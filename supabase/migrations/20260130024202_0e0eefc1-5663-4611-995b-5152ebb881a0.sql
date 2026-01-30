-- Insert new submenu "Mi información" in Inmobiliarias menu
INSERT INTO public.submenus (nombre, vista_front_end, menu_id, activo, fecha_creacion, fecha_actualizacion)
SELECT 
  'Mi información', 
  '/admin/inmobiliarias/mi-informacion', 
  m.id,
  true,
  NOW(),
  NOW()
FROM public.menus m
WHERE m.nombre = 'Inmobiliarias'
AND NOT EXISTS (
  SELECT 1 FROM public.submenus WHERE vista_front_end = '/admin/inmobiliarias/mi-informacion'
);

-- Assign permissions to Super Admin (rol_id = 1) and Inmobiliaria (rol_id = 4)
DO $$
DECLARE
  v_submenu_id INTEGER;
  v_super_admin_rol_id INTEGER := 1;
  v_inmobiliaria_rol_id INTEGER := 4;
  v_permiso_leer_id INTEGER;
  v_permiso_crear_id INTEGER;
  v_permiso_actualizar_id INTEGER;
  v_permiso_eliminar_id INTEGER;
  v_permiso_aprobar_id INTEGER;
  v_permiso_exportar_id INTEGER;
BEGIN
  -- Get submenu ID
  SELECT id INTO v_submenu_id FROM public.submenus WHERE vista_front_end = '/admin/inmobiliarias/mi-informacion';
  
  IF v_submenu_id IS NULL THEN
    RAISE EXCEPTION 'Submenu not found';
  END IF;
  
  -- Get permission IDs
  SELECT id INTO v_permiso_leer_id FROM public.permisos WHERE nombre = 'leer';
  SELECT id INTO v_permiso_crear_id FROM public.permisos WHERE nombre = 'crear';
  SELECT id INTO v_permiso_actualizar_id FROM public.permisos WHERE nombre = 'actualizar';
  SELECT id INTO v_permiso_eliminar_id FROM public.permisos WHERE nombre = 'eliminar';
  SELECT id INTO v_permiso_aprobar_id FROM public.permisos WHERE nombre = 'aprobar';
  SELECT id INTO v_permiso_exportar_id FROM public.permisos WHERE nombre = 'exportar';
  
  -- Assign all permissions to Super Admin (rol_id = 1)
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_leer_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_leer_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_crear_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_crear_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_actualizar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_actualizar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_eliminar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_eliminar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_aprobar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_aprobar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_super_admin_rol_id, v_permiso_exportar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_super_admin_rol_id AND permiso_id = v_permiso_exportar_id);
  
  -- Assign all permissions to Inmobiliaria (rol_id = 4)
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_leer_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_leer_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_crear_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_crear_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_actualizar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_actualizar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_eliminar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_eliminar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_aprobar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_aprobar_id);
  
  INSERT INTO public.submenus_permisos (submenu_id, rol_id, permiso_id, activo, fecha_creacion, fecha_actualizacion)
  SELECT v_submenu_id, v_inmobiliaria_rol_id, v_permiso_exportar_id, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM public.submenus_permisos WHERE submenu_id = v_submenu_id AND rol_id = v_inmobiliaria_rol_id AND permiso_id = v_permiso_exportar_id);
  
END $$;