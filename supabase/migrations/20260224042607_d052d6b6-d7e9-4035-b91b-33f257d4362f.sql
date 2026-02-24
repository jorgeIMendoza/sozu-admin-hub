
-- 1. Create unified reservas_citas table
CREATE TABLE public.reservas_citas (
  id SERIAL PRIMARY KEY,
  id_tipo_cita INTEGER NOT NULL REFERENCES tipos_cita(id),
  id_configuracion_cita INTEGER REFERENCES configuracion_citas_usuarios(id) ON DELETE SET NULL,
  id_persona INTEGER REFERENCES personas(id),
  id_persona_prospecto INTEGER REFERENCES personas(id),
  id_proyecto INTEGER REFERENCES proyectos(id),
  id_agente INTEGER REFERENCES personas(id),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  ubicacion TEXT,
  google_calendar_event_id TEXT,
  google_meet_link TEXT,
  estatus TEXT NOT NULL DEFAULT 'programada',
  notas TEXT,
  confirmada_por TEXT,
  fecha_confirmacion TIMESTAMPTZ,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Migrate data from citas_capacitacion
INSERT INTO public.reservas_citas (
  id_tipo_cita, id_configuracion_cita, id_persona, fecha, hora_inicio, hora_fin,
  ubicacion, google_calendar_event_id, google_meet_link, estatus, notas,
  confirmada_por, fecha_confirmacion, activo, fecha_creacion, fecha_actualizacion
)
SELECT
  COALESCE(ccu.id_tipo_cita, 1),
  cc.id_configuracion_cita,
  cc.id_persona,
  cc.fecha, cc.hora_inicio, cc.hora_fin,
  cc.ubicacion, cc.google_calendar_event_id, cc.google_meet_link,
  cc.estatus, cc.notas, cc.confirmada_por, cc.fecha_confirmacion,
  cc.activo, cc.fecha_creacion, cc.fecha_actualizacion
FROM citas_capacitacion cc
LEFT JOIN configuracion_citas_usuarios ccu ON ccu.id = cc.id_configuracion_cita;

-- 3. Migrate data from citas_showroom (0 rows but for safety)
INSERT INTO public.reservas_citas (
  id_tipo_cita, id_persona_prospecto, id_proyecto, id_agente,
  fecha, hora_inicio, hora_fin, estatus, notas, activo, fecha_creacion, fecha_actualizacion
)
SELECT
  2, -- assuming showroom type is id=2
  cs.id_prospecto, cs.id_proyecto, cs.id_agente,
  cs.fecha, cs.hora_inicio, cs.hora_fin, cs.estatus, cs.notas,
  cs.activo, cs.fecha_creacion, cs.fecha_actualizacion
FROM citas_showroom cs;

-- 4. Enable RLS
ALTER TABLE public.reservas_citas ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "Authenticated users can view reservas_citas"
ON public.reservas_citas FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert reservas_citas"
ON public.reservas_citas FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update reservas_citas"
ON public.reservas_citas FOR UPDATE
TO authenticated
USING (true);

-- 6. Drop old tables
DROP TABLE public.citas_showroom;
DROP TABLE public.citas_capacitacion;

-- 7. Trigger for updated_at
CREATE TRIGGER update_reservas_citas_updated_at
BEFORE UPDATE ON public.reservas_citas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
