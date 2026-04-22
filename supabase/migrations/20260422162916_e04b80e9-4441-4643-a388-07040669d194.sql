-- Allow multiple users to share the same company_slug
DROP INDEX IF EXISTS public.idx_profiles_company_slug;

-- Add a non-unique index so lookups stay fast
CREATE INDEX IF NOT EXISTS idx_profiles_company_slug_nonunique
  ON public.profiles (company_slug);

-- Now move Simon Raines into the correct company
UPDATE public.profiles
SET company_slug = 'simon-barnsley', updated_at = now()
WHERE user_id = '1940b763-0a0b-4897-b13a-83dbf49212b5';