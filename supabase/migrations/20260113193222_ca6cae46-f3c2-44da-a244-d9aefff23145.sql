-- Add JSONB column for tiered monthly payments to esquemas_pago
ALTER TABLE public.esquemas_pago 
ADD COLUMN tramos_mensualidad jsonb DEFAULT NULL;

COMMENT ON COLUMN public.esquemas_pago.tramos_mensualidad IS 
'Array de tramos con estructura: [{orden, numero_mensualidades, monto}]. NULL = mensualidades uniformes';