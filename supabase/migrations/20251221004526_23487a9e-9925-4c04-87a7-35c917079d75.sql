-- Actualizar reporte de propiedades (excluir productos)
UPDATE reportes 
SET query_sql = '
  SELECT 
    pr.nombre AS proyecto,
    p.numero_propiedad AS numero_departamento,
    COALESCE(comprador.nombre_legal, ''Sin comprador'') AS comprador,
    COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno_vendedor,
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
  LEFT JOIN compradores comp ON comp.id_cuenta_cobranza = cc.id AND comp.activo = true
  LEFT JOIN personas comprador ON comp.id_persona = comprador.id
  LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas dueno ON er.id_persona = dueno.id
  WHERE cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_propiedad IS NOT NULL
    AND o.id_producto IS NULL
    {{AND pr.id = :id_proyecto}}
    {{AND er.id_persona = :id_dueno}}
  ORDER BY pr.nombre, p.numero_propiedad
',
filtros_configuracion = '[
  {
    "nombre": "id_proyecto",
    "label": "Proyecto",
    "tipo": "select",
    "requerido": false,
    "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr JOIN edificios e ON e.id_proyecto = pr.id JOIN edificios_modelos em ON em.id_edificio = e.id JOIN propiedades p ON p.id_edificio_modelo = em.id JOIN ofertas o ON o.id_propiedad = p.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE cc.activo = true AND cc.id_tipo_cancelacion IS NULL AND o.id_producto IS NULL ORDER BY pr.nombre"
  },
  {
    "nombre": "id_dueno",
    "label": "Dueño Vendedor",
    "tipo": "select",
    "requerido": false,
    "depende_de": "id_proyecto",
    "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe JOIN entidades_relacionadas er ON er.id_persona = pe.id JOIN propiedades p ON p.id_entidad_relacionada_dueno = er.id JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = :id_proyecto AND pe.activo = true ORDER BY pe.nombre_legal"
  }
]'::jsonb
WHERE id = 1;

-- Crear nuevo reporte para productos
INSERT INTO reportes (nombre, descripcion, query_sql, nombre_archivo, filtros_configuracion, id_submenu, activo)
VALUES (
  'Cuentas por cobrar - Productos',
  'Reporte de cuentas por cobrar de productos (estacionamientos, bodegas, etc.)',
  '
  SELECT 
    pr.nombre AS proyecto,
    ps.nombre AS producto,
    cp.nombre AS categoria,
    COALESCE(comprador.nombre_legal, ''Sin comprador'') AS comprador,
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
  JOIN productos_servicios ps ON o.id_producto = ps.id
  JOIN categorias_producto cp ON ps.id_categoria = cp.id
  LEFT JOIN propiedades p ON ps.id_propiedad = p.id
  LEFT JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos pr ON e.id_proyecto = pr.id
  LEFT JOIN compradores comp ON comp.id_cuenta_cobranza = cc.id AND comp.activo = true
  LEFT JOIN personas comprador ON comp.id_persona = comprador.id
  WHERE cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_producto IS NOT NULL
    {{AND pr.id = :id_proyecto}}
    {{AND cp.id = :id_categoria}}
  ORDER BY pr.nombre, cp.nombre, ps.nombre
',
  'cuentas_cobrar_productos',
  '[
    {
      "nombre": "id_proyecto",
      "label": "Proyecto",
      "tipo": "select",
      "requerido": false,
      "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr JOIN edificios e ON e.id_proyecto = pr.id JOIN edificios_modelos em ON em.id_edificio = e.id JOIN propiedades p ON p.id_edificio_modelo = em.id JOIN productos_servicios ps ON ps.id_propiedad = p.id JOIN ofertas o ON o.id_producto = ps.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE cc.activo = true AND cc.id_tipo_cancelacion IS NULL ORDER BY pr.nombre"
    },
    {
      "nombre": "id_categoria",
      "label": "Categoría Producto",
      "tipo": "select",
      "requerido": false,
      "query_opciones": "SELECT DISTINCT cp.id, cp.nombre FROM categorias_producto cp JOIN productos_servicios ps ON ps.id_categoria = cp.id JOIN ofertas o ON o.id_producto = ps.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE cc.activo = true AND cc.id_tipo_cancelacion IS NULL ORDER BY cp.nombre"
    }
  ]'::jsonb,
  (SELECT id_submenu FROM reportes WHERE id = 1),
  true
);