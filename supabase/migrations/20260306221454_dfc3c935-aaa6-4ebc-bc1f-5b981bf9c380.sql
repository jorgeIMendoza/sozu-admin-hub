CREATE OR REPLACE FUNCTION public.can_access_agent_owned_lead(_owner_persona_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT (
    public.is_admin_user()
    OR public.can_view_all_prospects()
    OR (
      public.get_current_user_persona_id() IS NOT NULL
      AND _owner_persona_id IS NOT NULL
      AND _owner_persona_id = public.get_current_user_persona_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.entidades_relacionadas er_ag
      WHERE er_ag.id_tipo_entidad = 19
        AND er_ag.activo = true
        AND er_ag.id_persona = _owner_persona_id
        AND er_ag.id_persona_duena_lead = public.get_current_user_persona_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.proyectos_acceso pa
        ON lower(pa.usuario_id) = lower(u.email)
       AND pa.activo = true
      JOIN public.entidades_relacionadas er_owner
        ON er_owner.id = pa.id_entidad_relacionada_dueno
       AND er_owner.activo = true
       AND er_owner.id_tipo_entidad = 5
      WHERE u.auth_user_id = auth.uid()
        AND er_owner.id_persona = _owner_persona_id
    )
  );
$function$;