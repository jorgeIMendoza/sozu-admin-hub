-- Corregir propiedad 502 (id 5239) regresándola a estatus "Vendido" (5)
-- La propiedad fue cambiada incorrectamente a "Escrituración" (7) sin verificar pagos
UPDATE propiedades 
SET id_estatus_disponibilidad = 5, fecha_actualizacion = NOW() 
WHERE id = 5239;