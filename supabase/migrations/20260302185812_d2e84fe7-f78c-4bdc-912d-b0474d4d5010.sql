-- Invalidate cached PDFs for offers that were generated without id_esquema_pago_seleccionado
-- These offers have scheme 955 selected but the PDF was generated without it
UPDATE public.ofertas 
SET url = NULL 
WHERE id IN (1919, 1920, 1921, 1922);