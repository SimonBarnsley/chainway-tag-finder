CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
  existing_slug text;
BEGIN
  IF NEW.raw_user_meta_data->>'company_name' IS NOT NULL
     AND length(trim(NEW.raw_user_meta_data->>'company_name')) > 0 THEN
    base_slug := public.generate_slug(NEW.raw_user_meta_data->>'company_name');

    -- If a company with this exact name already exists (case-insensitive), reuse its slug
    SELECT company_slug INTO existing_slug
    FROM public.profiles
    WHERE lower(trim(company_name)) = lower(trim(NEW.raw_user_meta_data->>'company_name'))
      AND company_slug IS NOT NULL
    LIMIT 1;

    IF existing_slug IS NOT NULL THEN
      final_slug := existing_slug;
    ELSE
      final_slug := base_slug;
      WHILE EXISTS (SELECT 1 FROM public.profiles WHERE company_slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter::text;
      END LOOP;
    END IF;
  ELSE
    final_slug := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, email, display_name, company_name, company_slug)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'company_name',
    final_slug
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$function$;