
-- Fix sequences
SELECT setval(pg_get_serial_sequence('menus', 'id'), (SELECT MAX(id) FROM menus));
SELECT setval(pg_get_serial_sequence('submenus', 'id'), (SELECT MAX(id) FROM submenus));

-- Insert Portal Cobranza menu
INSERT INTO menus (nombre, activo, orden) VALUES ('Portal Cobranza', true, 19);

DO $$
DECLARE
  v_menu_id integer;
  v_sub_id integer;
  j integer;
  r integer;
  v_names text[] := ARRAY[
    'Dashboard','Bandeja Operativa','Atención de Clientes','Relación de Pagos',
    'CEPs Pendientes','Conciliaciones','Promesas de Pago','Administrar Avisos',
    'Enviar Avisos','Ejecuciones','Plantillas','Inputs de Obra','Reportes','Configuración'
  ];
  v_paths text[] := ARRAY[
    '/admin/portal-cobranza/dashboard','/admin/portal-cobranza/bandeja',
    '/admin/portal-cobranza/atencion','/admin/portal-cobranza/pagos',
    '/admin/portal-cobranza/ceps','/admin/portal-cobranza/conciliaciones',
    '/admin/portal-cobranza/promesas','/admin/portal-cobranza/comunicacion/avisos',
    '/admin/portal-cobranza/comunicacion/enviar','/admin/portal-cobranza/comunicacion/ejecuciones',
    '/admin/portal-cobranza/comunicacion/plantillas','/admin/portal-cobranza/inputs-obra',
    '/admin/portal-cobranza/reportes','/admin/portal-cobranza/configuracion'
  ];
  v_permisos int[] := ARRAY[1,2,3,4,6];
  v_roles int[] := ARRAY[1,2];
BEGIN
  SELECT id INTO v_menu_id FROM menus WHERE nombre = 'Portal Cobranza' LIMIT 1;

  FOR i IN 1..14 LOOP
    INSERT INTO submenus (menu_id, nombre, vista_front_end, activo, orden)
    VALUES (v_menu_id, v_names[i], v_paths[i], true, i)
    RETURNING id INTO v_sub_id;

    FOREACH j IN ARRAY v_permisos LOOP
      INSERT INTO submenus_permisos_disponibles (submenu_id, permiso_id, activo)
      VALUES (v_sub_id, j, true);
    END LOOP;

    FOREACH r IN ARRAY v_roles LOOP
      FOREACH j IN ARRAY v_permisos LOOP
        INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
        VALUES (v_sub_id, j, r, true);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
