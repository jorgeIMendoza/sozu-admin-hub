
-- Add email_confirmado column to usuarios table
-- Default is TRUE because existing users and admin-created users don't need confirmation
-- Only users from public registration (registro-publico) will have this set to FALSE
ALTER TABLE public.usuarios ADD COLUMN email_confirmado boolean NOT NULL DEFAULT true;

-- Add a comment for documentation
COMMENT ON COLUMN public.usuarios.email_confirmado IS 'Indicates if the user has confirmed their email. Only relevant for Agente Inmobiliario (3) and Inmobiliaria (4) roles created via public registration.';
