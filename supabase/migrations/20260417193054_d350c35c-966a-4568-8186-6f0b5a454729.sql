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
AS $function$
DECLARE
  v_result jsonb;
  v_total bigint;
  v_total_monto numeric;
  v_total_con_cep bigint;
  v_total_sin_cep bigint;
  v_total_aplicados bigint;
  v_total_sin_aplicar bigint;
  v_pagos jsonb;
BEGIN
  -- Build filtered base set in a CTE-like temp via WITH inside dynamic SQL is complex,
  -- so we run two queries against the same filter expression.

  WITH filtered AS (
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
      COALESCE(per.nombre_legal, '') AS cliente,
      pr.numero AS num_propiedad,
      ps.nombre AS producto,
      CASE
        WHEN cc.id_propiedad IS NOT NULL THEN 'propiedad'
        WHEN cc.id_producto IS NOT NULL THEN 'producto'
        ELSE NULL
      END AS tipo_cuenta,
      pry.nombre AS proyecto,
      pry.id AS proyecto_id,
      (p.url_cep IS NOT NULL AND p.url_cep <> '') AS tiene_cep,
      COALESCE((SELECT SUM(ap.monto) FROM aplicaciones_pago ap WHERE ap.id_pago = p.id AND ap.activo = true), 0) AS monto_aplicado,
      COALESCE((SELECT COUNT(*) FROM aplicaciones_pago ap WHERE ap.id_pago = p.id AND ap.activo = true), 0) AS num_aplicaciones
    FROM pagos p
    LEFT JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
    LEFT JOIN metodos_pago mp ON mp.id = p.id_metodos_pago
    LEFT JOIN propiedades pr ON pr.id = cc.id_propiedad
    LEFT JOIN productos_servicios ps ON ps.id = cc.id_producto
    LEFT JOIN proyectos pry ON pry.id = COALESCE(pr.id_proyecto, ps.id_proyecto)
    LEFT JOIN personas per ON per.id = cc.id_comprador
    WHERE p.activo = true
      AND (p_proyecto_id IS NULL OR pry.id = p_proyecto_id)
      AND (p_metodo_pago IS NULL OR mp.nombre = p_metodo_pago)
      AND (
        p_search IS NULL OR p_search = '' OR
        per.nombre_legal ILIKE '%' || p_search || '%' OR
        cc.clabe_stp ILIKE '%' || p_search || '%' OR
        p.clave_rastreo ILIKE '%' || p_search || '%'
      )
      AND (
        p_has_cep IS NULL OR
        (p_has_cep = true AND p.url_cep IS NOT NULL AND p.url_cep <> '') OR
        (p_has_cep = false AND (p.url_cep IS NULL OR p.url_cep = ''))
      )
      AND (
        p_tipo_cuenta IS NULL OR
        (p_tipo_cuenta = 'propiedad' AND cc.id_propiedad IS NOT NULL) OR
        (p_tipo_cuenta = 'producto' AND cc.id_producto IS NOT NULL)
      )
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(monto), 0),
    COUNT(*) FILTER (WHERE tiene_cep),
    COUNT(*) FILTER (WHERE NOT tiene_cep),
    COUNT(*) FILTER (WHERE num_aplicaciones > 0),
    COUNT(*) FILTER (WHERE num_aplicaciones = 0)
  INTO v_total, v_total_monto, v_total_con_cep, v_total_sin_cep, v_total_aplicados, v_total_sin_aplicar
  FROM filtered;

  -- Now get the page
  WITH filtered AS (
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
      COALESCE(per.nombre_legal, '') AS cliente,
      pr.numero AS num_propiedad,
      ps.nombre AS producto,
      CASE
        WHEN cc.id_propiedad IS NOT NULL THEN 'propiedad'
        WHEN cc.id_producto IS NOT NULL THEN 'producto'
        ELSE NULL
      END AS tipo_cuenta,
      pry.nombre AS proyecto,
      pry.id AS proyecto_id,
      (p.url_cep IS NOT NULL AND p.url_cep <> '') AS tiene_cep,
      COALESCE((SELECT SUM(ap.monto) FROM aplicaciones_pago ap WHERE ap.id_pago = p.id AND ap.activo = true), 0) AS monto_aplicado,
      COALESCE((SELECT COUNT(*) FROM aplicaciones_pago ap WHERE ap.id_pago = p.id AND ap.activo = true), 0) AS num_aplicaciones,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'concepto', cp.nombre,
          'orden', acp.orden,
          'monto', ap4.monto
        ) ORDER BY acp.orden NULLS LAST), '[]'::jsonb)
        FROM aplicaciones_pago ap4
        LEFT JOIN acuerdos_pago acp ON ap4.id_acuerdo_pago = acp.id
        LEFT JOIN conceptos_pago cp ON acp.id_concepto = cp.id
        WHERE ap4.id_pago = p.id AND ap4.activo = true
      ) AS aplicaciones_detalle
    FROM pagos p
    LEFT JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
    LEFT JOIN metodos_pago mp ON mp.id = p.id_metodos_pago
    LEFT JOIN propiedades pr ON pr.id = cc.id_propiedad
    LEFT JOIN productos_servicios ps ON ps.id = cc.id_producto
    LEFT JOIN proyectos pry ON pry.id = COALESCE(pr.id_proyecto, ps.id_proyecto)
    LEFT JOIN personas per ON per.id = cc.id_comprador
    WHERE p.activo = true
      AND (p_proyecto_id IS NULL OR pry.id = p_proyecto_id)
      AND (p_metodo_pago IS NULL OR mp.nombre = p_metodo_pago)
      AND (
        p_search IS NULL OR p_search = '' OR
        per.nombre_legal ILIKE '%' || p_search || '%' OR
        cc.clabe_stp ILIKE '%' || p_search || '%' OR
        p.clave_rastreo ILIKE '%' || p_search || '%'
      )
      AND (
        p_has_cep IS NULL OR
        (p_has_cep = true AND p.url_cep IS NOT NULL AND p.url_cep <> '') OR
        (p_has_cep = false AND (p.url_cep IS NULL OR p.url_cep = ''))
      )
      AND (
        p_tipo_cuenta IS NULL OR
        (p_tipo_cuenta = 'propiedad' AND cc.id_propiedad IS NOT NULL) OR
        (p_tipo_cuenta = 'producto' AND cc.id_producto IS NOT NULL)
      )
    ORDER BY p.fecha_pago DESC, p.id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(filtered)), '[]'::jsonb)
  INTO v_pagos
  FROM filtered;

  v_result := jsonb_build_object(
    'total', v_total,
    'total_monto', v_total_monto,
    'total_con_cep', v_total_con_cep,
    'total_sin_cep', v_total_sin_cep,
    'total_aplicados', v_total_aplicados,
    'total_sin_aplicar', v_total_sin_aplicar,
    'pagos', v_pagos
  );

  RETURN v_result;
END;
$function$;