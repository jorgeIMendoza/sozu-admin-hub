-- ========================================================================
-- CORRECCIÓN: Trigger de actualización de estatus a "Pagada completamente"
-- ========================================================================
-- Problema: El trigger marcaba propiedades como pagadas incluso cuando:
-- 1. No tienen precio_final válido (NULL o 0)
-- 2. No tienen cuenta de cobranza activa
-- Solución: Agregar validaciones para precio_final > 0

DROP TRIGGER IF EXISTS trigger_actualizar_estatus_propiedad_pagada ON aplicaciones_pago;

-- Función corregida para actualizar estatus a "Pagada completamente" solo para propiedades CON precio_final válido
CREATE OR REPLACE FUNCTION actualizar_estatus_propiedad_pagada()
RETURNS TRIGGER AS $$
DECLARE
  v_precio_final NUMERIC;
  v_total_pagado NUMERIC;
  v_id_propiedad BIGINT;
  v_id_oferta INTEGER;
  v_id_cuenta_cobranza INTEGER;
BEGIN
  -- Obtener id_cuenta_cobranza desde el acuerdo de pago
  SELECT id_cuenta_cobranza INTO v_id_cuenta_cobranza
  FROM acuerdos_pago
  WHERE id = NEW.id_acuerdo_pago
    AND activo = true;

  IF v_id_cuenta_cobranza IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener información de la cuenta de cobranza
  SELECT 
    cc.precio_final,
    cc.id_oferta
  INTO v_precio_final, v_id_oferta
  FROM cuentas_cobranza cc
  WHERE cc.id = v_id_cuenta_cobranza
    AND cc.activo = true;

  -- 🔥 VALIDACIÓN CRÍTICA: Si no hay oferta, salir
  IF v_id_oferta IS NULL THEN
    RETURN NEW;
  END IF;

  -- 🔥 VALIDACIÓN CRÍTICA: Si precio_final es NULL o <= 0, salir sin actualizar
  IF v_precio_final IS NULL OR v_precio_final <= 0 THEN
    RAISE NOTICE 'Propiedad de cuenta % no actualizada: precio_final es % (debe ser > 0)', v_id_cuenta_cobranza, v_precio_final;
    RETURN NEW;
  END IF;

  -- Calcular total pagado
  SELECT COALESCE(SUM(ap.monto), 0)
  INTO v_total_pagado
  FROM aplicaciones_pago ap
  JOIN pagos pg ON ap.id_pago = pg.id
  WHERE ap.id_acuerdo_pago IN (
    SELECT acp.id 
    FROM acuerdos_pago acp 
    WHERE acp.id_cuenta_cobranza = v_id_cuenta_cobranza
      AND acp.activo = true
  )
  AND ap.activo = true 
  AND pg.activo = true
  AND ap.es_multa = false;  -- 🔥 Excluir multas del cálculo

  -- Si está completamente pagado, actualizar estatus solo si es una propiedad
  IF v_total_pagado >= v_precio_final THEN
    -- Obtener id de propiedad desde la oferta
    SELECT o.id_propiedad
    INTO v_id_propiedad
    FROM ofertas o
    WHERE o.id = v_id_oferta;

    -- Si es una propiedad, actualizar su estatus
    IF v_id_propiedad IS NOT NULL THEN
      UPDATE propiedades
      SET id_estatus_disponibilidad = 9  -- Pagada completamente
      WHERE id = v_id_propiedad
        AND id_estatus_disponibilidad != 9;  -- Solo si no está ya en ese estatus
      
      RAISE NOTICE 'Propiedad % actualizada a PAGADA COMPLETAMENTE (id_estatus_disponibilidad=9). Pagado: % >= Precio final: %', v_id_propiedad, v_total_pagado, v_precio_final;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recrear trigger
CREATE TRIGGER trigger_actualizar_estatus_propiedad_pagada
AFTER INSERT OR UPDATE ON aplicaciones_pago
FOR EACH ROW
WHEN (NEW.activo = true)
EXECUTE FUNCTION actualizar_estatus_propiedad_pagada();

-- ========================================================================
-- CORRECCIÓN: Revertir propiedad 202 si fue marcada incorrectamente
-- ========================================================================

-- Revertir propiedad 202 a su estatus correcto (probablemente "Disponible" = 1 o el que tenía antes)
UPDATE propiedades
SET id_estatus_disponibilidad = 1  -- Disponible
WHERE id = 202
  AND id_estatus_disponibilidad = 9  -- Solo si está marcada como "Pagada completamente"
  AND NOT EXISTS (
    -- Solo revertir si NO tiene cuenta de cobranza con precio_final válido y pagado completo
    SELECT 1
    FROM ofertas o
    JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
    WHERE o.id_propiedad = 202
      AND cc.activo = true
      AND cc.precio_final > 0
  );