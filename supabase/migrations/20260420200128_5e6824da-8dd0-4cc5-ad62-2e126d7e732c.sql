ALTER TABLE public.avisos
  ADD COLUMN IF NOT EXISTS payload_postmark jsonb;

ALTER TABLE public.avisos_envios_evento
  ADD COLUMN IF NOT EXISTS payload_enviado jsonb;