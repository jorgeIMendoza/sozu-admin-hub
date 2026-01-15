-- Crear rol "Cliente" como rol interno (no visible en Roles y Permisos)
INSERT INTO roles (nombre, activo, es_rol_interno, ver_todos_prospectos_compradores, ver_todos_proyectos_propiedades, ver_filtros_avanzados_eliminados, ver_todos_duenos)
VALUES ('Cliente', true, true, false, false, false, false);