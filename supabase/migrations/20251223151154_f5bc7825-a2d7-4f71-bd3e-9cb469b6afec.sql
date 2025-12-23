-- Fix report ID 5: id_proyecto is in propiedades, not ofertas
UPDATE reportes
SET query_sql = 'SELECT
  cc.id AS id_cuenta,
  CASE WHEN o.id_producto IS NOT NULL THEN ''Producto'' ELSE ''Propiedad'' END AS tipo,
  proy.nombre AS proyecto,
  COALESCE(em.nombre, '''') AS edificio,
  COALESCE(mod.nombre, '''') AS modelo,
  COALESCE(prop.numero, '''') AS numero_propiedad,
  COALESCE(prod.nombre, '''') AS nombre_producto,
  per.nombre_legal AS comprador,
  dueno_persona.nombre_legal AS dueno,
  cc.precio_final,
  cc.fecha_compra,
  cc.clabe_stp,
  COALESCE(SUM(ap.monto), 0) AS total_acuerdos,
  COALESCE(pagado.total_pagado, 0) AS total_pagado,
  COALESCE(SUM(ap.monto), 0) - COALESCE(pagado.total_pagado, 0) AS saldo_pendiente
FROM cuentas_cobranza cc
JOIN ofertas o ON cc.id_oferta = o.id
JOIN personas per ON o.id_persona_lead = per.id
LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
LEFT JOIN productos_servicios prod ON o.id_producto = prod.id
LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
LEFT JOIN modelos mod ON prop.id_modelo = mod.id
LEFT JOIN entidades_proyectos ep ON prop.id_entidad_relacionada_dueno = ep.id
LEFT JOIN proyectos proy ON COALESCE(ep.id_proyecto, prod.id_proyecto) = proy.id
LEFT JOIN personas dueno_persona ON ep.id_persona = dueno_persona.id
LEFT JOIN acuerdos_pago ap ON ap.id_cuenta_cobranza = cc.id AND ap.activo = true
LEFT JOIN (
  SELECT p.id_cuenta_cobranza, SUM(p.monto) AS total_pagado
  FROM pagos p
  WHERE p.activo = true
  GROUP BY p.id_cuenta_cobranza
) pagado ON pagado.id_cuenta_cobranza = cc.id
WHERE cc.activo = true
  AND cc.es_mantenimiento = false
  {{AND proy.id = :id_proyecto}}
  {{AND ep.id_persona = :id_dueno}}
GROUP BY cc.id, o.id_producto, proy.nombre, em.nombre, mod.nombre, prop.numero, prod.nombre, per.nombre_legal, dueno_persona.nombre_legal, cc.precio_final, cc.fecha_compra, cc.clabe_stp, pagado.total_pagado
ORDER BY proy.nombre, em.nombre, prop.numero'
WHERE id = 5;