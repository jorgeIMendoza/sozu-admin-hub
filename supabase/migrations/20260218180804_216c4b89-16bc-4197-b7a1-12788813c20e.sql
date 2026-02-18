
CREATE TABLE public.citas_capacitacion (
  id SERIAL PRIMARY KEY,
  id_persona INTEGER NOT NULL REFERENCES public.personas(id),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  ubicacion TEXT NOT NULL,
  google_calendar_event_id TEXT,
  estatus TEXT NOT NULL DEFAULT 'programada' CHECK (estatus IN ('programada', 'asistio', 'no_asistio', 'cancelada')),
  notas TEXT,
  confirmada_por TEXT,
  fecha_confirmacion TIMESTAMPTZ,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.citas_capacitacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view training appointments"
ON public.citas_capacitacion FOR SELECT USING (true);

CREATE POLICY "Anyone can create training appointments"
ON public.citas_capacitacion FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update training appointments"
ON public.citas_capacitacion FOR UPDATE USING (true);

CREATE OR REPLACE FUNCTION public.update_citas_capacitacion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_citas_capacitacion_updated_at
BEFORE UPDATE ON public.citas_capacitacion
FOR EACH ROW
EXECUTE FUNCTION public.update_citas_capacitacion_timestamp();
