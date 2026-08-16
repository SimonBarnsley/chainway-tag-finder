/*
 * Zebra UHF RFID Capacitor plugin (Kotlin).
 *
 * Supports BOTH:
 *   1) Zebra TC22R / TC27R — RFID reader BUILT IN to the mobile computer.
 *      The RFID3 SDK exposes it over ENUM_TRANSPORT.SERVICE_SERIAL as a
 *      reader normally named "BUILTIN" / "RFD40-INTERNAL".
 *   2) Zebra RFD40 sled + TC22 via the e-Connex adapter (pin serial), and
 *      Bluetooth snap-on variants.
 *
 * Transport is auto-detected at init(): we try SERVICE_SERIAL (built-in),
 * then SERIAL (e-Connex sled), then BLUETOOTH, and use the first transport
 * that reports an available reader. The chosen transport + reader name are
 * returned to JS so the UI can label the device correctly.
 *
 * Uses Zebra's RFID3 SDK (com.zebra.rfid.api3), version 2.0.3.x or newer
 * (built-in TC22R reader support requires 2.0.3+).
 *
 * Copy this file into the Android project after running `bunx cap add android`:
 *   android/app/src/main/java/com/barcodewarehouse/uhftagfinder/ZebraRFD40Plugin.kt
 *
 * Then register it in MainActivity:
 *   registerPlugin(ZebraRFD40Plugin::class.java)
 *
 * Required SDK files in android/app/libs/:
 *   - API3_LIB-x.x.x.aar      (Zebra RFID3 SDK)
 *   - ASCII_SDK_API.jar       (sometimes shipped alongside)
 *
 * Trigger: on the TC22R the integrated trigger arrives as a HANDHELD_TRIGGER
 * status event from the SDK itself; on the sled it may instead arrive as a
 * key event (KEYCODE 293 / 280 / 10036) captured in MainActivity and
 * forwarded via `notifyTriggerPressed()` / `notifyTriggerReleased()`.
 */

package com.barcodewarehouse.uhftagfinder

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.zebra.rfid.api3.ENUM_TRANSPORT
import com.zebra.rfid.api3.ENUM_TRIGGER_MODE
import com.zebra.rfid.api3.HANDHELD_TRIGGER_EVENT_TYPE
import com.zebra.rfid.api3.InvalidUsageException
import com.zebra.rfid.api3.OperationFailureException
import com.zebra.rfid.api3.ReaderDevice
import com.zebra.rfid.api3.Readers
import com.zebra.rfid.api3.RfidEventsListener
import com.zebra.rfid.api3.RfidReadEvents
import com.zebra.rfid.api3.RfidStatusEvents
import com.zebra.rfid.api3.START_TRIGGER_TYPE
import com.zebra.rfid.api3.STATUS_EVENT_TYPE
import com.zebra.rfid.api3.STOP_TRIGGER_TYPE
import com.zebra.rfid.api3.TagData
import com.zebra.rfid.api3.TriggerInfo

@CapacitorPlugin(name = "ZebraRFID")
class ZebraRFD40Plugin : Plugin(), Readers.RFIDReaderEventHandler {

    private var readers: Readers? = null
    private var readerDevice: ReaderDevice? = null
    private val reader get() = readerDevice?.rfidReader
    @Volatile private var isInventorying = false
    // Tag Locationing (Geiger) state — the SDK reports a 0-100 proximity value
    // for the single target EPC while locationing is running.
    @Volatile private var isLocating = false
    @Volatile private var locateEpc: String? = null

    // Heartbeat: the Zebra SDK doesn't always fire DISCONNECTION_EVENT promptly
    // when the RFD40 sled is powered off via its physical switch (vs. unplugged).
    // We poll reader.isConnected every 2s and emit readerStatus so the UI can
    // reliably show "SCANNER NOT ON" within a couple of seconds of power loss.
    private val heartbeatHandler = android.os.Handler(android.os.Looper.getMainLooper())
    @Volatile private var lastConnectedState: Boolean = false
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            try {
                val connected = try { reader?.isConnected == true } catch (_: Throwable) { false }
                if (connected != lastConnectedState) {
                    lastConnectedState = connected
                    val payload = JSObject()
                    payload.put("connected", connected)
                    readerDevice?.name?.let { payload.put("name", it) }
                    notifyListeners("readerStatus", payload)
                }
            } catch (e: Throwable) {
                Log.w(TAG, "heartbeat error", e)
            } finally {
                heartbeatHandler.postDelayed(this, 2000L)
            }
        }
    }

    companion object {
        private const val TAG = "ZebraRFD40Plugin"
        // Singleton handle so MainActivity can forward trigger key events
        @Volatile var instance: ZebraRFD40Plugin? = null
    }

    override fun load() {
        super.load()
        instance = this
    }

    @PluginMethod
    fun init(call: PluginCall) {
        try {
            // SERIAL transport covers the e-Connex pin connection between
            // the TC22 and the RFD40. (Use BLUETOOTH for snap-on/standalone variants.)
            readers = Readers(context, ENUM_TRANSPORT.SERIAL)
            readers?.attach(this)

            val available = readers?.GetAvailableRFIDReaderList()
            val first = available?.firstOrNull()
            if (first == null) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("error", "No RFD40 sled detected over e-Connex")
                call.resolve(ret)
                return
            }

            readerDevice = first
            first.rfidReader.connect()
            configureReader()
            lastConnectedState = true
            heartbeatHandler.removeCallbacks(heartbeatRunnable)
            heartbeatHandler.postDelayed(heartbeatRunnable, 2000L)

            val ret = JSObject()
            ret.put("success", true)
            ret.put("readerName", first.name ?: "RFD40")
            call.resolve(ret)
        } catch (e: InvalidUsageException) {
            Log.e(TAG, "init InvalidUsage", e)
            resolveError(call, e.info ?: e.message ?: "InvalidUsageException")
        } catch (e: OperationFailureException) {
            Log.e(TAG, "init OperationFailure", e)
            resolveError(call, e.vendorMessage ?: e.message ?: "OperationFailureException")
        } catch (e: Throwable) {
            Log.e(TAG, "init threw", e)
            resolveError(call, e.message ?: e.javaClass.simpleName)
        }
    }

    private fun configureReader() {
        val r = reader ?: return
        // Subscribe to tag read + status events
        r.Events.addEventsListener(eventsListener)
        r.Events.setTagReadEvent(true)
        r.Events.setHandheldEvent(true)
        r.Events.setReaderDisconnectEvent(true)
        r.Events.setBatteryEvent(true)
        r.Events.setInventoryStartEvent(true)
        r.Events.setInventoryStopEvent(true)
        // Software-triggered start/stop — we drive the trigger from JS,
        // and ALSO forward the hardware trigger key from MainActivity.
        val triggerInfo = TriggerInfo()
        triggerInfo.StartTrigger.triggerType = START_TRIGGER_TYPE.START_TRIGGER_TYPE_IMMEDIATE
        triggerInfo.StopTrigger.triggerType = STOP_TRIGGER_TYPE.STOP_TRIGGER_TYPE_IMMEDIATE
        r.Config.startTrigger = triggerInfo.StartTrigger
        r.Config.stopTrigger = triggerInfo.StopTrigger
    }

    private val eventsListener = object : RfidEventsListener {
        override fun eventReadNotify(e: RfidReadEvents) {
            // While Tag Locationing is running, the SDK streams proximity updates
            // for the target EPC instead of ordinary inventory reads.
            if (isLocating) {
                val target = locateEpc
                val tag = e.readEventData?.tagData
                if (tag != null && (target == null || tag.tagID.equals(target, ignoreCase = true))) {
                    val payload = JSObject()
                    payload.put("epc", tag.tagID ?: target ?: "")
                    payload.put("proximity", tag.LocationInfo?.relativeDistance ?: 0)
                    payload.put("rssi", tag.peakRSSI.toInt())
                    notifyListeners("locateProximity", payload)
                }
                return
            }
            val tags: Array<TagData>? = reader?.Actions?.getReadTags(100)
            tags?.forEach { tag ->
                val payload = JSObject()
                payload.put("epc", tag.tagID ?: "")
                payload.put("rssi", tag.peakRSSI.toInt())
                payload.put("antenna", tag.antennaID)
                tag.tid?.let { payload.put("tid", it) }
                notifyListeners("tagRead", payload)
            }
        }

        override fun eventStatusNotify(e: RfidStatusEvents) {
            when (e.StatusEventData.statusEventType) {
                STATUS_EVENT_TYPE.HANDHELD_TRIGGER_EVENT -> {
                    val type = e.StatusEventData.HandheldTriggerEventData.handheldEvent
                    if (type == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_PRESSED) {
                        notifyListeners("triggerPressed", JSObject())
                    } else if (type == HANDHELD_TRIGGER_EVENT_TYPE.HANDHELD_TRIGGER_RELEASED) {
                        notifyListeners("triggerReleased", JSObject())
                    }
                }
                STATUS_EVENT_TYPE.DISCONNECTION_EVENT -> {
                    val payload = JSObject()
                    payload.put("connected", false)
                    notifyListeners("readerStatus", payload)
                }
                else -> { /* ignore */ }
            }
        }
    }

    @PluginMethod
    fun startScan(call: PluginCall) {
        val r = reader
        if (r == null) {
            call.reject("SDK not initialized")
            return
        }
        if (isInventorying) {
            call.resolve()
            return
        }
        if (isLocating) {
            call.reject("Tag locationing is active — stop it first")
            return
        }
        try {
            r.Actions.Inventory.perform()
            isInventorying = true
            call.resolve()
        } catch (e: Throwable) {
            Log.e(TAG, "startScan failed", e)
            call.reject(e.message ?: "startScan failed")
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        try {
            reader?.Actions?.Inventory?.stop()
            isInventorying = false
            call.resolve()
        } catch (e: Throwable) {
            Log.w(TAG, "stopScan error", e)
            call.resolve()
        }
    }

    @PluginMethod
    fun release(call: PluginCall) {
        try {
            heartbeatHandler.removeCallbacks(heartbeatRunnable)
            isInventorying = false
            if (isLocating) try { reader?.Actions?.TagLocationing?.Stop() } catch (_: Throwable) {}
            isLocating = false
            locateEpc = null
            reader?.Actions?.Inventory?.stop()
            reader?.Events?.removeEventsListener(eventsListener)
            reader?.disconnect()
            readerDevice = null
            readers?.Dispose()
            readers = null
            call.resolve()
        } catch (e: Throwable) {
            Log.w(TAG, "release error", e)
            call.resolve()
        }
    }

    /**
     * Start Zebra Tag Locationing ("Geiger") mode for a single EPC.
     * The reader continuously reports a relative proximity value (0-100) for
     * that tag, which is far more accurate for pinpointing than raw RSSI.
     */
    @PluginMethod
    fun startLocate(call: PluginCall) {
        val r = reader
        if (r == null) {
            call.reject("SDK not initialized")
            return
        }
        val epc = call.getString("epc")?.trim()?.uppercase()
        if (epc.isNullOrEmpty()) {
            call.reject("epc is required")
            return
        }
        try {
            // Locationing and inventory are mutually exclusive
            if (isInventorying) {
                try { r.Actions.Inventory.stop() } catch (_: Throwable) {}
                isInventorying = false
            }
            locateEpc = epc
            isLocating = true
            r.Actions.TagLocationing.Perform(epc, null, null)
            call.resolve()
        } catch (e: Throwable) {
            isLocating = false
            locateEpc = null
            Log.e(TAG, "startLocate failed", e)
            call.reject(e.message ?: "startLocate failed")
        }
    }

    /** Stop Tag Locationing mode. */
    @PluginMethod
    fun stopLocate(call: PluginCall) {
        try {
            if (isLocating) reader?.Actions?.TagLocationing?.Stop()
        } catch (e: Throwable) {
            Log.w(TAG, "stopLocate error", e)
        } finally {
            isLocating = false
            locateEpc = null
        }
        call.resolve()
    }

    // Readers.RFIDReaderEventHandler — fired when the sled is attached/detached
    override fun RFIDReaderAppeared(device: ReaderDevice) {
        val payload = JSObject()
        payload.put("connected", true)
        payload.put("name", device.name ?: "RFD40")
        notifyListeners("readerStatus", payload)
    }

    override fun RFIDReaderDisappeared(device: ReaderDevice) {
        val payload = JSObject()
        payload.put("connected", false)
        payload.put("name", device.name ?: "RFD40")
        notifyListeners("readerStatus", payload)
    }

    /** Called from MainActivity.dispatchKeyEvent when the e-Connex trigger key is pressed. */
    fun notifyTriggerPressed() {
        notifyListeners("triggerPressed", JSObject())
    }

    /** Called from MainActivity.dispatchKeyEvent when the e-Connex trigger key is released. */
    fun notifyTriggerReleased() {
        notifyListeners("triggerReleased", JSObject())
    }

    /**
     * Copy a string to the Android clipboard and (optionally) launch another
     * installed app by package name. Used by the dashboard's
     * "Copy & locate in 123RFID" button — copies the EPC, then opens
     * 123RFID Mobile so the user can paste it into the Locate Tag field.
     *
     * Tries each provided package name in order and launches the first one
     * that's installed. We can't auto-fill 123RFID's text fields (closed app,
     * no public Intent / deep link), so manual paste is the final step.
     */
    @PluginMethod
    fun copyAndLaunch(call: PluginCall) {
        val text = call.getString("text") ?: ""
        val packagesArr = call.getArray("packages")
        val packageNames = mutableListOf<String>()
        if (packagesArr != null) {
            for (i in 0 until packagesArr.length()) {
                packagesArr.optString(i, null)?.let { packageNames.add(it) }
            }
        }
        val label = call.getString("label") ?: "EPC"

        try {
            if (text.isNotEmpty()) {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText(label, text))
            }

            var launchedPackage: String? = null
            for (pkg in packageNames) {
                val intent: Intent? = context.packageManager.getLaunchIntentForPackage(pkg)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    launchedPackage = pkg
                    break
                }
            }

            val ret = JSObject()
            ret.put("copied", text.isNotEmpty())
            ret.put("launched", launchedPackage != null)
            launchedPackage?.let { ret.put("package", it) }
            call.resolve(ret)
        } catch (e: Throwable) {
            Log.e(TAG, "copyAndLaunch failed", e)
            resolveError(call, e.message ?: "copyAndLaunch failed")
        }
    }

    private fun resolveError(call: PluginCall, message: String) {
        val ret = JSObject()
        ret.put("success", false)
        ret.put("error", message)
        call.resolve(ret)
    }
}
