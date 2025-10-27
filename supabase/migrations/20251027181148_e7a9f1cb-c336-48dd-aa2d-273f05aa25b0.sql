-- Eliminar las políticas restrictivas actuales para templates
DROP POLICY IF EXISTS "Authenticated users can insert templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their templates" ON storage.objects;

-- Crear nuevas políticas más permisivas que incluyan anon y authenticated
CREATE POLICY "Allow anon and authenticated to insert templates"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Allow anon and authenticated to delete templates"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Allow anon and authenticated to update templates"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'templates_proyecto_escritura')
WITH CHECK (bucket_id = 'templates_proyecto_escritura');