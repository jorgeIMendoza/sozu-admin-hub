
-- Fix the function by removing reference to non-existent estatus_cuenta_cobranza column/table
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
RETURNS TABLE(
  id integer,
  clabe_stp text,
  precio_final numeric,
  fecha_compra date,
  activo boolean,
  porcentaje_comision_venta numeric,
  valor_uma numeric,
  id_oferta integer,
  id_estatus_cuenta integer,
  estatus_cuenta_nombre text,
  id_propiedad integer,
  numero_propiedad text,
  piso text,
  id_proyecto integer,
  proyecto_nombre text,
  id_edificio integer,
  edificio_nombre text,
  id_modelo integer,
  modelo_nombre text,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  metraje numeric,
  compradores jsonb,
  id_producto_servicio integer,
  producto_nombre text,
  id_categoria_producto integer,
  categoria_producto_nombre text,
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
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Count total matching records (removed estatus_cuenta references)
  SELECT COUNT(DISTINCT cc.id) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios ed ON em.id_edificio = ed.id
  LEFT JOIN proyectos proy ON ed.id_proyecto = proy.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN estatus_disponibilidad edp ON prop.id_estatus_disponibilidad = edp.id
  LEFT JOIN compradores comp ON comp.id_cuenta_cobranza = cc.id AND comp.activo = true
  LEFT JOIN personas pers ON comp.id_persona = pers.id
  LEFT JOIN ofertas_productos op ON cc.id_oferta_producto = op.id
  LEFT JOIN productos_servicios ps ON op.id_producto_servicio = ps.id
  LEFT JOIN categorias_productos cp ON ps.id_categoria_producto = cp.id
  LEFT JOIN duenos_desarrolladoras_proyecto ddp ON proy.id = ddp.id_proyecto AND ddp.activo = true
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR pers.nombre_legal ILIKE '%' || p_compradores || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_tipos IS NULL OR 
         (('Propiedad' = ANY(p_tipos) AND cc.id_oferta IS NOT NULL) OR
          ('Producto' = ANY(p_tipos) AND cc.id_oferta_producto IS NOT NULL) OR
          ('Servicio' = ANY(p_tipos) AND cc.id_oferta IS NULL AND cc.id_oferta_producto IS NULL)))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR ddp.id_entidad_legal = ANY(p_dueno_entity_ids))
    AND (p_search IS NULL OR p_search = '' OR
         cc.id::text ILIKE '%' || p_search || '%' OR
         cc.clabe_stp ILIKE '%' || p_search || '%' OR
         proy.nombre ILIKE '%' || p_search || '%' OR
         prop.numero_propiedad ILIKE '%' || p_search || '%' OR
         pers.nombre_legal ILIKE '%' || p_search || '%' OR
         ps.nombre ILIKE '%' || p_search || '%');

  RETURN QUERY
  WITH acuerdos_info AS (
    SELECT 
      ap.id_cuenta_cobranza,
      COUNT(*)::integer AS total_acuerdos,
      COALESCE(SUM(ap.monto), 0) AS suma_acuerdos
    FROM acuerdos_pago ap
    WHERE ap.activo = true
    GROUP BY ap.id_cuenta_cobranza
  ),
  pagos_agg AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(p.monto), 0) AS total_pagado
    FROM pagos p
    WHERE p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  cash_info AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(p.monto), 0) AS cash_paid
    FROM pagos p
    WHERE p.activo = true AND p.id_metodos_pago = 1
    GROUP BY p.id_cuenta_cobranza
  ),
  compradores_agg AS (
    SELECT 
      c.id_cuenta_cobranza,
      jsonb_agg(
        jsonb_build_object(
          'id_persona', c.id_persona,
          'nombre_legal', p.nombre_legal,
          'rfc', p.rfc,
          'porcentaje_propiedad', c.porcentaje_propiedad,
          'tipo_comprador', CASE WHEN c.es_comprador THEN 'comprador' ELSE 'conyuge' END
        )
      ) AS compradores
    FROM compradores c
    JOIN personas p ON c.id_persona = p.id
    WHERE c.activo = true
    GROUP BY c.id_cuenta_cobranza
  ),
  first_apartado AS (
    SELECT DISTINCT ON (ap.id_cuenta_cobranza)
      ap.id_cuenta_cobranza,
      ap.pago_completado
    FROM acuerdos_pago ap
    WHERE ap.activo = true AND ap.orden = 1
    ORDER BY ap.id_cuenta_cobranza
  )
  SELECT 
    cc.id::integer,
    cc.clabe_stp::text,
    cc.precio_final::numeric,
    cc.fecha_compra::date,
    cc.activo::boolean,
    cc.porcentaje_comision_venta::numeric,
    cc.valor_uma::numeric,
    cc.id_oferta::integer,
    -- Use property status as account status (mapped from estatus_disponibilidad)
    prop.id_estatus_disponibilidad::integer AS id_estatus_cuenta,
    edp.nombre::text AS estatus_cuenta_nombre,
    prop.id::integer AS id_propiedad,
    prop.numero_propiedad::text,
    prop.piso::text,
    proy.id::integer AS id_proyecto,
    proy.nombre::text AS proyecto_nombre,
    ed.id::integer AS id_edificio,
    ed.nombre::text AS edificio_nombre,
    m.id::integer AS id_modelo,
    m.nombre::text AS modelo_nombre,
    prop.id_estatus_disponibilidad::integer,
    edp.nombre::text AS estatus_disponibilidad_nombre,
    prop.m2_interiores::numeric AS metraje,
    COALESCE(ca.compradores, '[]'::jsonb) AS compradores,
    ps.id::integer AS id_producto_servicio,
    ps.nombre::text AS producto_nombre,
    cp.id::integer AS id_categoria_producto,
    cp.nombre::text AS categoria_producto_nombre,
    COALESCE(ps_agg.total_pagado, 0)::numeric AS pagado,
    (cc.precio_final - COALESCE(ps_agg.total_pagado, 0))::numeric AS restante,
    (ai.total_acuerdos > 0)::boolean AS tiene_acuerdos,
    COALESCE(fa.pago_completado, false)::boolean AS apartado_pagado,
    COALESCE(ai.suma_acuerdos, 0)::numeric AS total_acuerdos,
    (cc.precio_final - COALESCE(ai.suma_acuerdos, 0))::numeric AS discrepancia,
    (cc.valor_uma * 8000)::numeric AS cash_limit,
    COALESCE(ci.cash_paid, 0)::numeric AS cash_paid,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pago.fecha_pago,
        'monto', pago.monto
      ))
      FROM pagos pago
      WHERE pago.id_cuenta_cobranza = cc.id AND pago.activo = true AND pago.id_metodos_pago = 1
    ) AS cash_payments,
    cc.collection_id::integer,
    v_total::bigint AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios ed ON em.id_edificio = ed.id
  LEFT JOIN proyectos proy ON ed.id_proyecto = proy.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN estatus_disponibilidad edp ON prop.id_estatus_disponibilidad = edp.id
  LEFT JOIN ofertas_productos op ON cc.id_oferta_producto = op.id
  LEFT JOIN productos_servicios ps ON op.id_producto_servicio = ps.id
  LEFT JOIN categorias_productos cp ON ps.id_categoria_producto = cp.id
  LEFT JOIN acuerdos_info ai ON cc.id = ai.id_cuenta_cobranza
  LEFT JOIN pagos_agg ps_agg ON cc.id = ps_agg.id_cuenta_cobranza
  LEFT JOIN cash_info ci ON cc.id = ci.id_cuenta_cobranza
  LEFT JOIN compradores_agg ca ON cc.id = ca.id_cuenta_cobranza
  LEFT JOIN first_apartado fa ON cc.id = fa.id_cuenta_cobranza
  LEFT JOIN duenos_desarrolladoras_proyecto ddp ON proy.id = ddp.id_proyecto AND ddp.activo = true
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores c2 
      JOIN personas p2 ON c2.id_persona = p2.id 
      WHERE c2.id_cuenta_cobranza = cc.id 
      AND c2.activo = true 
      AND p2.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (('Propiedad' = ANY(p_tipos) AND cc.id_oferta IS NOT NULL) OR
          ('Producto' = ANY(p_tipos) AND cc.id_oferta_producto IS NOT NULL) OR
          ('Servicio' = ANY(p_tipos) AND cc.id_oferta IS NULL AND cc.id_oferta_producto IS NULL)))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR ddp.id_entidad_legal = ANY(p_dueno_entity_ids))
    AND (p_search IS NULL OR p_search = '' OR
         cc.id::text ILIKE '%' || p_search || '%' OR
         cc.clabe_stp ILIKE '%' || p_search || '%' OR
         proy.nombre ILIKE '%' || p_search || '%' OR
         prop.numero_propiedad ILIKE '%' || p_search || '%' OR
         EXISTS (
           SELECT 1 FROM compradores c3 
           JOIN personas p3 ON c3.id_persona = p3.id 
           WHERE c3.id_cuenta_cobranza = cc.id 
           AND c3.activo = true 
           AND p3.nombre_legal ILIKE '%' || p_search || '%'
         ) OR
         ps.nombre ILIKE '%' || p_search || '%')
  GROUP BY cc.id, cc.clabe_stp, cc.precio_final, cc.fecha_compra, cc.activo, 
           cc.porcentaje_comision_venta, cc.valor_uma, cc.id_oferta,
           prop.id, prop.numero_propiedad, prop.piso, proy.id, proy.nombre,
           ed.id, ed.nombre, m.id, m.nombre, prop.id_estatus_disponibilidad, edp.nombre,
           prop.m2_interiores, ca.compradores, ps.id, ps.nombre, cp.id, cp.nombre,
           ps_agg.total_pagado, ai.total_acuerdos, ai.suma_acuerdos, fa.pago_completado,
           ci.cash_paid, cc.collection_id
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;
