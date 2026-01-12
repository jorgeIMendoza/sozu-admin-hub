-- Función RPC para calcular totales de comisionistas (sin límite de 1000 registros)
CREATE OR REPLACE FUNCTION get_totales_comisionistas()
RETURNS TABLE (
  monto_total NUMERIC,
  monto_dispersado NUMERIC,
  monto_pendiente NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(cc.precio_final * c.porcentaje_comision / 100), 0) as monto_total,
    COALESCE(SUM(CASE WHEN c.pagada = true THEN cc.precio_final * c.porcentaje_comision / 100 ELSE 0 END), 0) as monto_dispersado,
    COALESCE(SUM(CASE WHEN c.pagada = false OR c.pagada IS NULL THEN cc.precio_final * c.porcentaje_comision / 100 ELSE 0 END), 0) as monto_pendiente
  FROM comisionistas c
  INNER JOIN cuentas_cobranza cc ON cc.id = c.id_cuenta_cobranza
  WHERE c.activo = true AND c.aprobada = true;
END;
$$;