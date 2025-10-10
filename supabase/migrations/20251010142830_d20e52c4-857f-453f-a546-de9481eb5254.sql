-- Crear función para cambiar estatus a Escrituración cuando se actualizan datos de escritura
CREATE OR REPLACE FUNCTION public.actualizar_estatus_a_escrituracion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_id_propiedad BIGINT;
    v_estatus_actual INTEGER;
    dato_actualizado BOOLEAN := FALSE;
BEGIN
    -- Detectar si se actualizó algún campo de escrituración
    IF (NEW.numero_escritura IS DISTINCT FROM OLD.numero_escritura) OR
       (NEW.libro IS DISTINCT FROM OLD.libro) OR
       (NEW.hoja IS DISTINCT FROM OLD.hoja) OR
       (NEW.numero_unidad_privativa IS DISTINCT FROM OLD.numero_unidad_privativa) OR
       (NEW.clave_catastral IS DISTINCT FROM OLD.clave_catastral) OR
       (NEW.fecha_escritura IS DISTINCT FROM OLD.fecha_escritura) THEN
        dato_actualizado := TRUE;
    END IF;

    -- Si no se actualizó ningún dato de escrituración, no hacer nada
    IF NOT dato_actualizado THEN
        RETURN NEW;
    END IF;

    -- Obtener la propiedad relacionada y su estatus actual
    SELECT o.id_propiedad, p.id_estatus_disponibilidad
    INTO v_id_propiedad, v_estatus_actual
    FROM ofertas o
    JOIN propiedades p ON o.id_propiedad = p.id
    WHERE o.id = NEW.id_oferta
      AND o.id_producto IS NULL  -- Solo propiedades, no productos
      AND p.activo = TRUE;

    -- Si no hay propiedad o no está en estatus 9, no hacer nada
    IF v_id_propiedad IS NULL OR v_estatus_actual IS NULL OR v_estatus_actual != 9 THEN
        RETURN NEW;
    END IF;

    -- Actualizar estatus de la propiedad a Escrituración (id=7)
    UPDATE propiedades
    SET id_estatus_disponibilidad = 7,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = v_id_propiedad
      AND id_estatus_disponibilidad = 9;  -- Solo si está en estado 9

    RAISE NOTICE 'Propiedad % actualizada de PAGADA COMPLETAMENTE (9) a ESCRITURACIÓN (7)', v_id_propiedad;

    RETURN NEW;
END;
$$;

-- Crear trigger que se ejecuta después de actualizar cuentas_cobranza
DROP TRIGGER IF EXISTS trigger_actualizar_estatus_escrituracion ON cuentas_cobranza;

CREATE TRIGGER trigger_actualizar_estatus_escrituracion
    AFTER UPDATE ON cuentas_cobranza
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_estatus_a_escrituracion();