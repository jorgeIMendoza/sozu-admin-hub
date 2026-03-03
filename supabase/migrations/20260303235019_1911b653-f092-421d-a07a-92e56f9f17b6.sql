ALTER TABLE public.configuracion_citas_usuarios
ADD COLUMN IF NOT EXISTS correos_enterado_fijos text[] DEFAULT '{}'::text[];