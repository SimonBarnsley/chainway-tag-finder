-- Create locations table for company-managed location list
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  barcode TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT locations_company_name_unique UNIQUE (company_slug, name)
);

CREATE INDEX idx_locations_company_slug ON public.locations(company_slug);
CREATE INDEX idx_locations_barcode ON public.locations(barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company locations"
  ON public.locations FOR SELECT
  TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own company locations"
  ON public.locations FOR INSERT
  TO authenticated
  WITH CHECK ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own company locations"
  ON public.locations FOR UPDATE
  TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own company locations"
  ON public.locations FOR DELETE
  TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();