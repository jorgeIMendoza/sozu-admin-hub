-- Add permissions for the new Prospectos submenu (id=87) for roles 1 (Super Admin) and 3 (Agente Inmobiliario)
-- Copying from submenu 67 (Inicio) permissions pattern
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT 87, sp.permiso_id, sp.rol_id, true
FROM submenus_permisos sp
WHERE sp.submenu_id = 67 AND sp.activo = true
ON CONFLICT DO NOTHING;