-- ========================================================================
-- PARTE 1: Agregar triggers de fecha_actualizacion a tablas principales
-- ========================================================================

-- Eliminar triggers existentes si existen
DROP TRIGGER IF EXISTS update_propiedades_updated_at ON propiedades;
DROP TRIGGER IF EXISTS update_cuentas_cobranza_updated_at ON cuentas_cobranza;
DROP TRIGGER IF EXISTS update_productos_servicios_updated_at ON productos_servicios;
DROP TRIGGER IF EXISTS update_ofertas_updated_at ON ofertas;
DROP TRIGGER IF EXISTS update_pagos_updated_at ON pagos;
DROP TRIGGER IF EXISTS update_aplicaciones_pago_updated_at ON aplicaciones_pago;
DROP TRIGGER IF EXISTS update_acuerdos_pago_updated_at ON acuerdos_pago;
DROP TRIGGER IF EXISTS update_compradores_updated_at ON compradores;

-- Crear triggers nuevos
CREATE TRIGGER update_propiedades_updated_at
BEFORE UPDATE ON propiedades
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cuentas_cobranza_updated_at
BEFORE UPDATE ON cuentas_cobranza
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_productos_servicios_updated_at
BEFORE UPDATE ON productos_servicios
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ofertas_updated_at
BEFORE UPDATE ON ofertas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pagos_updated_at
BEFORE UPDATE ON pagos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_aplicaciones_pago_updated_at
BEFORE UPDATE ON aplicaciones_pago
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_acuerdos_pago_updated_at
BEFORE UPDATE ON acuerdos_pago
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compradores_updated_at
BEFORE UPDATE ON compradores
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================================================
-- PARTE 2: Función y trigger para cambio automático a "Pagada completamente"
-- ========================================================================

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS trigger_actualizar_estatus_propiedad_pagada ON aplicaciones_pago;

-- Función para actualizar estatus a "Pagada completamente" solo para propiedades
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

  -- Si no encontramos la cuenta, salir
  IF v_id_oferta IS NULL THEN
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
  AND pg.activo = true;

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
      
      RAISE NOTICE 'Propiedad % actualizada a PAGADA COMPLETAMENTE (id_estatus_disponibilidad=9)', v_id_propiedad;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger en aplicaciones_pago para cambio automático de estatus
CREATE TRIGGER trigger_actualizar_estatus_propiedad_pagada
AFTER INSERT OR UPDATE ON aplicaciones_pago
FOR EACH ROW
WHEN (NEW.activo = true)
EXECUTE FUNCTION actualizar_estatus_propiedad_pagada();

-- ========================================================================
-- PARTE 3: Script de corrección para propiedades existentes
-- ========================================================================

-- Actualizar propiedades completamente pagadas
WITH propiedades_pagadas AS (
  SELECT DISTINCT 
    o.id_propiedad,
    cc.precio_final,
    (
      SELECT COALESCE(SUM(ap.monto), 0)
      FROM aplicaciones_pago ap
      JOIN pagos pg ON ap.id_pago = pg.id
      WHERE ap.id_acuerdo_pago IN (
        SELECT acp.id 
        FROM acuerdos_pago acp 
        WHERE acp.id_cuenta_cobranza = cc.id 
          AND acp.activo = true
      )
      AND ap.activo = true 
      AND pg.activo = true
    ) as total_pagado
  FROM ofertas o
  JOIN cuentas_cobranza cc ON o.id = cc.id_oferta
  WHERE cc.activo = true
    AND cc.es_aprobado = true
    AND o.id_propiedad IS NOT NULL
)
UPDATE propiedades p
SET id_estatus_disponibilidad = 9
FROM propiedades_pagadas pp
WHERE p.id = pp.id_propiedad
  AND pp.total_pagado >= pp.precio_final
  AND p.id_estatus_disponibilidad != 9;