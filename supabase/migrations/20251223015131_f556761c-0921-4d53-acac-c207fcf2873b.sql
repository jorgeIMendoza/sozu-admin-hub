-- Fix the get_accessible_report_ids function to properly join with roles table
CREATE OR REPLACE FUNCTION public.get_accessible_report_ids()
RETURNS TABLE(reporte_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _rol_id INTEGER;
    _rol_nombre TEXT;
BEGIN
    -- Get current user's role (with JOIN to roles table)
    SELECT u.rol_id, r.nombre INTO _rol_id, _rol_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.email = auth.email();
    
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
$$;