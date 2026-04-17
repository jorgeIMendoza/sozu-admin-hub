INSERT INTO public.documentos (id_persona, id_tipo_documento, url, activo, id_estatus_verificacion)
SELECT DISTINCT ON (fd.referencia_id)
  fd.referencia_id,
  48,
  CASE
    WHEN fd.pdf_firmado_url ~* '^(https?|/)' THEN fd.pdf_firmado_url
    ELSE '/' || fd.pdf_firmado_url
  END,
  true,
  2
FROM public.firmas_digitales fd
WHERE fd.tipo_documento = 'carta_acuerdos'
  AND fd.estado = 'completado'
  AND fd.referencia_id IS NOT NULL
  AND fd.pdf_firmado_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id_persona = fd.referencia_id
      AND d.id_tipo_documento = 48
      AND d.activo = true
  )
ORDER BY fd.referencia_id, fd.created_at DESC;