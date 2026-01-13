-- Insertar aplicaciones de pago faltantes para enero 2026
-- 10 cuentas de mantenimiento tienen pagos con saldo disponible pero sin aplicar

INSERT INTO aplicaciones_pago (id_acuerdo_pago, id_pago, monto, activo, fecha_creacion, fecha_actualizacion)
VALUES
  (24241, 17977, 4234.80, true, NOW(), NOW()),  -- Cuenta 1370
  (24051, 18119, 3234.80, true, NOW(), NOW()),  -- Cuenta 1402
  (24080, 19345, 2790.00, true, NOW(), NOW()),  -- Cuenta 1435
  (24291, 18252, 870.00, true, NOW(), NOW()),   -- Cuenta 1441
  (24095, 18436, 48.60, true, NOW(), NOW()),    -- Cuenta 1481
  (24262, 18509, 2445.00, true, NOW(), NOW()),  -- Cuenta 1494
  (24229, 19288, 4287.60, true, NOW(), NOW()),  -- Cuenta 1569
  (24211, 19482, 3984.56, true, NOW(), NOW()),  -- Cuenta 1628 (usa lo disponible)
  (24093, 19157, 1993.80, true, NOW(), NOW()),  -- Cuenta 1653
  (24212, 19180, 2002.80, true, NOW(), NOW());  -- Cuenta 1658

-- Actualizar pago_completado para los acuerdos que quedan 100% pagados
UPDATE acuerdos_pago
SET pago_completado = true,
    fecha_actualizacion = NOW()
WHERE id IN (24241, 24080, 24291, 24095, 24262, 24229, 24093, 24212)
  AND activo = true;