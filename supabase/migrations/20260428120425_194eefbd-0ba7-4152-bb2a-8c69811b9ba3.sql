-- Company-level settings table keyed by company_slug
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_slug text NOT NULL UNIQUE,
  epc_tag_prefix text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Anyone in the company (or super admin) can read their settings
CREATE POLICY "Users can read own company settings"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (
    company_slug = public.get_user_company_slug(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Only admins/super admins of the company can insert
CREATE POLICY "Admins can insert own company settings"
  ON public.company_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      company_slug = public.get_user_company_slug(auth.uid())
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Only admins/super admins of the company can update
CREATE POLICY "Admins can update own company settings"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (
    (
      company_slug = public.get_user_company_slug(auth.uid())
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();