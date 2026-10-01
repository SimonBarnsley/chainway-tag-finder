CREATE TABLE public.company_reader_keys (
  company_slug text PRIMARY KEY,
  api_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.company_reader_keys TO service_role;
ALTER TABLE public.company_reader_keys ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_company_reader_keys_updated_at BEFORE UPDATE ON public.company_reader_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();