-- Función actualizada para agregar automáticamente al cónyuge como comprador
-- Solo aplica para cuentas de cobranza de propiedades, no de productos
CREATE OR REPLACE FUNCTION public.agregar_conyuge_como_comprador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_conyuge INTEGER;
    v_nuevo_porcentaje NUMERIC;
    v_existe_conyuge BOOLEAN;
    v_es_producto BOOLEAN;
BEGIN
    -- Solo proceder si el comprador está activo
    IF NEW.activo = false THEN
        RETURN NEW;
    END IF;

    -- Verificar si la cuenta de cobranza es de un producto
    SELECT EXISTS(
        SELECT 1
        FROM cuentas_cobranza cc
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE cc.id = NEW.id_cuenta_cobranza
          AND o.id_producto IS NOT NULL
    ) INTO v_es_producto;

    -- Si es un producto, no hacer nada
    IF v_es_producto THEN
        RETURN NEW;
    END IF;

    -- Obtener el id_conyuge de la persona
    SELECT id_conyuge INTO v_id_conyuge
    FROM personas
    WHERE id = NEW.id_persona
      AND id_conyuge IS NOT NULL
      AND activo = true;

    -- Si no tiene cónyuge, no hacer nada
    IF v_id_conyuge IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calcular el nuevo porcentaje (mitad del original)
    v_nuevo_porcentaje := NEW.porcentaje_copropiedad / 2;

    -- Actualizar el porcentaje del comprador original a la mitad
    UPDATE compradores
    SET porcentaje_copropiedad = v_nuevo_porcentaje,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id_persona = NEW.id_persona
      AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
      AND activo = true;

    -- Verificar si el cónyuge ya existe como comprador para esta cuenta
    SELECT EXISTS(
        SELECT 1 
        FROM compradores
        WHERE id_persona = v_id_conyuge
          AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
          AND activo = true
    ) INTO v_existe_conyuge;

    -- Si el cónyuge no existe, agregarlo
    IF NOT v_existe_conyuge THEN
        INSERT INTO compradores (
            id_cuenta_cobranza,
            id_persona,
            porcentaje_copropiedad,
            activo,
            fecha_creacion,
            fecha_actualizacion
        ) VALUES (
            NEW.id_cuenta_cobranza,
            v_id_conyuge,
            v_nuevo_porcentaje,
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Cónyuge agregado como comprador en cuenta de propiedad';
    ELSE
        -- Si ya existe, actualizar su porcentaje
        UPDATE compradores
        SET porcentaje_copropiedad = v_nuevo_porcentaje,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id_persona = v_id_conyuge
          AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
          AND activo = true;
          
        RAISE NOTICE 'Porcentaje del cónyuge actualizado en cuenta de propiedad';
    END IF;

    RETURN NEW;
END;
$$;

-- El trigger ya existe, solo actualizamos el comentario
COMMENT ON TRIGGER trigger_agregar_conyuge_comprador ON compradores IS 
'Agrega automáticamente al cónyuge como comprador dividiendo el porcentaje. Solo aplica para cuentas de cobranza de propiedades.';