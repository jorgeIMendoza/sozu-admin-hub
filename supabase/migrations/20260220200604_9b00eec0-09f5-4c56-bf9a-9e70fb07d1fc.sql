
-- Insert new submenu for Configuración de Citas under Comunicación menu (id=14)
INSERT INTO public.submenus (nombre, vista_front_end, menu_id, orden, activo)
VALUES ('Configuración de Citas', '/admin/comunicacion/configuracion-citas', 14, 4, true);

-- Get the new submenu ID and insert available permissions (leer=1, crear=2, actualizar=3, eliminar=4)
INSERT INTO public.submenus_permisos_disponibles (submenu_id, permiso_id, activo)
SELECT s.id, p.id, true
FROM submenus s
CROSS JOIN (SELECT id FROM permisos WHERE nombre IN ('leer', 'crear', 'actualizar', 'eliminar')) p
WHERE s.vista_front_end = '/admin/comunicacion/configuracion-citas';
