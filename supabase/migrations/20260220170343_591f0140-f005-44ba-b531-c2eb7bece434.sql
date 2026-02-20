
-- Add Google Calendar fields to citas_capacitacion
ALTER TABLE public.citas_capacitacion
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text,
  ADD COLUMN IF NOT EXISTS google_meet_link text;
