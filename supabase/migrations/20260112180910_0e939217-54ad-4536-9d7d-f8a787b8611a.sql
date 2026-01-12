-- 2. Crear submenu "Usuarios Clientes" en el menu de Usuarios (menu_id 10)
INSERT INTO public.submenus (menu_id, nombre, vista_front_end, activo)
VALUES (10, 'Usuarios Clientes', '/admin/usuarios-clientes', true);

-- 3. Asignar permisos 'leer' y 'actualizar' al submenu para Super Administrador (rol_id 1)
INSERT INTO public.submenus_permisos (submenu_id, permiso_id, rol_id)
SELECT s.id, p.id, 1
FROM public.submenus s
CROSS JOIN public.permisos p
WHERE s.nombre = 'Usuarios Clientes'
AND p.nombre IN ('leer', 'actualizar')
ON CONFLICT DO NOTHING;