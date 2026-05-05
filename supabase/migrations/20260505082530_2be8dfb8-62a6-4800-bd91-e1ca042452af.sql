TRUNCATE TABLE public.zebra_reader_debug_logs;
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';