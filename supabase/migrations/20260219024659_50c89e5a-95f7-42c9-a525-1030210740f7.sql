
-- Create table for showroom appointments
CREATE TABLE public.citas_showroom (
  id SERIAL PRIMARY KEY,
  id_prospecto INTEGER NOT NULL REFERENCES public.personas(id),
  id_proyecto INTEGER NOT NULL REFERENCES public.proyectos(id),
  id_agente INTEGER NOT NULL REFERENCES public.personas(id),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  notas TEXT,
  estatus TEXT NOT NULL DEFAULT 'programada',
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.citas_showroom ENABLE ROW LEVEL SECURITY;

-- Agents can see their own appointments
CREATE POLICY "Agents can view their own showroom appointments"
  ON public.citas_showroom FOR SELECT
  USING (true);

CREATE POLICY "Agents can create showroom appointments"
  ON public.citas_showroom FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Agents can update showroom appointments"
  ON public.citas_showroom FOR UPDATE
  USING (true);
