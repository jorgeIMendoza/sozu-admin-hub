-- 1. Crear nueva categoría de documento para facturas de comisión
INSERT INTO categorias_tipo_documento (id, nombre) 
VALUES (11, 'Factura de comisión')
ON CONFLICT (id) DO NOTHING;

-- 2. Crear tipo de documento "Factura de comisión externa"
INSERT INTO tipos_documento (nombre, id_categoria_documento, asignado_a, activo)
VALUES ('Factura de comisión externa', 11, 'comision', true);

-- 3. Crear el submenu "Comisiones externas" en Finanzas (menu_id = 6)
-- Usamos id 45 (siguiente disponible después de 44)
INSERT INTO submenus (id, menu_id, nombre, vista_front_end, activo)
OVERRIDING SYSTEM VALUE
VALUES (45, 6, 'Comisiones externas', '/admin/comisiones-externas', true);

-- 4. Resetear la secuencia de submenus
SELECT setval('submenus_id_seq', 45, true);

-- 5. Asignar todos los permisos al rol "Administrador de Proyecto" (rol_id = 2)
-- Permisos: leer(1), crear(2), actualizar(3), eliminar(4), aprobar(5), exportar(6)
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
VALUES 
  (45, 2, 1, true),  -- leer
  (45, 2, 2, true),  -- crear
  (45, 2, 3, true),  -- actualizar
  (45, 2, 4, true),  -- eliminar
  (45, 2, 5, true),  -- aprobar
  (45, 2, 6, true);  -- exportar