
-- Table for storing floor plan images per building level
CREATE TABLE public.edificios_niveles_planos (
  id SERIAL PRIMARY KEY,
  id_edificio INTEGER NOT NULL REFERENCES public.edificios(id) ON DELETE CASCADE,
  nivel INTEGER NOT NULL,
  imagen_url TEXT NOT NULL,
  regiones JSONB DEFAULT '[]'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id_edificio, nivel)
);

-- RLS
ALTER TABLE public.edificios_niveles_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read edificios_niveles_planos"
  ON public.edificios_niveles_planos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert edificios_niveles_planos"
  ON public.edificios_niveles_planos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update edificios_niveles_planos"
  ON public.edificios_niveles_planos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for floor plans (reuse modelos bucket, add path planos-ubicacion)
-- No new bucket needed, we'll use the existing 'modelos' bucket with a different path
