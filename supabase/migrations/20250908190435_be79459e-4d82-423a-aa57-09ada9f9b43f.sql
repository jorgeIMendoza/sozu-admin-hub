-- Create tipos_uso table for project usage types
CREATE TABLE public.tipos_uso (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert the usage types from the image
INSERT INTO public.tipos_uso (nombre) VALUES 
('Residencial'),
('Comercial'),
('Mixto'),
('Industrial'),
('Turístico'),
('Oficinas'),
('Retail'),
('Hotelero');

-- Enable RLS
ALTER TABLE public.tipos_uso ENABLE ROW LEVEL SECURITY;

-- Create policies for tipos_uso
CREATE POLICY "Anyone can view tipos_uso" 
ON public.tipos_uso 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert tipos_uso" 
ON public.tipos_uso 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update tipos_uso" 
ON public.tipos_uso 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Add tipo_uso_id to proyectos table
ALTER TABLE public.proyectos 
ADD COLUMN IF NOT EXISTS id_tipo_uso INTEGER REFERENCES public.tipos_uso(id);

-- Add other missing fields that appear in the card design
ALTER TABLE public.proyectos 
ADD COLUMN IF NOT EXISTS precio_m2 NUMERIC,
ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
ADD COLUMN IF NOT EXISTS numero_edificios INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS numero_amenidades INTEGER DEFAULT 0;