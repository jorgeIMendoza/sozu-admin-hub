-- Marcar todas las comisiones como aprobadas
UPDATE public.comisionistas SET aprobada = true WHERE aprobada = false OR aprobada IS NULL;