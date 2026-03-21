ALTER TABLE public.comisionistas
ADD COLUMN IF NOT EXISTS fecha_pago_comision timestamp with time zone;

COMMENT ON COLUMN public.comisionistas.fecha_pago_comision IS 'Fecha real en que se registró el pago de la comisión al comisionista/inmobiliaria externa.';