
- Handheld APK opens /handheld (Goods In, Stock Check, Inventory only); a localStorage flag sends login back there — keeps the device UI separate from the full web app.
- Stock Check opts into GeigerSearch's proximity-only presentation using TagProximityMeter; other scanning screens retain their existing behaviour, and useZebraSdk remains the sole owner of physical trigger handling.
