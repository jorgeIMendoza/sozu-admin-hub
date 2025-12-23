-- Actualizar query del reporte "Pagos actuales y futuros" con meses en español y flag de mes actual
UPDATE reportes 
SET query_sql = '
WITH meses AS (
  SELECT generate_series(
    date_trunc(''month'', CURRENT_DATE),
    date_trunc(''month'', CURRENT_DATE) + interval ''4 months'',
    interval ''1 month''
  )::date AS mes_inicio
),
aplicaciones_agregadas AS (
  SELECT 
    id_acuerdo_pago,
    SUM(monto) AS monto_pagado
  FROM aplicaciones_pago
  WHERE activo = true
  GROUP BY id_acuerdo_pago
),
datos_propiedades AS (
  SELECT 
    ''propiedad'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er.id_persona AS id_dueno,
    dueno.nombre_legal AS dueno,
    ap.fecha_pago,
    ap.monto AS monto_acuerdo,
    COALESCE(apl.monto_pagado, 0) AS monto_pagado
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN propiedades p ON o.id_propiedad = p.id
  JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  JOIN edificios e ON em.id_edificio = e.id
  JOIN proyectos pr ON e.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas dueno ON er.id_persona = dueno.id
  LEFT JOIN aplicaciones_agregadas apl ON apl.id_acuerdo_pago = ap.id
  WHERE cc.activo = true
    AND ap.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_propiedad IS NOT NULL
    AND o.id_producto IS NULL
    AND ap.fecha_pago IS NOT NULL
),
datos_productos AS (
  SELECT 
    ''producto'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er_dueno.id_persona AS id_dueno,
    pe_dueno.nombre_legal AS dueno,
    ap.fecha_pago,
    ap.monto AS monto_acuerdo,
    COALESCE(apl.monto_pagado, 0) AS monto_pagado
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr ON ps.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er_dueno ON ps.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  LEFT JOIN aplicaciones_agregadas apl ON apl.id_acuerdo_pago = ap.id
  WHERE cc.activo = true
    AND ap.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_producto IS NOT NULL
    AND ap.fecha_pago IS NOT NULL
),
datos_base AS (
  SELECT * FROM datos_propiedades
  UNION ALL
  SELECT * FROM datos_productos
),
datos_filtrados AS (
  SELECT * FROM datos_base
  WHERE 1=1
    {{AND id_proyecto = :id_proyecto}}
    {{AND id_dueno = :id_dueno}}
    {{AND tipo = :tipo}}
),
meses_espanol AS (
  SELECT 
    m.mes_inicio,
    CASE EXTRACT(MONTH FROM m.mes_inicio)
      WHEN 1 THEN ''Ene''
      WHEN 2 THEN ''Feb''
      WHEN 3 THEN ''Mar''
      WHEN 4 THEN ''Abr''
      WHEN 5 THEN ''May''
      WHEN 6 THEN ''Jun''
      WHEN 7 THEN ''Jul''
      WHEN 8 THEN ''Ago''
      WHEN 9 THEN ''Sep''
      WHEN 10 THEN ''Oct''
      WHEN 11 THEN ''Nov''
      WHEN 12 THEN ''Dic''
    END || ''-'' || to_char(m.mes_inicio, ''YY'') AS mes_label,
    CASE WHEN m.mes_inicio = date_trunc(''month'', CURRENT_DATE) THEN true ELSE false END AS es_mes_actual
  FROM meses m
),
resumen_por_mes AS (
  SELECT 
    me.mes_inicio,
    me.mes_label,
    me.es_mes_actual,
    COALESCE(SUM(d.monto_acuerdo), 0) AS monto_por_cobrar,
    COALESCE(SUM(d.monto_pagado), 0) AS monto_cobrado,
    COALESCE(SUM(d.monto_acuerdo), 0) - COALESCE(SUM(d.monto_pagado), 0) AS monto_faltante
  FROM meses_espanol me
  LEFT JOIN datos_filtrados d ON date_trunc(''month'', d.fecha_pago::date) = me.mes_inicio
  GROUP BY me.mes_inicio, me.mes_label, me.es_mes_actual
  ORDER BY me.mes_inicio
)
SELECT 
  mes_label AS mes,
  es_mes_actual,
  monto_por_cobrar,
  monto_cobrado,
  monto_faltante
FROM resumen_por_mes
ORDER BY mes_inicio
'
WHERE id = 4;