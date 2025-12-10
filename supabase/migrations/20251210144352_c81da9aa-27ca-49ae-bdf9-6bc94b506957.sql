-- Agregar nuevo permiso "generar_oferta" (sin especificar id, se genera automáticamente)
INSERT INTO permisos (nombre, descripcion, activo)
VALUES ('generar_oferta', 'Generar ofertas comerciales', true)
ON CONFLICT DO NOTHING;

-- Agregar permiso generar_oferta al Super Admin para el submenu Propiedades (id=3)
-- El id del permiso se obtiene dinámicamente
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
SELECT 3, p.id, 1, true
FROM permisos p
WHERE p.nombre = 'generar_oferta'
ON CONFLICT DO NOTHING;