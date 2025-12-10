-- 1. Crear tabla estatus_verificacion
CREATE TABLE public.estatus_verificacion (
    id integer PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insertar los estatus
INSERT INTO public.estatus_verificacion (id, nombre) VALUES
(1, 'Pendiente'),
(2, 'Validado'),
(3, 'Rechazado'),
(4, 'Expirado');

-- 3. Crear tabla para comentarios de cambio de estatus
CREATE TABLE public.comentarios_verificacion_documento (
    id serial PRIMARY KEY,
    id_documento bigint NOT NULL,
    id_estatus_verificacion integer NOT NULL REFERENCES public.estatus_verificacion(id),
    comentario text NOT NULL,
    email_usuario text,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Agregar nueva columna id_estatus_verificacion a documentos
ALTER TABLE public.documentos 
ADD COLUMN id_estatus_verificacion integer DEFAULT 1 REFERENCES public.estatus_verificacion(id);

-- 5. Migrar datos existentes: true -> 2 (Validado), false/null -> 1 (Pendiente)
UPDATE public.documentos 
SET id_estatus_verificacion = CASE 
    WHEN es_verificado = true THEN 2 
    ELSE 1 
END;

-- 6. Hacer la columna NOT NULL
ALTER TABLE public.documentos 
ALTER COLUMN id_estatus_verificacion SET NOT NULL;

-- 7. Agregar FK de comentarios a documentos
ALTER TABLE public.comentarios_verificacion_documento
ADD CONSTRAINT fk_comentarios_verif_documento 
FOREIGN KEY (id_documento) REFERENCES public.documentos(id);

-- 8. Eliminar la columna es_verificado (CASCADE eliminará triggers dependientes)
ALTER TABLE public.documentos DROP COLUMN es_verificado CASCADE;

-- 9. Actualizar función trigger_check_escrituracion
CREATE OR REPLACE FUNCTION public.trigger_check_escrituracion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id_cuenta_cobranza INTEGER;
  v_request_id BIGINT;
  v_supabase_url TEXT := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
  v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';
BEGIN
  IF NEW.id_estatus_verificacion = 2 AND (OLD.id_estatus_verificacion IS NULL OR OLD.id_estatus_verificacion != 2) THEN
    IF NEW.id_persona IS NOT NULL THEN
      RAISE LOG '[TRIGGER] Documento % verificado para persona %', NEW.id, NEW.id_persona;
      FOR v_id_cuenta_cobranza IN 
        SELECT DISTINCT comp.id_cuenta_cobranza
        FROM compradores comp
        WHERE comp.id_persona = NEW.id_persona AND comp.activo = true
      LOOP
        SELECT net.http_post(
          url := v_supabase_url || '/functions/v1/check-property-escrituracion-status',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon_key),
          body := jsonb_build_object('id_cuenta_cobranza', v_id_cuenta_cobranza)
        ) INTO v_request_id;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 10. Actualizar función verificar_propiedad_vendida
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
    IF TG_TABLE_NAME = 'documentos' THEN
        v_propiedad_id := NEW.id_propiedad;
    ELSIF TG_TABLE_NAME = 'acuerdos_pago' THEN
        SELECT o.id_propiedad INTO v_propiedad_id
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE ap.id = NEW.id;
    END IF;

    SELECT id_edificio_modelo INTO v_id_edificio_modelo FROM propiedades WHERE id = v_propiedad_id;
    IF v_id_edificio_modelo IS NULL THEN RETURN NEW; END IF;

    SELECT EXISTS(
        SELECT 1 FROM documentos 
        WHERE id_propiedad = v_propiedad_id AND id_tipo_documento = 18 
        AND id_estatus_verificacion = 2 AND activo = TRUE
    ) INTO tiene_contrato_verificado;

    SELECT EXISTS(
        SELECT 1 FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
        JOIN ofertas o ON cc.id_oferta = o.id
        WHERE o.id_propiedad = v_propiedad_id AND ap.id_concepto = 2 
        AND ap.pago_completado = TRUE AND ap.activo = TRUE
    ) INTO tiene_enganche_pagado;

    IF tiene_contrato_verificado AND tiene_enganche_pagado THEN
        UPDATE propiedades SET id_estatus_disponibilidad = 5 WHERE id = v_propiedad_id;
        UPDATE cuentas_cobranza SET fecha_compra = CURRENT_DATE
        WHERE id IN (SELECT cc.id FROM cuentas_cobranza cc JOIN ofertas o ON cc.id_oferta = o.id WHERE o.id_propiedad = v_propiedad_id AND cc.activo = TRUE);
    END IF;
    RETURN NEW;
END;
$function$;

-- 11. Recrear triggers
CREATE TRIGGER trg_verificar_propiedad_vendida_documento
    AFTER UPDATE OF id_estatus_verificacion ON public.documentos
    FOR EACH ROW EXECUTE FUNCTION public.verificar_propiedad_vendida();

CREATE TRIGGER after_documento_verificado
    AFTER UPDATE OF id_estatus_verificacion ON public.documentos
    FOR EACH ROW EXECUTE FUNCTION public.trigger_check_escrituracion();