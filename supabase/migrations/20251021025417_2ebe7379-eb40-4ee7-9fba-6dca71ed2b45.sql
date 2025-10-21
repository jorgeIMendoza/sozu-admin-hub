-- Corregir Parcialidad 343 para pruebas
-- Paso 1: Marcar el acuerdo 343 como NO completado
UPDATE acuerdos_pago 
SET pago_completado = false,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 343;

-- Paso 2: Reactivar la aplicación 51 que fue desactivada
UPDATE aplicaciones_pago 
SET activo = true,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 51;