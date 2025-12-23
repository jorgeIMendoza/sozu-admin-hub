-- Fix report ID 5: Exclude accounts with zero pending balance
UPDATE reportes
SET query_sql = 'SELECT
  cc.id AS numero_cuenta,
  CASE WHEN o.id_producto IS NOT NULL THEN ''Producto'' ELSE ''Propiedad'' END AS tipo,
  proy.nombre AS proyecto,
  COALESCE(edif.nombre, '''') AS edificio,
  COALESCE(mod.nombre, '''') AS modelo,
  COALESCE(prop.numero_propiedad, '''') AS numero_departamento,
  COALESCE(cp.nombre, '''') AS categoria,
  COALESCE(prod.nombre, '''') AS nombre_producto,
  per.nombre_legal AS compradores,
  dueno_persona.nombre_legal AS dueno,
  cc.precio_final,
  cc.fecha_compra,
  cc.clabe_stp,
  COALESCE(SUM(ap.monto), 0) AS monto_a_pagar,
  COALESCE(pagado.total_pagado, 0) AS monto_pagado,
  COALESCE(SUM(ap.monto), 0) - COALESCE(pagado.total_pagado, 0) AS monto_restante
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN personas per ON o.id_persona_lead = per.id
LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
LEFT JOIN productos_servicios prod ON o.id_producto = prod.id
LEFT JOIN categorias_producto cp ON prod.id_categoria = cp.id
LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
LEFT JOIN edificios edif ON em.id_edificio = edif.id
LEFT JOIN modelos mod ON em.id_modelo = mod.id
LEFT JOIN entidades_relacionadas er ON prop.id_entidad_relacionada_dueno = er.id
LEFT JOIN proyectos proy ON COALESCE(er.id_proyecto, prod.id_proyecto) = proy.id
LEFT JOIN personas dueno_persona ON er.id_persona = dueno_persona.id
LEFT JOIN acuerdos_pago ap ON ap.id_cuenta_cobranza = cc.id AND ap.activo = true
LEFT JOIN (
  SELECT p.id_cuenta_cobranza, SUM(p.monto) AS total_pagado
  FROM pagos p
  WHERE p.activo = true
  GROUP BY p.id_cuenta_cobranza
) pagado ON pagado.id_cuenta_cobranza = cc.id
WHERE cc.activo = true
  AND cc.id_cuenta_cobranza_padre IS NULL
  {{AND proy.id = :id_proyecto}}
  {{AND er.id_persona = :id_dueno}}
GROUP BY cc.id, o.id_producto, proy.nombre, edif.nombre, mod.nombre, prop.numero_propiedad, cp.nombre, prod.nombre, per.nombre_legal, dueno_persona.nombre_legal, cc.precio_final, cc.fecha_compra, cc.clabe_stp, pagado.total_pagado
HAVING (COALESCE(SUM(ap.monto), 0) - COALESCE(pagado.total_pagado, 0)) > 0
ORDER BY proy.nombre, edif.nombre, prop.numero_propiedad'
WHERE id = 5;