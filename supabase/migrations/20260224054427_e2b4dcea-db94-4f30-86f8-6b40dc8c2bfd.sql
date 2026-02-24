
ALTER TABLE public.citas_calendar_events 
ADD COLUMN cancelado_externamente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.citas_calendar_events.cancelado_externamente IS 'True when the Google Calendar event was manually deleted. Blocks the slot for all users.';
