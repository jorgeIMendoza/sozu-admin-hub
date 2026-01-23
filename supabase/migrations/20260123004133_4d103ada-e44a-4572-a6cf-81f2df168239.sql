-- Eliminar el constraint de foreign key que impide agregar inmobiliarias como comisionistas
-- El email puede ser de la tabla usuarios O de la tabla personas (inmobiliarias)
ALTER TABLE public.comisionistas 
DROP CONSTRAINT IF EXISTS fk_comisionistas_usuarios;