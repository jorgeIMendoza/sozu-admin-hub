
-- Actualizar id_persona_duena_lead a Jorge Mendoza (id_persona=1113)
-- para todos los registros de entidades_relacionadas que son tanto prospectos (7) como compradores (2)
UPDATE entidades_relacionadas 
SET id_persona_duena_lead = 1113, 
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id_tipo_entidad IN (2, 7) 
AND id_persona IN (
  SELECT DISTINCT e1.id_persona
  FROM entidades_relacionadas e1
  INNER JOIN entidades_relacionadas e2 ON e1.id_persona = e2.id_persona
  WHERE e1.id_tipo_entidad = 7 
  AND e2.id_tipo_entidad = 2
  AND e1.activo = true
  AND e2.activo = true
)
AND activo = true;
