
-- Actualizar propiedades de Vive DAIKU que no tienen dueño asignado
-- Asignarles la entidad relacionada 1155 (Tallwood - Dueño Vendedor del proyecto)
UPDATE propiedades p
SET id_entidad_relacionada_dueno = 1155,
    fecha_actualizacion = CURRENT_TIMESTAMP
FROM edificios_modelos em
JOIN edificios ed ON em.id_edificio = ed.id
WHERE p.id_edificio_modelo = em.id
AND ed.id_proyecto = 1453
AND p.id_entidad_relacionada_dueno IS NULL
AND p.activo = true
