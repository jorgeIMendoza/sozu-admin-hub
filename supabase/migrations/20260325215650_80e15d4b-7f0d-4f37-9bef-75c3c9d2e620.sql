CREATE OR REPLACE FUNCTION public.agent_claim_or_reactivate_prospect_project(_persona_id BIGINT, _proyecto_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_persona_id BIGINT;
  _relation_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _current_persona_id := public.get_current_user_persona_id();

  IF NOT public.is_admin_user() AND _current_persona_id IS NULL THEN
    RAISE EXCEPTION 'User persona not found';
  END IF;

  IF NOT public.is_admin_user() AND NOT EXISTS (
    SELECT 1
    FROM public.entidades_relacionadas
    WHERE id_persona = _persona_id
      AND id_tipo_entidad = 7
      AND activo = true
      AND id_persona_duena_lead = _current_persona_id
  ) THEN
    RAISE EXCEPTION 'No tienes acceso para reasignar este prospecto';
  END IF;

  SELECT id
  INTO _relation_id
  FROM public.entidades_relacionadas
  WHERE id_persona = _persona_id
    AND id_tipo_entidad = 7
    AND id_proyecto = _proyecto_id
  ORDER BY id DESC
  LIMIT 1;

  IF _relation_id IS NOT NULL THEN
    UPDATE public.entidades_relacionadas
    SET activo = true,
        id_persona_duena_lead = COALESCE(_current_persona_id, id_persona_duena_lead)
    WHERE id = _relation_id;

    RETURN _relation_id;
  END IF;

  INSERT INTO public.entidades_relacionadas (
    id_persona,
    id_tipo_entidad,
    id_proyecto,
    id_persona_duena_lead,
    activo
  )
  VALUES (
    _persona_id,
    7,
    _proyecto_id,
    _current_persona_id,
    true
  )
  RETURNING id INTO _relation_id;

  RETURN _relation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_claim_or_reactivate_prospect_project(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_claim_or_reactivate_prospect_project(BIGINT, BIGINT) TO authenticated;