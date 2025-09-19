-- Create avisos_legales table
CREATE TABLE public.avisos_legales (
    id integer NOT NULL DEFAULT nextval('avisos_legales_id_seq'::regclass) PRIMARY KEY,
    id_proyecto integer NOT NULL,
    contenido text NOT NULL,
    orden integer NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create sequence for the id field
CREATE SEQUENCE IF NOT EXISTS avisos_legales_id_seq;

-- Add foreign key constraint
ALTER TABLE public.avisos_legales 
ADD CONSTRAINT fk_avisos_legales_proyecto 
FOREIGN KEY (id_proyecto) REFERENCES public.proyectos(id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_avisos_legales_updated_at
    BEFORE UPDATE ON public.avisos_legales
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.avisos_legales ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all access to avisos_legales" 
ON public.avisos_legales 
FOR ALL 
USING (true) 
WITH CHECK (true);