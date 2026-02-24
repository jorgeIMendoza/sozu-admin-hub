
-- Add google_calendar_event_id to configuracion_citas_horarios to track each generated meet
-- This allows: 1) detecting manually deleted events, 2) updating/regenerating events on config changes

CREATE TABLE IF NOT EXISTS public.citas_calendar_events (
  id SERIAL PRIMARY KEY,
  id_configuracion_cita INTEGER NOT NULL REFERENCES configuracion_citas_usuarios(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora INTEGER NOT NULL,
  calendar_email TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id_configuracion_cita, fecha, hora)
);

-- Enable RLS
ALTER TABLE public.citas_calendar_events ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Authenticated users can read citas_calendar_events"
ON public.citas_calendar_events
FOR SELECT
USING (true);

-- Allow all authenticated users to manage (admin will manage via edge function)
CREATE POLICY "Authenticated users can insert citas_calendar_events"
ON public.citas_calendar_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update citas_calendar_events"
ON public.citas_calendar_events
FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete citas_calendar_events"
ON public.citas_calendar_events
FOR DELETE
USING (true);
