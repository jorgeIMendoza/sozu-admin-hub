-- Step 1: Drop the existing function first
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer,integer,text,text,text,text,text,text,text,integer[],text[],boolean,integer[],integer[]);

-- Step 2: Recreate with correct types - all IDs as integer, total_count as bigint
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
  fecha_compra text,
  precio_final numeric,
  activo boolean,
  id_oferta integer,
  tipo text,
  proyecto text,
  id_proyecto integer,
  modelo text,
  edificio text,
  numero_propiedad text,
  id_propiedad integer,
  producto text,
  id_producto integer,
  comprador text,
  compradores_json jsonb,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  vendedor text,
  dueno text,
  id_entidad_relacionada_dueno integer,
  id_cuenta_cobranza_padre integer,
  metraje numeric,
  precio_lista numeric,
  pagado numeric,
  restante numeric,
  tiene_acuerdos boolean,
  apartado_pagado boolean,
  total_acuerdos numeric,
  discrepancia numeric,
  cash_limit numeric,
  cash_paid numeric,
  cash_payments jsonb,
  collection_id integer,
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

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM cuentas_cobranza cc
  JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN proyectos pr ON edif.id_proyecto = pr.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr2 ON ps.id_proyecto = pr2.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(pr.nombre, pr2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR EXISTS (
      SELECT 1 FROM modelos m WHERE em.id_modelo = m.id AND m.nombre ILIKE '%' || p_modelo || '%'
    ))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_oferta = o.id AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR (
      CASE
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        ELSE 'Servicio'
      END
    ) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(pr.id, pr2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT
    cc.id::integer AS id,
    cc.clabe_stp,
    cc.fecha_compra::text,
    cc.precio_final,
    cc.activo,
    cc.id_oferta::integer,
    CASE
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
      ELSE 'Servicio'
    END AS tipo,
    COALESCE(pr.nombre, pr2.nombre) AS proyecto,
    COALESCE(pr.id, pr2.id)::integer AS id_proyecto,
    m.nombre AS modelo,
    edif.nombre AS edificio,
    prop.numero_propiedad,
    prop.id::integer AS id_propiedad,
    ps.nombre AS producto,
    ps.id::integer AS id_producto,
    (SELECT pers.nombre_legal FROM compradores comp JOIN personas pers ON comp.id_persona = pers.id WHERE comp.id_oferta = o.id AND comp.activo = true LIMIT 1) AS comprador,
    (SELECT jsonb_agg(jsonb_build_object(
      'id_persona', comp.id_persona,
      'nombre_legal', pers.nombre_legal,
      'rfc', pers.rfc,
      'porcentaje_copropiedad', comp.porcentaje_copropiedad
    )) FROM compradores comp JOIN personas pers ON comp.id_persona = pers.id WHERE comp.id_oferta = o.id AND comp.activo = true) AS compradores_json,
    prop.id_estatus_disponibilidad::integer,
    ed.nombre AS estatus_disponibilidad_nombre,
    (SELECT pers.nombre_legal FROM personas pers WHERE pers.id = o.id_persona_lead) AS vendedor,
    (SELECT pers.nombre_legal FROM personas pers JOIN entidades_relacionadas er ON pers.id = er.id_persona WHERE er.id = prop.id_entidad_relacionada_dueno LIMIT 1) AS dueno,
    prop.id_entidad_relacionada_dueno::integer,
    cc.id_cuenta_cobranza_padre::integer,
    prop.m2_interiores AS metraje,
    prop.precio_lista,
    COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0) AS pagado,
    cc.precio_final - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0) AS restante,
    EXISTS(SELECT 1 FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true) AS tiene_acuerdos,
    COALESCE(
      (SELECT ap.pago_completado FROM acuerdos_pago ap JOIN conceptos_pago cp ON ap.id_concepto = cp.id WHERE ap.id_cuenta_cobranza = cc.id AND cp.nombre = 'Apartado' AND ap.activo = true LIMIT 1),
      EXISTS(SELECT 1 FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true)
    ) AS apartado_pagado,
    COALESCE((SELECT SUM(ap.monto) FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true), 0) AS total_acuerdos,
    cc.precio_final - COALESCE((SELECT SUM(ap.monto) FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true), 0) AS discrepancia,
    CASE WHEN o.valor_uma IS NOT NULL AND o.valor_uma > 0 THEN 8025 * o.valor_uma ELSE NULL END AS cash_limit,
    COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true AND p.id_metodos_pago = 1), 0) AS cash_paid,
    (SELECT jsonb_agg(jsonb_build_object('fecha_pago', p.fecha_pago, 'monto', p.monto)) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true AND p.id_metodos_pago = 1) AS cash_payments,
    cc.collection_id::integer,
    v_total AS total_count
  FROM cuentas_cobranza cc
  JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN proyectos pr ON edif.id_proyecto = pr.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr2 ON ps.id_proyecto = pr2.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(pr.nombre, pr2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_oferta = o.id AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR (
      CASE
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        ELSE 'Servicio'
      END
    ) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(pr.id, pr2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;