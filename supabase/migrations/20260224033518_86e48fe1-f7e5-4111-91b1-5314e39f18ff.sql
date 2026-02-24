-- Allow all authenticated users to SELECT configuracion_citas_horarios
-- so agents can see available time slots for booking
CREATE POLICY "Authenticated users can read configuracion_citas_horarios"
ON public.configuracion_citas_horarios
FOR SELECT
USING (true);
