-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-images', 'item-images', true);

-- Allow public read
CREATE POLICY "Anyone can view item images"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-images');

-- Allow public upload
CREATE POLICY "Anyone can upload item images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'item-images');

-- Allow public update
CREATE POLICY "Anyone can update item images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'item-images');

-- Allow public delete
CREATE POLICY "Anyone can delete item images"
ON storage.objects FOR DELETE
USING (bucket_id = 'item-images');