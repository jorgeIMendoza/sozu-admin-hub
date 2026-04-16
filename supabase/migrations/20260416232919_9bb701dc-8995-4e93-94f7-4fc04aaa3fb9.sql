CREATE OR REPLACE FUNCTION public.get_expediente_cobranza(p_cuenta_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_hoy date := current_date;
BEGIN
  WITH cuenta AS (
    SELECT
      cc.id,
      cc.clabe_stp,
      cc.precio_final,
      cc.fecha_compra,
      cc.id_oferta,
      cc.activo,
      cc.collection_id,
      o.id_persona_lead,
      p.nombre_legal AS cliente_nombre,
      p.email AS cliente_email,
      p.telefono AS cliente_telefono,
      p.rfc AS cliente_rfc,
      p.tipo_persona AS cliente_tipo,
      pr.id AS proyecto_id,
      pr.nombre AS proyecto_nombre,
      ed.nombre AS edificio,
      mod.nombre AS modelo,
      prop.numero_propiedad,
      prop.id AS propiedad_id,
      (COALESCE(prop.m2_interiores,0) + COALESCE(prop.m2_exteriores,0) + COALESCE(prop.m2_loft,0))::numeric AS metraje
    FROM cuentas_cobranza cc
    LEFT JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN personas p ON p.id = o.id_persona_lead
    LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
    LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
    LEFT JOIN edificios ed ON ed.id = em.id_edificio
    LEFT JOIN proyectos pr ON pr.id = ed.id_proyecto
    LEFT JOIN modelos mod ON mod.id = em.id_modelo
    WHERE cc.id = p_cuenta_id
  ),
  acuerdos AS (
    SELECT
      ap.id,
      ap.orden,
      ap.fecha_pago,
      ap.monto,
      ap.pago_completado,
      cp.nombre AS concepto,
      COALESCE((
        SELECT SUM(a.monto) FROM aplicaciones_pago a
        WHERE a.id_acuerdo_pago = ap.id AND a.activo = true AND a.es_multa = false
      ), 0) AS aplicado
    FROM acuerdos_pago ap
    LEFT JOIN conceptos_pago cp ON cp.id = ap.id_concepto
    WHERE ap.id_cuenta_cobranza = p_cuenta_id AND ap.activo = true
  ),
  pagos_list AS (
    SELECT
      pg.id,
      pg.fecha_pago,
      pg.monto,
      pg.descripcion,
      pg.clave_rastreo,
      pg.url_recibo,
      pg.url_cep,
      mp.nombre AS metodo
    FROM pagos pg
    LEFT JOIN metodos_pago mp ON mp.id = pg.id_metodos_pago
    WHERE pg.id_cuenta_cobranza = p_cuenta_id AND pg.activo = true
  ),
  finanzas AS (
    SELECT
      COALESCE(SUM(monto), 0) AS total_acuerdos,
      COALESCE(SUM(aplicado), 0) AS total_pagado,
      COUNT(*) FILTER (WHERE pago_completado = false AND fecha_pago < v_hoy) AS parcialidades_vencidas,
      COALESCE(SUM(GREATEST(monto - aplicado, 0)) FILTER (WHERE pago_completado = false AND fecha_pago < v_hoy), 0) AS monto_vencido,
      COALESCE(SUM(GREATEST(monto - aplicado, 0)) FILTER (WHERE pago_completado = false), 0) AS saldo_pendiente,
      MIN(fecha_pago) FILTER (WHERE pago_completado = false AND fecha_pago >= v_hoy) AS proximo_vencimiento,
      COUNT(*) AS total_parcialidades,
      COUNT(*) FILTER (WHERE pago_completado = true) AS parcialidades_pagadas
    FROM acuerdos
  ),
  compradores_data AS (
    SELECT jsonb_agg(jsonb_build_object(
      'nombre_legal', per.nombre_legal,
      'rfc', per.rfc,
      'email', per.email,
      'telefono', per.telefono,
      'porcentaje_copropiedad', comp.porcentaje_copropiedad
    ) ORDER BY per.nombre_legal) AS data
    FROM compradores comp
    JOIN personas per ON per.id = comp.id_persona
    WHERE comp.id_cuenta_cobranza = p_cuenta_id AND comp.activo = true
  )
  SELECT jsonb_build_object(
    'cuenta', (SELECT row_to_json(c) FROM cuenta c),
    'compradores', COALESCE((SELECT data FROM compradores_data), '[]'::jsonb),
    'finanzas', (SELECT row_to_json(f) FROM finanzas f),
    'parcialidades', COALESCE((
      SELECT jsonb_agg(row_to_json(a) ORDER BY a.orden) FROM acuerdos a
    ), '[]'::jsonb),
    'pagos', COALESCE((
      SELECT jsonb_agg(row_to_json(p) ORDER BY p.fecha_pago DESC) FROM pagos_list p
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;