-- Drop and recreate function with new return type
DROP FUNCTION IF EXISTS public.get_current_user_profile();

CREATE FUNCTION public.get_current_user_profile()
RETURNS TABLE(
  email text,
  nombre text,
  rol_id integer,
  rol_nombre text,
  debe_cambiar_password boolean,
  id_persona integer,
  activo boolean,
  ver_todos_prospectos_compradores boolean,
  ver_filtros_avanzados_eliminados boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT 
    u.email, 
    u.nombre, 
    u.rol_id, 
    r.nombre as rol_nombre,
    u.debe_cambiar_password, 
    u.id_persona, 
    u.activo,
    COALESCE(r.ver_todos_prospectos_compradores, false) as ver_todos_prospectos_compradores,
    COALESCE(r.ver_filtros_avanzados_eliminados, true) as ver_filtros_avanzados_eliminados
  FROM usuarios u 
  JOIN roles r ON u.rol_id = r.id 
  WHERE u.auth_user_id = auth.uid();
END;
$$;