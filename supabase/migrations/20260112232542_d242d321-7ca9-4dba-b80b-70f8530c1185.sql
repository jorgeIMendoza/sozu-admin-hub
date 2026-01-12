-- Agregar política para que roles internos puedan ver todos los usuarios
-- Esto permite que usuarios con roles de administración interna vean 
-- los nombres de los comisionistas en la vista de Pagar Comisiones

CREATE POLICY "Internal roles can view all users"
ON public.usuarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid()
    AND r.es_rol_interno = true
  )
);