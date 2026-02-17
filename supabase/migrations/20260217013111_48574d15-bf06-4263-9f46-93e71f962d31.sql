-- Insert the new submenu "Mis Proyectos" under "Datos Inmobiliarios" (menu_id = 12)
INSERT INTO public.submenus (menu_id, nombre, vista_front_end, orden, activo)
VALUES (12, 'Mis Proyectos', '/admin/inmobiliarias/mis-proyectos', 5, true);

-- Add "Leer" permission for Super Admin (rol_id = 1) for this new submenu
INSERT INTO public.submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, 1, 1, true
FROM public.submenus s
WHERE s.vista_front_end = '/admin/inmobiliarias/mis-proyectos'
AND s.activo = true
LIMIT 1;

-- Mark only "Leer" as available permission for this submenu
INSERT INTO public.submenus_permisos_disponibles (submenu_id, permiso_id, activo)
SELECT s.id, 1, true
FROM public.submenus s
WHERE s.vista_front_end = '/admin/inmobiliarias/mis-proyectos'
AND s.activo = true
LIMIT 1;
