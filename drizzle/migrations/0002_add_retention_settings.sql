ALTER TABLE public.company_settings
  ADD COLUMN scan_retention_days integer NOT NULL DEFAULT 365,
  ADD COLUMN alert_retention_days integer NOT NULL DEFAULT 90;

COMMENT ON COLUMN public.company_settings.scan_retention_days IS 'Days to keep RFID scan history per company before automatic deletion.';
COMMENT ON COLUMN public.company_settings.alert_retention_days IS 'Days to keep read alerts per company before automatic deletion.';