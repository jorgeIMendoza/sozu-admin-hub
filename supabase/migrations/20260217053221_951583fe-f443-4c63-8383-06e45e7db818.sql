
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _usuario_nombre TEXT;
  _supabase_url TEXT;
  _anon_key TEXT;
BEGIN
  -- Only proceed if email_confirmed_at changed from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    -- 1. Update email_confirmado in usuarios table
    UPDATE public.usuarios
    SET email_confirmado = true
    WHERE LOWER(email) = LOWER(NEW.email);

    -- 2. Try to call the notification edge function (non-blocking)
    BEGIN
      SELECT nombre INTO _usuario_nombre
      FROM public.usuarios
      WHERE LOWER(email) = LOWER(NEW.email)
      LIMIT 1;

      _supabase_url := 'https://tzmhgfjmddkfyffkkmto.supabase.co';
      _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';

      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/notificar-confirmacion-email',
        body := jsonb_build_object('email', NEW.email, 'nombre', COALESCE(_usuario_nombre, 'Usuario')),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _anon_key)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'handle_email_confirmation: Could not call notification edge function: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
