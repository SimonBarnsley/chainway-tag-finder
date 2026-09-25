CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_name_lower_idx ON public.companies (lower(trim(name)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage companies" ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Admins read companies" ON public.companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.companies (name, slug)
SELECT DISTINCT ON (company_slug) trim(company_name), company_slug FROM public.profiles
WHERE company_slug IS NOT NULL AND company_name IS NOT NULL AND length(trim(company_name))>0
ORDER BY company_slug, created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.company_exists(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE lower(trim(name)) = lower(trim(_name)))
$$;
GRANT EXECUTE ON FUNCTION public.company_exists(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  c_name text;
  c_slug text;
  entered text := trim(coalesce(NEW.raw_user_meta_data->>'company_name',''));
BEGIN
  IF length(entered) > 0 THEN
    SELECT name, slug INTO c_name, c_slug FROM public.companies
    WHERE lower(trim(name)) = lower(entered) LIMIT 1;
    IF c_slug IS NULL THEN
      RAISE EXCEPTION 'Company "%" is not registered. Please check the company name with your administrator.', entered;
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, email, display_name, company_name, company_slug)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    c_name, c_slug);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$function$;