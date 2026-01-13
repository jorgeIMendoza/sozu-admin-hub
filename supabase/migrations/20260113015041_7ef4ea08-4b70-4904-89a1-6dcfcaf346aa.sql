
-- Soft delete duplicate January 2026 maintenance payment agreements
-- 301 accounts have duplicates created on 2026-01-12 19:46:37
-- This marks the duplicate (higher ID) as inactive

UPDATE acuerdos_pago
SET activo = false,
    fecha_actualizacion = NOW()
WHERE id IN (
  SELECT (array_agg(id ORDER BY id DESC))[1] as id_a_eliminar
  FROM acuerdos_pago
  WHERE 
    EXTRACT(MONTH FROM fecha_pago) = 1 
    AND EXTRACT(YEAR FROM fecha_pago) = 2026
    AND activo = true
  GROUP BY id_cuenta_cobranza, fecha_pago
  HAVING COUNT(*) > 1
);
