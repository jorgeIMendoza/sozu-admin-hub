-- Drop existing function
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], bigint[], text);

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
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
  p_dueno_entity_ids bigint[] DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  clabe_stp text,
  fecha_compra date,
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
  id_entidad_relacionada_dueno bigint,
  id_cuenta_cobranza_padre bigint,
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
  collection_id bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_offset integer;
  v_total_count bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;
  
  -- Get total count first
  SELECT COUNT(DISTINCT cc.id) INTO v_total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos proy2 ON ps.id_proyecto = proy2.id
  WHERE cc.activo = p_activo
    AND (cc.id_cuenta_cobranza_padre IS NULL)
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR EXISTS (
      SELECT 1 FROM modelos m WHERE m.id = em.id_modelo AND m.nombre ILIKE '%' || p_modelo || '%'
    ))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR (
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        ELSE 'Servicio'
      END
    ) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_search IS NULL OR p_search = '' OR (
      cc.id::text ILIKE '%' || p_search || '%'
      OR cc.clabe_stp ILIKE '%' || p_search || '%'
      OR COALESCE(proy.nombre, proy2.nombre) ILIKE '%' || p_search || '%'
      OR prop.numero_propiedad ILIKE '%' || p_search || '%'
      OR EXISTS (
        SELECT 1 FROM compradores comp
        JOIN personas pers ON comp.id_persona = pers.id
        WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
          AND pers.nombre_legal ILIKE '%' || p_search || '%'
      )
    ));

  RETURN QUERY
  WITH pagos_sum AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(p.monto), 0) as total_pagado
    FROM pagos p
    WHERE p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  primer_comprador AS (
    SELECT DISTINCT ON (comp.id_cuenta_cobranza)
      comp.id_cuenta_cobranza,
      pers.nombre_legal
    FROM compradores comp
    JOIN personas pers ON comp.id_persona = pers.id
    WHERE comp.activo = true
    ORDER BY comp.id_cuenta_cobranza, comp.porcentaje_copropiedad DESC NULLS LAST
  ),
  acuerdos_info AS (
    SELECT 
      ap.id_cuenta_cobranza,
      COUNT(*) as total_acuerdos,
      COALESCE(SUM(ap.monto), 0) as suma_acuerdos
    FROM acuerdos_pago ap
    WHERE ap.activo = true
    GROUP BY ap.id_cuenta_cobranza
  ),
  cash_info AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(p.monto), 0) as cash_paid
    FROM pagos p
    WHERE p.activo = true AND p.id_metodos_pago = 2
    GROUP BY p.id_cuenta_cobranza
  )
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
    COALESCE(proy.nombre, proy2.nombre) AS proyecto,
    COALESCE(proy.id, proy2.id)::integer AS id_proyecto,
    m.nombre AS modelo,
    e.nombre AS edificio,
    prop.numero_propiedad,
    prop.id::integer AS id_propiedad,
    ps.nombre AS producto,
    ps.id::integer AS id_producto,
    pc.nombre_legal AS comprador,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id_persona', comp.id_persona,
        'nombre_legal', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje_copropiedad', comp.porcentaje_copropiedad
      ) ORDER BY comp.porcentaje_copropiedad DESC NULLS LAST)
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) AS compradores_json,
    prop.id_estatus_disponibilidad::integer,
    ed.nombre AS estatus_disponibilidad_nombre,
    -- VENDEDOR: Obtener desde email_creador de la oferta
    (
      SELECT u.nombre
      FROM usuarios u
      WHERE u.email = o.email_creador
      LIMIT 1
    ) AS vendedor,
    -- PROPIETARIO: Si tiene cuenta de mantenimiento -> comprador principal, sino -> dueño original
    CASE
      WHEN EXISTS (
        SELECT 1 FROM cuentas_cobranza cc_mant
        WHERE cc_mant.id_cuenta_cobranza_padre = cc.id
          AND cc_mant.activo = true
      ) THEN pc.nombre_legal
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
    (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0))::numeric AS metraje,
    prop.precio_lista,
    COALESCE(ps_agg.total_pagado, 0) AS pagado,
    cc.precio_final - COALESCE(ps_agg.total_pagado, 0) AS restante,
    (ai.total_acuerdos > 0)::boolean AS tiene_acuerdos,
    -- apartado_pagado: check if first payment exists
    (COALESCE(ps_agg.total_pagado, 0) > 0)::boolean AS apartado_pagado,
    COALESCE(ai.suma_acuerdos, 0) AS total_acuerdos,
    -- discrepancia: difference between agreements and payments
    (COALESCE(ai.suma_acuerdos, 0) - COALESCE(ps_agg.total_pagado, 0))::numeric AS discrepancia,
    (cc.valor_uma * 8000)::numeric AS cash_limit,
    COALESCE(ci.cash_paid, 0) AS cash_paid,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pago.fecha_pago,
        'monto', pago.monto
      ) ORDER BY pago.fecha_pago DESC)
      FROM pagos pago
      WHERE pago.id_cuenta_cobranza = cc.id 
        AND pago.activo = true 
        AND pago.id_metodos_pago = 2
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
  LEFT JOIN proyectos proy2 ON ps.id_proyecto = proy2.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN pagos_sum ps_agg ON cc.id = ps_agg.id_cuenta_cobranza
  LEFT JOIN primer_comprador pc ON cc.id = pc.id_cuenta_cobranza
  LEFT JOIN acuerdos_info ai ON cc.id = ai.id_cuenta_cobranza
  LEFT JOIN cash_info ci ON cc.id = ci.id_cuenta_cobranza
  WHERE cc.activo = p_activo
    AND (cc.id_cuenta_cobranza_padre IS NULL)
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
        AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR (
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        ELSE 'Servicio'
      END
    ) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_search IS NULL OR p_search = '' OR (
      cc.id::text ILIKE '%' || p_search || '%'
      OR cc.clabe_stp ILIKE '%' || p_search || '%'
      OR COALESCE(proy.nombre, proy2.nombre) ILIKE '%' || p_search || '%'
      OR prop.numero_propiedad ILIKE '%' || p_search || '%'
      OR EXISTS (
        SELECT 1 FROM compradores comp
        JOIN personas pers ON comp.id_persona = pers.id
        WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
          AND pers.nombre_legal ILIKE '%' || p_search || '%'
      )
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;