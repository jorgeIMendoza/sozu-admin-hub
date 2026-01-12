-- Actualizar monto_comision_pagado para todas las cuentas con es_pagada_comision_venta = true
UPDATE cuentas_cobranza
SET monto_comision_pagado = ROUND(
  CASE 
    WHEN iva_incluido = true THEN (porcentaje_comision_venta / 100.0 * precio_final) * 1.16
    ELSE (porcentaje_comision_venta / 100.0 * precio_final)
  END, 2
)
WHERE es_pagada_comision_venta = true;