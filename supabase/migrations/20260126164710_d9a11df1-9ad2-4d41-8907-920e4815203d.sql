-- Reset cuenta 207: deactivate SAT notification documents
UPDATE documentos 
SET activo = false, fecha_actualizacion = now()
WHERE id_cuenta_cobranza = 207 
AND id_tipo_documento IN (44, 45) 
AND activo = true;