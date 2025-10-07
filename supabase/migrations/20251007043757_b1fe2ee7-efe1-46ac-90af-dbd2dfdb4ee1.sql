-- Modificar función para procesar cambios de cónyuge (no solo primera asignación)
CREATE OR REPLACE FUNCTION public.agregar_conyuge_en_todas_cuentas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cuenta_record RECORD;
    v_nuevo_porcentaje NUMERIC;
    v_existe_conyuge BOOLEAN;
    v_existe_persona_original BOOLEAN;
BEGIN
    -- Solo ejecutar en el primer nivel del trigger
    IF pg_trigger_depth() > 0 THEN
        RETURN NEW;
    END IF;

    -- Solo proceder si hay un nuevo cónyuge asignado
    IF NEW.id_conyuge IS NULL THEN
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

    -- ====================================================================
    -- LOOP 1: Procesar cuentas donde la PERSONA ORIGINAL (NEW.id) es compradora
    -- ====================================================================
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
          AND o.id_producto IS NULL  -- Solo propiedades
    LOOP
        -- Verificar si el cónyuge ya existe en esta cuenta
        SELECT EXISTS(
            SELECT 1 
            FROM compradores
            WHERE id_persona = NEW.id_conyuge
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true
        ) INTO v_existe_conyuge;

        IF NOT v_existe_conyuge THEN
            -- Dividir el porcentaje actual
            v_nuevo_porcentaje := v_cuenta_record.porcentaje_copropiedad / 2;

            -- Actualizar el porcentaje de la persona original
            UPDATE compradores
            SET porcentaje_copropiedad = v_nuevo_porcentaje,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_persona = NEW.id
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true;

            -- Insertar el cónyuge con el otro 50%
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

    -- ====================================================================
    -- LOOP 2: Procesar cuentas donde el CÓNYUGE (NEW.id_conyuge) es comprador
    -- ====================================================================
    FOR v_cuenta_record IN
        SELECT 
            c.id_cuenta_cobranza,
            c.porcentaje_copropiedad
        FROM compradores c
        JOIN cuentas_cobranza cc ON c.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE c.id_persona = NEW.id_conyuge
          AND c.activo = true
          AND cc.activo = true
          AND o.id_producto IS NULL  -- Solo propiedades
    LOOP
        -- Verificar si la persona original ya existe en esta cuenta del cónyuge
        SELECT EXISTS(
            SELECT 1 
            FROM compradores
            WHERE id_persona = NEW.id
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true
        ) INTO v_existe_persona_original;

        IF NOT v_existe_persona_original THEN
            -- Dividir el porcentaje del cónyuge
            v_nuevo_porcentaje := v_cuenta_record.porcentaje_copropiedad / 2;

            -- Actualizar el porcentaje del cónyuge
            UPDATE compradores
            SET porcentaje_copropiedad = v_nuevo_porcentaje,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_persona = NEW.id_conyuge
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true;

            -- Insertar la persona original con el otro 50%
            INSERT INTO compradores (
                id_cuenta_cobranza,
                id_persona,
                porcentaje_copropiedad,
                activo,
                fecha_creacion,
                fecha_actualizacion
            ) VALUES (
                v_cuenta_record.id_cuenta_cobranza,
                NEW.id,
                v_nuevo_porcentaje,
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;