-- Add RLS policies for the ofertas bucket to allow uploads

-- Policy for inserting/uploading files to ofertas bucket
CREATE POLICY "Allow authenticated users to upload ofertas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ofertas');

-- Policy for updating/replacing files in ofertas bucket  
CREATE POLICY "Allow authenticated users to update ofertas"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'ofertas');

-- Policy for public read access (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Ofertas PDFs are publicly accessible'
  ) THEN
    CREATE POLICY "Ofertas PDFs are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'ofertas');
  END IF;
END $$;