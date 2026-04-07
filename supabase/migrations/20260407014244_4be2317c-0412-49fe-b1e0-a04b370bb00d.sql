
-- Add location columns to configuracion_citas_proyectos (per-project location)
ALTER TABLE public.configuracion_citas_proyectos
  ADD COLUMN ubicacion_direccion TEXT,
  ADD COLUMN ubicacion_latitud NUMERIC,
  ADD COLUMN ubicacion_longitud NUMERIC;

-- Remove old single-location columns from configuracion_citas_usuarios
ALTER TABLE public.configuracion_citas_usuarios
  DROP COLUMN IF EXISTS ubicacion_direccion,
  DROP COLUMN IF EXISTS ubicacion_latitud,
  DROP COLUMN IF EXISTS ubicacion_longitud;
