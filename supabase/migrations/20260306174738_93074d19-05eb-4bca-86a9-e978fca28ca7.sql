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
  owner_candidates AS (
    -- Super Admin y Admin Proyecto: acceso total
    SELECT -1::bigint AS owner_persona
    FROM actor a
    WHERE a.rol_id IN (1, 2)

    UNION

    -- Agentes: resolver inmobiliaria dueña por relación tipo 19
    SELECT er.id_persona_duena_lead::bigint AS owner_persona
    FROM actor a
    JOIN public.entidades_relacionadas er
      ON er.id_persona = a.id_persona
     AND er.id_tipo_entidad = 19
     AND er.activo = true
    WHERE a.rol_id IN (3, 9)
      AND er.id_persona_duena_lead IS NOT NULL

    UNION

    -- Usuario inmobiliaria: usar su id_persona SOLO si realmente tiene agentes vinculados
    SELECT a.id_persona::bigint AS owner_persona
    FROM actor a
    WHERE a.rol_id = 4
      AND a.id_persona IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.entidades_relacionadas er_check
        WHERE er_check.id_tipo_entidad = 19
          AND er_check.activo = true
          AND er_check.id_persona_duena_lead = a.id_persona
      )

    UNION

    -- Fallback por proyectos_acceso para contextos de inmobiliaria secundaria
    SELECT er_owner.id_persona::bigint AS owner_persona
    FROM actor a
    JOIN public.proyectos_acceso pa
      ON lower(pa.usuario_id) = lower(a.email)
     AND pa.activo = true
     AND pa.id_entidad_relacionada_dueno IS NOT NULL
    JOIN public.entidades_relacionadas er_owner
      ON er_owner.id = pa.id_entidad_relacionada_dueno
     AND er_owner.id_tipo_entidad = 5
     AND er_owner.activo = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM owner_candidates oc
    WHERE oc.owner_persona IS NOT NULL
      AND (
        oc.owner_persona = -1
        OR EXISTS (
          SELECT 1
          FROM public.entidades_relacionadas er_agent
          JOIN public.usuarios u_agent ON u_agent.id_persona = er_agent.id_persona
          WHERE er_agent.id_tipo_entidad = 19
            AND er_agent.activo = true
            AND er_agent.id_persona_duena_lead = oc.owner_persona
            AND lower(u_agent.email) = lower(trim(target_email))
        )
      )
  );
$$;