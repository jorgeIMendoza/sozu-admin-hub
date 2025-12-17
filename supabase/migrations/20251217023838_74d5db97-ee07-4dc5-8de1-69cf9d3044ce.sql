-- Add column for commercial representative in personas table
ALTER TABLE public.personas 
ADD COLUMN IF NOT EXISTS id_entidad_relacionada_rep_com integer REFERENCES public.entidades_relacionadas(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_personas_rep_comercial 
ON public.personas(id_entidad_relacionada_rep_com) 
WHERE id_entidad_relacionada_rep_com IS NOT NULL;