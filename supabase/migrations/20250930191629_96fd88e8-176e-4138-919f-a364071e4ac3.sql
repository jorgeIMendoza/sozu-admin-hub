-- Function to verify if a property should be marked as "Vendido"
CREATE OR REPLACE FUNCTION public.verificar_propiedad_vendida()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_propiedad_id INTEGER;
    tiene_contrato_verificado BOOLEAN := FALSE;
    tiene_enganche_pagado BOOLEAN := FALSE;
BEGIN
    -- Determine property ID based on triggering table
    IF TG_TABLE_NAME = 'documentos' THEN
        v_propiedad_id := NEW.id_propiedad;
    ELSIF TG_TABLE_NAME = 'acuerdos_pago' THEN
        -- Get property ID through cuentas_cobranza -> ofertas -> propiedades
        SELECT o.id_propiedad INTO v_propiedad_id
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE ap.id = NEW.id;
    END IF;

    -- Check if there's a verified "Contrato" (id_tipo_documento = 18)
    SELECT EXISTS(
        SELECT 1 
        FROM documentos 
        WHERE id_propiedad = v_propiedad_id 
        AND id_tipo_documento = 18 
        AND es_verificado = TRUE
        AND activo = TRUE
    ) INTO tiene_contrato_verificado;

    -- Check if there's a completed "Enganche" payment (id_concepto = 2)
    SELECT EXISTS(
        SELECT 1
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE o.id_propiedad = v_propiedad_id
        AND ap.id_concepto = 2
        AND ap.pago_completado = TRUE
        AND ap.activo = TRUE
    ) INTO tiene_enganche_pagado;

    -- Only update to "Vendido" (id=5) if BOTH conditions are true
    IF tiene_contrato_verificado AND tiene_enganche_pagado THEN
        UPDATE propiedades 
        SET id_estatus_disponibilidad = 5
        WHERE id = v_propiedad_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger for documentos table (when Contrato is verified)
DROP TRIGGER IF EXISTS trigger_verificar_venta_documento ON documentos;
CREATE TRIGGER trigger_verificar_venta_documento
AFTER UPDATE ON documentos
FOR EACH ROW
WHEN (
    OLD.es_verificado = FALSE 
    AND NEW.es_verificado = TRUE 
    AND NEW.id_tipo_documento = 18
    AND NEW.activo = TRUE
)
EXECUTE FUNCTION verificar_propiedad_vendida();

-- Trigger for acuerdos_pago table (when Enganche is completed)
DROP TRIGGER IF EXISTS trigger_verificar_venta_pago ON acuerdos_pago;
CREATE TRIGGER trigger_verificar_venta_pago
AFTER UPDATE ON acuerdos_pago
FOR EACH ROW
WHEN (
    OLD.pago_completado = FALSE 
    AND NEW.pago_completado = TRUE 
    AND NEW.id_concepto = 2
    AND NEW.activo = TRUE
)
EXECUTE FUNCTION verificar_propiedad_vendida();