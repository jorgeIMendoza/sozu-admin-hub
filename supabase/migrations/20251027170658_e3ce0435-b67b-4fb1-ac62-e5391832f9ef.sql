-- Limpiar políticas existentes completamente
DO $$ 
DECLARE
    pol record;
BEGIN
    -- Eliminar políticas en storage.objects
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage'
        AND policyname LIKE '%template%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
    
    -- Eliminar políticas en storage.buckets
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'buckets' 
        AND schemaname = 'storage'
        AND policyname LIKE '%template%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.buckets', pol.policyname);
    END LOOP;
END $$;

-- Asegurar que el bucket existe y es público
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates_proyecto_escritura', 'templates_proyecto_escritura', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas en storage.buckets (necesarias para que funcione el upload)
CREATE POLICY "Allow public select on templates bucket"
ON storage.buckets
FOR SELECT
TO public
USING (id = 'templates_proyecto_escritura');

CREATE POLICY "Allow authenticated insert on templates bucket"
ON storage.buckets
FOR INSERT
TO authenticated
WITH CHECK (id = 'templates_proyecto_escritura');

-- Políticas en storage.objects
CREATE POLICY "Public can view templates"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'templates_proyecto_escritura');

CREATE POLICY "Authenticated users can insert templates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'templates_proyecto_escritura'
);

CREATE POLICY "Authenticated users can update their templates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'templates_proyecto_escritura'
)
WITH CHECK (
  bucket_id = 'templates_proyecto_escritura'
);

CREATE POLICY "Authenticated users can delete templates"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'templates_proyecto_escritura'
);