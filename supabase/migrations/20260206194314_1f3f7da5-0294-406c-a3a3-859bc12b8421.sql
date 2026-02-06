
UPDATE cuentas_cobranza 
SET id_tipo_cancelacion = 7, fecha_actualizacion = now()
WHERE id IN (515, 1071, 1072);
