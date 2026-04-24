CREATE POLICY "Inmob owners can view their agents"
ON public.usuarios
FOR SELECT
TO authenticated
USING ( public.is_inmob_agent_owner(email) );