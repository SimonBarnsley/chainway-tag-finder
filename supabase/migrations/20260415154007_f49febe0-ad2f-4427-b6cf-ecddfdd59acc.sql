
-- Fixed RFID readers table
CREATE TABLE public.fixed_readers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hostname TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT,
  company_slug TEXT NOT NULL,
  antenna_count INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (hostname, company_slug)
);

ALTER TABLE public.fixed_readers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company readers"
  ON public.fixed_readers FOR SELECT TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own company readers"
  ON public.fixed_readers FOR INSERT TO authenticated
  WITH CHECK ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own company readers"
  ON public.fixed_readers FOR UPDATE TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own company readers"
  ON public.fixed_readers FOR DELETE TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_fixed_readers_updated_at
  BEFORE UPDATE ON public.fixed_readers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reader antenna-to-location mapping table
CREATE TABLE public.reader_antennas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reader_id UUID NOT NULL REFERENCES public.fixed_readers(id) ON DELETE CASCADE,
  antenna_port INTEGER NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  company_slug TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (reader_id, antenna_port)
);

ALTER TABLE public.reader_antennas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company antennas"
  ON public.reader_antennas FOR SELECT TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own company antennas"
  ON public.reader_antennas FOR INSERT TO authenticated
  WITH CHECK ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own company antennas"
  ON public.reader_antennas FOR UPDATE TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own company antennas"
  ON public.reader_antennas FOR DELETE TO authenticated
  USING ((company_slug = get_user_company_slug(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));
