-- Update report 7 "Completamente liquidados" with proper filters, columns, and type support
UPDATE reportes 
SET 
  query_sql = 'SELECT
    pr.nombre AS proyecto,
    COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno,
    COALESCE((
      SELECT string_agg(p_comp.nombre_legal, '','' ORDER BY p_comp.nombre_legal)
      FROM compradores c
      JOIN personas p_comp ON c.id_persona = p_comp.id
      WHERE c.id_cuenta_cobranza = cc.id AND c.activo = true
    ), ''Sin comprador'') AS compradores,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN p.numero_propiedad 
      ELSE NULL 
    END AS numero_departamento,
    ''CC-'' || LPAD(cc.id::text, 6, ''0'') AS numero_cuenta,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN ''Propiedad''
      ELSE ''Producto''
    END AS tipo,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN ed.nombre 
      ELSE NULL 
    END AS estatus_propiedad,
    cc.fecha_compra AS fecha_compra,
    cc.precio_final AS monto_total_a_pagar,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
        AND aplp.activo = true
    ), 0) AS monto_total_pagado
  FROM cuentas_cobranza cc
  JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades p ON o.id_propiedad = p.id
  LEFT JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN estatus_disponibilidad ed ON p.id_estatus_disponibilidad = ed.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr ON (
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN e.id_proyecto 
      ELSE ps.id_proyecto 
    END = pr.id
  )
  LEFT JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas dueno ON er.id_persona = dueno.id
  WHERE cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND (
      (o.id_propiedad IS NOT NULL AND p.id_estatus_disponibilidad = 5) -- Vendida for propiedades
      OR (o.id_producto IS NOT NULL) -- Products
    )
    AND cc.precio_final <= COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id
        AND ap.activo = true
        AND aplp.activo = true
    ), 0)
    {{AND pr.id = :id_proyecto}}
    {{AND CASE WHEN o.id_propiedad IS NOT NULL THEN ''Propiedad'' ELSE ''Producto'' END = :tipo}}
  ORDER BY pr.nombre, p.numero_propiedad',
  filtros_configuracion = '[
    {
      "nombre": "id_proyecto",
      "label": "Proyecto",
      "tipo": "select",
      "tabla": "proyectos",
      "campo_valor": "id",
      "campo_label": "nombre"
    },
    {
      "nombre": "tipo",
      "label": "Tipo",
      "tipo": "select",
      "opciones_estaticas": [
        {"id": "Propiedad", "nombre": "Propiedad"},
        {"id": "Producto", "nombre": "Producto"}
      ]
    }
  ]'::jsonb
WHERE id = 7;