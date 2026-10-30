
- Handheld APK opens /handheld (Goods In, Stock Check, Inventory only); a localStorage flag sends login back there — keeps the device UI separate from the full web app.
- Handheld Stock Check and Inventory opt into GeigerSearch's proximity-only presentation using TagProximityMeter; Inventory's HandheldTagSearch owns one selected linked EPC at a time, other scanning screens retain their existing behaviour, and useZebraSdk remains the sole owner of physical trigger handling — this reuses calibrated locating without changing normal scanning.
- Reader connection indicators subscribe to a shared client-side status snapshot populated by SDK initialization, release and native status events; this captures connections that do not emit an initial event without giving headers ownership of the reader.
- rfid_scans is unique per (company_slug, epc); every upsert must use onConflict "company_slug,epc" — keeps companies' tag records separate.
- Admin/super_admin accounts must reach aal2; reviewed privileged server actions use tenant-access.server and membership/role-management RLS uses can_manage_company — browser gates alone are not security boundaries, and remaining admin paths must be reviewed.
- RFID payload extraction and batch deduplication live in a browser-safe pure module shared with tests — tests exercise production parsing without database access.
- Commercial readiness evidence and test protocols live in docs/readiness; distinguish source support, automated checks and field verification so support claims stay defensible.
- RFID snapshot changes are recorded by a database trigger into tenant-scoped scan_events, with retention matching company scan periods — every write path gets history without trusting browser-inserted events; this is not raw RF telemetry.
