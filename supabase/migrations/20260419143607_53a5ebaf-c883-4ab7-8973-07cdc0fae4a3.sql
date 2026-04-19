CREATE TABLE public.zebra_reader_debug_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  company_slug text,
  reader_hostname text,
  remote_ip text,
  method text,
  content_type text,
  content_length integer,
  user_agent text,
  query_string text,
  headers jsonb,
  raw_body text,
  parsed_tag_count integer,
  parse_error text
);

CREATE INDEX idx_zebra_debug_company_time ON public.zebra_reader_debug_logs (company_slug, created_at DESC);

ALTER TABLE public.zebra_reader_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company debug logs"
  ON public.zebra_reader_debug_logs
  FOR SELECT
  TO authenticated
  USING (
    (company_slug = get_user_company_slug(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Users can delete own company debug logs"
  ON public.zebra_reader_debug_logs
  FOR DELETE
  TO authenticated
  USING (
    (company_slug = get_user_company_slug(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );