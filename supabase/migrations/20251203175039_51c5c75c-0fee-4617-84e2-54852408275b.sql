-- Actualizar 217 propiedades de Margot a estatus "Pagado completamente" (id=9)
-- SOLO considerando cuentas de PROPIEDAD (id_producto IS NULL) completamente pagadas
UPDATE propiedades
SET id_estatus_disponibilidad = 9,
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT DISTINCT p.id
  FROM propiedades p
  JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
  JOIN ofertas o ON o.id_propiedad = p.id AND o.id_producto IS NULL
  JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
  LEFT JOIN pagos pg ON pg.id_cuenta_cobranza = cc.id AND pg.activo = true
  WHERE p.activo = true
    AND cc.activo = true
    AND o.activo = true
    AND p.id_estatus_disponibilidad != 9
    AND cc.precio_final > 0
  GROUP BY p.id, cc.id, cc.precio_final
  HAVING COALESCE(SUM(pg.monto), 0) >= cc.precio_final
)