-- Create Multimedias_proyecto table for project multimedia
CREATE TABLE IF NOT EXISTS public.multimedias_proyecto (
  id SERIAL PRIMARY KEY,
  id_proyecto INTEGER NOT NULL,
  es_imagen BOOLEAN NOT NULL DEFAULT true,
  url TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_multimedias_proyecto_proyecto'
    ) THEN
        ALTER TABLE public.multimedias_proyecto 
          ADD CONSTRAINT fk_multimedias_proyecto_proyecto 
          FOREIGN KEY (id_proyecto) REFERENCES public.proyectos(id);
    END IF;
END$$;

-- Add trigger for updated_at timestamps only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_multimedias_proyecto_updated_at'
    ) THEN
        CREATE TRIGGER update_multimedias_proyecto_updated_at
          BEFORE UPDATE ON public.multimedias_proyecto
          FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END$$;