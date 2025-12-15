-- Eliminar todos los permisos del Dashboard (submenu_id = 1) excepto "leer" (permiso_id = 1)
DELETE FROM submenus_permisos 
WHERE submenu_id = 1 
AND permiso_id != 1;