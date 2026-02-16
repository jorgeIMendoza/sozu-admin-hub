
-- Add url_factura_comision and es_draft_factura_comision to cuentas_cobranza
ALTER TABLE public.cuentas_cobranza 
  ADD COLUMN IF NOT EXISTS url_factura_comision TEXT,
  ADD COLUMN IF NOT EXISTS es_draft_factura_comision BOOLEAN DEFAULT true;

-- Migrate existing data from documentos table
UPDATE public.cuentas_cobranza cc
SET 
  url_factura_comision = d.url,
  es_draft_factura_comision = d.es_draft
FROM public.documentos d
WHERE cc.id_documento_factura_comision_sozu = d.id
  AND d.id_tipo_documento = 47
  AND d.activo = true;
