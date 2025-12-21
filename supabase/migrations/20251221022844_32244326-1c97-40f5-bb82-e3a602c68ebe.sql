UPDATE reportes 
SET query_sql = '
  SELECT 
    pr.nombre AS proyecto,
    cp.nombre AS categoria,
    ps.nombre AS producto,
    string_agg(DISTINCT comprador.nombre_legal, '' / '') AS compradores,
    cc.precio_final,
    COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND aplp.activo = true
    ), 0) AS pagado,
    cc.precio_final - COALESCE((
      SELECT SUM(aplp.monto)
      FROM aplicaciones_pago aplp
      JOIN acuerdos_pago ap ON aplp.id_acuerdo_pago = ap.id
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true
        AND aplp.activo = true
    ), 0) AS restante
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
    {{AND pr.id = :id_proyecto}}
    {{AND cp.id = :id_categoria}}
  GROUP BY cc.id, pr.nombre, cp.nombre, ps.nombre, cc.precio_final
  ORDER BY pr.nombre, cp.nombre, ps.nombre
',
fecha_actualizacion = NOW()
WHERE id = 2