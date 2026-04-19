
-- Security definer function to get a user's company_slug without hitting RLS on profiles
CREATE OR REPLACE FUNCTION public.get_user_company_slug(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_slug FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Add company_slug to items
ALTER TABLE public.items ADD COLUMN company_slug text;

-- Add company_slug to rfid_scans
ALTER TABLE public.rfid_scans ADD COLUMN company_slug text;

-- Add company_slug to tag_items
ALTER TABLE public.tag_items ADD COLUMN company_slug text;

-- Drop old public RLS policies on items
DROP POLICY IF EXISTS "Anyone can read items" ON public.items;
DROP POLICY IF EXISTS "Anyone can insert items" ON public.items;
DROP POLICY IF EXISTS "Anyone can update items" ON public.items;
DROP POLICY IF EXISTS "Anyone can delete items" ON public.items;

-- Drop old public RLS policies on rfid_scans
DROP POLICY IF EXISTS "Allow public read" ON public.rfid_scans;
DROP POLICY IF EXISTS "Allow public insert" ON public.rfid_scans;
DROP POLICY IF EXISTS "Allow public update" ON public.rfid_scans;
DROP POLICY IF EXISTS "Allow public delete" ON public.rfid_scans;

-- Drop old public RLS policies on tag_items
DROP POLICY IF EXISTS "Anyone can read tag_items" ON public.tag_items;
DROP POLICY IF EXISTS "Anyone can insert tag_items" ON public.tag_items;
DROP POLICY IF EXISTS "Anyone can update tag_items" ON public.tag_items;
DROP POLICY IF EXISTS "Anyone can delete tag_items" ON public.tag_items;

-- New RLS policies for items (company-scoped)
CREATE POLICY "Users can read own company items"
ON public.items FOR SELECT TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can insert own company items"
ON public.items FOR INSERT TO authenticated
WITH CHECK (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can update own company items"
ON public.items FOR UPDATE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can delete own company items"
ON public.items FOR DELETE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- New RLS policies for rfid_scans (company-scoped)
CREATE POLICY "Users can read own company scans"
ON public.rfid_scans FOR SELECT TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can insert own company scans"
ON public.rfid_scans FOR INSERT TO authenticated
WITH CHECK (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can update own company scans"
ON public.rfid_scans FOR UPDATE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can delete own company scans"
ON public.rfid_scans FOR DELETE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- New RLS policies for tag_items (company-scoped)
CREATE POLICY "Users can read own company tag_items"
ON public.tag_items FOR SELECT TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can insert own company tag_items"
ON public.tag_items FOR INSERT TO authenticated
WITH CHECK (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can update own company tag_items"
ON public.tag_items FOR UPDATE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can delete own company tag_items"
ON public.tag_items FOR DELETE TO authenticated
USING (
  company_slug = public.get_user_company_slug(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add indexes for performance
CREATE INDEX idx_items_company_slug ON public.items(company_slug);
CREATE INDEX idx_rfid_scans_company_slug ON public.rfid_scans(company_slug);
CREATE INDEX idx_tag_items_company_slug ON public.tag_items(company_slug);
