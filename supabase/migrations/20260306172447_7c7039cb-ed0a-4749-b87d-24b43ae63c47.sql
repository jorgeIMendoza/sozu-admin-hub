-- Improve ownership resolution for inmobiliaria agent management
-- Allows owner users (rol 4) and users linked to an inmobiliaria (roles 3/9)
-- to update agents that belong to the same inmobiliaria owner.

CREATE OR REPLACE FUNCTION public.is_inmob_agent_owner(target_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor AS (
    SELECT u.id_persona, u.rol_id
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
    LIMIT 1
  ),
  actor_owner AS (
    SELECT
      CASE
        WHEN a.rol_id = 4 THEN a.id_persona
        WHEN a.rol_id IN (3, 9) THEN (
          SELECT er.id_persona_duena_lead
          FROM public.entidades_relacionadas er
          WHERE er.id_persona = a.id_persona
            AND er.id_tipo_entidad = 19
            AND er.activo = true
          ORDER BY er.id DESC
          LIMIT 1
        )
        ELSE NULL
      END AS owner_persona
    FROM actor a
  )
  SELECT EXISTS (
    SELECT 1
    FROM actor_owner ao
    JOIN public.entidades_relacionadas er_agent
      ON er_agent.id_persona_duena_lead = ao.owner_persona
     AND er_agent.id_tipo_entidad = 19
     AND er_agent.activo = true
    JOIN public.usuarios u_agent
      ON u_agent.id_persona = er_agent.id_persona
    WHERE ao.owner_persona IS NOT NULL
      AND lower(u_agent.email) = lower(target_email)
  );
$$;