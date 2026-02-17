-- Create a function to mark email as confirmed for the current logged-in user
CREATE OR REPLACE FUNCTION public.mark_email_confirmed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  -- Get the email of the currently authenticated user
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  
  IF user_email IS NOT NULL THEN
    UPDATE usuarios
    SET email_confirmado = true, fecha_actualizacion = now()
    WHERE LOWER(email) = LOWER(user_email)
      AND email_confirmado = false;
  END IF;
END;
$$;