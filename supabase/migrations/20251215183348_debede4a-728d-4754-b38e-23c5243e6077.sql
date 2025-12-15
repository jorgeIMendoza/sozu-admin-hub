-- Primero DROP y luego CREATE para cambiar el tipo de retorno
DROP FUNCTION IF EXISTS public.get_current_user_profile();

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
 RETURNS TABLE(
   email text, 
   nombre text, 
   rol_id integer, 
   rol_nombre text, 
   debe_cambiar_password boolean, 
   id_persona integer, 
   activo boolean,
   ver_todos_prospectos_compradores boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT 
    u.email, 
    u.nombre, 
    u.rol_id, 
    r.nombre as rol_nombre,
    u.debe_cambiar_password, 
    u.id_persona, 
    u.activo,
    COALESCE(r.ver_todos_prospectos_compradores, false) as ver_todos_prospectos_compradores
  FROM usuarios u 
  JOIN roles r ON u.rol_id = r.id 
  WHERE u.auth_user_id = auth.uid();
END;
$function$;