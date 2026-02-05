-- Mover "Configuración de Reportes" al menú "Configuraciones/Logs" (ID 13)
UPDATE submenus SET menu_id = 13, fecha_actualizacion = now() WHERE id = 42;

-- Marcar todos los submenus del menú 13 como solo_usuarioA = true
UPDATE submenus SET solo_usuarioA = true, fecha_actualizacion = now() WHERE menu_id = 13;