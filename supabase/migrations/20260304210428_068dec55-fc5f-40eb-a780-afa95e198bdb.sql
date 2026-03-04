-- Fix VIVALTA proyectos_acceso: set id_entidad_relacionada_dueno for all users with project 1453 linked to VIVALTA
UPDATE proyectos_acceso 
SET id_entidad_relacionada_dueno = 3042 
WHERE proyecto_id = 1453 
AND id_entidad_relacionada_dueno IS NULL;