-- Primero eliminar la política que causa recursión
DROP POLICY IF EXISTS "Internal roles can view all users" ON public.usuarios;

-- Crear función SECURITY DEFINER para verificar si el usuario tiene rol interno
-- Esto evita la recursión infinita
CREATE OR REPLACE FUNCTION public.user_has_internal_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = _user_id
    AND r.es_rol_interno = true
  );
$$;

-- Crear la política usando la función SECURITY DEFINER
CREATE POLICY "Internal roles can view all users"
ON public.usuarios
FOR SELECT
USING (
  public.user_has_internal_role(auth.uid())
);