-- Cambiar las 27 propiedades de "Entregado" a "Vendido" (id=5)
UPDATE propiedades 
SET id_estatus_disponibilidad = 5,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id IN (4863, 4871, 4905, 4916, 4919, 4920, 4924, 4942, 4949, 4985, 4989, 4991, 4993, 5004, 5016, 5035, 5047, 5048, 5053, 5083, 5103, 5115, 5120, 5144, 5150, 5161, 5163)