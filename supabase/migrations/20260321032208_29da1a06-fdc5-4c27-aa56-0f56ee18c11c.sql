-- Backfill fecha_pago_comision for already-paid comisionistas
UPDATE public.comisionistas
SET fecha_pago_comision = fecha_actualizacion
WHERE pagada = true AND fecha_pago_comision IS NULL;