
-- Función del trigger para verificar escrituración automáticamente
CREATE OR REPLACE FUNCTION public.trigger_check_escrituracion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id_cuenta_cobranza INTEGER;
  v_request_id BIGINT;
  v_supabase_url TEXT := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
  v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';
BEGIN
  -- Solo ejecutar si cambió de false a true
  IF NEW.es_verificado = TRUE AND (OLD.es_verificado = FALSE OR OLD.es_verificado IS NULL) THEN
    
    -- Si el documento está asociado a una persona, buscar sus cuentas de cobranza
    IF NEW.id_persona IS NOT NULL THEN
      
      RAISE LOG '[TRIGGER] Documento % verificado para persona %', NEW.id, NEW.id_persona;
      
      -- Obtener las cuentas de cobranza donde esta persona es compradora
      FOR v_id_cuenta_cobranza IN 
        SELECT DISTINCT comp.id_cuenta_cobranza
        FROM compradores comp
        WHERE comp.id_persona = NEW.id_persona
          AND comp.activo = true
      LOOP
        RAISE LOG '[TRIGGER] Llamando a check-property-escrituracion-status para cuenta %', v_id_cuenta_cobranza;
        
        -- Llamar al edge function para verificar
        SELECT net.http_post(
          url := v_supabase_url || '/functions/v1/check-property-escrituracion-status',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_anon_key
          ),
          body := jsonb_build_object(
            'id_cuenta_cobranza', v_id_cuenta_cobranza
          )
        ) INTO v_request_id;
        
        RAISE LOG '[TRIGGER] HTTP request enviado con ID: %', v_request_id;
      END LOOP;
      
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Crear el trigger en la tabla documentos
DROP TRIGGER IF EXISTS after_documento_verificado ON public.documentos;
CREATE TRIGGER after_documento_verificado
  AFTER UPDATE ON public.documentos
  FOR EACH ROW
  WHEN (NEW.es_verificado = TRUE AND (OLD.es_verificado = FALSE OR OLD.es_verificado IS NULL))
  EXECUTE FUNCTION public.trigger_check_escrituracion();
