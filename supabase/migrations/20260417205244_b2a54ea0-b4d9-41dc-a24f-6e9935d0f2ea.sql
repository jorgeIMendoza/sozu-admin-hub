CREATE OR REPLACE FUNCTION public.get_relacion_pagos(
  p_proyecto_id integer DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_has_cep boolean DEFAULT NULL,
  p_tipo_cuenta text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH base AS (
    SELECT
      p.id AS pago_id,
      p.monto,
      p.fecha_pago,
      p.clave_rastreo,
      p.url_cep,
      p.url_recibo,
      p.descripcion,
      p.id_cuenta_cobranza,
      mp.nombre AS metodo_pago,
      cc.clabe_stp,
      cc.id_propiedad,
      cc.id_oferta,
      o.id_producto AS oferta_id_producto,
      o.id_persona_lead,
      per.nombre_legal AS cliente,
      pr.numero_propiedad AS num_propiedad,
      ps.nombre AS producto,
      CASE 
        WHEN cc.id_propiedad IS NOT NULL THEN 'propiedad'
        WHEN o.id_producto IS NOT NULL THEN 'producto'
        ELSE NULL
      END AS tipo_cuenta,
      proy.nombre AS proyecto,
      proy.id AS proyecto_id,
      (p.url_cep IS NOT NULL AND length(trim(p.url_cep)) > 0) AS tiene_cep
    FROM pagos p
    LEFT JOIN metodos_pago mp ON mp.id = p.id_metodos_pago
    LEFT JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
    LEFT JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN personas per ON per.id = o.id_persona_lead
    LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
    LEFT JOIN propiedades pr ON pr.id = cc.id_propiedad
    LEFT JOIN edificios_modelos em ON em.id = pr.id_edificio_modelo
    LEFT JOIN edificios ed ON ed.id = em.id_edificio
    LEFT JOIN proyectos proy ON proy.id = COALESCE(ed.id_proyecto, ps.id_proyecto)
    WHERE p.activo = true
      -- Excluir cuentas de mantenimiento: solo cuentas con propiedad o producto
      AND (cc.id_propiedad IS NOT NULL OR o.id_producto IS NOT NULL)
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (p_proyecto_id IS NULL OR proyecto_id = p_proyecto_id)
      AND (p_metodo_pago IS NULL OR metodo_pago = p_metodo_pago)
      AND (p_has_cep IS NULL OR tiene_cep = p_has_cep)
      AND (p_tipo_cuenta IS NULL OR tipo_cuenta = p_tipo_cuenta)
      AND (
        p_search IS NULL OR p_search = '' OR
        clave_rastreo ILIKE '%' || p_search || '%' OR
        descripcion ILIKE '%' || p_search || '%' OR
        cliente ILIKE '%' || p_search || '%' OR
        num_propiedad ILIKE '%' || p_search || '%' OR
        producto ILIKE '%' || p_search || '%' OR
        clabe_stp ILIKE '%' || p_search || '%'
      )
  ),
  with_apps AS (
    SELECT f.*,
      COALESCE(SUM(ap.monto), 0) AS monto_aplicado,
      COUNT(ap.id) AS num_aplicaciones,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'concepto', cp.nombre,
            'orden', acp.orden,
            'monto', ap.monto
          ) ORDER BY acp.orden
        ) FILTER (WHERE ap.id IS NOT NULL),
        '[]'::jsonb
      ) AS aplicaciones_detalle
    FROM filtered f
    LEFT JOIN aplicaciones_pago ap ON ap.id_pago = f.pago_id AND ap.activo = true
    LEFT JOIN acuerdos_pago acp ON acp.id = ap.id_acuerdo_pago
    LEFT JOIN conceptos_pago cp ON cp.id = acp.id_concepto
    GROUP BY f.pago_id, f.monto, f.fecha_pago, f.clave_rastreo, f.url_cep, f.url_recibo,
             f.descripcion, f.id_cuenta_cobranza, f.metodo_pago, f.clabe_stp,
             f.id_propiedad, f.id_oferta, f.oferta_id_producto, f.id_persona_lead,
             f.cliente, f.num_propiedad, f.producto, f.tipo_cuenta,
             f.proyecto, f.proyecto_id, f.tiene_cep
  ),
  totals AS (
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(monto), 0) AS total_monto,
      COUNT(*) FILTER (WHERE tiene_cep) AS total_con_cep,
      COUNT(*) FILTER (WHERE NOT tiene_cep) AS total_sin_cep,
      COUNT(*) FILTER (WHERE monto_aplicado >= monto AND monto > 0) AS total_aplicados,
      COUNT(*) FILTER (WHERE monto_aplicado < monto OR monto_aplicado = 0) AS total_sin_aplicar
    FROM with_apps
  ),
  paginated AS (
    SELECT * FROM with_apps
    ORDER BY fecha_pago DESC, pago_id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM totals),
    'total_monto', (SELECT total_monto FROM totals),
    'total_con_cep', (SELECT total_con_cep FROM totals),
    'total_sin_cep', (SELECT total_sin_cep FROM totals),
    'total_aplicados', (SELECT total_aplicados FROM totals),
    'total_sin_aplicar', (SELECT total_sin_aplicar FROM totals),
    'pagos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'pago_id', pago_id,
          'monto', monto,
          'fecha_pago', fecha_pago,
          'clave_rastreo', clave_rastreo,
          'url_cep', url_cep,
          'url_recibo', url_recibo,
          'descripcion', descripcion,
          'id_cuenta_cobranza', id_cuenta_cobranza,
          'metodo_pago', metodo_pago,
          'clabe_stp', clabe_stp,
          'cliente', cliente,
          'num_propiedad', num_propiedad,
          'producto', producto,
          'tipo_cuenta', tipo_cuenta,
          'proyecto', proyecto,
          'proyecto_id', proyecto_id,
          'tiene_cep', tiene_cep,
          'monto_aplicado', monto_aplicado,
          'num_aplicaciones', num_aplicaciones,
          'aplicaciones_detalle', aplicaciones_detalle
        )
      ) FROM paginated
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;