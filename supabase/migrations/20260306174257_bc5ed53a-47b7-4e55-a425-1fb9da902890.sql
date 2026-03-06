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
        -- Super Admin and Administrador de Proyecto can manage any agent
        WHEN a.rol_id IN (1, 2) THEN -1
        -- Inmobiliaria user is the owner directly
        WHEN a.rol_id = 4 THEN a.id_persona
        -- Agent roles resolve via their own relationship
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
    WHERE ao.owner_persona IS NOT NULL
      AND (
        -- Super Admin / Admin Proyecto: can manage any agent
        ao.owner_persona = -1
        OR
        -- Normal ownership check
        EXISTS (
          SELECT 1
          FROM public.entidades_relacionadas er_agent
          JOIN public.usuarios u_agent ON u_agent.id_persona = er_agent.id_persona
          WHERE er_agent.id_persona_duena_lead = ao.owner_persona
            AND er_agent.id_tipo_entidad = 19
            AND er_agent.activo = true
            AND lower(u_agent.email) = lower(target_email)
        )
      )
  );
$$;