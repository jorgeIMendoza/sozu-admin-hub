-- Fix: Replace incorrect table name 'compradores_cuenta_cobranza' with 'compradores'
CREATE OR REPLACE FUNCTION public.check_sat_notification_conditions(p_cuenta_cobranza_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_propiedad_id INTEGER;
  v_estatus INTEGER;
  v_tiene_factura BOOLEAN;
  v_tiene_constancia BOOLEAN;
  v_tiene_archivo_sat BOOLEAN;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_edge_function_url TEXT;
BEGIN
  -- Get the property and its status through the offer
  SELECT o.id_propiedad, p.id_estatus_disponibilidad
  INTO v_propiedad_id, v_estatus
  FROM cuentas_cobranza cc
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN propiedades p ON o.id_propiedad = p.id
  WHERE cc.id = p_cuenta_cobranza_id
    AND cc.activo = true;

  -- If property not found or not in "Pagada completamente" status (9), exit
  IF v_propiedad_id IS NULL OR v_estatus != 9 THEN
    RETURN FALSE;
  END IF;

  -- Check if there's an active verified invoice (type 21 or 22)
  SELECT EXISTS (
    SELECT 1 FROM documentos
    WHERE id_cuenta_cobranza = p_cuenta_cobranza_id
      AND id_tipo_documento IN (21, 22)
      AND activo = true
      AND id_estatus_verificacion = 2
      AND es_draft = false
  ) INTO v_tiene_factura;

  -- Check if there's an active verified constancia fiscal (type 6)
  -- FIX: Changed 'compradores_cuenta_cobranza' to 'compradores'
  SELECT EXISTS (
    SELECT 1 FROM documentos d
    JOIN compradores ccc ON d.id_persona = ccc.id_persona
    WHERE ccc.id_cuenta_cobranza = p_cuenta_cobranza_id
      AND ccc.activo = true
      AND d.id_tipo_documento = 6
      AND d.activo = true
      AND d.id_estatus_verificacion = 2
  ) INTO v_tiene_constancia;

  -- Check if SAT notification file already exists (type 44)
  SELECT EXISTS (
    SELECT 1 FROM documentos
    WHERE id_cuenta_cobranza = p_cuenta_cobranza_id
      AND id_tipo_documento = 44
      AND activo = true
  ) INTO v_tiene_archivo_sat;

  -- If all conditions met and no SAT file exists, call the Edge Function
  IF v_tiene_factura AND v_tiene_constancia AND NOT v_tiene_archivo_sat THEN
    -- Get Supabase URL from environment (available in database functions)
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Fallback to direct URL if settings not available
    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
      v_supabase_url := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
    END IF;
    
    v_edge_function_url := v_supabase_url || '/functions/v1/trigger-sat-notification';
    
    -- Call the Edge Function using http extension
    PERFORM extensions.http_post(
      url := v_edge_function_url,
      body := json_build_object('id_cuenta_cobranza', p_cuenta_cobranza_id)::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_role_key, current_setting('request.jwt', true))
      )
    );
    
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;