UPDATE public.esquemas_pago 
SET 
  porcentaje_enganche = 30,
  porcentaje_mensualidades = 40,
  porcentaje_entrega = 30,
  fecha_actualizacion = now()
WHERE id = 720;