-- Actualizar la función para usar auth.uid() en lugar de auth.email()
CREATE OR REPLACE FUNCTION public.user_can_access_report(_reporte_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _rol_id INTEGER;
    _rol_nombre TEXT;
    _has_access BOOLEAN;
BEGIN
    -- Get current user's role using auth_user_id (más confiable que email)
    SELECT u.rol_id, r.nombre INTO _rol_id, _rol_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid()
    AND u.activo = true;
    
    -- Si no encontró el usuario, intentar con email como fallback
    IF _rol_id IS NULL THEN
        SELECT u.rol_id, r.nombre INTO _rol_id, _rol_nombre
        FROM usuarios u
        JOIN roles r ON r.id = u.rol_id
        WHERE u.email = auth.email()
        AND u.activo = true;
    END IF;
    
    -- Super Admin has access to everything
    IF _rol_nombre = 'Super Administrador' THEN
        RETURN TRUE;
    END IF;
    
    -- Check if role has access to this specific report
    SELECT EXISTS (
        SELECT 1
        FROM roles_reportes
        WHERE rol_id = _rol_id
        AND reporte_id = _reporte_id
        AND activo = true
    ) INTO _has_access;
    
    RETURN COALESCE(_has_access, FALSE);
END;
$function$;

-- También actualizar get_accessible_report_ids para consistencia
CREATE OR REPLACE FUNCTION public.get_accessible_report_ids()
 RETURNS TABLE(reporte_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _rol_id INTEGER;
    _rol_nombre TEXT;
BEGIN
    -- Get current user's role using auth_user_id
    SELECT u.rol_id, r.nombre INTO _rol_id, _rol_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid()
    AND u.activo = true;
    
    -- Fallback to email if auth_user_id not found
    IF _rol_id IS NULL THEN
        SELECT u.rol_id, r.nombre INTO _rol_id, _rol_nombre
        FROM usuarios u
        JOIN roles r ON r.id = u.rol_id
        WHERE u.email = auth.email()
        AND u.activo = true;
    END IF;
    
    -- Super Admin has access to all active reports
    IF _rol_nombre = 'Super Administrador' THEN
        RETURN QUERY SELECT rep.id FROM reportes rep WHERE rep.activo = true;
        RETURN;
    END IF;
    
    -- Return report IDs the role has access to
    RETURN QUERY
    SELECT rr.reporte_id
    FROM roles_reportes rr
    WHERE rr.rol_id = _rol_id
    AND rr.activo = true;
END;
$function$;