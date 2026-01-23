-- Rollback: Eliminar aplicaciones y desactivar pago HSB5290755 para prueba de usuario
DELETE FROM aplicaciones_pago WHERE id_pago = 3584;

UPDATE pagos SET activo = false, fecha_actualizacion = CURRENT_TIMESTAMP 
WHERE id = 3584 AND clave_rastreo = 'HSB5290755';