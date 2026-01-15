-- Actualizar la función para usar SUPABASE_SERVICE_ROLE_KEY desde Vault
CREATE OR REPLACE FUNCTION public.create_client_user_on_comprador_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_persona RECORD;
  v_existing_user RECORD;
  v_cliente_rol_id INTEGER;
  v_new_user_id INTEGER;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Obtener datos de la persona
  SELECT id, nombre_legal, email INTO v_persona
  FROM personas
  WHERE id = NEW.id_persona;
  
  -- Si no tiene email válido, no podemos crear usuario
  IF v_persona.email IS NULL OR v_persona.email = '' THEN
    RETURN NEW;
  END IF;
  
  -- Obtener el ID del rol Cliente
  SELECT id INTO v_cliente_rol_id
  FROM roles
  WHERE nombre = 'Cliente' AND activo = true
  LIMIT 1;
  
  -- Si no existe el rol Cliente, salir
  IF v_cliente_rol_id IS NULL THEN
    RAISE WARNING 'Rol Cliente no encontrado';
    RETURN NEW;
  END IF;
  
  -- Verificar si ya existe usuario con ese email
  SELECT id INTO v_existing_user
  FROM usuarios
  WHERE email = v_persona.email;
  
  -- Si no existe, crear el registro en usuarios
  IF v_existing_user.id IS NULL THEN
    INSERT INTO usuarios (email, nombre, rol_id, activo, debe_cambiar_password, id_persona)
    VALUES (v_persona.email, v_persona.nombre_legal, v_cliente_rol_id, true, true, v_persona.id)
    RETURNING id INTO v_new_user_id;
  END IF;
  
  -- URL de la edge function
  v_edge_function_url := 'https://tzmhgfjmddkfyffkkmto.supabase.co/functions/v1/create-client-user';
  
  -- Obtener el service role key desde Vault (usando el mismo nombre que en Edge Functions)
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_role_key := NULL;
    RAISE WARNING 'No se pudo obtener SUPABASE_SERVICE_ROLE_KEY desde Vault: %', SQLERRM;
  END;
  
  -- Si tenemos el service role key, llamar a la edge function via pg_net
  IF v_service_role_key IS NOT NULL AND v_service_role_key != '' THEN
    PERFORM net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'email', v_persona.email,
        'nombre', v_persona.nombre_legal,
        'id_persona', v_persona.id
      )
    );
  ELSE
    RAISE WARNING 'SUPABASE_SERVICE_ROLE_KEY no configurado en Vault - no se puede crear usuario en auth.users';
  END IF;
  
  RETURN NEW;
END;
$$;