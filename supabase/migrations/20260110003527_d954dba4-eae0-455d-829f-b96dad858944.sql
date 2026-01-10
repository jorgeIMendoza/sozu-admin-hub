-- 1. Agregar columna para marcar roles internos (invisibles en Roles y Permisos)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_rol_interno BOOLEAN NOT NULL DEFAULT false;

-- 2. Crear el rol "Directores" como rol interno (no aparece en la lista de roles)
INSERT INTO roles (nombre, activo, es_rol_interno, ver_filtros_avanzados_eliminados, ver_todos_duenos)
VALUES ('Directores', true, true, false, false);

-- 3. Renombrar el submenu "Usuarios" a "Usuarios del Sistema"
UPDATE submenus 
SET nombre = 'Usuarios del Sistema', fecha_actualizacion = NOW()
WHERE id = 33;

-- 4. Agregar nuevo submenu "Usuarios Directivos"
INSERT INTO submenus (menu_id, nombre, vista_front_end, activo)
VALUES (10, 'Usuarios Directivos', '/admin/usuarios-directivos', true);