-- =====================================================
-- PARTE 1: Insertar usuarios para todos los compradores activos
-- =====================================================

INSERT INTO usuarios (email, nombre, rol_id, activo, debe_cambiar_password, id_persona)
SELECT DISTINCT ON (p.email)
  p.email,
  p.nombre_legal,
  23, -- rol Cliente
  true,
  true,
  p.id
FROM compradores c
JOIN personas p ON p.id = c.id_persona
LEFT JOIN usuarios u ON u.email = p.email
WHERE c.activo = true
  AND p.email IS NOT NULL 
  AND p.email != ''
  AND u.email IS NULL
ORDER BY p.email, p.id;

-- =====================================================
-- PARTE 2: Llamar a la edge function para crear auth.users
-- =====================================================

DO $$
DECLARE
  v_user RECORD;
  v_service_role_key TEXT;
  v_edge_function_url TEXT := 'https://tzmhgfjmddkfyffkkmto.supabase.co/functions/v1/create-client-user';
  v_count INTEGER := 0;
BEGIN
  -- Obtener el service role key desde Vault
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_role_key := NULL;
    RAISE WARNING 'No se pudo obtener SUPABASE_SERVICE_ROLE_KEY desde Vault: %', SQLERRM;
  END;
  
  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE WARNING 'SUPABASE_SERVICE_ROLE_KEY no encontrado en Vault - los usuarios se crearán sin auth.users';
    RETURN;
  END IF;
  
  -- Iterar sobre usuarios Cliente sin auth_user_id
  FOR v_user IN 
    SELECT u.email, u.nombre, u.id_persona
    FROM usuarios u
    WHERE u.rol_id = 23  -- Cliente
      AND u.auth_user_id IS NULL
      AND u.activo = true
      AND u.email IS NOT NULL
      AND u.email != ''
  LOOP
    -- Llamar a la edge function via pg_net
    PERFORM net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'email', v_user.email,
        'nombre', v_user.nombre,
        'id_persona', v_user.id_persona
      )
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Se enviaron % solicitudes para crear usuarios en auth.users', v_count;
END;
$$;