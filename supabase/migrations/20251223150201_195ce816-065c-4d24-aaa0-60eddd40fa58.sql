-- Fix query_sql for report ID 5:
-- 1. Remove entity type 17 (only keep 4 and 15)
-- 2. Get owner from property's id_entidad_relacionada_dueno instead of project-level subquery
UPDATE reportes
SET query_sql = 'WITH cuentas_con_montos AS (
    SELECT 
      cc.id AS id_cuenta,
      pr.id AS id_proyecto,
      pr.nombre AS proyecto,
      CASE 
        WHEN prop.id IS NOT NULL THEN (
          SELECT pe.nombre_legal 
          FROM entidades_relacionadas er 
          JOIN personas pe ON pe.id = er.id_persona 
          WHERE er.id = prop.id_entidad_relacionada_dueno 
          AND er.activo = true
        )
        ELSE (
          SELECT pe.nombre_legal 
          FROM entidades_relacionadas er 
          JOIN personas pe ON pe.id = er.id_persona 
          WHERE er.id_proyecto = pr.id 
          AND er.id_tipo_entidad IN (4, 15) 
          AND er.activo = true 
          LIMIT 1
        )
      END AS dueno,
      CASE 
        WHEN prop.id IS NOT NULL THEN (
          SELECT er.id_persona
          FROM entidades_relacionadas er 
          WHERE er.id = prop.id_entidad_relacionada_dueno 
          AND er.activo = true
        )
        ELSE (
          SELECT er.id_persona
          FROM entidades_relacionadas er 
          WHERE er.id_proyecto = pr.id 
          AND er.id_tipo_entidad IN (4, 15) 
          AND er.activo = true 
          LIMIT 1
        )
      END AS id_persona_dueno,
      STRING_AGG(DISTINCT pc.nombre_legal, '', '') AS compradores,
      COALESCE(prop.numero_propiedad, '''') AS numero_departamento,
      CASE 
        WHEN cc.id_cuenta_cobranza_padre IS NOT NULL THEN ''CCM-'' || LPAD(cc.id::text, 6, ''0'')
        WHEN o.id_producto IS NOT NULL THEN ''CCP-'' || LPAD(cc.id::text, 6, ''0'')
        ELSE ''CC-'' || LPAD(cc.id::text, 6, ''0'')
      END AS numero_cuenta,
      CASE 
        WHEN prop.id IS NOT NULL THEN ''Propiedad''
        ELSE ''Producto''
      END AS tipo,
      COALESCE(cp.nombre, ''N/A'') AS categoria,
      COALESCE(ps.nombre, ''N/A'') AS nombre_producto,
      COALESCE(
        (SELECT SUM(ap.monto) FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true AND (ap.fecha_pago IS NULL OR ap.fecha_pago <= CURRENT_DATE)),
        0
      ) AS monto_a_pagar,
      COALESCE(
        (SELECT SUM(aplp.monto) FROM aplicaciones_pago aplp JOIN pagos p ON p.id = aplp.id_pago WHERE aplp.id_acuerdo_pago IN (SELECT id FROM acuerdos_pago WHERE id_cuenta_cobranza = cc.id AND activo = true) AND aplp.activo = true AND p.activo = true),
        0
      ) AS monto_pagado
    FROM cuentas_cobranza cc
    JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
    LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
    LEFT JOIN edificios ed ON ed.id = em.id_edificio
    LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
    LEFT JOIN categorias_producto cp ON cp.id = ps.id_categoria
    LEFT JOIN proyectos pr ON pr.id = COALESCE(ed.id_proyecto, ps.id_proyecto)
    LEFT JOIN compradores comp ON comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    LEFT JOIN personas pc ON pc.id = comp.id_persona
    WHERE cc.activo = true 
      AND cc.id_tipo_cancelacion IS NULL
      AND pr.id IS NOT NULL
      {{AND pr.id = :id_proyecto}}
      {{AND EXISTS (SELECT 1 FROM entidades_relacionadas er WHERE er.id = prop.id_entidad_relacionada_dueno AND er.activo = true AND er.id_persona = :id_dueno)}}
    GROUP BY cc.id, pr.id, pr.nombre, prop.id, prop.numero_propiedad, cp.nombre, ps.nombre, o.id_producto, cc.id_cuenta_cobranza_padre
  )
  SELECT 
    proyecto,
    dueno,
    compradores,
    numero_departamento,
    numero_cuenta,
    tipo,
    categoria,
    nombre_producto,
    monto_a_pagar,
    monto_pagado,
    monto_a_pagar - monto_pagado AS monto_restante
  FROM cuentas_con_montos
  WHERE monto_a_pagar > monto_pagado
    {{AND tipo = :tipo}}
  ORDER BY proyecto, numero_cuenta',
filtros_configuracion = '[
  {
    "nombre": "id_proyecto",
    "label": "Proyecto",
    "tipo": "select",
    "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr INNER JOIN edificios ed ON ed.id_proyecto = pr.id INNER JOIN edificios_modelos em ON em.id_edificio = ed.id INNER JOIN propiedades prop ON prop.id_edificio_modelo = em.id INNER JOIN ofertas o ON o.id_propiedad = prop.id INNER JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE pr.activo = true AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL UNION SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr INNER JOIN productos_servicios ps ON ps.id_proyecto = pr.id INNER JOIN ofertas o ON o.id_producto = ps.id INNER JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE pr.activo = true AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL ORDER BY nombre"
  },
  {
    "nombre": "id_dueno",
    "label": "Dueño",
    "tipo": "select",
    "depende_de": "id_proyecto",
    "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe INNER JOIN entidades_relacionadas er ON er.id_persona = pe.id WHERE er.id_tipo_entidad IN (4, 15) AND er.activo = true AND pe.activo = true AND er.id_proyecto = :id_proyecto ORDER BY pe.nombre_legal"
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
WHERE id = 5;