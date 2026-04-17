CREATE OR REPLACE FUNCTION public.get_relacion_pagos(
  p_proyecto_id integer DEFAULT NULL,
  p_metodo_pago text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_has_cep boolean DEFAULT NULL,
  p_tipo_cuenta text DEFAULT NULL, -- 'propiedad' | 'producto' | NULL
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_total  bigint;
BEGIN
  -- Count
  SELECT COUNT(*)
  INTO v_total
  FROM pagos p
  LEFT JOIN metodos_pago mp ON p.id_metodos_pago = mp.id
  LEFT JOIN cuentas_cobranza cc ON p.id_cuenta_cobranza = cc.id
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN personas per ON o.id_persona_lead = per.id
  LEFT JOIN propiedades prop ON cc.id_propiedad = prop.id
  LEFT JOIN productos_servicios prod ON o.id_producto = prod.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON COALESCE(e.id_proyecto, prod.id_proyecto) = proy.id
  WHERE p.activo = true
    AND cc.id_cuenta_cobranza_padre IS NULL  -- exclude mantenimiento sub-accounts
    AND (p_proyecto_id IS NULL OR proy.id = p_proyecto_id)
    AND (p_metodo_pago IS NULL OR mp.nombre = p_metodo_pago)
    AND (p_has_cep IS NULL OR (p_has_cep = true AND p.url_cep IS NOT NULL) OR (p_has_cep = false AND p.url_cep IS NULL))
    AND (p_tipo_cuenta IS NULL
         OR (p_tipo_cuenta = 'propiedad' AND o.id_propiedad IS NOT NULL AND o.id_producto IS NULL)
         OR (p_tipo_cuenta = 'producto' AND o.id_producto IS NOT NULL))
    AND (p_search IS NULL OR
         per.nombre_legal ILIKE '%' || p_search || '%' OR
         cc.clabe_stp ILIKE '%' || p_search || '%' OR
         p.clave_rastreo ILIKE '%' || p_search || '%');

  -- Data
  SELECT jsonb_build_object(
    'total', v_total,
    'pagos', COALESCE(jsonb_agg(row_data ORDER BY fecha_pago DESC, pago_id DESC), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      p.id                          AS pago_id,
      p.fecha_pago,
      jsonb_build_object(
        'pago_id', p.id,
        'monto', p.monto,
        'fecha_pago', p.fecha_pago,
        'clave_rastreo', p.clave_rastreo,
        'url_cep', p.url_cep,
        'url_recibo', p.url_recibo,
        'descripcion', p.descripcion,
        'id_cuenta_cobranza', p.id_cuenta_cobranza,
        'metodo_pago', mp.nombre,
        'clabe_stp', cc.clabe_stp,
        'cliente', per.nombre_legal,
        'num_propiedad', prop.numero_propiedad,
        'producto', prod.nombre,
        'tipo_cuenta', CASE
          WHEN o.id_producto IS NOT NULL THEN 'producto'
          WHEN o.id_propiedad IS NOT NULL THEN 'propiedad'
          ELSE NULL
        END,
        'proyecto', proy.nombre,
        'proyecto_id', proy.id,
        'tiene_cep', (p.url_cep IS NOT NULL),
        'monto_aplicado', COALESCE((SELECT SUM(ap2.monto) FROM aplicaciones_pago ap2 WHERE ap2.id_pago = p.id AND ap2.activo = true), 0),
        'num_aplicaciones', COALESCE((SELECT COUNT(*) FROM aplicaciones_pago ap3 WHERE ap3.id_pago = p.id AND ap3.activo = true), 0),
        'aplicaciones_detalle', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'concepto', cp.nombre,
            'orden', ap4.orden,
            'monto', ap4.monto
          ) ORDER BY ap4.orden)
          FROM aplicaciones_pago ap4
          LEFT JOIN acuerdos_pago acp ON ap4.id_acuerdo_pago = acp.id
          LEFT JOIN conceptos_pago cp ON acp.id_concepto = cp.id
          WHERE ap4.id_pago = p.id AND ap4.activo = true
        ), '[]'::jsonb)
      ) AS row_data
    FROM pagos p
    LEFT JOIN metodos_pago mp ON p.id_metodos_pago = mp.id
    LEFT JOIN cuentas_cobranza cc ON p.id_cuenta_cobranza = cc.id
    LEFT JOIN ofertas o ON cc.id_oferta = o.id
    LEFT JOIN personas per ON o.id_persona_lead = per.id
    LEFT JOIN propiedades prop ON cc.id_propiedad = prop.id
    LEFT JOIN productos_servicios prod ON o.id_producto = prod.id
    LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
    LEFT JOIN edificios e ON em.id_edificio = e.id
    LEFT JOIN proyectos proy ON COALESCE(e.id_proyecto, prod.id_proyecto) = proy.id
    WHERE p.activo = true
      AND cc.id_cuenta_cobranza_padre IS NULL
      AND (p_proyecto_id IS NULL OR proy.id = p_proyecto_id)
      AND (p_metodo_pago IS NULL OR mp.nombre = p_metodo_pago)
      AND (p_has_cep IS NULL OR (p_has_cep = true AND p.url_cep IS NOT NULL) OR (p_has_cep = false AND p.url_cep IS NULL))
      AND (p_tipo_cuenta IS NULL
           OR (p_tipo_cuenta = 'propiedad' AND o.id_propiedad IS NOT NULL AND o.id_producto IS NULL)
           OR (p_tipo_cuenta = 'producto' AND o.id_producto IS NOT NULL))
      AND (p_search IS NULL OR
           per.nombre_legal ILIKE '%' || p_search || '%' OR
           cc.clabe_stp ILIKE '%' || p_search || '%' OR
           p.clave_rastreo ILIKE '%' || p_search || '%')
    ORDER BY p.fecha_pago DESC, p.id DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$function$;