-- Modificar la función verificar_propiedad_vendida para actualizar fecha_compra
CREATE OR REPLACE FUNCTION public.verificar_propiedad_vendida()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_propiedad_id INTEGER;
    tiene_contrato_verificado BOOLEAN := FALSE;
    tiene_enganche_pagado BOOLEAN := FALSE;
    v_id_edificio_modelo INTEGER;
BEGIN
    -- Determine property ID based on triggering table
    IF TG_TABLE_NAME = 'documentos' THEN
        v_propiedad_id := NEW.id_propiedad;
        RAISE NOTICE 'Trigger ejecutado desde documentos para propiedad %', v_propiedad_id;
    ELSIF TG_TABLE_NAME = 'acuerdos_pago' THEN
        -- Get property ID through cuentas_cobranza -> ofertas -> propiedades
        SELECT o.id_propiedad INTO v_propiedad_id
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE ap.id = NEW.id;
        
        RAISE NOTICE 'Trigger ejecutado desde acuerdos_pago para propiedad %', v_propiedad_id;
    END IF;

    -- Verificar que la propiedad tenga id_edificio_modelo (datos completos)
    SELECT id_edificio_modelo INTO v_id_edificio_modelo
    FROM propiedades
    WHERE id = v_propiedad_id;

    IF v_id_edificio_modelo IS NULL THEN
        RAISE NOTICE 'Propiedad % no puede actualizarse a VENDIDO: id_edificio_modelo es NULL', v_propiedad_id;
        RETURN NEW;
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

    RAISE NOTICE 'Propiedad %: Contrato verificado = %, Enganche pagado = %', 
        v_propiedad_id, tiene_contrato_verificado, tiene_enganche_pagado;

    -- Only update to "Vendido" (id=5) if BOTH conditions are true
    IF tiene_contrato_verificado AND tiene_enganche_pagado THEN
        -- Update property status
        UPDATE propiedades 
        SET id_estatus_disponibilidad = 5
        WHERE id = v_propiedad_id;
        
        -- Update fecha_compra in cuentas_cobranza for all active accounts related to this property
        UPDATE cuentas_cobranza
        SET fecha_compra = CURRENT_DATE
        WHERE id IN (
            SELECT cc.id
            FROM cuentas_cobranza cc
            JOIN ofertas o ON cc.id_oferta = o.id
            WHERE o.id_propiedad = v_propiedad_id
              AND cc.activo = TRUE
        );
        
        RAISE NOTICE 'Propiedad % actualizada a VENDIDO (id_estatus_disponibilidad=5) y fecha_compra actualizada', v_propiedad_id;
    END IF;

    RETURN NEW;
END;
$function$;