-- Insertar submenu "Pago Proveedores" en menu Finanzas
INSERT INTO submenus (id, nombre, menu_id, activo) 
OVERRIDING SYSTEM VALUE
VALUES (50, 'Pago Proveedores', 6, true);

-- Insertar permisos Leer (1) para roles 1, 21, 12
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
VALUES 
  (50, 1, 1, true),
  (50, 1, 21, true),
  (50, 1, 12, true);

-- Insertar permisos Exportar (6) para roles 1, 21, 12
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
VALUES 
  (50, 6, 1, true),
  (50, 6, 21, true),
  (50, 6, 12, true);