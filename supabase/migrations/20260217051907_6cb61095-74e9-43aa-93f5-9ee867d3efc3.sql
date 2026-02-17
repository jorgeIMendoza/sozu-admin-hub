
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Update the trigger function to also call the notification edge function via pg_net
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _usuario_nombre TEXT;
  _supabase_url TEXT := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
  _anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';
BEGIN
  -- Update email_confirmado in usuarios table
  UPDATE public.usuarios
  SET email_confirmado = true, fecha_actualizacion = now()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND email_confirmado = false;

  -- Get the user's name for the notification
  SELECT nombre INTO _usuario_nombre
  FROM public.usuarios
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  -- Call edge function to send credential + admin notification emails via pg_net
  IF _usuario_nombre IS NOT NULL THEN
    PERFORM extensions.http_post(
      url := _supabase_url || '/functions/v1/notificar-confirmacion-email',
      body := jsonb_build_object(
        'email', LOWER(NEW.email),
        'nombre', _usuario_nombre
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _anon_key
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
