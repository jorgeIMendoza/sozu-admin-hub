-- Add missing columns to proyectos table
ALTER TABLE public.proyectos 
ADD COLUMN IF NOT EXISTS precio_m2 NUMERIC,
ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
ADD COLUMN IF NOT EXISTS numero_edificios INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS numero_amenidades INTEGER DEFAULT 0;