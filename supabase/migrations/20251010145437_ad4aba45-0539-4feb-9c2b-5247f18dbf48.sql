-- Ajuste manual del acuerdo #607 para cuenta_cobranza 21
-- Restar $0.13 para que la suma total coincida exactamente con precio_final

UPDATE acuerdos_pago
SET monto = 2462348.14,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 607
  AND id_cuenta_cobranza = 21
  AND activo = TRUE;

-- Verificación del ajuste
DO $$
DECLARE
    v_suma_acuerdos NUMERIC;
    v_precio_final NUMERIC;
    v_diferencia NUMERIC;
BEGIN
    -- Calcular suma de acuerdos activos
    SELECT COALESCE(SUM(monto), 0)
    INTO v_suma_acuerdos
    FROM acuerdos_pago
    WHERE id_cuenta_cobranza = 21
      AND activo = TRUE;
    
    -- Obtener precio final
    SELECT precio_final
    INTO v_precio_final
    FROM cuentas_cobranza
    WHERE id = 21
      AND activo = TRUE;
    
    -- Calcular diferencia
    v_diferencia := v_precio_final - v_suma_acuerdos;
    
    RAISE NOTICE 'Ajuste completado - Suma acuerdos: %, Precio final: %, Diferencia: %', 
        v_suma_acuerdos, v_precio_final, v_diferencia;
END $$;