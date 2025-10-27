
-- Habilitar RLS en la tabla notarios
ALTER TABLE public.notarios ENABLE ROW LEVEL SECURITY;

-- Política para permitir SELECT a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden ver notarios"
ON public.notarios
FOR SELECT
TO authenticated
USING (true);

-- Política para permitir INSERT a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden crear notarios"
ON public.notarios
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir UPDATE a usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden actualizar notarios"
ON public.notarios
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para permitir DELETE a usuarios autenticados (soft delete)
CREATE POLICY "Usuarios autenticados pueden eliminar notarios"
ON public.notarios
FOR DELETE
TO authenticated
USING (true);
