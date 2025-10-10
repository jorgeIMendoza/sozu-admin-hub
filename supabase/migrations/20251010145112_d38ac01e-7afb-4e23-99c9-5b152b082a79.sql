-- Función para ajustar automáticamente el último acuerdo de pago
CREATE OR REPLACE FUNCTION public.ajustar_ultimo_acuerdo_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_suma_acuerdos NUMERIC;
    v_precio_final NUMERIC;
    v_diferencia NUMERIC;
    v_id_ultimo_acuerdo INTEGER;
    v_monto_ultimo NUMERIC;
    v_orden_ultimo INTEGER;
    v_pago_completado BOOLEAN;
BEGIN
    -- Evitar recursión infinita
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Solo proceder si el acuerdo está activo
    IF NEW.activo = FALSE THEN
        RETURN NEW;
    END IF;

    -- Obtener el precio final de la cuenta de cobranza
    SELECT precio_final
    INTO v_precio_final
    FROM cuentas_cobranza
    WHERE id = NEW.id_cuenta_cobranza
      AND activo = TRUE;

    -- Si no hay precio final, no hacer nada
    IF v_precio_final IS NULL OR v_precio_final <= 0 THEN
        RETURN NEW;
    END IF;

    -- Calcular la suma de todos los acuerdos activos
    SELECT COALESCE(SUM(monto), 0)
    INTO v_suma_acuerdos
    FROM acuerdos_pago
    WHERE id_cuenta_cobranza = NEW.id_cuenta_cobranza
      AND activo = TRUE;

    -- Calcular la diferencia
    v_diferencia := v_precio_final - v_suma_acuerdos;

    -- Solo ajustar si la diferencia es significativa (mayor a 1 centavo)
    IF ABS(v_diferencia) <= 0.01 THEN
        RETURN NEW;
    END IF;

    -- Identificar el último acuerdo (el de mayor orden)
    SELECT id, monto, orden, pago_completado
    INTO v_id_ultimo_acuerdo, v_monto_ultimo, v_orden_ultimo, v_pago_completado
    FROM acuerdos_pago
    WHERE id_cuenta_cobranza = NEW.id_cuenta_cobranza
      AND activo = TRUE
    ORDER BY orden DESC
    LIMIT 1;

    -- Si el último acuerdo no existe o ya está pagado, no hacer nada
    IF v_id_ultimo_acuerdo IS NULL OR v_pago_completado = TRUE THEN
        RETURN NEW;
    END IF;

    -- Ajustar el monto del último acuerdo
    UPDATE acuerdos_pago
    SET monto = v_monto_ultimo + v_diferencia,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = v_id_ultimo_acuerdo;

    RAISE NOTICE 'Ajustado acuerdo % (orden %): monto anterior %, nuevo monto %, diferencia %', 
        v_id_ultimo_acuerdo, v_orden_ultimo, v_monto_ultimo, v_monto_ultimo + v_diferencia, v_diferencia;

    RETURN NEW;
END;
$$;

-- Crear trigger para INSERT en acuerdos_pago
DROP TRIGGER IF EXISTS trigger_ajustar_acuerdo_insert ON acuerdos_pago;

CREATE TRIGGER trigger_ajustar_acuerdo_insert
    AFTER INSERT ON acuerdos_pago
    FOR EACH ROW
    EXECUTE FUNCTION ajustar_ultimo_acuerdo_pago();

-- Crear trigger para UPDATE en acuerdos_pago (solo cuando cambia el monto)
DROP TRIGGER IF EXISTS trigger_ajustar_acuerdo_update ON acuerdos_pago;

CREATE TRIGGER trigger_ajustar_acuerdo_update
    AFTER UPDATE OF monto ON acuerdos_pago
    FOR EACH ROW
    WHEN (OLD.monto IS DISTINCT FROM NEW.monto)
    EXECUTE FUNCTION ajustar_ultimo_acuerdo_pago();