-- Rollback: eliminar comprador temporal de pruebas
DELETE FROM compradores 
WHERE id_cuenta_cobranza = 478 
AND id_persona = 1;