
-- Add company_slug column
ALTER TABLE public.profiles ADD COLUMN company_slug text;

-- Create a function to generate slug from company name
CREATE OR REPLACE FUNCTION public.generate_slug(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(trim(input), '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  )
$$;

-- Update handle_new_user to also set company_slug
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, company_name, company_slug)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'company_name',
    CASE
      WHEN NEW.raw_user_meta_data->>'company_name' IS NOT NULL
      THEN public.generate_slug(NEW.raw_user_meta_data->>'company_name')
      ELSE NULL
    END
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Backfill existing profiles
UPDATE public.profiles
SET company_slug = public.generate_slug(company_name)
WHERE company_name IS NOT NULL AND company_slug IS NULL;

-- Add unique index on company_slug (allow nulls)
CREATE UNIQUE INDEX idx_profiles_company_slug ON public.profiles (company_slug) WHERE company_slug IS NOT NULL;
