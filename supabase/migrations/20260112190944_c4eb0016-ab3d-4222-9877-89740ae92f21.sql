-- Actualizar las 4 cuentas para que aparezcan en Aprobación de Comisiones
-- Cuenta CCP-001666
UPDATE cuentas_cobranza 
SET es_pagada_comision_venta = true,
    monto_comision_pagado = 11458.63,
    fecha_pago_comision = '2025-12-31'
WHERE id = 1666;

-- Cuenta CC-001667
UPDATE cuentas_cobranza 
SET es_pagada_comision_venta = true,
    monto_comision_pagado = 267746.24,
    fecha_pago_comision = '2025-12-31'
WHERE id = 1667;

-- Cuenta CCP-001668
UPDATE cuentas_cobranza 
SET es_pagada_comision_venta = true,
    monto_comision_pagado = 6403.20,
    fecha_pago_comision = '2025-12-31'
WHERE id = 1668;

-- Cuenta CCP-001673
UPDATE cuentas_cobranza 
SET es_pagada_comision_venta = true,
    monto_comision_pagado = 12146.55,
    fecha_pago_comision = '2025-12-31'
WHERE id = 1673;