
-- Crear tabla de catálogo de estatus de cita
CREATE TABLE public.estatus_cita (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar los 3 estatus
INSERT INTO public.estatus_cita (id, nombre) VALUES
  (1, 'Agendada'),
  (2, 'Pendiente de confirmación'),
  (3, 'Confirmada');

-- Habilitar RLS
ALTER TABLE public.estatus_cita ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (es catálogo)
CREATE POLICY "Estatus cita visible para todos" ON public.estatus_cita
  FOR SELECT USING (true);

-- Agregar columna id_estatus_cita a reservas_citas
ALTER TABLE public.reservas_citas
  ADD COLUMN id_estatus_cita INTEGER REFERENCES public.estatus_cita(id);

-- Poblar valores iniciales basados en estatus existente
UPDATE public.reservas_citas SET id_estatus_cita = 1 WHERE estatus = 'programada';
UPDATE public.reservas_citas SET id_estatus_cita = 3 WHERE estatus = 'asistio';

-- Agregar columna fecha_asistencia para cuando el agente reporta "Ya acudí"
ALTER TABLE public.reservas_citas
  ADD COLUMN fecha_asistencia DATE;
