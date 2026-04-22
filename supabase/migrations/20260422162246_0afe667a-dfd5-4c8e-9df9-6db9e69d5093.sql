-- Seed default role_permissions for the permission catalog used in the Roles page.
-- Admin gets everything; Supervisor gets operational + view; Basic (user) gets minimal usage.
INSERT INTO public.role_permissions (role, permission, enabled) VALUES
  ('admin', 'scanner.use', true),
  ('admin', 'items.view', true),
  ('admin', 'items.edit', true),
  ('admin', 'locations.view', true),
  ('admin', 'locations.edit', true),
  ('admin', 'history.view', true),
  ('admin', 'bulk_upload.use', true),
  ('admin', 'readers.manage', true),
  ('admin', 'dashboard.admin', true),
  ('supervisor', 'scanner.use', true),
  ('supervisor', 'items.view', true),
  ('supervisor', 'items.edit', true),
  ('supervisor', 'locations.view', true),
  ('supervisor', 'locations.edit', false),
  ('supervisor', 'history.view', true),
  ('supervisor', 'bulk_upload.use', false),
  ('supervisor', 'readers.manage', false),
  ('supervisor', 'dashboard.admin', false),
  ('user', 'scanner.use', true),
  ('user', 'items.view', true),
  ('user', 'items.edit', false),
  ('user', 'locations.view', true),
  ('user', 'locations.edit', false),
  ('user', 'history.view', true),
  ('user', 'bulk_upload.use', false),
  ('user', 'readers.manage', false),
  ('user', 'dashboard.admin', false)
ON CONFLICT DO NOTHING;

-- Add unique constraint so future upserts work cleanly
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_permission_key'
  ) THEN
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_role_permission_key UNIQUE (role, permission);
  END IF;
END $$;