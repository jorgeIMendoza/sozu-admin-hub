
INSERT INTO submenus (id, nombre, vista_front_end, menu_id, orden, activo)
OVERRIDING SYSTEM VALUE
VALUES
  (88, 'Config. Notificaciones', '/admin/notificaciones-config', 13, 10, true),
  (89, 'Logs de Notificaciones', '/admin/notificaciones-log', 13, 11, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
VALUES
  (88, 1, 1, true), (88, 1, 2, true), (88, 1, 3, true), (88, 1, 4, true),
  (89, 1, 1, true), (89, 1, 2, true), (89, 1, 3, true), (89, 1, 4, true)
ON CONFLICT DO NOTHING;

SELECT setval('submenus_id_seq', (SELECT MAX(id) FROM submenus));
