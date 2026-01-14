
-- Actualizar precio_final de la cuenta 1676 con el precio de lista de la propiedad
UPDATE cuentas_cobranza 
SET precio_final = 5540176.63, 
    fecha_actualizacion = NOW()
WHERE id = 1676;
