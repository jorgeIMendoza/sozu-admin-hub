
-- 1. Add configurar_citas boolean to roles table
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS configurar_citas boolean NOT NULL DEFAULT false;

-- 2. Create table for per-user day/slot availability configuration
CREATE TABLE public.configuracion_citas_horarios (
  id SERIAL PRIMARY KEY,
  id_usuario_email TEXT NOT NULL,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 6), -- 1=Lunes, 6=Sábado
  hora INTEGER NOT NULL CHECK (hora BETWEEN 9 AND 20), -- 9=9:00, 20=20:00
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(id_usuario_email, dia_semana, hora)
);

-- Enable RLS
ALTER TABLE public.configuracion_citas_horarios ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins can manage all configs"
ON public.configuracion_citas_horarios
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid()
    AND r.nombre = 'Super Administrador'
  )
);

CREATE POLICY "Users can manage own configs"
ON public.configuracion_citas_horarios
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
    AND u.email = id_usuario_email
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_configuracion_citas_horarios_updated_at
BEFORE UPDATE ON public.configuracion_citas_horarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
