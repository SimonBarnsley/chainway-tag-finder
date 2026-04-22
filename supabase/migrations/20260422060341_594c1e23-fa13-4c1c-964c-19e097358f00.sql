-- Update handle_new_user to ensure unique company_slug
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
BEGIN
  -- Generate base slug from company name (or null if no company)
  IF NEW.raw_user_meta_data->>'company_name' IS NOT NULL 
     AND length(trim(NEW.raw_user_meta_data->>'company_name')) > 0 THEN
    base_slug := public.generate_slug(NEW.raw_user_meta_data->>'company_name');
    final_slug := base_slug;
    
    -- Ensure uniqueness by appending counter if needed
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE company_slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter::text;
    END LOOP;
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

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();