-- 1. Fix masivo de datos: resetear pago_completado donde las aplicaciones no-multa no cubren el monto
UPDATE public.acuerdos_pago ap
SET pago_completado = false
WHERE ap.activo = true
  AND ap.pago_completado = true
  AND ap.monto - 0.01 > (
    SELECT COALESCE(SUM(apl.monto), 0)
    FROM public.aplicaciones_pago apl
    WHERE apl.id_acuerdo_pago = ap.id
      AND apl.activo = true
      AND apl.es_multa = false
  );

-- 2. RPC reutilizable para recalcular pago_completado de acuerdos
CREATE OR REPLACE FUNCTION public.recalcular_pago_completado_acuerdos(
  p_id_cuenta_cobranza integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_actualizados integer := 0;
BEGIN
  WITH totales AS (
    SELECT
      ap.id AS id_acuerdo,
      ap.monto AS monto_requerido,
      ap.pago_completado AS flag_actual,
      COALESCE((
        SELECT SUM(apl.monto)
        FROM public.aplicaciones_pago apl
        WHERE apl.id_acuerdo_pago = ap.id
          AND apl.activo = true
          AND apl.es_multa = false
      ), 0) AS total_aplicado
    FROM public.acuerdos_pago ap
    WHERE ap.activo = true
      AND (p_id_cuenta_cobranza IS NULL OR ap.id_cuenta_cobranza = p_id_cuenta_cobranza)
  ),
  cambios AS (
    UPDATE public.acuerdos_pago ap
    SET pago_completado = (t.total_aplicado >= t.monto_requerido - 0.01)
    FROM totales t
    WHERE ap.id = t.id_acuerdo
      AND ap.pago_completado IS DISTINCT FROM (t.total_aplicado >= t.monto_requerido - 0.01)
    RETURNING 1
  )
  SELECT COUNT(*) INTO n_actualizados FROM cambios;

  RETURN n_actualizados;
END;
$$;