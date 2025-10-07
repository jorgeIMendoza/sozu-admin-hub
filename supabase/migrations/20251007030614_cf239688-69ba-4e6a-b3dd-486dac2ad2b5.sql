-- Función para agregar automáticamente al cónyuge como comprador
CREATE OR REPLACE FUNCTION public.agregar_conyuge_como_comprador()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_id_conyuge INTEGER;
    v_nuevo_porcentaje NUMERIC;
    v_existe_conyuge BOOLEAN;
BEGIN
    -- Solo proceder si el comprador está activo
    IF NEW.activo = false THEN
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
        
        RAISE NOTICE 'Cónyuge agregado como comprador con porcentaje de copropiedad';
    ELSE
        -- Si ya existe, actualizar su porcentaje
        UPDATE compradores
        SET porcentaje_copropiedad = v_nuevo_porcentaje,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id_persona = v_id_conyuge
          AND id_cuenta_cobranza = NEW.id_cuenta_cobranza
          AND activo = true;
          
        RAISE NOTICE 'Porcentaje del cónyuge actualizado';
    END IF;

    RETURN NEW;
END;
$$;

-- Crear el trigger para ejecutar la función después de INSERT o UPDATE
DROP TRIGGER IF EXISTS trigger_agregar_conyuge_comprador ON compradores;

CREATE TRIGGER trigger_agregar_conyuge_comprador
    AFTER INSERT OR UPDATE OF porcentaje_copropiedad, id_persona
    ON compradores
    FOR EACH ROW
    EXECUTE FUNCTION public.agregar_conyuge_como_comprador();