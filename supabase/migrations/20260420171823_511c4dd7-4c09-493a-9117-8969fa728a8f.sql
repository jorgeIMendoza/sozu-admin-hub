-- Fix search_path
CREATE OR REPLACE FUNCTION public.tg_set_aviso_evento_updated()
RETURNS TRIGGER LANGUAGE plpgsql 
SET search_path = public
AS $$
BEGIN
  NEW.fecha_actualizacion = now();
  RETURN NEW;
END;
$$;

-- Restringir política permisiva de INSERT a service role
DROP POLICY IF EXISTS "Service role inserts envios" ON public.avisos_envios_evento;

CREATE POLICY "Service role inserts envios"
ON public.avisos_envios_evento FOR INSERT
TO service_role
WITH CHECK (true);