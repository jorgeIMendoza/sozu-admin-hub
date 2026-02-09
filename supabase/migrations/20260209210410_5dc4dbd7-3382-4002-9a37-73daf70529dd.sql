CREATE OR REPLACE FUNCTION public.check_email_blocked_role(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN roles r ON u.rol_id = r.id
    WHERE u.email = lower(trim(p_email))
      AND u.activo = true
      AND r.nombre IN ('Cliente', 'Directores')
  );
$$;