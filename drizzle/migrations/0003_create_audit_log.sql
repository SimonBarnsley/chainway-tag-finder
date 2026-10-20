CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_slug text NOT NULL,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_company_created_idx ON public.audit_log (company_slug, created_at DESC);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read their company audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    company_slug = public.get_user_company_slug(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Signed-in users can write audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());