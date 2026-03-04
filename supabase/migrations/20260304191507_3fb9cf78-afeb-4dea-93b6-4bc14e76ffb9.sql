-- Reset the submenus identity sequence
SELECT setval(pg_get_serial_sequence('submenus', 'id'), COALESCE((SELECT MAX(id) FROM submenus), 1));

-- Insert submenu
INSERT INTO submenus (nombre, vista_front_end, menu_id, orden, activo, solo_usuarioa)
VALUES ('Todas las Citas', '/admin/comunicacion/todas-las-citas', 14, 5, true, false);

-- Add read permission for Super Admin
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
SELECT s.id, 1, 1, true
FROM submenus s WHERE s.vista_front_end = '/admin/comunicacion/todas-las-citas';

-- Add only 'leer' as available permission
INSERT INTO submenus_permisos_disponibles (submenu_id, permiso_id, activo)
SELECT s.id, 1, true
FROM submenus s WHERE s.vista_front_end = '/admin/comunicacion/todas-las-citas';