-- 1. Crear el menú principal "Inmobiliarias" para el rol Inmobiliaria
INSERT INTO menus (nombre, activo)
VALUES ('Inmobiliarias', true)
ON CONFLICT DO NOTHING;

-- 2. Crear submenús y asignar permisos
DO $$
DECLARE
    v_menu_id INTEGER;
    v_submenu_mis_agentes_id INTEGER;
    v_submenu_mis_propiedades_id INTEGER;
    v_submenu_mis_ventas_id INTEGER;
    v_permiso_leer_id INTEGER;
    v_permiso_crear_id INTEGER;
    v_permiso_actualizar_id INTEGER;
    v_permiso_eliminar_id INTEGER;
    v_permiso_exportar_id INTEGER;
    v_permiso_generar_oferta_id INTEGER;
    v_rol_super_admin_id INTEGER := 1;
    v_rol_inmobiliaria_id INTEGER := 4;
BEGIN
    -- Obtener el ID del menú
    SELECT id INTO v_menu_id FROM menus WHERE nombre = 'Inmobiliarias' LIMIT 1;
    
    -- Obtener IDs de permisos
    SELECT id INTO v_permiso_leer_id FROM permisos WHERE nombre = 'leer';
    SELECT id INTO v_permiso_crear_id FROM permisos WHERE nombre = 'crear';
    SELECT id INTO v_permiso_actualizar_id FROM permisos WHERE nombre = 'actualizar';
    SELECT id INTO v_permiso_eliminar_id FROM permisos WHERE nombre = 'eliminar';
    SELECT id INTO v_permiso_exportar_id FROM permisos WHERE nombre = 'exportar';
    SELECT id INTO v_permiso_generar_oferta_id FROM permisos WHERE nombre = 'generar_oferta';
    
    -- 3. Crear submenús
    INSERT INTO submenus (menu_id, nombre, vista_front_end, activo)
    VALUES (v_menu_id, 'Mis Agentes', '/admin/inmobiliarias/mis-agentes', true)
    RETURNING id INTO v_submenu_mis_agentes_id;
    
    INSERT INTO submenus (menu_id, nombre, vista_front_end, activo)
    VALUES (v_menu_id, 'Mis Propiedades', '/admin/inmobiliarias/mis-propiedades', true)
    RETURNING id INTO v_submenu_mis_propiedades_id;
    
    INSERT INTO submenus (menu_id, nombre, vista_front_end, activo)
    VALUES (v_menu_id, 'Mis Ventas', '/admin/inmobiliarias/mis-ventas', true)
    RETURNING id INTO v_submenu_mis_ventas_id;
    
    -- 4. Asignar permisos a Super Admin para todos los submenús
    -- Mis Agentes
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_agentes_id, v_rol_super_admin_id, v_permiso_leer_id, true),
        (v_submenu_mis_agentes_id, v_rol_super_admin_id, v_permiso_crear_id, true),
        (v_submenu_mis_agentes_id, v_rol_super_admin_id, v_permiso_actualizar_id, true),
        (v_submenu_mis_agentes_id, v_rol_super_admin_id, v_permiso_eliminar_id, true),
        (v_submenu_mis_agentes_id, v_rol_super_admin_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
    
    -- Mis Propiedades
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_propiedades_id, v_rol_super_admin_id, v_permiso_leer_id, true),
        (v_submenu_mis_propiedades_id, v_rol_super_admin_id, v_permiso_generar_oferta_id, true),
        (v_submenu_mis_propiedades_id, v_rol_super_admin_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
    
    -- Mis Ventas
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_ventas_id, v_rol_super_admin_id, v_permiso_leer_id, true),
        (v_submenu_mis_ventas_id, v_rol_super_admin_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
    
    -- 5. Asignar permisos al rol Inmobiliaria para todos los submenús
    -- Mis Agentes
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_agentes_id, v_rol_inmobiliaria_id, v_permiso_leer_id, true),
        (v_submenu_mis_agentes_id, v_rol_inmobiliaria_id, v_permiso_crear_id, true),
        (v_submenu_mis_agentes_id, v_rol_inmobiliaria_id, v_permiso_actualizar_id, true),
        (v_submenu_mis_agentes_id, v_rol_inmobiliaria_id, v_permiso_eliminar_id, true),
        (v_submenu_mis_agentes_id, v_rol_inmobiliaria_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
    
    -- Mis Propiedades
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_propiedades_id, v_rol_inmobiliaria_id, v_permiso_leer_id, true),
        (v_submenu_mis_propiedades_id, v_rol_inmobiliaria_id, v_permiso_generar_oferta_id, true),
        (v_submenu_mis_propiedades_id, v_rol_inmobiliaria_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
    
    -- Mis Ventas
    INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
    VALUES 
        (v_submenu_mis_ventas_id, v_rol_inmobiliaria_id, v_permiso_leer_id, true),
        (v_submenu_mis_ventas_id, v_rol_inmobiliaria_id, v_permiso_exportar_id, true)
    ON CONFLICT DO NOTHING;
END $$;

-- 6. Crear trigger para desactivar usuario cuando se elimina (soft delete) un agente
CREATE OR REPLACE FUNCTION public.deactivate_user_on_agent_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el agente se está desactivando (soft delete)
    IF OLD.activo = true AND NEW.activo = false THEN
        -- Buscar el usuario asociado a esta persona y desactivarlo
        UPDATE usuarios
        SET activo = false, fecha_actualizacion = now()
        WHERE id_persona = NEW.id
        AND activo = true;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Crear el trigger en la tabla personas
DROP TRIGGER IF EXISTS trigger_deactivate_user_on_agent_delete ON personas;
CREATE TRIGGER trigger_deactivate_user_on_agent_delete
    AFTER UPDATE ON personas
    FOR EACH ROW
    WHEN (OLD.activo = true AND NEW.activo = false)
    EXECUTE FUNCTION public.deactivate_user_on_agent_delete();