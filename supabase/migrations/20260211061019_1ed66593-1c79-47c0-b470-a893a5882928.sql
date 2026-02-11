
-- Tabla avisos
CREATE TABLE public.avisos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  asunto text NOT NULL,
  mensaje_html text NOT NULL,
  tipo_envio text NOT NULL DEFAULT 'manual',
  cron_expression text,
  activo boolean DEFAULT true NOT NULL,
  fecha_creacion timestamptz DEFAULT now() NOT NULL,
  fecha_actualizacion timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read avisos"
  ON public.avisos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert avisos"
  ON public.avisos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update avisos"
  ON public.avisos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete avisos"
  ON public.avisos FOR DELETE TO authenticated USING (true);

-- Trigger para fecha_actualizacion
CREATE TRIGGER update_avisos_updated_at
  BEFORE UPDATE ON public.avisos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabla avisos_roles_destinatarios
CREATE TABLE public.avisos_roles_destinatarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aviso_id integer NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  rol_id integer NOT NULL REFERENCES public.roles(id),
  UNIQUE(aviso_id, rol_id)
);

ALTER TABLE public.avisos_roles_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read avisos_roles_destinatarios"
  ON public.avisos_roles_destinatarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert avisos_roles_destinatarios"
  ON public.avisos_roles_destinatarios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update avisos_roles_destinatarios"
  ON public.avisos_roles_destinatarios FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete avisos_roles_destinatarios"
  ON public.avisos_roles_destinatarios FOR DELETE TO authenticated USING (true);

-- Tabla avisos_ejecuciones
CREATE TABLE public.avisos_ejecuciones (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aviso_id integer NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  fecha_ejecucion timestamptz DEFAULT now() NOT NULL,
  tipo_trigger text NOT NULL,
  total_destinatarios integer DEFAULT 0,
  total_enviados integer DEFAULT 0,
  total_errores integer DEFAULT 0,
  estado text DEFAULT 'pendiente' NOT NULL,
  detalle_error text,
  ejecutado_por uuid
);

ALTER TABLE public.avisos_ejecuciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read avisos_ejecuciones"
  ON public.avisos_ejecuciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert avisos_ejecuciones"
  ON public.avisos_ejecuciones FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update avisos_ejecuciones"
  ON public.avisos_ejecuciones FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Service role can manage avisos_ejecuciones"
  ON public.avisos_ejecuciones FOR ALL TO service_role USING (true);
