-- Actualizar políticas de documentos para permitir acceso anónimo

-- Eliminar política de INSERT existente y crear una nueva para anon
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar documentos" ON public.documentos;

CREATE POLICY "Usuarios pueden insertar documentos"
ON public.documentos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Actualizar política de SELECT para incluir anon
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver documentos" ON public.documentos;

CREATE POLICY "Usuarios pueden ver documentos"
ON public.documentos
FOR SELECT
TO anon, authenticated
USING (true);

-- Actualizar política de UPDATE para incluir anon
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar documentos" ON public.documentos;

CREATE POLICY "Usuarios pueden actualizar documentos"
ON public.documentos
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Actualizar políticas de Storage para proyectos_escritura

-- Permitir uploads anónimos
DROP POLICY IF EXISTS "Usuarios autenticados pueden subir proyectos de escritura" ON storage.objects;

CREATE POLICY "Usuarios pueden subir proyectos de escritura"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'proyectos_escritura');

-- Permitir ver archivos anónimamente
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver proyectos de escritura" ON storage.objects;

CREATE POLICY "Usuarios pueden ver proyectos de escritura"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'proyectos_escritura');

-- Permitir actualizar archivos
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar proyectos de escritura" ON storage.objects;

CREATE POLICY "Usuarios pueden actualizar proyectos de escritura"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'proyectos_escritura');