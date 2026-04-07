
CREATE TABLE public.notificaciones_log (
  id bigint generated always as identity primary key,
  tipo_evento text not null,
  canal text not null,
  destinatarios_count int not null default 0,
  id_proyecto int references public.proyectos(id),
  nombre_desarrollo text,
  payload jsonb,
  resultado text not null default 'success',
  error_detalle text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin can read notification logs"
ON public.notificaciones_log FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Service role can insert logs"
ON public.notificaciones_log FOR INSERT
TO service_role
WITH CHECK (true);
