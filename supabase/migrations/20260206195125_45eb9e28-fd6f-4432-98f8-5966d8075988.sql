
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(integer,integer,text,text,text,text,text,text,text,integer[],text[],boolean,integer[],integer[],text);

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
  p_page integer,
  p_per_page integer,
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
  total_count bigint,
  motivo_cancelacion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset integer;
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  SELECT COUNT(DISTINCT cc.id) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN compradores comp_filter ON comp_filter.id_cuenta_cobranza = cc.id AND comp_filter.activo = true
  LEFT JOIN personas per_filter ON per_filter.id = comp_filter.id_persona
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_compradores IS NULL OR per_filter.nombre_legal ILIKE '%' || p_compradores || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (CASE 
           WHEN o.id_producto IS NOT NULL THEN 'Producto'
           WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
           ELSE 'Servicio'
         END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_search IS NULL OR (
      cc.id::text ILIKE '%' || p_search || '%'
      OR cc.clabe_stp ILIKE '%' || p_search || '%'
      OR proy.nombre ILIKE '%' || p_search || '%'
      OR prop.numero_propiedad ILIKE '%' || p_search || '%'
      OR ps.nombre ILIKE '%' || p_search || '%'
      OR per_filter.nombre_legal ILIKE '%' || p_search || '%'
    ));

  RETURN QUERY
  WITH acuerdos_info AS (
    SELECT 
      ap.id_cuenta_cobranza,
      SUM(ap.monto) AS suma_acuerdos,
      COUNT(*) > 0 AS tiene_acuerdos_flag
    FROM acuerdos_pago ap
    WHERE ap.activo = true
    GROUP BY ap.id_cuenta_cobranza
  ),
  pagos_info AS (
    SELECT 
      p.id_cuenta_cobranza,
      SUM(p.monto) AS total_pagado
    FROM pagos p
    WHERE p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  cash_info AS (
    SELECT 
      p.id_cuenta_cobranza,
      SUM(p.monto) AS cash_paid,
      jsonb_agg(jsonb_build_object('fecha_pago', p.fecha_pago, 'monto', p.monto)) AS cash_payments
    FROM pagos p
    WHERE p.activo = true AND p.id_metodos_pago = 2
    GROUP BY p.id_cuenta_cobranza
  ),
  compradores_info AS (
    SELECT 
      comp.id_cuenta_cobranza,
      jsonb_agg(jsonb_build_object(
        'id_persona', per.id,
        'nombre_legal', per.nombre_legal,
        'rfc', per.rfc,
        'porcentaje_copropiedad', comp.porcentaje_copropiedad
      )) AS compradores_json,
      (array_agg(per.nombre_legal ORDER BY comp.porcentaje_copropiedad DESC))[1] AS comprador_principal
    FROM compradores comp
    JOIN personas per ON per.id = comp.id_persona
    WHERE comp.activo = true
    GROUP BY comp.id_cuenta_cobranza
  ),
  primer_acuerdo_info AS (
    SELECT DISTINCT ON (ap.id_cuenta_cobranza)
      ap.id_cuenta_cobranza,
      ap.pago_completado AS primer_pago_completado
    FROM acuerdos_pago ap
    WHERE ap.activo = true
    ORDER BY ap.id_cuenta_cobranza, ap.orden ASC
  ),
  filtered_accounts AS (
    SELECT DISTINCT cc.id as cc_id
    FROM cuentas_cobranza cc
    LEFT JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
    LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
    LEFT JOIN edificios e ON e.id = em.id_edificio
    LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
    LEFT JOIN modelos m ON m.id = em.id_modelo
    LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
    LEFT JOIN compradores comp_filter ON comp_filter.id_cuenta_cobranza = cc.id AND comp_filter.activo = true
    LEFT JOIN personas per_filter ON per_filter.id = comp_filter.id_persona
    WHERE cc.activo = p_activo
      AND cc.id_cuenta_cobranza_padre IS NULL
      AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
      AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
      AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
      AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
      AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
      AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
      AND (p_compradores IS NULL OR per_filter.nombre_legal ILIKE '%' || p_compradores || '%')
      AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
      AND (p_tipos IS NULL OR 
           (CASE 
             WHEN o.id_producto IS NOT NULL THEN 'Producto'
             WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
             ELSE 'Servicio'
           END) = ANY(p_tipos))
      AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
      AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
      AND (p_search IS NULL OR (
        cc.id::text ILIKE '%' || p_search || '%'
        OR cc.clabe_stp ILIKE '%' || p_search || '%'
        OR proy.nombre ILIKE '%' || p_search || '%'
        OR prop.numero_propiedad ILIKE '%' || p_search || '%'
        OR ps.nombre ILIKE '%' || p_search || '%'
        OR per_filter.nombre_legal ILIKE '%' || p_search || '%'
      ))
  )
  SELECT 
    cc.id::integer,
    cc.clabe_stp::text,
    cc.fecha_compra::text,
    cc.precio_final::numeric,
    cc.activo,
    cc.id_oferta::integer,
    (CASE 
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      ELSE 'Servicio'
    END)::text AS tipo,
    proy.nombre::text AS proyecto,
    proy.id::integer AS id_proyecto,
    m.nombre::text AS modelo,
    e.nombre::text AS edificio,
    prop.numero_propiedad::text,
    prop.id::integer AS id_propiedad,
    ps.nombre::text AS producto,
    ps.id::integer AS id_producto,
    ci.comprador_principal::text AS comprador,
    COALESCE(ci.compradores_json, '[]'::jsonb) AS compradores_json,
    prop.id_estatus_disponibilidad::integer,
    ed.nombre::text AS estatus_disponibilidad_nombre,
    u.nombre::text AS vendedor,
    (CASE 
      WHEN (o.id_producto IS NOT NULL OR o.id_propiedad IS NOT NULL) 
           AND (cc.precio_final - COALESCE(pi.total_pagado, 0)) <= 0 
           AND ci.comprador_principal IS NOT NULL 
      THEN ci.comprador_principal
      ELSE prop_dueno.nombre_legal 
    END)::text AS dueno,
    prop.id_entidad_relacionada_dueno::integer,
    cc.id_cuenta_cobranza_padre::integer,
    (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0))::numeric AS metraje,
    prop.precio_lista::numeric,
    COALESCE(pi.total_pagado, 0)::numeric AS pagado,
    (cc.precio_final - COALESCE(pi.total_pagado, 0))::numeric AS restante,
    COALESCE(ai.tiene_acuerdos_flag, false) AS tiene_acuerdos,
    COALESCE(pai.primer_pago_completado, false) AS apartado_pagado,
    COALESCE(ai.suma_acuerdos, 0)::numeric AS total_acuerdos,
    (cc.precio_final - COALESCE(ai.suma_acuerdos, 0))::numeric AS discrepancia,
    NULL::numeric AS cash_limit,
    COALESCE(cashi.cash_paid, 0)::numeric AS cash_paid,
    COALESCE(cashi.cash_payments, '[]'::jsonb) AS cash_payments,
    cc.collection_id::integer,
    v_total AS total_count,
    tc.nombre::text AS motivo_cancelacion
  FROM cuentas_cobranza cc
  INNER JOIN filtered_accounts fa ON fa.cc_id = cc.id
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN estatus_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  LEFT JOIN usuarios u ON u.email = o.email_creador
  LEFT JOIN acuerdos_info ai ON ai.id_cuenta_cobranza = cc.id
  LEFT JOIN pagos_info pi ON pi.id_cuenta_cobranza = cc.id
  LEFT JOIN cash_info cashi ON cashi.id_cuenta_cobranza = cc.id
  LEFT JOIN compradores_info ci ON ci.id_cuenta_cobranza = cc.id
  LEFT JOIN entidades_relacionadas er_prop ON er_prop.id = prop.id_entidad_relacionada_dueno
  LEFT JOIN personas prop_dueno ON prop_dueno.id = er_prop.id_persona
  LEFT JOIN primer_acuerdo_info pai ON pai.id_cuenta_cobranza = cc.id
  LEFT JOIN tipos_cancelacion tc ON tc.id = cc.id_tipo_cancelacion
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;
