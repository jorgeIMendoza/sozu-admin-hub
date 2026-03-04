CREATE POLICY "Authenticated users can delete firmas"
ON public.firmas_digitales
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated'::text);