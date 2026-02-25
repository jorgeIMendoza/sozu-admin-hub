
-- Add round robin support to configuracion_citas_usuarios
ALTER TABLE public.configuracion_citas_usuarios 
  ADD COLUMN IF NOT EXISTS round_robin_enterados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round_robin_index integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.configuracion_citas_usuarios.round_robin_enterados IS 'When true, rotate correos_enterado instead of adding all to each event';
COMMENT ON COLUMN public.configuracion_citas_usuarios.round_robin_index IS 'Index tracking which correo_enterado is next in round robin rotation';
