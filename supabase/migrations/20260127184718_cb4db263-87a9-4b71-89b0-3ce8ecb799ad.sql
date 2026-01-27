-- Actualización del trigger para prevenir cambio a Escrituración
-- si la cuenta aún tiene saldo pendiente.
--
-- El trigger original solo verificaba que el estatus fuera 9 (Pagada completamente)
-- pero no validaba que la cuenta realmente estuviera pagada según los pagos registrados.

CREATE OR REPLACE FUNCTION public.actualizar_estatus_a_escrituracion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_id_propiedad BIGINT;
    v_estatus_actual INTEGER;
    v_saldo_pendiente NUMERIC;
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

    IF NOT dato_actualizado THEN
        RETURN NEW;
    END IF;

    -- Obtener la propiedad relacionada y su estatus actual
    SELECT o.id_propiedad, p.id_estatus_disponibilidad
    INTO v_id_propiedad, v_estatus_actual
    FROM ofertas o
    JOIN propiedades p ON o.id_propiedad = p.id
    WHERE o.id = NEW.id_oferta
      AND o.id_producto IS NULL
      AND p.activo = TRUE;

    IF v_id_propiedad IS NULL OR v_estatus_actual IS NULL OR v_estatus_actual != 9 THEN
        RETURN NEW;
    END IF;

    -- NUEVA VALIDACIÓN: Verificar que la cuenta esté realmente pagada
    SELECT NEW.precio_final - COALESCE(SUM(p.monto), 0)
    INTO v_saldo_pendiente
    FROM pagos p
    WHERE p.id_cuenta_cobranza = NEW.id
      AND p.activo = true;

    -- Solo permitir el cambio si el saldo es <= $0.01
    IF v_saldo_pendiente > 0.01 THEN
        RAISE LOG 'Propiedad % NO actualizada a Escrituración: saldo pendiente $%', 
            v_id_propiedad, v_saldo_pendiente;
        RETURN NEW;
    END IF;

    -- Actualizar estatus a Escrituración
    UPDATE propiedades
    SET id_estatus_disponibilidad = 7,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = v_id_propiedad
      AND id_estatus_disponibilidad = 9;

    RAISE NOTICE 'Propiedad % actualizada de PAGADA COMPLETAMENTE (9) a ESCRITURACIÓN (7)', v_id_propiedad;

    RETURN NEW;
END;
$$;