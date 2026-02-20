-- Allow authenticated users to insert into tipos_cita
CREATE POLICY "Authenticated users can insert tipos_cita"
ON public.tipos_cita
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update tipos_cita
CREATE POLICY "Authenticated users can update tipos_cita"
ON public.tipos_cita
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);