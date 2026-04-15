
CREATE OR REPLACE FUNCTION public.get_dashboard_cobranza_kpis(
  p_proyecto_id integer DEFAULT NULL,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_cobrado_total numeric;
  v_vencido_total numeric;
  v_vencido_total_sin_ce numeric;
  v_pendiente_total numeric;
  v_cobrado_mes numeric;
  v_programado_mes numeric;
  v_programado_mes_sin_ce numeric;
  v_por_cobrar_mes numeric;
  v_por_cobrar_mes_sin_ce numeric;
  v_mes_inicio date;
  v_mes_fin date;
  v_hoy date;
BEGIN
  v_hoy := current_date;
  v_mes_inicio := COALESCE(p_fecha_inicio, date_trunc('month', v_hoy)::date);
  v_mes_fin := COALESCE(p_fecha_fin, (date_trunc('month', v_hoy) + interval '1 month' - interval '1 day')::date);

  -- Cobrado total
  SELECT COALESCE(SUM(p.monto), 0) INTO v_cobrado_total
  FROM pagos p
  JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE p.activo = true AND cc.activo = true
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Vencido total (restando pagos parciales aplicados)
  SELECT COALESCE(SUM(
    ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0)
  ), 0) INTO v_vencido_total
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.pago_completado = false AND ap.fecha_pago < v_hoy
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Vencido total SIN contraentrega (id_concepto != 3), restando parciales
  SELECT COALESCE(SUM(
    ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0)
  ), 0) INTO v_vencido_total_sin_ce
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.pago_completado = false AND ap.fecha_pago < v_hoy
    AND ap.id_concepto != 3
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Pendiente futuro
  SELECT COALESCE(SUM(ap.monto), 0) INTO v_pendiente_total
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.pago_completado = false AND ap.fecha_pago >= v_hoy
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Cobrado en periodo
  SELECT COALESCE(SUM(p.monto), 0) INTO v_cobrado_mes
  FROM pagos p
  JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE p.activo = true AND cc.activo = true
    AND p.fecha_pago >= v_mes_inicio AND p.fecha_pago <= v_mes_fin
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Programado en periodo (con contraentrega) - restando parciales
  SELECT COALESCE(SUM(
    ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0)
  ), 0) INTO v_programado_mes
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.fecha_pago >= v_mes_inicio AND ap.fecha_pago <= v_mes_fin
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Programado en periodo SIN contraentrega - restando parciales
  SELECT COALESCE(SUM(
    ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0)
  ), 0) INTO v_programado_mes_sin_ce
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.fecha_pago >= v_mes_inicio AND ap.fecha_pago <= v_mes_fin
    AND ap.id_concepto != 3
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Por cobrar en periodo: saldo remanente de acuerdos no completados en el rango de fechas
  SELECT COALESCE(SUM(
    GREATEST(ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0), 0)
  ), 0) INTO v_por_cobrar_mes
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.pago_completado = false
    AND ap.fecha_pago >= v_mes_inicio AND ap.fecha_pago <= v_mes_fin
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  -- Por cobrar en periodo SIN contraentrega
  SELECT COALESCE(SUM(
    GREATEST(ap.monto - COALESCE((
      SELECT SUM(apl.monto) FROM aplicaciones_pago apl
      WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
    ), 0), 0)
  ), 0) INTO v_por_cobrar_mes_sin_ce
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  WHERE ap.activo = true AND cc.activo = true
    AND ap.pago_completado = false
    AND ap.fecha_pago >= v_mes_inicio AND ap.fecha_pago <= v_mes_fin
    AND ap.id_concepto != 3
    AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id);

  result := jsonb_build_object(
    'cobrado_total', v_cobrado_total,
    'vencido_total', v_vencido_total,
    'vencido_total_sin_ce', v_vencido_total_sin_ce,
    'pendiente_total', v_pendiente_total,
    'cobrado_mes', v_cobrado_mes,
    'programado_mes', v_programado_mes,
    'programado_mes_sin_ce', v_programado_mes_sin_ce,
    'por_cobrar_mes', v_por_cobrar_mes,
    'por_cobrar_mes_sin_ce', v_por_cobrar_mes_sin_ce,
    'recovery_rate', CASE WHEN v_programado_mes > 0 THEN ROUND((v_cobrado_mes / v_programado_mes * 100)::numeric, 1) ELSE 0 END
  );

  -- Aging de cartera (restando pagos parciales)
  result := result || jsonb_build_object('aging', (
    SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb)
    FROM (
      SELECT
        CASE
          WHEN v_hoy - ap.fecha_pago BETWEEN 1 AND 30 THEN '1-30'
          WHEN v_hoy - ap.fecha_pago BETWEEN 31 AND 60 THEN '31-60'
          WHEN v_hoy - ap.fecha_pago BETWEEN 61 AND 90 THEN '61-90'
          ELSE '90+'
        END AS rango,
        SUM(ap.monto - COALESCE((
          SELECT SUM(apl.monto) FROM aplicaciones_pago apl
          WHERE apl.id_acuerdo_pago = ap.id AND apl.activo = true AND apl.es_multa = false
        ), 0)) AS monto,
        COUNT(*) AS cantidad
      FROM acuerdos_pago ap
      JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
      LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
      LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
      LEFT JOIN edificios ed ON ed.id = em.id_edificio
      WHERE ap.activo = true AND cc.activo = true
        AND ap.pago_completado = false AND ap.fecha_pago < v_hoy
        AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id)
      GROUP BY 1 ORDER BY 1
    ) a
  ));

  -- Morosidad
  result := result || jsonb_build_object('morosidad', (
    SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb)
    FROM (
      SELECT
        CASE WHEN cnt = 1 THEN '1_vencida' WHEN cnt = 2 THEN '2_vencidas' ELSE '3_plus' END AS grupo,
        SUM(total)::integer AS cuentas
      FROM (
        SELECT ap.id_cuenta_cobranza, LEAST(COUNT(*), 3) AS cnt, 1 AS total
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
        LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
        LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
        LEFT JOIN edificios ed ON ed.id = em.id_edificio
        WHERE ap.activo = true AND cc.activo = true
          AND ap.pago_completado = false AND ap.fecha_pago < v_hoy
          AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id)
        GROUP BY ap.id_cuenta_cobranza HAVING COUNT(*) >= 1
      ) sub
      GROUP BY 1 ORDER BY 1
    ) m
  ));

  -- Por proyecto (restando pagos parciales en vencido)
  result := result || jsonb_build_object('por_proyecto', (
    SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb)
    FROM (
      SELECT
        pr.nombre AS proyecto,
        pr.id AS proyecto_id,
        COALESCE((
          SELECT SUM(p2.monto) FROM pagos p2
          JOIN cuentas_cobranza cc2 ON cc2.id = p2.id_cuenta_cobranza
          LEFT JOIN propiedades prop2 ON prop2.id = cc2.id_propiedad
          LEFT JOIN edificios_modelos em2 ON em2.id = prop2.id_edificio_modelo
          LEFT JOIN edificios ed2 ON ed2.id = em2.id_edificio
          WHERE p2.activo = true AND cc2.activo = true AND ed2.id_proyecto = pr.id
        ), 0) AS cobrado,
        COALESCE((
          SELECT SUM(ap2.monto - COALESCE((
            SELECT SUM(apl2.monto) FROM aplicaciones_pago apl2
            WHERE apl2.id_acuerdo_pago = ap2.id AND apl2.activo = true AND apl2.es_multa = false
          ), 0))
          FROM acuerdos_pago ap2
          JOIN cuentas_cobranza cc2 ON cc2.id = ap2.id_cuenta_cobranza
          LEFT JOIN propiedades prop2 ON prop2.id = cc2.id_propiedad
          LEFT JOIN edificios_modelos em2 ON em2.id = prop2.id_edificio_modelo
          LEFT JOIN edificios ed2 ON ed2.id = em2.id_edificio
          WHERE ap2.activo = true AND cc2.activo = true
            AND ap2.pago_completado = false AND ap2.fecha_pago < v_hoy AND ed2.id_proyecto = pr.id
        ), 0) AS vencido,
        COALESCE((
          SELECT SUM(ap2.monto) FROM acuerdos_pago ap2
          JOIN cuentas_cobranza cc2 ON cc2.id = ap2.id_cuenta_cobranza
          LEFT JOIN propiedades prop2 ON prop2.id = cc2.id_propiedad
          LEFT JOIN edificios_modelos em2 ON em2.id = prop2.id_edificio_modelo
          LEFT JOIN edificios ed2 ON ed2.id = em2.id_edificio
          WHERE ap2.activo = true AND cc2.activo = true
            AND ap2.pago_completado = false AND ap2.fecha_pago >= v_hoy AND ed2.id_proyecto = pr.id
        ), 0) AS pendiente
      FROM proyectos pr
      WHERE pr.activo = true
        AND (p_proyecto_id IS NULL OR pr.id = p_proyecto_id)
      ORDER BY pr.nombre
    ) pp
  ));

  -- Cobrado mensual (últimos 12 meses)
  result := result || jsonb_build_object('cobrado_mensual', (
    SELECT COALESCE(jsonb_agg(row_to_json(cm)), '[]'::jsonb)
    FROM (
      SELECT to_char(date_trunc('month', p.fecha_pago), 'YYYY-MM') AS mes, SUM(p.monto) AS cobrado
      FROM pagos p
      JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
      LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
      LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
      LEFT JOIN edificios ed ON ed.id = em.id_edificio
      WHERE p.activo = true AND cc.activo = true
        AND p.fecha_pago >= (v_hoy - interval '12 months')
        AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id)
      GROUP BY 1 ORDER BY 1
    ) cm
  ));

  -- Programado mensual (últimos 12 meses)
  result := result || jsonb_build_object('programado_mensual', (
    SELECT COALESCE(jsonb_agg(row_to_json(pm)), '[]'::jsonb)
    FROM (
      SELECT to_char(date_trunc('month', ap.fecha_pago), 'YYYY-MM') AS mes, SUM(ap.monto) AS programado
      FROM acuerdos_pago ap
      JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
      LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
      LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
      LEFT JOIN edificios ed ON ed.id = em.id_edificio
      WHERE ap.activo = true AND cc.activo = true
        AND ap.fecha_pago >= (v_hoy - interval '12 months')
        AND (p_proyecto_id IS NULL OR ed.id_proyecto = p_proyecto_id)
      GROUP BY 1 ORDER BY 1
    ) pm
  ));

  RETURN result;
END;
$$;
