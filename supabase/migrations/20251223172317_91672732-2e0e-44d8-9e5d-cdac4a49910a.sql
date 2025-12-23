-- Insert the new report "Solo resta pagos a contraentrega"
INSERT INTO reportes (
  nombre,
  descripcion,
  query_sql,
  filtros_configuracion,
  nombre_archivo,
  id_submenu,
  prendido,
  activo
) VALUES (
  'Solo resta pagos a contraentrega',
  'Cuentas de cobranza de propiedades donde el único pago pendiente es el pago a contraentrega. Todos los demás conceptos han sido pagados completamente.',
  'SELECT 
    pr.nombre AS proyecto,
    COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno,
    COALESCE((
      SELECT string_agg(p_comp.nombre_legal, '', '' ORDER BY p_comp.nombre_legal)
      FROM compradores c
      JOIN personas p_comp ON c.id_persona = p_comp.id
      WHERE c.id_cuenta_cobranza = cc.id AND c.activo = true
    ), ''Sin comprador'') AS compradores,
    p.numero_propiedad AS numero_departamento,
    ''CC-'' || LPAD(cc.id::text, 6, ''0'') AS numero_cuenta,
    cc.id AS id_cuenta_cobranza,
    cc.fecha_compra,
    (
      SELECT ap.fecha_pago
      FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND ap.id_concepto = 3
      ORDER BY ap.orden DESC
      LIMIT 1
    ) AS fecha_pago_contraentrega,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND aplp.activo = true
    ), 0) AS monto_pagado_total,
    COALESCE((
      SELECT SUM(ap.monto)
      FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND ap.id_concepto = 3
    ), 0) AS monto_contraentrega,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND aplp.activo = true
        AND ap.id_concepto = 3
    ), 0) AS monto_pagado_contraentrega
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
    -- Only accounts where contraentrega (id_concepto=3) is the only pending payment
    AND EXISTS (
      SELECT 1 FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND ap.id_concepto = 3
        AND ap.pago_completado = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM acuerdos_pago ap
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND ap.id_concepto != 3
        AND ap.pago_completado = false
    )
    {{AND pr.id = :id_proyecto}}
    {{AND er.id_persona = :id_dueno}}
  ORDER BY pr.nombre, p.numero_propiedad',
  '[
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
  ]'::jsonb,
  'solo_falta_pagos_contraentrega',
  41,
  true,
  true
);

-- Get the ID of the newly created report
DO $$
DECLARE
  new_report_id INTEGER;
BEGIN
  SELECT id INTO new_report_id FROM reportes WHERE nombre = 'Solo resta pagos a contraentrega' AND activo = true ORDER BY id DESC LIMIT 1;
  
  -- Insert permissions for all roles that have access to reports (7, 12, 14, 17)
  INSERT INTO roles_reportes (rol_id, reporte_id, activo)
  VALUES 
    (7, new_report_id, true),
    (12, new_report_id, true),
    (14, new_report_id, true),
    (17, new_report_id, true)
  ON CONFLICT DO NOTHING;
END $$;