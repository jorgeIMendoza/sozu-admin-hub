-- Habilitar extensión pg_net para hacer HTTP requests desde PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Función que se ejecutará cuando se complete un pago
CREATE OR REPLACE FUNCTION public.trigger_check_property_sold_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id_propiedad INTEGER;
  v_cuenta_cobranza_id INTEGER;
  v_request_id BIGINT;
  v_supabase_url TEXT := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
  v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';
BEGIN
  -- Solo ejecutar cuando pago_completado cambia a TRUE
  IF NEW.pago_completado = TRUE AND (OLD.pago_completado = FALSE OR OLD.pago_completado IS NULL) THEN
    
    v_cuenta_cobranza_id := NEW.id_cuenta_cobranza;
    
    -- Verificar si la cuenta de cobranza está relacionada con una propiedad
    SELECT o.id_propiedad INTO v_id_propiedad
    FROM cuentas_cobranza cc
    JOIN ofertas o ON cc.id_oferta = o.id
    WHERE cc.id = v_cuenta_cobranza_id
      AND o.id_propiedad IS NOT NULL
      AND cc.activo = TRUE;
    
    -- Solo llamar al Edge Function si es una cuenta de propiedad
    IF v_id_propiedad IS NOT NULL THEN
      RAISE LOG '[TRIGGER] Llamando a check-property-sold-status para cuenta % (propiedad %)', 
        v_cuenta_cobranza_id, v_id_propiedad;
      
      -- Hacer HTTP POST request al Edge Function usando pg_net
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/check-property-sold-status',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body := jsonb_build_object(
          'id_cuenta_cobranza', v_cuenta_cobranza_id
        )
      ) INTO v_request_id;
      
      RAISE LOG '[TRIGGER] HTTP request enviado con ID: %', v_request_id;
    ELSE
      RAISE LOG '[TRIGGER] Cuenta % no es de propiedad, omitiendo llamada a Edge Function', 
        v_cuenta_cobranza_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS trg_check_sold_status_on_payment ON public.acuerdos_pago;

-- Crear trigger que se ejecuta AFTER UPDATE de pago_completado
CREATE TRIGGER trg_check_sold_status_on_payment
AFTER UPDATE OF pago_completado ON public.acuerdos_pago
FOR EACH ROW
WHEN (NEW.pago_completado = TRUE AND NEW.activo = TRUE)
EXECUTE FUNCTION public.trigger_check_property_sold_status();

-- Comentarios explicativos
COMMENT ON FUNCTION public.trigger_check_property_sold_status() IS 
'Trigger function que llama al Edge Function check-property-sold-status cuando se completa un pago de una propiedad. Solo se ejecuta para cuentas de cobranza relacionadas con propiedades (no productos ni servicios).';

COMMENT ON TRIGGER trg_check_sold_status_on_payment ON public.acuerdos_pago IS 
'Ejecuta automáticamente check-property-sold-status cuando pago_completado cambia a TRUE para cuentas de propiedades.';