-- Allow admins (in addition to super_admins) to manage role permissions
DROP POLICY IF EXISTS "Super admins can insert role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Super admins can update role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Super admins can delete role permissions" ON public.role_permissions;

CREATE POLICY "Admins can insert role permissions"
ON public.role_permissions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can update role permissions"
ON public.role_permissions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can delete role permissions"
ON public.role_permissions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));