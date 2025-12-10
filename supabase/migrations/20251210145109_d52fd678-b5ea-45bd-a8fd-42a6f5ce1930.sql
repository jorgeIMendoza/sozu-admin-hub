-- Primero eliminar las referencias en submenus_permisos
DELETE FROM submenus_permisos
WHERE permiso_id = (SELECT id FROM permisos WHERE nombre = 'configurar');

-- Luego eliminar el permiso de la tabla permisos
DELETE FROM permisos WHERE nombre = 'configurar';