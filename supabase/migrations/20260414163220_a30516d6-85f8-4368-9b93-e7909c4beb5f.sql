
CREATE OR REPLACE FUNCTION public.get_dashboard_cobranza_kpis(
  p_proyecto_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_cobrado_total numeric;
  v_vencido_total numeric;
  v_pendiente_total numeric;
  v_cobrado_mes numeric;
  v_programado_mes numeric;
  v_mes_inicio date;
  v_mes_fin date;
  v_hoy date;
BEGIN
  v_hoy := current_date;
  v_mes_inicio := date_trunc('month', v_hoy)::date;
  v_mes_fin := (date_trunc('month', v_hoy) + interval '1 month' - interval '1 day')::date;

  -- Cobrado total (todos los pagos activos)
  SELECT COALESCE(SUM(p.monto), 0) INTO v_cobrado_total
  FROM pagos p
  JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
  WHERE p.activo = true
    AND cc.activo = true
    AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id);

  -- Vencido total (acuerdos vencidos no pagados)
  SELECT COALESCE(SUM(ap.monto), 0) INTO v_vencido_total
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  WHERE ap.activo = true
    AND cc.activo = true
    AND ap.pago_completado = false
    AND ap.fecha_pago < v_hoy
    AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id);

  -- Pendiente futuro (acuerdos no pagados con fecha >= hoy)
  SELECT COALESCE(SUM(ap.monto), 0) INTO v_pendiente_total
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  WHERE ap.activo = true
    AND cc.activo = true
    AND ap.pago_completado = false
    AND ap.fecha_pago >= v_hoy
    AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id);

  -- Cobrado del mes actual
  SELECT COALESCE(SUM(p.monto), 0) INTO v_cobrado_mes
  FROM pagos p
  JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
  WHERE p.activo = true
    AND cc.activo = true
    AND p.fecha_pago >= v_mes_inicio
    AND p.fecha_pago <= v_mes_fin
    AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id);

  -- Programado del mes actual
  SELECT COALESCE(SUM(ap.monto), 0) INTO v_programado_mes
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
  WHERE ap.activo = true
    AND cc.activo = true
    AND ap.fecha_pago >= v_mes_inicio
    AND ap.fecha_pago <= v_mes_fin
    AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id);

  -- Build result
  result := jsonb_build_object(
    'cobrado_total', v_cobrado_total,
    'vencido_total', v_vencido_total,
    'pendiente_total', v_pendiente_total,
    'cobrado_mes', v_cobrado_mes,
    'programado_mes', v_programado_mes,
    'recovery_rate', CASE WHEN v_programado_mes > 0 THEN ROUND((v_cobrado_mes / v_programado_mes * 100)::numeric, 1) ELSE 0 END
  );

  -- Aging de cartera
  result := result || jsonb_build_object('aging', (
    SELECT jsonb_agg(row_to_json(a))
    FROM (
      SELECT
        CASE
          WHEN v_hoy - ap.fecha_pago BETWEEN 1 AND 30 THEN '1-30'
          WHEN v_hoy - ap.fecha_pago BETWEEN 31 AND 60 THEN '31-60'
          WHEN v_hoy - ap.fecha_pago BETWEEN 61 AND 90 THEN '61-90'
          ELSE '90+'
        END AS rango,
        SUM(ap.monto) AS monto,
        COUNT(*) AS cantidad
      FROM acuerdos_pago ap
      JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
      WHERE ap.activo = true AND cc.activo = true
        AND ap.pago_completado = false
        AND ap.fecha_pago < v_hoy
        AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id)
      GROUP BY 1
      ORDER BY 1
    ) a
  ));

  -- Cuentas por morosidad (parcialidades vencidas)
  result := result || jsonb_build_object('morosidad', (
    SELECT jsonb_agg(row_to_json(m))
    FROM (
      SELECT
        CASE
          WHEN cnt = 1 THEN '1_vencida'
          WHEN cnt = 2 THEN '2_vencidas'
          ELSE '3_plus'
        END AS grupo,
        SUM(total) AS cuentas
      FROM (
        SELECT
          ap.id_cuenta_cobranza,
          LEAST(COUNT(*), 3) AS cnt,
          1 AS total
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
        WHERE ap.activo = true AND cc.activo = true
          AND ap.pago_completado = false
          AND ap.fecha_pago < v_hoy
          AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id)
        GROUP BY ap.id_cuenta_cobranza
        HAVING COUNT(*) >= 1
      ) sub
      GROUP BY 1
      ORDER BY 1
    ) m
  ));

  -- Cobranza por proyecto
  result := result || jsonb_build_object('por_proyecto', (
    SELECT jsonb_agg(row_to_json(pp))
    FROM (
      SELECT
        pr.nombre AS proyecto,
        pr.id AS proyecto_id,
        COALESCE(cobrado.total, 0) AS cobrado,
        COALESCE(vencido.total, 0) AS vencido,
        COALESCE(pendiente.total, 0) AS pendiente
      FROM proyectos pr
      LEFT JOIN LATERAL (
        SELECT SUM(p.monto) AS total
        FROM pagos p
        JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
        WHERE p.activo = true AND cc.activo = true AND cc.id_proyecto = pr.id
      ) cobrado ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ap.monto) AS total
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
        WHERE ap.activo = true AND cc.activo = true
          AND ap.pago_completado = false AND ap.fecha_pago < v_hoy
          AND cc.id_proyecto = pr.id
      ) vencido ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ap.monto) AS total
        FROM acuerdos_pago ap
        JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
        WHERE ap.activo = true AND cc.activo = true
          AND ap.pago_completado = false AND ap.fecha_pago >= v_hoy
          AND cc.id_proyecto = pr.id
      ) pendiente ON true
      WHERE pr.activo = true
        AND (p_proyecto_id IS NULL OR pr.id = p_proyecto_id)
        AND (COALESCE(cobrado.total, 0) + COALESCE(vencido.total, 0) + COALESCE(pendiente.total, 0)) > 0
      ORDER BY cobrado.total DESC NULLS LAST
    ) pp
  ));

  -- Cobrado mensual (últimos 12 meses)
  result := result || jsonb_build_object('cobrado_mensual', (
    SELECT jsonb_agg(row_to_json(cm) ORDER BY cm.mes)
    FROM (
      SELECT
        to_char(date_trunc('month', p.fecha_pago), 'YYYY-MM') AS mes,
        SUM(p.monto) AS cobrado
      FROM pagos p
      JOIN cuentas_cobranza cc ON cc.id = p.id_cuenta_cobranza
      WHERE p.activo = true AND cc.activo = true
        AND p.fecha_pago >= (v_hoy - interval '12 months')
        AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id)
      GROUP BY 1
      ORDER BY 1
    ) cm
  ));

  -- Programado mensual (últimos 12 meses)
  result := result || jsonb_build_object('programado_mensual', (
    SELECT jsonb_agg(row_to_json(pm) ORDER BY pm.mes)
    FROM (
      SELECT
        to_char(date_trunc('month', ap.fecha_pago), 'YYYY-MM') AS mes,
        SUM(ap.monto) AS programado
      FROM acuerdos_pago ap
      JOIN cuentas_cobranza cc ON cc.id = ap.id_cuenta_cobranza
      WHERE ap.activo = true AND cc.activo = true
        AND ap.fecha_pago >= (v_hoy - interval '12 months')
        AND (p_proyecto_id IS NULL OR cc.id_proyecto = p_proyecto_id)
      GROUP BY 1
      ORDER BY 1
    ) pm
  ));

  RETURN result;
END;
$$;
