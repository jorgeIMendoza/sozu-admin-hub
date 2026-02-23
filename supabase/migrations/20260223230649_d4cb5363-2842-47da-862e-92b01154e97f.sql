
-- 1. Add new columns to configuracion_citas_usuarios
ALTER TABLE public.configuracion_citas_usuarios
  ADD COLUMN IF NOT EXISTS nombre TEXT,
  ADD COLUMN IF NOT EXISTS max_invitados INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS correos_enterado TEXT[] DEFAULT '{}';

-- 2. Migrate existing data: set nombre = tipo_cita name
UPDATE public.configuracion_citas_usuarios u
  SET nombre = (SELECT t.nombre FROM public.tipos_cita t WHERE t.id = u.id_tipo_cita)
  WHERE nombre IS NULL;

-- 3. Make nombre NOT NULL after migration
ALTER TABLE public.configuracion_citas_usuarios
  ALTER COLUMN nombre SET NOT NULL;

-- 4. Drop old unique constraint using ALTER TABLE and create new one
ALTER TABLE public.configuracion_citas_usuarios
  DROP CONSTRAINT IF EXISTS configuracion_citas_usuarios_id_usuario_email_id_tipo_cita_key;
ALTER TABLE public.configuracion_citas_usuarios
  ADD CONSTRAINT configuracion_citas_usuarios_email_tipo_nombre_key
  UNIQUE(id_usuario_email, id_tipo_cita, nombre);

-- 5. Create join table for projects
CREATE TABLE IF NOT EXISTS public.configuracion_citas_proyectos (
  id SERIAL PRIMARY KEY,
  id_configuracion_cita INTEGER NOT NULL REFERENCES public.configuracion_citas_usuarios(id) ON DELETE CASCADE,
  id_proyecto INTEGER NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  UNIQUE(id_configuracion_cita, id_proyecto)
);

-- 6. Enable RLS on new table
ALTER TABLE public.configuracion_citas_proyectos ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies
CREATE POLICY "Authenticated users can view configuracion_citas_proyectos"
  ON public.configuracion_citas_proyectos FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert configuracion_citas_proyectos"
  ON public.configuracion_citas_proyectos FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update configuracion_citas_proyectos"
  ON public.configuracion_citas_proyectos FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete configuracion_citas_proyectos"
  ON public.configuracion_citas_proyectos FOR DELETE USING (true);

-- 8. Add id_configuracion_cita to horarios
ALTER TABLE public.configuracion_citas_horarios
  ADD COLUMN IF NOT EXISTS id_configuracion_cita INTEGER REFERENCES public.configuracion_citas_usuarios(id) ON DELETE CASCADE;

-- 9. Migrate existing horarios
UPDATE public.configuracion_citas_horarios h
  SET id_configuracion_cita = (
    SELECT u.id FROM public.configuracion_citas_usuarios u
    WHERE u.id_usuario_email = h.id_usuario_email AND u.id_tipo_cita = h.id_tipo_cita
    LIMIT 1
  )
  WHERE id_configuracion_cita IS NULL;
