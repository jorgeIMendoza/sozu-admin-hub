-- First, clean up duplicate records before adding unique constraint
-- Keep only the most recently updated record for each (usuario_id, proyecto_id) pair

-- Step 1: Add a temporary ID column if it doesn't exist to identify rows
-- Since the table has no primary key, we'll use ctid (PostgreSQL internal row id)

-- Delete duplicates keeping only one record per (usuario_id, proyecto_id)
DELETE FROM public.proyectos_acceso a
USING public.proyectos_acceso b
WHERE a.ctid < b.ctid
  AND a.usuario_id = b.usuario_id
  AND a.proyecto_id = b.proyecto_id;

-- Now add the unique constraint
ALTER TABLE public.proyectos_acceso 
ADD CONSTRAINT proyectos_acceso_usuario_proyecto_key 
UNIQUE (usuario_id, proyecto_id);