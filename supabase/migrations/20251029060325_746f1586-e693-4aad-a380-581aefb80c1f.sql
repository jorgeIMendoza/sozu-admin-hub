
-- Corrección de datos erróneos en cuentas 63 y 64
-- La comisión en efectivo se calculó incorrectamente sobre precio_lista en lugar de precio_final

-- Cuenta 63: Esquema F2 (+5% interés)
-- Precio antes de comisión: 2,993,435.34
-- Comisión 5%: 149,671.77
-- Precio final correcto: 2,843,763.57

UPDATE cuentas_cobranza
SET precio_final = 2843763.57
WHERE id = 63;

UPDATE acuerdos_pago
SET monto = 428882.77  -- Enganche reducido por la diferencia correcta de comisión
WHERE id = 1099;  -- id_acuerdo_enganche de cuenta 63

-- Cuenta 64: Esquema F4 (-5% ahorro)  
-- Precio antes de comisión: 2,708,346.26
-- Comisión 5%: 135,417.31
-- Precio final correcto: 2,572,928.95

UPDATE cuentas_cobranza
SET precio_final = 2572928.95
WHERE id = 64;

UPDATE acuerdos_pago
SET monto = 257127.23  -- Enganche ajustado por la diferencia correcta de comisión
WHERE id = 1150;  -- id_acuerdo_enganche de cuenta 64
