-- =====================================================
-- FASE 1: Modificar tabla usuarios
-- =====================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_persona INTEGER REFERENCES personas(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_cambio_password TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user ON usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_persona ON usuarios(id_persona);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol_id);

-- =====================================================
-- FASE 2: Modificar tabla submenus_permisos
-- =====================================================

ALTER TABLE submenus_permisos ADD COLUMN IF NOT EXISTS rol_id INTEGER REFERENCES roles(id);
ALTER TABLE submenus_permisos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- =====================================================
-- FASE 3: Actualizar/Insertar roles del sistema
-- =====================================================

-- Actualizar rol existente
UPDATE roles SET nombre = 'Super Administrador' WHERE id = 1;

-- Insertar nuevos roles (sin el 1 que ya existe)
INSERT INTO roles (id, nombre) OVERRIDING SYSTEM VALUE VALUES
  (2, 'Administrador de Proyecto'),
  (3, 'Agente Inmobiliario'),
  (4, 'Inmobiliaria'),
  (5, 'Vendedor'),
  (6, 'Notario'),
  (7, 'Administrador de Mantenimiento'),
  (8, 'Solo Lectura')
ON CONFLICT DO NOTHING;

SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 8));

-- =====================================================
-- FASE 4: Poblar permisos base
-- =====================================================

ALTER TABLE permisos ADD COLUMN IF NOT EXISTS descripcion TEXT;

TRUNCATE permisos CASCADE;

INSERT INTO permisos (id, nombre, descripcion) OVERRIDING SYSTEM VALUE VALUES
  (1, 'leer', 'Ver registros existentes'),
  (2, 'crear', 'Crear nuevos registros'),
  (3, 'actualizar', 'Modificar registros'),
  (4, 'eliminar', 'Eliminar registros'),
  (5, 'aprobar', 'Aprobar acciones (ej: comisiones)'),
  (6, 'exportar', 'Exportar datos'),
  (7, 'configurar', 'Configurar sistema');

SELECT setval('permisos_id_seq', 7);

-- =====================================================
-- FASE 5: Poblar menús principales
-- =====================================================

TRUNCATE menus CASCADE;

INSERT INTO menus (id, nombre) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Dashboard'),
  (2, 'Inventarios'),
  (3, 'Entidades'),
  (4, 'Personas'),
  (5, 'Productos'),
  (6, 'Finanzas'),
  (7, 'Mantenimientos'),
  (8, 'Notarios'),
  (9, 'Legal'),
  (10, 'Configuración');

SELECT setval('menus_id_seq', 10);

-- =====================================================
-- FASE 6: Poblar submenús con sus rutas
-- =====================================================

-- Los submenus ya fueron borrados por el CASCADE de menus

INSERT INTO submenus (id, menu_id, nombre, vista_front_end) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'Dashboard', '/admin'),
  (2, 2, 'Proyectos', '/admin/proyectos'),
  (3, 2, 'Propiedades', '/admin/propiedades'),
  (4, 2, 'Modelos', '/admin/modelos'),
  (5, 2, 'Vistas', '/admin/vistas'),
  (6, 2, 'Estacionamientos', '/admin/estacionamientos'),
  (7, 2, 'Bodegas', '/admin/bodegas'),
  (8, 3, 'Desarrolladores', '/admin/desarrolladores'),
  (9, 3, 'Dueños', '/admin/duenos'),
  (10, 3, 'Inmobiliarias', '/admin/inmobiliarias'),
  (11, 3, 'Administradoras', '/admin/administradoras'),
  (12, 3, 'Entidades Legales', '/admin/entidades-legales'),
  (13, 4, 'Prospectos', '/admin/prospectos'),
  (14, 4, 'Clientes', '/admin/clientes'),
  (15, 4, 'Compradores', '/admin/compradores'),
  (16, 4, 'Residentes', '/admin/residentes'),
  (17, 4, 'Agentes', '/admin/agentes'),
  (18, 4, 'Vendedores', '/admin/vendedores'),
  (19, 4, 'Representantes Legales', '/admin/representantes-legales'),
  (20, 5, 'Categorías', '/admin/categorias-productos'),
  (21, 5, 'Productos', '/admin/productos'),
  (22, 5, 'Servicios', '/admin/servicios'),
  (23, 6, 'Pagos', '/admin/pagos'),
  (24, 6, 'Comisiones', '/admin/comisiones'),
  (25, 6, 'Aprobar Comisiones', '/admin/aprobar-comisiones'),
  (26, 6, 'Pagar Comisiones', '/admin/pagar-comisiones'),
  (27, 7, 'Cuentas Mantenimiento', '/admin/cuentas-mantenimiento'),
  (28, 8, 'Notarías', '/admin/notarias'),
  (29, 8, 'Notarios', '/admin/notarios'),
  (30, 8, 'Revisión Documentación', '/admin/notarios/revision-documentacion'),
  (31, 9, 'Contratos', '/admin/legal/contratos'),
  (32, 10, 'Bancos', '/admin/bancos'),
  (33, 10, 'Usuarios', '/admin/usuarios'),
  (34, 10, 'Consultas IA', '/admin/consultas-ia'),
  (35, 7, 'Reservas', '/admin/reservas');

SELECT setval('submenus_id_seq', 35);

-- =====================================================
-- FASE 7: Asignar menús a roles
-- =====================================================

-- menus_roles ya fue borrado por CASCADE

-- Super Admin tiene acceso a todos los menús
INSERT INTO menus_roles (rol_id, menu_id) SELECT 1, id FROM menus;

-- Administrador de Proyecto
INSERT INTO menus_roles (rol_id, menu_id) VALUES (2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6);

-- Agente Inmobiliario
INSERT INTO menus_roles (rol_id, menu_id) VALUES (3, 1), (3, 2), (3, 4);

-- Inmobiliaria
INSERT INTO menus_roles (rol_id, menu_id) VALUES (4, 1), (4, 2), (4, 6);

-- Vendedor
INSERT INTO menus_roles (rol_id, menu_id) VALUES (5, 1), (5, 2), (5, 4);

-- Notario
INSERT INTO menus_roles (rol_id, menu_id) VALUES (6, 1), (6, 8);

-- Administrador de Mantenimiento
INSERT INTO menus_roles (rol_id, menu_id) VALUES (7, 1), (7, 7);

-- Solo Lectura
INSERT INTO menus_roles (rol_id, menu_id) SELECT 8, id FROM menus;

-- =====================================================
-- FASE 8: Asignar permisos por rol y submenú
-- =====================================================

-- Super Admin: todos los permisos
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, p.id, 1, true FROM submenus s CROSS JOIN permisos p;

-- Admin Proyecto
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, p.id, 2, true
FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 2
CROSS JOIN permisos p WHERE p.id IN (1, 2, 3, 4);

-- Agente
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, 1, 3, true FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 3;

-- Inmobiliaria
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, 1, 4, true FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 4;

-- Vendedor
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, 1, 5, true FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 5;

-- Notario
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, p.id, 6, true FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 6
CROSS JOIN permisos p WHERE p.id IN (1, 3);

-- Admin Mantenimiento
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, p.id, 7, true FROM submenus s
JOIN menus_roles mr ON s.menu_id = mr.menu_id AND mr.rol_id = 7
CROSS JOIN permisos p WHERE p.id IN (1, 2, 3, 4);

-- Solo Lectura
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT s.id, 1, 8, true FROM submenus s;

-- =====================================================
-- FASE 9: RLS Policies en usuarios
-- =====================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own record" ON usuarios;
CREATE POLICY "Users can view own record" ON usuarios FOR SELECT
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all users" ON usuarios;
CREATE POLICY "Admins can view all users" ON usuarios FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM usuarios u JOIN roles r ON u.rol_id = r.id
    WHERE u.auth_user_id = auth.uid() AND r.nombre = 'Super Administrador'
  ));

DROP POLICY IF EXISTS "Admins can modify users" ON usuarios;
CREATE POLICY "Admins can modify users" ON usuarios FOR ALL
  USING (EXISTS (
    SELECT 1 FROM usuarios u JOIN roles r ON u.rol_id = r.id
    WHERE u.auth_user_id = auth.uid() AND r.nombre = 'Super Administrador'
  ));

-- =====================================================
-- FASE 10: Funciones helper
-- =====================================================

CREATE OR REPLACE FUNCTION public.user_has_permission(_submenu_path TEXT, _permission_name TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios u
    JOIN menus_roles mr ON u.rol_id = mr.rol_id AND mr.activo = true
    JOIN submenus s ON s.menu_id = mr.menu_id
    JOIN submenus_permisos sp ON sp.submenu_id = s.id AND sp.rol_id = u.rol_id AND sp.activo = true
    JOIN permisos perm ON perm.id = sp.permiso_id
    WHERE u.auth_user_id = auth.uid() AND s.vista_front_end = _submenu_path
    AND perm.nombre = _permission_name AND u.activo = true
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE _role_name TEXT;
BEGIN
  SELECT r.nombre INTO _role_name FROM usuarios u
  JOIN roles r ON u.rol_id = r.id WHERE u.auth_user_id = auth.uid() AND u.activo = true;
  RETURN _role_name;
END; $$;

CREATE OR REPLACE FUNCTION public.get_user_menus()
RETURNS TABLE (menu_id INTEGER, menu_nombre TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT m.id, m.nombre FROM usuarios u
  JOIN menus_roles mr ON u.rol_id = mr.rol_id AND mr.activo = true
  JOIN menus m ON m.id = mr.menu_id
  WHERE u.auth_user_id = auth.uid() AND u.activo = true ORDER BY m.id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (email TEXT, nombre TEXT, rol_id INTEGER, rol_nombre TEXT, debe_cambiar_password BOOLEAN, id_persona INTEGER, activo BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT u.email, u.nombre, u.rol_id, r.nombre as rol_nombre,
    u.debe_cambiar_password, u.id_persona, u.activo
  FROM usuarios u JOIN roles r ON u.rol_id = r.id WHERE u.auth_user_id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE usuarios SET debe_cambiar_password = false,
    ultimo_cambio_password = NOW(), fecha_actualizacion = NOW()
  WHERE auth_user_id = auth.uid();
END; $$;