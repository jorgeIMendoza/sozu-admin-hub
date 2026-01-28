-- Update the Reporte Mensual de Pagos to use date range instead of month picker
UPDATE reportes 
SET 
  filtros_configuracion = '[
    {"nombre": "fecha_desde", "label": "Fecha Desde", "tipo": "date", "requerido": false},
    {"nombre": "fecha_hasta", "label": "Fecha Hasta", "tipo": "date", "requerido": false},
    {"nombre": "id_proyecto", "label": "Proyecto", "tipo": "select", "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr WHERE pr.activo = true AND (EXISTS (SELECT 1 FROM propiedades p JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id JOIN ofertas o ON o.id_propiedad = p.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE e.id_proyecto = pr.id AND cc.activo = true AND p.activo = true) OR EXISTS (SELECT 1 FROM productos_servicios ps JOIN ofertas o ON o.id_producto = ps.id JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE ps.id_proyecto = pr.id AND cc.activo = true AND ps.activo = true)) ORDER BY pr.nombre"},
    {"nombre": "id_dueno", "label": "Dueño/Aportante", "tipo": "select", "depende_de": "id_proyecto", "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal AS nombre FROM entidades_relacionadas er JOIN personas pe ON er.id_persona = pe.id WHERE er.activo = true AND er.id_tipo_entidad IN (4, 15) AND er.id_proyecto = :id_proyecto ORDER BY pe.nombre_legal"},
    {"nombre": "tipo", "label": "Tipo", "tipo": "select", "opciones_estaticas": [{"id": "propiedad", "nombre": "Propiedades"}, {"id": "producto", "nombre": "Productos"}]}
  ]'::jsonb,
  query_sql = 'WITH pagos_propiedades AS (
  SELECT 
    ''propiedad'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    pe_dueno.id AS id_dueno,
    pe_dueno.nombre_legal AS nombre_dueno,
    p.numero_propiedad AS numero_departamento,
    CONCAT(e.nombre, '' - '', m.nombre) AS edificio_modelo,
    NULL::text AS nombre_producto,
    pago.fecha_pago,
    pago.monto AS monto_pago,
    mp.nombre AS metodo_pago,
    pago.clave_rastreo,
    pago.descripcion AS descripcion_pago,
    (SELECT string_agg(DISTINCT cp.nombre, '', '' ORDER BY cp.nombre)
     FROM aplicaciones_pago ap
     JOIN acuerdos_pago acp ON ap.id_acuerdo_pago = acp.id
     JOIN conceptos_pago cp ON acp.id_concepto = cp.id
     WHERE ap.id_pago = pago.id AND ap.activo = true
    ) AS concepto_pago,
    cc.id AS id_cuenta_cobranza,
    ''CC-'' || LPAD(cc.id::text, 6, ''0'') AS numero_cuenta,
    cc.clabe_stp AS cuenta_clabe,
    (SELECT string_agg(pc.nombre_legal, '', '' ORDER BY pc.nombre_legal)
     FROM compradores comp
     JOIN personas pc ON comp.id_persona = pc.id
     WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) AS compradores,
    pe.nombre_legal AS comprador_principal,
    pe.rfc AS rfc_comprador,
    pe.email AS email_comprador,
    pe.direccion_fiscal_calle AS direccion_fiscal
  FROM pagos pago
  JOIN cuentas_cobranza cc ON pago.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN propiedades p ON o.id_propiedad = p.id
  JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  JOIN edificios e ON em.id_edificio = e.id
  JOIN modelos m ON em.id_modelo = m.id
  JOIN proyectos pr ON e.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er_dueno ON p.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  JOIN metodos_pago mp ON pago.id_metodos_pago = mp.id
  JOIN personas pe ON o.id_persona_lead = pe.id
  WHERE pago.activo = true
    AND cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_propiedad IS NOT NULL
    AND o.id_producto IS NULL
    {{AND pago.fecha_pago >= to_date(:fecha_desde, ''YYYY-MM-DD'')}}
    {{AND pago.fecha_pago <= to_date(:fecha_hasta, ''YYYY-MM-DD'')}}
),
pagos_productos AS (
  SELECT 
    ''producto'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    pe_dueno.id AS id_dueno,
    pe_dueno.nombre_legal AS nombre_dueno,
    ps.nombre AS numero_departamento,
    cat.nombre AS edificio_modelo,
    ps.nombre AS nombre_producto,
    pago.fecha_pago,
    pago.monto AS monto_pago,
    mp.nombre AS metodo_pago,
    pago.clave_rastreo,
    pago.descripcion AS descripcion_pago,
    (SELECT string_agg(DISTINCT cp.nombre, '', '' ORDER BY cp.nombre)
     FROM aplicaciones_pago ap
     JOIN acuerdos_pago acp ON ap.id_acuerdo_pago = acp.id
     JOIN conceptos_pago cp ON acp.id_concepto = cp.id
     WHERE ap.id_pago = pago.id AND ap.activo = true
    ) AS concepto_pago,
    cc.id AS id_cuenta_cobranza,
    ''CCP-'' || LPAD(cc.id::text, 6, ''0'') AS numero_cuenta,
    cc.clabe_stp AS cuenta_clabe,
    (SELECT string_agg(pc.nombre_legal, '', '' ORDER BY pc.nombre_legal)
     FROM compradores comp
     JOIN personas pc ON comp.id_persona = pc.id
     WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) AS compradores,
    pe.nombre_legal AS comprador_principal,
    pe.rfc AS rfc_comprador,
    pe.email AS email_comprador,
    pe.direccion_fiscal_calle AS direccion_fiscal
  FROM pagos pago
  JOIN cuentas_cobranza cc ON pago.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN productos_servicios ps ON o.id_producto = ps.id
  JOIN categorias_producto cat ON ps.id_categoria = cat.id
  JOIN proyectos pr ON ps.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er_dueno ON ps.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  JOIN metodos_pago mp ON pago.id_metodos_pago = mp.id
  JOIN personas pe ON o.id_persona_lead = pe.id
  WHERE pago.activo = true
    AND cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_producto IS NOT NULL
    AND o.id_propiedad IS NULL
    {{AND pago.fecha_pago >= to_date(:fecha_desde, ''YYYY-MM-DD'')}}
    {{AND pago.fecha_pago <= to_date(:fecha_hasta, ''YYYY-MM-DD'')}}
)
SELECT *
FROM (
  SELECT * FROM pagos_propiedades
  UNION ALL
  SELECT * FROM pagos_productos
) combined
WHERE 1=1
  {{AND id_proyecto = :id_proyecto}}
  {{AND id_dueno = :id_dueno}}
  {{AND tipo = :tipo}}
ORDER BY fecha_pago DESC, proyecto, numero_cuenta'
WHERE id = 8;