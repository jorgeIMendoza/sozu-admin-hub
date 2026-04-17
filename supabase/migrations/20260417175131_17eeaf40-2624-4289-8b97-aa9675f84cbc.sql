CREATE OR REPLACE FUNCTION public.get_bandeja_operativa(p_proyecto_id integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_solo_vencidas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_hoy date := current_date;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.parcialidades_vencidas DESC, r.monto_vencido DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      cc.id AS cuenta_id,
      cc.clabe_stp,
      cc.precio_final,
      cc.fecha_compra,
      p.nombre_legal AS cliente_nombre,
      p.email AS cliente_email,
      p.telefono AS cliente_telefono,
      pr.nombre AS proyecto,
      pr.id AS proyecto_id,
      ed.nombre AS edificio,
      prop.numero_propiedad,
      mod.nombre AS modelo,
      COALESCE(vc.parcialidades_vencidas, 0) AS parcialidades_vencidas,
      COALESCE(vc.monto_vencido, 0) AS monto_vencido,
      COALESCE(vc.saldo_pendiente, 0) AS saldo_pendiente,
      vc.proximo_vencimiento,
      CASE
        WHEN COALESCE(vc.parcialidades_vencidas, 0) >= 3 THEN 'purple'
        WHEN COALESCE(vc.parcialidades_vencidas, 0) = 2 THEN 'red'
        WHEN COALESCE(vc.parcialidades_vencidas, 0) = 1 THEN 'yellow'
        ELSE 'green'
      END AS prioridad
    FROM cuentas_cobranza cc
    LEFT JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN personas p ON p.id = o.id_persona_lead
    LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
    LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
    LEFT JOIN edificios ed ON ed.id = em.id_edificio
    LEFT JOIN proyectos pr ON pr.id = ed.id_proyecto
    LEFT JOIN modelos mod ON mod.id = em.id_modelo
    LEFT JOIN LATERAL (
      SELECT
        COUNT(CASE WHEN ap.pago_completado = false AND ap.fecha_pago < v_hoy THEN 1 END) AS parcialidades_vencidas,
        COALESCE(SUM(CASE WHEN ap.pago_completado = false AND ap.fecha_pago < v_hoy THEN GREATEST(ap.monto - COALESCE(apl.aplicado, 0), 0) END), 0) AS monto_vencido,
        COALESCE(SUM(CASE WHEN ap.pago_completado = false THEN GREATEST(ap.monto - COALESCE(apl.aplicado, 0), 0) END), 0) AS saldo_pendiente,
        MIN(CASE WHEN ap.pago_completado = false AND ap.fecha_pago >= v_hoy THEN ap.fecha_pago END) AS proximo_vencimiento
      FROM acuerdos_pago ap
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(a.monto), 0) AS aplicado
        FROM aplicaciones_pago a
        WHERE a.id_acuerdo_pago = ap.id
          AND a.activo = true
          AND a.es_multa = false
      ) apl ON true
      WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true
    ) vc ON true
    WHERE cc.activo = true
      AND cc.id_tipo_cancelacion IS NULL
      AND cc.id_cuenta_cobranza_padre IS NULL
      AND (p_proyecto_id IS NULL OR pr.id = p_proyecto_id)
      AND (p_search IS NULL OR p_search = '' OR
           p.nombre_legal ILIKE '%' || p_search || '%' OR
           cc.clabe_stp ILIKE '%' || p_search || '%')
      AND (p_solo_vencidas = false OR COALESCE(vc.parcialidades_vencidas, 0) > 0)
  ) r;

  RETURN result;
END;
$function$;