INSERT INTO submenus (nombre, vista_front_end, orden, menu_id, activo)
VALUES ('Pagos', '/admin/portal-cliente/pagos', 3, 18, true);

UPDATE submenus SET orden = 4 WHERE id = 84;