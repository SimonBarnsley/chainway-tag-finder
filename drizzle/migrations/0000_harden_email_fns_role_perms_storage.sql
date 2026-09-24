-- 1. Pin search_path on SECURITY DEFINER email queue helpers
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- 2. role_permissions: users only see the permissions of roles they hold; admins see all
DROP POLICY IF EXISTS "Authenticated users can read role permissions" ON public.role_permissions;

CREATE POLICY "Users read permissions for their own roles"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), role)
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- 3. Storage writes bound to the uploader (admins retain full control)
DROP POLICY IF EXISTS "Anyone can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update item images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete item images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload location maps" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update location maps" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete location maps" ON storage.objects;

CREATE POLICY "Owners upload item images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'item-images' AND owner_id = (select auth.uid()::text));

CREATE POLICY "Owners update item images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'item-images' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')))
WITH CHECK (bucket_id = 'item-images' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Owners delete item images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'item-images' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Owners upload location maps"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'location-maps' AND owner_id = (select auth.uid()::text));

CREATE POLICY "Owners update location maps"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'location-maps' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')))
WITH CHECK (bucket_id = 'location-maps' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Owners delete location maps"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'location-maps' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));
