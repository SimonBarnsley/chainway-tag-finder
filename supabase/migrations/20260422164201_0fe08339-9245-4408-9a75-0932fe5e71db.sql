-- Allow admins to insert non-super_admin roles
DROP POLICY IF EXISTS "Admins can insert non-super roles" ON public.user_roles;
CREATE POLICY "Admins can insert non-super roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

-- Allow admins to delete non-super_admin roles
DROP POLICY IF EXISTS "Admins can delete non-super roles" ON public.user_roles;
CREATE POLICY "Admins can delete non-super roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

-- Allow admins to update non-super_admin roles to non-super_admin roles
DROP POLICY IF EXISTS "Admins can update non-super roles" ON public.user_roles;
CREATE POLICY "Admins can update non-super roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'super_admin'::app_role
);

-- Allow admins to view all user roles (so they can see who has what)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);