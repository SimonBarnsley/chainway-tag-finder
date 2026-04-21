
-- 1. location_maps: one floor plan image per location
CREATE TABLE public.location_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug text NOT NULL,
  location_id uuid NOT NULL,
  image_path text NOT NULL,
  image_width integer NOT NULL DEFAULT 1000,
  image_height integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id)
);

ALTER TABLE public.location_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company maps" ON public.location_maps
  FOR SELECT TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own company maps" ON public.location_maps
  FOR INSERT TO authenticated
  WITH CHECK (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own company maps" ON public.location_maps
  FOR UPDATE TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own company maps" ON public.location_maps
  FOR DELETE TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_location_maps_updated_at
  BEFORE UPDATE ON public.location_maps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. antenna_zones: a drawn shape on a map linked to a specific reader antenna
CREATE TABLE public.antenna_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug text NOT NULL,
  map_id uuid NOT NULL REFERENCES public.location_maps(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES public.fixed_readers(id) ON DELETE CASCADE,
  antenna_port integer NOT NULL,
  shape_kind text NOT NULL CHECK (shape_kind IN ('rect', 'polygon')),
  -- For rect: [{x,y,w,h}] normalized 0-1. For polygon: [{x,y}, ...] normalized 0-1.
  shape_data jsonb NOT NULL,
  label text,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_antenna_zones_map ON public.antenna_zones(map_id);
CREATE INDEX idx_antenna_zones_reader_port ON public.antenna_zones(reader_id, antenna_port);

ALTER TABLE public.antenna_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company zones" ON public.antenna_zones
  FOR SELECT TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own company zones" ON public.antenna_zones
  FOR INSERT TO authenticated
  WITH CHECK (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own company zones" ON public.antenna_zones
  FOR UPDATE TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own company zones" ON public.antenna_zones
  FOR DELETE TO authenticated
  USING (company_slug = get_user_company_slug(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_antenna_zones_updated_at
  BEFORE UPDATE ON public.antenna_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Storage bucket for floor plan images (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('location-maps', 'location-maps', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read location maps"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'location-maps');

CREATE POLICY "Authenticated can upload location maps"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'location-maps');

CREATE POLICY "Authenticated can update location maps"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'location-maps');

CREATE POLICY "Authenticated can delete location maps"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'location-maps');

-- 4. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.antenna_zones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_maps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_scans;
