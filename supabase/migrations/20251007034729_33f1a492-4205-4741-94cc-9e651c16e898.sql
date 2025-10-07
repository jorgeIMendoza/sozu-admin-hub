-- Modificar la función para evitar recursión infinita
-- Solo ejecutar cuando OLD.id_conyuge es NULL y NEW.id_conyuge NO es NULL
-- Esto asegura que solo se ejecute en la PRIMERA asignación del cónyuge
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
    -- Solo proceder si es la PRIMERA asignación de cónyuge
    -- OLD.id_conyuge debe ser NULL y NEW.id_conyuge debe tener un valor
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
          AND o.id_producto IS NULL  -- Solo propiedades, NO productos
    LOOP
        -- Calcular el nuevo porcentaje (mitad del actual)
        v_nuevo_porcentaje := v_cuenta_record.porcentaje_copropiedad / 2;

        -- Verificar si el cónyuge ya existe como comprador en esta cuenta
        SELECT EXISTS(
            SELECT 1 
            FROM compradores
            WHERE id_persona = NEW.id_conyuge
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true
        ) INTO v_existe_conyuge;

        IF NOT v_existe_conyuge THEN
            -- Actualizar el porcentaje del comprador original a la mitad
            UPDATE compradores
            SET porcentaje_copropiedad = v_nuevo_porcentaje,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_persona = NEW.id
              AND id_cuenta_cobranza = v_cuenta_record.id_cuenta_cobranza
              AND activo = true;

            -- Insertar al cónyuge como nuevo comprador con la otra mitad
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

COMMENT ON FUNCTION public.agregar_conyuge_en_todas_cuentas() IS 
'Agrega automáticamente al cónyuge como comprador en todas las cuentas de propiedades donde la persona es compradora activa. Solo se ejecuta cuando OLD.id_conyuge es NULL y NEW.id_conyuge tiene un valor (primera asignación).';