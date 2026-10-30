# ScanLoc8 reader and tag support

Evidence reviewed: 30 October 2026. ScanLoc8 manages tagged stock, receipts, stock checks, movements and last-seen inventory locations. It is not people tracking or an RF coordinate positioning system.

| Device | Implemented connection | Supported capability in source | Verification |
|---|---|---|---|
| Zebra TC22R | Capacitor Android bridge, integrated RFID3 reader | Inventory reads, physical trigger, real locate proximity | User previously reported live proximity working; no independent device test in this checklist |
| Zebra TC27R | Same native bridge, stated target | Same intended API path | Code support only; field test required |
| Chainway C75 | Keyboard wedge in browser | EPC capture into handheld workflows | No Chainway native locating SDK; field test required |
| Chainway UA4E | HTTPS POST | JSON, supported XML layouts, text/form EPC lists | Payload fixture tests only; firmware/configuration test required |
| Zebra FX9600 / FX family | HTTPS POST | Shared ingestion, antenna mapping, heartbeat contact | FX9600-oriented configuration; other FX models not automatically certified |
| Zebra RFD40 / Bluetooth sleds | Not supported by native bridge | No native certification | Do not advertise as supported |

Tag decoding supports SGTIN-96 (header 30, exactly 24 hex characters) and SGTIN-198 (header 36, decoder accepts 50 or more hex characters). This is not certification of every EPC encoding or tag construction. Decoder boundary and GTIN check-digit validation need further review before commercially relying on auto-link identities.

Goods In, Stock Check and Stock Movement share the 3039 prefix admission gate plus any company prefix. A company prefix does not replace 3039. Fixed ingestion does not currently apply that handheld rule; text extraction accepts 24–64 hex characters, while JSON/XML admission is more permissive. Raw ingestion and successful SGTIN decoding are distinct capabilities. Auto-link requires a decodable SGTIN and a matching item SKU/GTIN; it does not create placeholder items.

Hardware compatibility must name model, firmware, SDK/APK version, antenna/tag model, regional RF settings and a dated field result. Metal/liquid, orientation, neighbouring zones and movement must be tested. A read is an observation, not proof of precise location; lack of a read is not proof of absence. Proximity percentage is relative, display-calibrated, not metres.

Evidence: `src/hooks/use-zebra-sdk.ts`, `android-plugin/ZebraTC22RPlugin.kt`, `src/hooks/use-handheld-scanner.ts`, `src/hooks/use-rfid-scanner.ts`, `src/lib/rfid-payload.ts`, `src/lib/sgtin-decoder.ts`, `src/lib/auto-link-epcs.ts`, `src/routes/api.chainway-reader*.ts`, `src/routes/api.zebra-reader*.ts`.