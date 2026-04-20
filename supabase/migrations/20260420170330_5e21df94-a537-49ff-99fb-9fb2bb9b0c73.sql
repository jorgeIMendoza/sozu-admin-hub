-- 1. Catálogo de fuentes de fecha
CREATE TABLE IF NOT EXISTS public.aviso_triggers_fuentes (
  id BIGSERIAL PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.aviso_triggers_fuentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage aviso_triggers_fuentes"
ON public.aviso_triggers_fuentes FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Authenticated users read aviso_triggers_fuentes"
ON public.aviso_triggers_fuentes FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Semillas iniciales
INSERT INTO public.aviso_triggers_fuentes (clave, nombre, descripcion) VALUES
  ('acuerdo_pago_proximo', 'Acuerdo de pago próximo a vencer', 'Disparado en función de acuerdos_pago.fecha_pago donde activo=true y pago_completado=false. Usar offsets negativos (-5,-3,-1) para enviar antes del vencimiento.'),
  ('acuerdo_pago_vencido', 'Acuerdo de pago vencido', 'Disparado en función de acuerdos_pago.fecha_pago donde activo=true y pago_completado=false. Usar offsets positivos (1,3,7) para enviar después del vencimiento.')
ON CONFLICT (clave) DO NOTHING;

-- 2. Configuración de triggers por evento
CREATE TABLE IF NOT EXISTS public.avisos_triggers_evento (
  id BIGSERIAL PRIMARY KEY,
  id_aviso BIGINT NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  id_fuente BIGINT NOT NULL REFERENCES public.aviso_triggers_fuentes(id),
  offsets_dias INTEGER[] NOT NULL DEFAULT '{}',
  hora_envio TIME NOT NULL DEFAULT '10:00:00',
  canal TEXT NOT NULL DEFAULT 'email' CHECK (canal IN ('email','whatsapp','ambos')),
  filtros JSONB DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avisos_triggers_evento_aviso ON public.avisos_triggers_evento(id_aviso);
CREATE INDEX idx_avisos_triggers_evento_activo ON public.avisos_triggers_evento(activo) WHERE activo = true;

ALTER TABLE public.avisos_triggers_evento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage avisos_triggers_evento"
ON public.avisos_triggers_evento FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Authenticated users read avisos_triggers_evento"
ON public.avisos_triggers_evento FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 3. Log de envíos por evento (anti-duplicados + auditoría)
CREATE TABLE IF NOT EXISTS public.avisos_envios_evento (
  id BIGSERIAL PRIMARY KEY,
  id_aviso BIGINT NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  id_trigger BIGINT NOT NULL REFERENCES public.avisos_triggers_evento(id) ON DELETE CASCADE,
  clave_entidad TEXT NOT NULL,
  fecha_objetivo DATE NOT NULL,
  fecha_envio TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_destino TEXT,
  telefono_destino TEXT,
  canal TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'enviado',
  error TEXT,
  CONSTRAINT avisos_envios_evento_unique UNIQUE (id_trigger, clave_entidad)
);

CREATE INDEX idx_avisos_envios_evento_aviso ON public.avisos_envios_evento(id_aviso);
CREATE INDEX idx_avisos_envios_evento_fecha ON public.avisos_envios_evento(fecha_envio DESC);

ALTER TABLE public.avisos_envios_evento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage avisos_envios_evento"
ON public.avisos_envios_evento FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Authenticated users read avisos_envios_evento"
ON public.avisos_envios_evento FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role inserts envios"
ON public.avisos_envios_evento FOR INSERT
WITH CHECK (true);

-- 4. Columna modo_trigger en avisos
ALTER TABLE public.avisos
  ADD COLUMN IF NOT EXISTS modo_trigger TEXT NOT NULL DEFAULT 'cron'
  CHECK (modo_trigger IN ('cron','evento'));

-- Trigger para fecha_actualizacion
CREATE OR REPLACE FUNCTION public.tg_set_aviso_evento_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.fecha_actualizacion = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_avisos_triggers_evento_updated
BEFORE UPDATE ON public.avisos_triggers_evento
FOR EACH ROW EXECUTE FUNCTION public.tg_set_aviso_evento_updated();

CREATE TRIGGER trg_aviso_triggers_fuentes_updated
BEFORE UPDATE ON public.aviso_triggers_fuentes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_aviso_evento_updated();