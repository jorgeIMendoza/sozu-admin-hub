-- Verificar y recrear las políticas de storage para templates_proyecto_escritura

-- Primero eliminar TODAS las políticas relacionadas con este bucket
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage'
        AND (policyname LIKE '%template%' OR policyname LIKE '%authenticated%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Crear políticas simples y permisivas para usuarios autenticados
CREATE POLICY "Anyone authenticated can insert templates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Anyone authenticated can read templates"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Anyone authenticated can update templates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Anyone authenticated can delete templates"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'templates_proyecto_escritura');

-- Permitir lectura pública
CREATE POLICY "Anyone can read templates publicly"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'templates_proyecto_escritura');