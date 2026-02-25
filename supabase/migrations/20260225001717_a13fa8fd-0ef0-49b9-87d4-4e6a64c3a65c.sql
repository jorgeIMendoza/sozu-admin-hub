
-- Limpiar permisos que no corresponden a cada submenu del Portal Agente

-- Inicio (67): debe tener leer(1), crear(2), actualizar(3) — NO generar_oferta(8)
DELETE FROM submenus_permisos WHERE submenu_id = 67 AND permiso_id = 8;

-- Agregar crear(2) para Super Admin en Inicio (faltaba)
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
VALUES (67, 1, 2, true)
ON CONFLICT DO NOTHING;

-- Inventario (68): debe tener leer(1), generar_oferta(8) — NO actualizar(3)
DELETE FROM submenus_permisos WHERE submenu_id = 68 AND permiso_id = 3;

-- Pipeline (69): debe tener leer(1), actualizar(3) — NO generar_oferta(8)
DELETE FROM submenus_permisos WHERE submenu_id = 69 AND permiso_id = 8;

-- Comisiones (70): debe tener leer(1), actualizar(3) — NO generar_oferta(8)
DELETE FROM submenus_permisos WHERE submenu_id = 70 AND permiso_id = 8;

-- Perfil (71): debe tener leer(1), actualizar(3) — NO generar_oferta(8)
DELETE FROM submenus_permisos WHERE submenu_id = 71 AND permiso_id = 8;
