
-- Add 'supervisor' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Create role_permissions table for editable permission matrix per role
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  permission TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read permissions (so the UI can render gates)
CREATE POLICY "Authenticated users can read role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

-- Only super admins can modify permissions
CREATE POLICY "Super admins can insert role permissions"
ON public.role_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can update role permissions"
ON public.role_permissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admins can delete role permissions"
ON public.role_permissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger for updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
