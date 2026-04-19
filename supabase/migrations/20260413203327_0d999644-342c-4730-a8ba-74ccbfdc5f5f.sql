
-- Item master data table
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  sku TEXT,
  gtin TEXT,
  weight NUMERIC,
  weight_unit TEXT DEFAULT 'kg',
  length NUMERIC,
  width NUMERIC,
  height NUMERIC,
  dimension_unit TEXT DEFAULT 'cm',
  price NUMERIC,
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  warehouse_location TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Junction table linking EPCs to items
CREATE TABLE public.tag_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  epc TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  gtin TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(epc, item_id)
);

-- Index for fast lookups
CREATE INDEX idx_items_gtin ON public.items(gtin);
CREATE INDEX idx_items_sku ON public.items(sku);
CREATE INDEX idx_tag_items_epc ON public.tag_items(epc);
CREATE INDEX idx_tag_items_gtin ON public.tag_items(gtin);
CREATE INDEX idx_tag_items_item_id ON public.tag_items(item_id);

-- Enable RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_items ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (field tool, no auth)
CREATE POLICY "Anyone can read items" ON public.items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert items" ON public.items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update items" ON public.items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete items" ON public.items FOR DELETE USING (true);

CREATE POLICY "Anyone can read tag_items" ON public.tag_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert tag_items" ON public.tag_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update tag_items" ON public.tag_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete tag_items" ON public.tag_items FOR DELETE USING (true);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
