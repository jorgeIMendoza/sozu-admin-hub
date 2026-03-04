
-- Menu Portal Inmobiliaria (ID 17)
INSERT INTO menus (id, nombre, orden, activo)
OVERRIDING SYSTEM VALUE
VALUES (17, 'Portal Inmobiliaria', 17, true);

-- 8 submenus (IDs 73-80)
INSERT INTO submenus (id, nombre, vista_front_end, menu_id, orden, activo)
OVERRIDING SYSTEM VALUE
VALUES
  (73, 'Dashboard',      '/admin/portal-inmobiliaria/dashboard',      17, 1, true),
  (74, 'Agentes',        '/admin/portal-inmobiliaria/agentes',        17, 2, true),
  (75, 'Pipeline',       '/admin/portal-inmobiliaria/pipeline',       17, 3, true),
  (76, 'Prospectos',     '/admin/portal-inmobiliaria/prospectos',     17, 4, true),
  (77, 'Citas',          '/admin/portal-inmobiliaria/citas',          17, 5, true),
  (78, 'Comisiones',     '/admin/portal-inmobiliaria/comisiones',     17, 6, true),
  (79, 'Reportes',       '/admin/portal-inmobiliaria/reportes',       17, 7, true),
  (80, 'Configuración',  '/admin/portal-inmobiliaria/configuracion',  17, 8, true);

-- Permisos for Super Admin (rol 1) - permiso leer (id 1)
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
SELECT s.id, 1, 1, true
FROM submenus s WHERE s.menu_id = 17;

-- Permisos for Inmobiliaria (rol 4) - permiso leer (id 1)
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
SELECT s.id, 4, 1, true
FROM submenus s WHERE s.menu_id = 17;

-- Permisos disponibles: leer (1), crear (2), actualizar (3), eliminar (4), exportar (6) for all submenus
INSERT INTO submenus_permisos_disponibles (submenu_id, permiso_id)
SELECT s.id, p.id
FROM submenus s
CROSS JOIN (SELECT id FROM permisos WHERE id IN (1, 2, 3, 4, 6)) p
WHERE s.menu_id = 17;
