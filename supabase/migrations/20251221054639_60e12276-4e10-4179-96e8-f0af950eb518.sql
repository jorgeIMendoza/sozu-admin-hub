UPDATE reportes 
SET query_sql = '
  SELECT 
    pr.nombre AS proyecto,
    COALESCE(dueno.nombre_legal, ''Sin dueño'') AS dueno,
    p.numero_propiedad AS numero_departamento,
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
    {{AND pr.id = :id_proyecto}}
    {{AND er.id_persona = :id_dueno}}
  ORDER BY pr.nombre, p.numero_propiedad
',
fecha_actualizacion = NOW()
WHERE id = 1