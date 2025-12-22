-- Actualizar el reporte con una query optimizada usando CTEs y JOINs en lugar de subconsultas correlacionadas
UPDATE reportes 
SET query_sql = '
-- CTE para calcular totales de acuerdos de pago por cuenta
WITH acuerdos_totales AS (
  SELECT 
    ap.id_cuenta_cobranza,
    SUM(CASE WHEN ap.id_concepto IN (1, 2, 4, 5, 6) THEN ap.monto ELSE 0 END) AS monto_durante_obra,
    SUM(CASE WHEN ap.id_concepto = 3 THEN ap.monto ELSE 0 END) AS monto_a_la_entrega
  FROM acuerdos_pago ap
  WHERE ap.activo = true
  GROUP BY ap.id_cuenta_cobranza
),
-- CTE para calcular totales de pagos aplicados por cuenta
pagos_aplicados AS (
  SELECT 
    ap.id_cuenta_cobranza,
    SUM(CASE WHEN ap.id_concepto IN (1, 2, 4, 5, 6) THEN aplp.monto ELSE 0 END) AS pagado_durante_obra,
    SUM(CASE WHEN ap.id_concepto = 3 THEN aplp.monto ELSE 0 END) AS pagado_a_la_entrega,
    SUM(aplp.monto) AS total_pagado
  FROM aplicaciones_pago aplp
  JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
  WHERE ap.activo = true AND aplp.activo = true
  GROUP BY ap.id_cuenta_cobranza
),
-- CTE para compradores por cuenta
compradores_agg AS (
  SELECT 
    c.id_cuenta_cobranza,
    string_agg(p.nombre_legal, '', '' ORDER BY p.nombre_legal) AS compradores
  FROM compradores c
  JOIN personas p ON c.id_persona = p.id
  WHERE c.activo = true
  GROUP BY c.id_cuenta_cobranza
)

-- PROPIEDADES
SELECT 
  ''Propiedad'' AS tipo,
  NULL AS categoria_producto,
  pr.nombre AS proyecto,
  COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno,
  p.numero_propiedad AS identificador,
  COALESCE(ca.compradores, ''Sin comprador'') AS compradores,
  cc.precio_final,
  COALESCE(at.monto_durante_obra, 0) AS monto_durante_obra,
  COALESCE(at.monto_a_la_entrega, 0) AS monto_a_la_entrega,
  COALESCE(pa.pagado_durante_obra, 0) AS pagado_durante_obra,
  COALESCE(pa.pagado_a_la_entrega, 0) AS pagado_a_la_entrega,
  COALESCE(at.monto_durante_obra, 0) - COALESCE(pa.pagado_durante_obra, 0) AS restante_durante_obra,
  COALESCE(at.monto_a_la_entrega, 0) - COALESCE(pa.pagado_a_la_entrega, 0) AS restante_a_la_entrega
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN propiedades p ON o.id_propiedad = p.id
JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
JOIN edificios e ON em.id_edificio = e.id
JOIN proyectos pr ON e.id_proyecto = pr.id
LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
LEFT JOIN personas dueno ON er.id_persona = dueno.id
LEFT JOIN acuerdos_totales at ON at.id_cuenta_cobranza = cc.id
LEFT JOIN pagos_aplicados pa ON pa.id_cuenta_cobranza = cc.id
LEFT JOIN compradores_agg ca ON ca.id_cuenta_cobranza = cc.id
WHERE cc.activo = true
  AND cc.id_tipo_cancelacion IS NULL
  AND o.id_propiedad IS NOT NULL
  AND o.id_producto IS NULL
  {{AND ''Propiedad'' = :tipo}}
  {{AND pr.id = :id_proyecto}}
  {{AND er.id_persona = :id_dueno}}

UNION ALL

-- PRODUCTOS
SELECT 
  ''Producto'' AS tipo,
  cp.nombre AS categoria_producto,
  pr.nombre AS proyecto,
  NULL AS dueno,
  ps.nombre AS identificador,
  COALESCE(ca.compradores, ''Sin comprador'') AS compradores,
  cc.precio_final,
  0 AS monto_durante_obra,
  cc.precio_final AS monto_a_la_entrega,
  0 AS pagado_durante_obra,
  COALESCE(pa.total_pagado, 0) AS pagado_a_la_entrega,
  0 AS restante_durante_obra,
  cc.precio_final - COALESCE(pa.total_pagado, 0) AS restante_a_la_entrega
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN productos_servicios ps ON o.id_producto = ps.id
JOIN categorias_producto cp ON ps.id_categoria = cp.id
LEFT JOIN proyectos pr ON ps.id_proyecto = pr.id
LEFT JOIN pagos_aplicados pa ON pa.id_cuenta_cobranza = cc.id
LEFT JOIN compradores_agg ca ON ca.id_cuenta_cobranza = cc.id
WHERE cc.activo = true
  AND cc.id_tipo_cancelacion IS NULL
  AND o.id_producto IS NOT NULL
  {{AND ''Producto'' = :tipo}}
  {{AND pr.id = :id_proyecto}}
  {{AND cp.id = :id_categoria}}

ORDER BY tipo, proyecto, identificador
',
fecha_actualizacion = NOW()
WHERE id = 3;