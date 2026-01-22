-- Drop and recreate with CORRECT joins through ofertas
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas;

CREATE OR REPLACE FUNCTION public.get_cuentas_cobranza_paginadas(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50,
  p_id_cuenta text DEFAULT NULL,
  p_proyecto text DEFAULT NULL,
  p_clabe text DEFAULT NULL,
  p_no_propiedad text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_compradores text DEFAULT NULL,
  p_producto text DEFAULT NULL,
  p_estatus_ids integer[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_activo boolean DEFAULT true,
  p_proyecto_ids integer[] DEFAULT NULL,
  p_dueno_entity_ids integer[] DEFAULT NULL
)
RETURNS TABLE (
  id integer,
  clabe_stp text,
  precio_final numeric,
  tipo text,
  proyecto text,
  id_proyecto integer,
  modelo text,
  edificio text,
  numero_propiedad text,
  compradores jsonb,
  id_propiedad integer,
  id_entidad_relacionada_dueno integer,
  metraje numeric,
  pagado numeric,
  restante numeric,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad text,
  dueno text,
  estatus_disponibilidad_nombre text,
  apartado_pagado boolean,
  cash_limit numeric,
  cash_paid numeric,
  tiene_acuerdos boolean,
  pagos_efectivo jsonb,
  fecha_compra timestamp,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset integer;
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;
  
  -- Get total count first using correct join path
  SELECT COUNT(*)::bigint INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR cc.tipo = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR cc.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
      AND comp.activo = true
      AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ));

  RETURN QUERY
  SELECT 
    cc.id::integer,
    cc.clabe_stp,
    cc.precio_final,
    cc.tipo,
    proy.nombre as proyecto,
    e.id_proyecto::integer as id_proyecto,
    m.nombre as modelo,
    e.nombre as edificio,
    prop.numero as numero_propiedad,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pers.id,
        'nombre', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', comp.porcentaje_copropiedad
      ))
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
      AND comp.activo = true
    ) as compradores,
    o.id_propiedad::integer,
    cc.id_entidad_relacionada_dueno::integer,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) as metraje,
    COALESCE((
      SELECT SUM(pag.monto)
      FROM pagos pag
      WHERE pag.id_cuenta_cobranza = cc.id
      AND pag.activo = true
    ), 0) as pagado,
    cc.precio_final - COALESCE((
      SELECT SUM(pag.monto)
      FROM pagos pag
      WHERE pag.id_cuenta_cobranza = cc.id
      AND pag.activo = true
    ), 0) as restante,
    prop.id_estatus_disponibilidad::integer,
    ed.nombre as estatus_disponibilidad,
    ent.nombre_legal as dueno,
    ed.nombre as estatus_disponibilidad_nombre,
    -- apartado_pagado: check if 'Apartado' concept is paid OR if there's no apartado but payment exists
    COALESCE(
      (SELECT ap.pago_completado 
       FROM acuerdos_pago ap 
       JOIN conceptos_pago cp ON ap.id_concepto = cp.id
       WHERE ap.id_cuenta_cobranza = cc.id 
       AND ap.activo = true 
       AND cp.nombre = 'Apartado'
       LIMIT 1),
      EXISTS(SELECT 1 FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true AND p.monto > 0)
    ) as apartado_pagado,
    COALESCE(8025 * COALESCE(cc.valor_uma, 0), 0) as cash_limit,
    COALESCE((
      SELECT SUM(pe.monto)
      FROM pagos_efectivo pe
      WHERE pe.id_cuenta_cobranza = cc.id
      AND pe.activo = true
    ), 0) as cash_paid,
    EXISTS(SELECT 1 FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true) as tiene_acuerdos,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pe.fecha_pago,
        'monto', pe.monto
      ))
      FROM pagos_efectivo pe
      WHERE pe.id_cuenta_cobranza = cc.id
      AND pe.activo = true
    ) as pagos_efectivo,
    cc.fecha_creacion as fecha_compra,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN entidades_relacionadas ent ON cc.id_entidad_relacionada_dueno = ent.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR cc.tipo = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR cc.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
      AND comp.activo = true
      AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;