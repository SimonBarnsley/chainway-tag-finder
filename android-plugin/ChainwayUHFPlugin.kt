/*
 * Chainway UHF Capacitor plugin (Kotlin).
 *
 * Copy this file into the Android project after running `bunx cap add android`:
 *   android/app/src/main/java/com/barcodewarehouse/uhftagfinder/ChainwayUHFPlugin.kt
 *
 * Then register it in MainActivity:
 *   registerPlugin(ChainwayUHFPlugin::class.java)
 *
 * Targets the RFIDWithUHFUART variant of the Chainway SDK (C72/C66/C61
 * family). For BLE variants change the import + getInstance() call.
 *
 * The trigger button (KEYCODE_F1 / 293 / 139 depending on model) is captured
 * by overriding dispatchKeyEvent in MainActivity and forwarding to this plugin
 * via static helpers `notifyTriggerPressed()` / `notifyTriggerReleased()`.
 */
package com.barcodewarehouse.uhftagfinder

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.rscja.deviceapi.RFIDWithUHFUART
import com.rscja.deviceapi.entity.UHFTAGInfo
import com.rscja.deviceapi.exception.ConfigurationException

@CapacitorPlugin(name = "ChainwayUHF")
class ChainwayUHFPlugin : Plugin() {

    private var reader: RFIDWithUHFUART? = null
    private var inventoryThread: Thread? = null
    @Volatile private var isInventorying = false

    companion object {
        private const val TAG = "ChainwayUHFPlugin"
        // Singleton handle so MainActivity can forward trigger key events
        @Volatile var instance: ChainwayUHFPlugin? = null
    }

    override fun load() {
        super.load()
        instance = this
    }

    @PluginMethod
    fun init(call: PluginCall) {
        try {
            val r = RFIDWithUHFUART.getInstance()
            val ok = r.init()
            reader = r
            val ret = JSObject()
            ret.put("success", ok)
            if (!ok) ret.put("error", "RFIDWithUHFUART.init() returned false")
            call.resolve(ret)
        } catch (e: ConfigurationException) {
            Log.e(TAG, "init failed", e)
            val ret = JSObject()
            ret.put("success", false)
            ret.put("error", e.message ?: "ConfigurationException")
            call.resolve(ret)
        } catch (e: Throwable) {
            Log.e(TAG, "init threw", e)
            val ret = JSObject()
            ret.put("success", false)
            ret.put("error", e.message ?: e.javaClass.simpleName)
            call.resolve(ret)
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
        try {
            val started = r.startInventoryTag()
            if (!started) {
                call.reject("startInventoryTag() returned false")
                return
            }
            isInventorying = true
            inventoryThread = Thread {
                while (isInventorying) {
                    try {
                        val info: UHFTAGInfo? = r.readTagFromBuffer()
                        if (info != null) {
                            val payload = JSObject()
                            payload.put("epc", info.epc ?: "")
                            // RSSI from Chainway SDK is a String like "-52"
                            info.rssi?.toIntOrNull()?.let { payload.put("rssi", it) }
                            notifyListeners("tagRead", payload)
                        } else {
                            Thread.sleep(10)
                        }
                    } catch (ie: InterruptedException) {
                        break
                    } catch (e: Throwable) {
                        Log.w(TAG, "inventory loop error", e)
                    }
                }
            }.also { it.start() }
            call.resolve()
        } catch (e: Throwable) {
            Log.e(TAG, "startScan failed", e)
            call.reject(e.message ?: "startScan failed")
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        try {
            isInventorying = false
            inventoryThread?.interrupt()
            inventoryThread = null
            reader?.stopInventory()
            call.resolve()
        } catch (e: Throwable) {
            Log.w(TAG, "stopScan error", e)
            call.resolve()
        }
    }

    @PluginMethod
    fun release(call: PluginCall) {
        try {
            isInventorying = false
            inventoryThread?.interrupt()
            inventoryThread = null
            reader?.stopInventory()
            reader?.free()
            reader = null
            call.resolve()
        } catch (e: Throwable) {
            Log.w(TAG, "release error", e)
            call.resolve()
        }
    }

    /** Called from MainActivity.dispatchKeyEvent when the hardware trigger is pressed. */
    fun notifyTriggerPressed() {
        notifyListeners("triggerPressed", JSObject())
    }

    /** Called from MainActivity.dispatchKeyEvent when the hardware trigger is released. */
    fun notifyTriggerReleased() {
        notifyListeners("triggerReleased", JSObject())
    }
}
