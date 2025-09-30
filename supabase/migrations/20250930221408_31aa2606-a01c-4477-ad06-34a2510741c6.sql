-- Crear triggers para verificar_propiedad_vendida

-- Trigger para cuando se verifica un documento de tipo Contrato (id_tipo_documento = 18)
DROP TRIGGER IF EXISTS trg_verificar_propiedad_vendida_documento ON public.documentos;
CREATE TRIGGER trg_verificar_propiedad_vendida_documento
AFTER UPDATE OF es_verificado ON public.documentos
FOR EACH ROW
WHEN (NEW.es_verificado = TRUE AND NEW.id_tipo_documento = 18 AND NEW.activo = TRUE)
EXECUTE FUNCTION public.verificar_propiedad_vendida();

-- Trigger para cuando se completa un pago de Enganche (id_concepto = 2)
DROP TRIGGER IF EXISTS trg_verificar_propiedad_vendida_pago ON public.acuerdos_pago;
CREATE TRIGGER trg_verificar_propiedad_vendida_pago
AFTER UPDATE OF pago_completado ON public.acuerdos_pago
FOR EACH ROW
WHEN (NEW.pago_completado = TRUE AND NEW.id_concepto = 2 AND NEW.activo = TRUE)
EXECUTE FUNCTION public.verificar_propiedad_vendida();

-- Actualizar manualmente la propiedad 350 si cumple las condiciones
DO $$
DECLARE
    v_tiene_contrato BOOLEAN;
    v_tiene_enganche BOOLEAN;
    v_id_edificio_modelo INTEGER;
BEGIN
    -- Verificar id_edificio_modelo
    SELECT id_edificio_modelo INTO v_id_edificio_modelo
    FROM propiedades
    WHERE id = 350;

    IF v_id_edificio_modelo IS NULL THEN
        RAISE NOTICE 'Propiedad 350 no tiene id_edificio_modelo';
        RETURN;
    END IF;

    -- Verificar contrato
    SELECT EXISTS(
        SELECT 1 FROM documentos 
        WHERE id_propiedad = 350 
        AND id_tipo_documento = 18 
        AND es_verificado = TRUE
        AND activo = TRUE
    ) INTO v_tiene_contrato;

    -- Verificar enganche pagado
    SELECT EXISTS(
        SELECT 1
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE o.id_propiedad = 350
        AND ap.id_concepto = 2
        AND ap.pago_completado = TRUE
        AND ap.activo = TRUE
    ) INTO v_tiene_enganche;

    IF v_tiene_contrato AND v_tiene_enganche THEN
        UPDATE propiedades 
        SET id_estatus_disponibilidad = 5
        WHERE id = 350;
        
        RAISE NOTICE 'Propiedad 350 actualizada a VENDIDO';
    ELSE
        RAISE NOTICE 'Propiedad 350: Contrato=%, Enganche=%', v_tiene_contrato, v_tiene_enganche;
    END IF;
END $$;