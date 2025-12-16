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
  -- Solo procesar cuando el estatus cambia a Validado (2)
  IF NEW.id_estatus_verificacion = 2 AND (OLD.id_estatus_verificacion IS NULL OR OLD.id_estatus_verificacion != 2) THEN
    
    -- CASO 1: Documento asociado directamente a una cuenta de cobranza
    IF NEW.id_cuenta_cobranza IS NOT NULL THEN
      RAISE LOG '[TRIGGER] Documento % verificado para cuenta_cobranza %', NEW.id, NEW.id_cuenta_cobranza;
      
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/check-property-escrituracion-status',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon_key),
        body := jsonb_build_object('id_cuenta_cobranza', NEW.id_cuenta_cobranza)
      ) INTO v_request_id;
      
      RAISE LOG '[TRIGGER] HTTP request enviado para cuenta %: request_id=%', NEW.id_cuenta_cobranza, v_request_id;
    
    -- CASO 2: Documento asociado a una persona (buscar sus cuentas como comprador)
    ELSIF NEW.id_persona IS NOT NULL THEN
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
        
        RAISE LOG '[TRIGGER] HTTP request enviado para cuenta %: request_id=%', v_id_cuenta_cobranza, v_request_id;
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;