ALTER TABLE public.configuracion_citas_usuarios
  ADD COLUMN ubicacion_direccion TEXT,
  ADD COLUMN ubicacion_latitud NUMERIC,
  ADD COLUMN ubicacion_longitud NUMERIC;