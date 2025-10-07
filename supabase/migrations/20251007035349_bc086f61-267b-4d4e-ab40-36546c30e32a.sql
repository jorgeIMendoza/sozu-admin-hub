-- Solución definitiva para evitar recursión infinita usando pg_trigger_depth()
-- Esta función solo permite que el trigger se ejecute en el primer nivel

-- Actualizar agregar_conyuge_en_todas_cuentas para usar pg_trigger_depth()
CREATE OR REPLACE FUNCTION public.agregar_conyuge_en_todas_cuentas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cuenta_record RECORD;
    v_nuevo_porcentaje NUMERIC;
    v_existe_conyuge BOOLEAN;
BEGIN
    -- Solo ejecutar en el primer nivel del trigger (pg_trigger_depth() = 0)
    -- Esto evita la recursión infinita
    IF pg_trigger_depth() > 0 THEN
        RETURN NEW;
    END IF;

    -- Solo proceder si es la PRIMERA asignación de cónyuge
    IF OLD.id_conyuge IS NOT NULL OR NEW.id_conyuge IS NULL THEN
        RETURN NEW;
    END IF;

    -- Solo proceder si ambas personas están activas
    IF NEW.activo = false THEN
        RETURN NEW;
    END IF;

    -- Verificar que el cónyuge existe y está activo
    IF NOT EXISTS(
        SELECT 1 FROM personas 
        WHERE id = NEW.id_conyuge 
        AND activo = true
    ) THEN
        RETURN NEW;
    END IF;

    -- Buscar todas las cuentas de cobranza de PROPIEDADES donde esta persona es compradora activa
    FOR v_cuenta_record IN
        SELECT 
            c.id_cuenta_cobranza,
            c.porcentaje_copropiedad
        FROM compradores c
        JOIN cuentas_cobranza cc ON c.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE c.id_persona = NEW.id
          AND c.activo = true
          AND cc.activo = true
          AND o.id_producto IS NULL
    LOOP
        v_nuevo_porcentaje := v_cuenta_record.porcentaje_copropiedad / 2;

        SELECT EXISTS(
            SELECT 1 
            FROM compradores
            WHERE id_persona = NEW.id_conyuge
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true
        ) INTO v_existe_conyuge;

        IF NOT v_existe_conyuge THEN
            UPDATE compradores
            SET porcentaje_copropiedad = v_nuevo_porcentaje,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_persona = NEW.id
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true;

            INSERT INTO compradores (
                id_cuenta_cobranza,
                id_persona,
                porcentaje_copropiedad,
                activo,
                fecha_creacion,
                fecha_actualizacion
            ) VALUES (
                v_cuenta_record.id_cuenta_cobranza,
                NEW.id_conyuge,
                v_nuevo_porcentaje,
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- Actualizar agregar_conyuge_como_comprador para usar pg_trigger_depth()
CREATE OR REPLACE FUNCTION public.agregar_conyuge_como_comprador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_id_conyuge INTEGER;
    v_nuevo_porcentaje NUMERIC;
    v_existe_conyuge BOOLEAN;
    v_es_producto BOOLEAN;
BEGIN
    -- Solo ejecutar en el primer nivel del trigger
    IF pg_trigger_depth() > 0 THEN
        RETURN NEW;
    END IF;

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

    -- Calcular el nuevo porcentaje
    v_nuevo_porcentaje := NEW.porcentaje_copropiedad / 2;

    -- Actualizar el porcentaje del comprador original
    UPDATE compradores
    SET porcentaje_copropiedad = v_nuevo_porcentaje,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id_persona = NEW.id_persona
      AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
      AND activo = true;

    -- Verificar si el cónyuge ya existe como comprador
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
    ELSE
        -- Si ya existe, actualizar su porcentaje
        UPDATE compradores
        SET porcentaje_copropiedad = v_nuevo_porcentaje,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id_persona = v_id_conyuge
          AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
          AND activo = true;
    END IF;

    RETURN NEW;
END;
$$;