
-- Drop and recreate the function with correct column name
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[], text);

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
  p_dueno_entity_ids integer[] DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id integer,
  clabe_stp text,
  fecha_compra timestamp with time zone,
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
SET search_path = public
AS $$
DECLARE
  v_offset integer;
  v_total_count bigint;
  v_search_pattern text;
BEGIN
  v_offset := (p_page - 1) * p_per_page;
  
  IF p_search IS NOT NULL AND p_search <> '' THEN
    v_search_pattern := '%' || lower(p_search) || '%';
  END IF;

  SELECT COUNT(DISTINCT cc.id) INTO v_total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
        AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        ELSE 'Servicio'
      END = ANY(p_tipos)
    )
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (v_search_pattern IS NULL OR (
      cc.id::text ILIKE v_search_pattern
      OR cc.clabe_stp ILIKE v_search_pattern
      OR proy.nombre ILIKE v_search_pattern
      OR prop.numero_propiedad ILIKE v_search_pattern
      OR EXISTS (
        SELECT 1 FROM compradores comp
        JOIN personas pers ON comp.id_persona = pers.id
        WHERE comp.id_cuenta_cobranza = cc.id
          AND comp.activo = true
          AND pers.nombre_legal ILIKE v_search_pattern
      )
    ));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    cc.id_oferta,
    CASE 
      WHEN o.id_producto IS NOT NULL THEN 'Producto'::text
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'::text
      ELSE 'Servicio'::text
    END AS tipo,
    proy.nombre AS proyecto,
    proy.id AS id_proyecto,
    m.nombre AS modelo,
    e.nombre AS edificio,
    prop.numero_propiedad,
    prop.id AS id_propiedad,
    ps.nombre AS producto,
    ps.id AS id_producto,
    (
      SELECT pers.nombre_legal
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
        AND comp.activo = true
      ORDER BY comp.porcentaje_copropiedad DESC NULLS LAST
      LIMIT 1
    ) AS comprador,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id_persona', comp.id_persona,
          'nombre_legal', pers.nombre_legal,
          'rfc', pers.rfc,
          'porcentaje_copropiedad', comp.porcentaje_copropiedad
        )
        ORDER BY comp.porcentaje_copropiedad DESC NULLS LAST
      )
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
        AND comp.activo = true
    ) AS compradores_json,
    prop.id_estatus_disponibilidad,
    ed.nombre AS estatus_disponibilidad_nombre,
    (
      SELECT pers.nombre_legal
      FROM personas pers
      JOIN entidades_relacionadas er ON pers.id = er.id_persona
      WHERE er.id = o.id_entidad_relacionada_vendedor
        AND er.activo = true
      LIMIT 1
    ) AS vendedor,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM cuentas_cobranza cc_mant 
        WHERE cc_mant.id_cuenta_cobranza_padre = cc.id 
          AND cc_mant.activo = true
      ) THEN (
        SELECT pers.nombre_legal
        FROM compradores comp
        JOIN personas pers ON comp.id_persona = pers.id
        WHERE comp.id_cuenta_cobranza = cc.id
          AND comp.activo = true
        ORDER BY comp.porcentaje_copropiedad DESC NULLS LAST
        LIMIT 1
      )
      ELSE (
        SELECT pers.nombre_legal
        FROM personas pers
        JOIN entidades_relacionadas er ON pers.id = er.id_persona
        WHERE er.id = prop.id_entidad_relacionada_dueno
          AND er.activo = true
        LIMIT 1
      )
    END AS dueno,
    prop.id_entidad_relacionada_dueno,
    cc.id_cuenta_cobranza_padre,
    prop.metraje,
    prop.precio_lista,
    COALESCE((
      SELECT SUM(p.monto)
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id
        AND p.activo = true
    ), 0) AS pagado,
    cc.precio_final - COALESCE((
      SELECT SUM(p.monto)
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id
        AND p.activo = true
    ), 0) AS restante,
    EXISTS (
      SELECT 1 FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
    ) AS tiene_acuerdos,
    COALESCE((
      SELECT ap.pago_completado
      FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
      ORDER BY ap.orden
      LIMIT 1
    ), false) AS apartado_pagado,
    (
      SELECT SUM(ap.monto)
      FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
    ) AS total_acuerdos,
    cc.precio_final - COALESCE((
      SELECT SUM(ap.monto)
      FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
    ), cc.precio_final) AS discrepancia,
    o.limite_efectivo AS cash_limit,
    COALESCE((
      SELECT SUM(p.monto)
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id
        AND p.activo = true
        AND p.id_metodos_pago = 1
    ), 0) AS cash_paid,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'fecha_pago', p.fecha_pago,
          'monto', p.monto
        )
        ORDER BY p.fecha_pago
      )
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id
        AND p.activo = true
        AND p.id_metodos_pago = 1
    ) AS cash_payments,
    cc.collection_id,
    v_total_count AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id
        AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        ELSE 'Servicio'
      END = ANY(p_tipos)
    )
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (v_search_pattern IS NULL OR (
      cc.id::text ILIKE v_search_pattern
      OR cc.clabe_stp ILIKE v_search_pattern
      OR proy.nombre ILIKE v_search_pattern
      OR prop.numero_propiedad ILIKE v_search_pattern
      OR EXISTS (
        SELECT 1 FROM compradores comp
        JOIN personas pers ON comp.id_persona = pers.id
        WHERE comp.id_cuenta_cobranza = cc.id
          AND comp.activo = true
          AND pers.nombre_legal ILIKE v_search_pattern
      )
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;
