
-- Add super_admin to the enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Drop existing admin-only role management policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
