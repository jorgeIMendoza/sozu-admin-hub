
-- Insert project access for vivalta2@yopmail.com copying from the primary user (contacto@vivaltainmobiliaria.com)
-- The primary user has access to project 1453 (Daiku) with entidad_relacionada_dueno 3042 (VIVALTA)
INSERT INTO proyectos_acceso (usuario_id, proyecto_id, id_entidad_relacionada_dueno, activo)
VALUES ('vivalta2@yopmail.com', 1453, 3042, true)
ON CONFLICT (usuario_id, proyecto_id) 
DO UPDATE SET id_entidad_relacionada_dueno = 3042, activo = true;
