-- Shift existing agent portal tabs with orden >= 3 up by 1 to make room
UPDATE submenus SET orden = orden + 1 WHERE menu_id = 16 AND orden >= 3 AND activo = true;

-- Insert "Prospectos" submenu for agent portal
INSERT INTO submenus (menu_id, nombre, vista_front_end, orden, activo)
VALUES (16, 'Prospectos', '/admin/agent/prospectos', 3, true);