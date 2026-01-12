-- Función RPC para calcular los totales de comisiones SOZU de forma precisa
CREATE OR REPLACE FUNCTION get_totales_comisiones_sozu()
RETURNS TABLE (
  monto_total_sozu NUMERIC,
  monto_ya_cobrado NUMERIC,
  monto_por_cobrar NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(cc.precio_final * cc.porcentaje_comision_venta / 100), 0) as monto_total_sozu,
    COALESCE(SUM(CASE WHEN cc.es_pagada_comision_venta = true THEN cc.precio_final * cc.porcentaje_comision_venta / 100 ELSE 0 END), 0) as monto_ya_cobrado,
    COALESCE(SUM(CASE WHEN cc.es_pagada_comision_venta = false OR cc.es_pagada_comision_venta IS NULL THEN cc.precio_final * cc.porcentaje_comision_venta / 100 ELSE 0 END), 0) as monto_por_cobrar
  FROM cuentas_cobranza cc
  WHERE cc.activo = true AND cc.porcentaje_comision_venta > 0;
END;
$$;