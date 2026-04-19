
-- Create rfid_scans table
CREATE TABLE public.rfid_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  epc TEXT NOT NULL,
  rssi NUMERIC,
  tid TEXT,
  device_name TEXT,
  notes TEXT,
  scan_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rfid_scans ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert/update for device usage (no auth needed for handheld)
CREATE POLICY "Allow public read" ON public.rfid_scans FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.rfid_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.rfid_scans FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.rfid_scans FOR DELETE USING (true);

-- Index on EPC for fast lookups
CREATE INDEX idx_rfid_scans_epc ON public.rfid_scans (epc);
CREATE INDEX idx_rfid_scans_last_seen ON public.rfid_scans (last_seen DESC);
