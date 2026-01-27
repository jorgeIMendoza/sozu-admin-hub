-- Eliminar comisionistas de la cuenta 1671 que NO son VIVALTA
-- jorge.externo@yopmail.com ya está pagada, pero es dato de prueba
-- jorge.mendoza@sozu.com no está pagada

DELETE FROM comisionistas 
WHERE id_cuenta_cobranza = 1671 
AND email_usuario IN ('jorge.externo@yopmail.com', 'jorge.mendoza@sozu.com');