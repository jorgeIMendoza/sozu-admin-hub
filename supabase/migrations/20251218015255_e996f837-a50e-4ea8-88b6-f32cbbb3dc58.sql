-- Limpiar datos incorrectos de TRUST y VIVALTA que fueron creados como agentes por error

-- 1. Eliminar proyectos_acceso
DELETE FROM proyectos_acceso 
WHERE usuario_id IN ('bb@trustreal.mx', 'contacto@vivaltainmobiliaria.com');

-- 2. Eliminar usuarios
DELETE FROM usuarios 
WHERE email IN ('bb@trustreal.mx', 'contacto@vivaltainmobiliaria.com');

-- 3. Eliminar entidades_relacionadas duplicadas (tipo Agente = 19)
DELETE FROM entidades_relacionadas 
WHERE id IN (3051, 3053);