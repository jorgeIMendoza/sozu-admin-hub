-- Drop existing policies for templates_proyecto_escritura bucket
DROP POLICY IF EXISTS "Authenticated users can upload templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON storage.objects;

-- Create new policies with proper conditions for templates_proyecto_escritura bucket
CREATE POLICY "Allow authenticated users to upload templates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Allow authenticated users to view templates"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Allow authenticated users to update templates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura')
WITH CHECK (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Allow authenticated users to delete templates"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura');