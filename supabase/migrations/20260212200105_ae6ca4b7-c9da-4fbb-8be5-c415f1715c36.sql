
-- Fix sequence for menus table
SELECT setval(pg_get_serial_sequence('public.menus', 'id'), (SELECT MAX(id) FROM public.menus));

-- 1. Crear menu CRM con orden 15
INSERT INTO public.menus (nombre, orden, activo)
VALUES ('CRM', 15, true);

-- 2. Crear submenus
INSERT INTO public.submenus (nombre, vista_front_end, menu_id, orden, activo)
VALUES 
  ('Workflow de Ofertas', '/admin/crm/workflow-ofertas', (SELECT id FROM menus WHERE nombre = 'CRM' AND orden = 15), 1, true),
  ('Dashboard Ejecutivo', '/admin/crm/dashboard-ejecutivo', (SELECT id FROM menus WHERE nombre = 'CRM' AND orden = 15), 2, true);

-- 3. Permisos Super Admin (rol_id=1)
INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo)
VALUES 
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 1, 1, true),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 1, 3, true),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 1, 1, true);

-- 4. Permisos disponibles - Workflow
INSERT INTO public.submenus_permisos_disponibles (submenu_id, permiso_id, activo)
VALUES
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 1, true),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 2, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 3, true),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 4, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 5, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 6, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/workflow-ofertas'), 8, false),
  -- Dashboard
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 1, true),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 2, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 3, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 4, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 5, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 6, false),
  ((SELECT id FROM submenus WHERE vista_front_end = '/admin/crm/dashboard-ejecutivo'), 8, false);
