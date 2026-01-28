-- 1. Modificar logs_actividad para usar CASCADE en updates
ALTER TABLE logs_actividad 
DROP CONSTRAINT logs_actividad_usuario_id_fkey;

ALTER TABLE logs_actividad 
ADD CONSTRAINT logs_actividad_usuario_id_fkey 
FOREIGN KEY (usuario_id) REFERENCES usuarios(email) 
ON UPDATE CASCADE ON DELETE NO ACTION;

-- 2. Modificar proyectos_acceso para usar CASCADE en updates
ALTER TABLE proyectos_acceso 
DROP CONSTRAINT fk_proyectos_acceso_usuarios;

ALTER TABLE proyectos_acceso 
ADD CONSTRAINT fk_proyectos_acceso_usuarios 
FOREIGN KEY (usuario_id) REFERENCES usuarios(email) 
ON UPDATE CASCADE ON DELETE NO ACTION;