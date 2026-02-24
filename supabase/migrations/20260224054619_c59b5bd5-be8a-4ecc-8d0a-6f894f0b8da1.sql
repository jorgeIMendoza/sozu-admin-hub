
-- Mark the Feb 26 event as externally cancelled since we know it was deleted from Google Calendar
UPDATE public.citas_calendar_events 
SET cancelado_externamente = true, fecha_actualizacion = now()
WHERE id = 18 AND fecha = '2026-02-26';
