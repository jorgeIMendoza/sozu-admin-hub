-- =====================================================
-- Nuevo reporte: Pagos actuales y futuros (ID: 4)
-- Este reporte muestra proyecciones de cobro por mes
-- =====================================================

INSERT INTO reportes (
  id,
  nombre, 
  descripcion, 
  nombre_archivo, 
  query_sql, 
  filtros_configuracion,
  activo, 
  prendido
) VALUES (
  4,
  'Pagos actuales y futuros',
  'Reporte de proyecciones de cobro mostrando montos por cobrar, cobrados y faltantes para el mes actual y los siguientes 4 meses',
  'pagos_actuales_futuros',
  '
WITH meses AS (
  SELECT generate_series(
    date_trunc(''month'', CURRENT_DATE),
    date_trunc(''month'', CURRENT_DATE) + interval ''4 months'',
    interval ''1 month''
  )::date AS mes_inicio
),
datos_base AS (
  -- Propiedades
  SELECT 
    ''propiedad'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er.id_persona AS id_dueno,
    dueno.nombre_legal AS dueno,
    ap.fecha_pago,
    ap.monto AS monto_acuerdo,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      WHERE aplp.id_acuerdo_pago = ap.id AND aplp.activo = true
    ), 0) AS monto_pagado,
    ap.pago_completado
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN propiedades p ON o.id_propiedad = p.id
  JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  JOIN edificios e ON em.id_edificio = e.id
  JOIN proyectos pr ON e.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas dueno ON er.id_persona = dueno.id
  WHERE cc.activo = true
    AND ap.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_propiedad IS NOT NULL
    AND o.id_producto IS NULL
    AND ap.fecha_pago IS NOT NULL
  
  UNION ALL
  
  -- Productos
  SELECT 
    ''producto'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er_dueno.id_persona AS id_dueno,
    pe_dueno.nombre_legal AS dueno,
    ap.fecha_pago,
    ap.monto AS monto_acuerdo,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      WHERE aplp.id_acuerdo_pago = ap.id AND aplp.activo = true
    ), 0) AS monto_pagado,
    ap.pago_completado
  FROM acuerdos_pago ap
  JOIN cuentas_cobranza cc ON ap.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr ON ps.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er_dueno ON ps.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  WHERE cc.activo = true
    AND ap.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_producto IS NOT NULL
    AND ap.fecha_pago IS NOT NULL
),
datos_filtrados AS (
  SELECT * FROM datos_base
  WHERE 1=1
    {{AND id_proyecto = :id_proyecto}}
    {{AND id_dueno = :id_dueno}}
    {{AND tipo = :tipo}}
),
resumen_por_mes AS (
  SELECT 
    m.mes_inicio,
    to_char(m.mes_inicio, ''Mon-YY'') AS mes_label,
    COALESCE(SUM(d.monto_acuerdo), 0) AS monto_por_cobrar,
    COALESCE(SUM(d.monto_pagado), 0) AS monto_cobrado,
    COALESCE(SUM(d.monto_acuerdo), 0) - COALESCE(SUM(d.monto_pagado), 0) AS monto_faltante
  FROM meses m
  LEFT JOIN datos_filtrados d ON date_trunc(''month'', d.fecha_pago::date) = m.mes_inicio
  GROUP BY m.mes_inicio
  ORDER BY m.mes_inicio
)
SELECT 
  mes_label AS mes,
  monto_por_cobrar,
  monto_cobrado,
  monto_faltante
FROM resumen_por_mes
ORDER BY mes_inicio
  ',
  '[
    {
      "nombre": "id_proyecto",
      "label": "Proyecto",
      "tipo": "select",
      "query_opciones": "SELECT DISTINCT pr.id::text AS value, pr.nombre AS label FROM proyectos pr WHERE pr.activo = true AND (EXISTS (SELECT 1 FROM propiedades p JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id JOIN ofertas o ON o.id_propiedad = p.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE e.id_proyecto = pr.id AND cc.activo = true AND p.activo = true) OR EXISTS (SELECT 1 FROM productos_servicios ps JOIN ofertas o ON o.id_producto = ps.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE ps.id_proyecto = pr.id AND cc.activo = true AND ps.activo = true)) ORDER BY pr.nombre"
    },
    {
      "nombre": "id_dueno",
      "label": "Dueño/Aportante",
      "tipo": "select",
      "query_opciones": "SELECT DISTINCT pe.id::text AS value, pe.nombre_legal AS label FROM entidades_relacionadas er JOIN personas pe ON er.id_persona = pe.id WHERE er.activo = true AND er.id_tipo_entidad IN (4, 15) ORDER BY pe.nombre_legal"
    },
    {
      "nombre": "tipo",
      "label": "Tipo",
      "tipo": "select",
      "opciones_estaticas": [
        {"id": "propiedad", "nombre": "Propiedades"},
        {"id": "producto", "nombre": "Productos"}
      ]
    }
  ]'::jsonb,
  true,
  true
);

-- Dar acceso al reporte a todos los roles EXCEPTO rol 16 (Representante de empresa dueña)
-- Rol 1 es Super Admin que ya tiene acceso global
INSERT INTO roles_reportes (rol_id, reporte_id, activo)
SELECT r.id, 4, true
FROM roles r
WHERE r.activo = true
  AND r.id NOT IN (1, 16)  -- Excluir Super Admin (tiene acceso global) y Representante
ON CONFLICT (rol_id, reporte_id) DO NOTHING;