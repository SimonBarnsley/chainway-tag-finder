-- Wipe existing per-location maps and zones
DELETE FROM public.antenna_zones;
DELETE FROM public.location_maps;

-- Allow ONE map per company (location_id no longer required)
ALTER TABLE public.location_maps
  ALTER COLUMN location_id DROP NOT NULL;

-- Each company should only ever have one company-wide map
CREATE UNIQUE INDEX IF NOT EXISTS location_maps_company_singleton
  ON public.location_maps (company_slug)
  WHERE location_id IS NULL;

-- Repurpose antenna_zones into "location zones" on the company map
ALTER TABLE public.antenna_zones
  ADD COLUMN IF NOT EXISTS location_id uuid;

ALTER TABLE public.antenna_zones
  ALTER COLUMN reader_id DROP NOT NULL,
  ALTER COLUMN antenna_port DROP NOT NULL;

-- A location should only have one zone per map
CREATE UNIQUE INDEX IF NOT EXISTS antenna_zones_map_location_unique
  ON public.antenna_zones (map_id, location_id)
  WHERE location_id IS NOT NULL;
