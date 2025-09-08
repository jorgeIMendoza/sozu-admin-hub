-- Add the foreign key relationship between proyectos and tipos_uso
ALTER TABLE public.proyectos 
ADD COLUMN IF NOT EXISTS id_tipo_uso INTEGER REFERENCES public.tipos_uso(id);