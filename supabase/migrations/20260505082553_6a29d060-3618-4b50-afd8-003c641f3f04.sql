CREATE OR REPLACE FUNCTION public.cleanup_zebra_debug_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.zebra_reader_debug_logs WHERE created_at < now() - interval '7 days';
$$;

SELECT cron.schedule(
  'cleanup-zebra-debug-logs-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_zebra_debug_logs();$$
);