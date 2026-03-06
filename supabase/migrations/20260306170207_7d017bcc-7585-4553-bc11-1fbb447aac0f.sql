-- Allow inmobiliaria users (rol_id=4) to update activo status of their linked agents
CREATE OR REPLACE FUNCTION public.is_inmob_agent_owner(target_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u_owner
    JOIN entidades_relacionadas er_owner
      ON er_owner.id_persona = u_owner.id_persona
      AND er_owner.id_tipo_entidad = 5
      AND er_owner.activo = true
    JOIN entidades_relacionadas er_agent
      ON er_agent.id_persona_duena_lead = er_owner.id_persona
      AND er_agent.id_tipo_entidad = 19
      AND er_agent.activo = true
    JOIN usuarios u_agent
      ON u_agent.id_persona = er_agent.id_persona
    WHERE u_owner.email = (auth.jwt() ->> 'email')
      AND u_owner.rol_id = 4
      AND u_agent.email = target_email
  )
$$;

CREATE POLICY "Inmobiliaria can update own agents"
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING (public.is_inmob_agent_owner(email))
  WITH CHECK (public.is_inmob_agent_owner(email));