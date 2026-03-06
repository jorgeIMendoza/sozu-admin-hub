-- Extend ownership resolution for inmobiliaria agent management.
-- Supports actor resolution by auth_user_id OR JWT email and owner resolution
-- by direct inmobiliaria role, agent/internal relationship, or project-access ownership link.

CREATE OR REPLACE FUNCTION public.is_inmob_agent_owner(target_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor AS (
    SELECT u.id_persona, u.rol_id, u.email
    FROM public.usuarios u
    WHERE u.activo = true
      AND (
        u.auth_user_id = auth.uid()
        OR lower(u.email) = lower(auth.jwt() ->> 'email')
      )
    ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  ),
  owner_from_relation AS (
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
  ),
  owner_from_access AS (
    SELECT er_owner.id_persona AS owner_persona
    FROM actor a
    JOIN public.proyectos_acceso pa
      ON lower(pa.usuario_id) = lower(a.email)
     AND pa.activo = true
     AND pa.id_entidad_relacionada_dueno IS NOT NULL
    JOIN public.entidades_relacionadas er_owner
      ON er_owner.id = pa.id_entidad_relacionada_dueno
     AND er_owner.id_tipo_entidad = 5
     AND er_owner.activo = true
    LIMIT 1
  ),
  actor_owner AS (
    SELECT COALESCE(
      (SELECT owner_persona FROM owner_from_relation),
      (SELECT owner_persona FROM owner_from_access)
    ) AS owner_persona
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