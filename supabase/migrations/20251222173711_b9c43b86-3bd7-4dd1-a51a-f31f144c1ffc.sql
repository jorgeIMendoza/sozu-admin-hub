INSERT INTO reportes (nombre, descripcion, query_sql, filtros_configuracion, nombre_archivo, id_submenu, activo, prendido)
VALUES (
  'Cuentas por cobrar unificado (Propiedades + Productos)',
  'Reporte unificado que combina las cuentas por cobrar de propiedades y productos con filtros para tipo, proyecto, categoría y dueño vendedor.',
  '
-- PROPIEDADES
SELECT 
  ''Propiedad'' AS tipo,
  NULL AS categoria_producto,
  pr.nombre AS proyecto,
  COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno,
  p.numero_propiedad AS identificador,
  COALESCE((
    SELECT string_agg(p_comp.nombre_legal, '', '' ORDER BY p_comp.nombre_legal)
    FROM compradores c
    JOIN personas p_comp ON c.id_persona = p_comp.id
    WHERE c.id_cuenta_cobranza = cc.id AND c.activo = true
  ), ''Sin comprador'') AS compradores,
  cc.precio_final,
  COALESCE((
    SELECT SUM(ap.monto)
    FROM acuerdos_pago ap
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND ap.id_concepto IN (1, 2, 4, 5, 6)
  ), 0) AS monto_durante_obra,
  COALESCE((
    SELECT SUM(ap.monto)
    FROM acuerdos_pago ap
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND ap.id_concepto = 3
  ), 0) AS monto_a_la_entrega,
  COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
      AND ap.id_concepto IN (1, 2, 4, 5, 6)
  ), 0) AS pagado_durante_obra,
  COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
      AND ap.id_concepto = 3
  ), 0) AS pagado_a_la_entrega,
  COALESCE((
    SELECT SUM(ap.monto)
    FROM acuerdos_pago ap
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND ap.id_concepto IN (1, 2, 4, 5, 6)
  ), 0) - COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
      AND ap.id_concepto IN (1, 2, 4, 5, 6)
  ), 0) AS restante_durante_obra,
  COALESCE((
    SELECT SUM(ap.monto)
    FROM acuerdos_pago ap
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND ap.id_concepto = 3
  ), 0) - COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
      AND ap.id_concepto = 3
  ), 0) AS restante_a_la_entrega
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN propiedades p ON o.id_propiedad = p.id
JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
JOIN edificios e ON em.id_edificio = e.id
JOIN proyectos pr ON e.id_proyecto = pr.id
LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
LEFT JOIN personas dueno ON er.id_persona = dueno.id
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
  string_agg(DISTINCT comprador.nombre_legal, '' / '') AS compradores,
  cc.precio_final,
  0 AS monto_durante_obra,
  cc.precio_final AS monto_a_la_entrega,
  0 AS pagado_durante_obra,
  COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
  ), 0) AS pagado_a_la_entrega,
  0 AS restante_durante_obra,
  cc.precio_final - COALESCE((
    SELECT SUM(aplp.monto)
    FROM aplicaciones_pago aplp
    JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
    WHERE ap.id_cuenta_cobranza = cc.id 
      AND ap.activo = true
      AND aplp.activo = true
  ), 0) AS restante_a_la_entrega
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN productos_servicios ps ON o.id_producto = ps.id
JOIN categorias_producto cp ON ps.id_categoria = cp.id
LEFT JOIN proyectos pr ON ps.id_proyecto = pr.id
LEFT JOIN compradores comp ON comp.id_cuenta_cobranza = cc.id AND comp.activo = true
LEFT JOIN personas comprador ON comp.id_persona = comprador.id
WHERE cc.activo = true
  AND cc.id_tipo_cancelacion IS NULL
  AND o.id_producto IS NOT NULL
  {{AND ''Producto'' = :tipo}}
  {{AND pr.id = :id_proyecto}}
  {{AND cp.id = :id_categoria}}
GROUP BY cc.id, pr.nombre, cp.nombre, ps.nombre, cc.precio_final

ORDER BY tipo, proyecto, identificador
  ',
  '[
    {
      "nombre": "tipo",
      "label": "Tipo",
      "tipo": "select",
      "opciones_estaticas": [
        {"id": "Propiedad", "nombre": "Propiedad"},
        {"id": "Producto", "nombre": "Producto"}
      ],
      "requerido": false
    },
    {
      "nombre": "id_proyecto",
      "label": "Proyecto",
      "tipo": "select",
      "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr WHERE pr.activo = true ORDER BY pr.nombre",
      "requerido": false
    },
    {
      "nombre": "id_categoria",
      "label": "Categoría de Producto",
      "tipo": "select",
      "query_opciones": "SELECT id, nombre FROM categorias_producto WHERE activo = true ORDER BY nombre",
      "requerido": false
    },
    {
      "nombre": "id_dueno",
      "label": "Dueño Vendedor",
      "tipo": "select",
      "depende_de": "id_proyecto",
      "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe JOIN entidades_relacionadas er ON er.id_persona = pe.id JOIN propiedades p ON p.id_entidad_relacionada_dueno = er.id JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = :id_proyecto AND pe.activo = true ORDER BY pe.nombre_legal",
      "requerido": false
    }
  ]',
  'cuentas_por_cobrar_unificado',
  41,
  true,
  true
);