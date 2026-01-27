-- Rollback cuenta 1671 para probar flujo completo de comisiones externas
-- Esto resetea: aprobada=false, pagada=false, elimina evidencia de pago
UPDATE comisionistas 
SET 
  aprobada = false, 
  pagada = false, 
  url_evidencia_pago = NULL, 
  fecha_actualizacion = now()
WHERE id_cuenta_cobranza = 1671 
  AND email_usuario = 'contacto@vivaltainmobiliaria.com' 
  AND activo = true;