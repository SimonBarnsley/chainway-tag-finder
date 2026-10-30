ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_company_slug text, ADD COLUMN IF NOT EXISTS pending_company_name text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  -- Self sign-ups never join a company directly; a company admin must approve.
  INSERT INTO public.profiles (user_id, email, display_name, pending_company_name, pending_company_slug)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    c_name, c_slug);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Profiles must be created through account registration'; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_slug IS DISTINCT FROM OLD.company_slug OR NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.pending_company_slug IS DISTINCT FROM OLD.pending_company_slug
       OR NEW.pending_company_name IS DISTINCT FROM OLD.pending_company_name THEN
      RAISE EXCEPTION 'Company membership cannot be changed through profile editing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;