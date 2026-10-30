# Scan data flow

## Fixed readers

Reader → HTTPS `/api/{zebra|chainway}-reader/{company}/{key}` (or existing query/header form) → company reader-key lookup → JSON/XML/text extraction → deduplicate EPC within batch, strongest RSSI retained → reader hostname resolution → antenna port/location-name mapping → `rfid_scans` upsert on `(company_slug, epc)` → database `scan_events` trigger → SGTIN/item linking → item last-seen location sync → existing alert evaluation and scheduled email dispatch.

The shared-key compatibility fallback remains. Company key lookup errors now fail closed. Request body is still read before authentication; request-size/rate caps and credential rotation remain required. Reader identity fallback and late-event handling remain release risks. Server receipt time currently becomes last-seen time; original reader time is not retained. `scan_count=1` on fixed batches is not total read volume.

## Handhelds

Zebra native bridge `tagRead` or browser keyboard wedge → shared 3039/company-prefix gate → EPC/count Map in React memory → operator submits Goods In/Stock Check/Movement → company-scoped scan write → `scan_events` trigger → authenticated link/sync function → return to handheld menu.

Inventory Find Tag selects one linked EPC; Stock Check Find selects an unobserved EPC. Real `locateProximity` drives the bar. Calibration is display-only `min(100, round(raw*1.25))`; raw readings, constant beep and native trigger ownership are unchanged.

## Persistence semantics

- `rfid_scans`: mutable latest snapshot per company and EPC, not full raw history.
- `scan_events`: immutable-to-client INSERT/UPDATE snapshot-change records from this update onward, with prior/new location, server record time and application last-seen time. It does not reconstruct older events or preserve every physical RF read, RSSI sample or deduplicated antenna candidate.
- `items` and `tag_items`: item master and company EPC links; one item can have several tags.
- `fixed_readers` and `reader_antennas`: registered readers and configured port/location associations.
- `locations`, `location_maps`, `antenna_zones`: configured labels and floor-plan geometry, not measured RF coordinates.
- `alerts`, `alert_rules`, `audit_log`: notifications, configured conditions and application activity. Client-submitted activity remains untrusted evidence.

Cloud database daily backups are documented by the platform; storage files are excluded. Snapshot inventory and a restore test have not been verified. Do not promise arbitrary point-in-time recovery.