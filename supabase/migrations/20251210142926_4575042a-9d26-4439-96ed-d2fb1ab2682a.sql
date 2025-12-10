-- Renombrar menu Configuración a Sistema
UPDATE menus SET nombre = 'Sistema' WHERE id = 10;

-- Mover Bancos de Configuración (10) a Entidades (3)
UPDATE submenus SET menu_id = 3 WHERE id = 32;

-- Mover Notarías de Notarios (8) a Entidades (3)
UPDATE submenus SET menu_id = 3 WHERE id = 28;

-- Mover Dueños de Entidades (3) a Personas (4)
UPDATE submenus SET menu_id = 4 WHERE id = 9;

-- Desactivar Notarios (persona) ya que no existe en sidebar
UPDATE submenus SET activo = false WHERE id = 29;

-- Agregar submenú Roles y Permisos al menú Sistema (10)
INSERT INTO submenus (nombre, menu_id, vista_front_end, activo)
VALUES ('Roles y Permisos', 10, '/admin/roles-permisos', true);

-- Agregar submenú Administradores (personas) si no existe
INSERT INTO submenus (nombre, menu_id, vista_front_end, activo)
SELECT 'Administradores', 4, '/admin/administradores-personas', true
WHERE NOT EXISTS (SELECT 1 FROM submenus WHERE vista_front_end = '/admin/administradores-personas');

-- Corregir path de Aprobar Comisiones
UPDATE submenus SET vista_front_end = '/admin/aprobacion-comisiones' WHERE id = 25;

-- Corregir nombre de Aprobar Comisiones
UPDATE submenus SET nombre = 'Aprobación de Comisiones' WHERE id = 25;

-- Actualizar Cuentas Mantenimiento a Cuentas de mantenimientos
UPDATE submenus SET nombre = 'Cuentas de mantenimientos' WHERE id = 27;

-- Actualizar Reservas a Reservas de espacios
UPDATE submenus SET nombre = 'Reservas de espacios' WHERE id = 35;

-- Agregar Cuentas de cobranza si no existe
INSERT INTO submenus (nombre, menu_id, vista_front_end, activo)
SELECT 'Cuentas de cobranza', 6, '/admin/cuentas-cobranza', true
WHERE NOT EXISTS (SELECT 1 FROM submenus WHERE vista_front_end = '/admin/cuentas-cobranza');

-- Desactivar Pagos ya que no aparece en el sidebar actual
UPDATE submenus SET activo = false WHERE id = 23;

-- Desactivar Clientes ya que no aparece en el sidebar actual  
UPDATE submenus SET activo = false WHERE id = 14;

-- Desactivar Consultas IA del menú Sistema (se accede desde Dashboard)
UPDATE submenus SET activo = false WHERE id = 34;