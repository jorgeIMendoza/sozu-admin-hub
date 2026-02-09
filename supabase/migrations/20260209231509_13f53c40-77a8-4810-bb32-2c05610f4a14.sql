-- Paso 1: Eliminar multimedias de propiedades del edificio 3809
DELETE FROM multimedias_propiedad 
WHERE id_propiedad IN (
  SELECT id FROM propiedades WHERE id_edificio_modelo IN (2607, 2608, 2609)
);

-- Paso 2: Eliminar las 164 propiedades
DELETE FROM propiedades WHERE id_edificio_modelo IN (2607, 2608, 2609);

-- Paso 3: Eliminar relaciones edificio-modelo
DELETE FROM edificios_modelos WHERE id_edificio = 3809;

-- Paso 4: Eliminar edificio 3809
DELETE FROM edificios WHERE id = 3809;