-- Create sequence for estatus_persona first
CREATE SEQUENCE IF NOT EXISTS public.estatus_persona_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create estatus_persona table
CREATE TABLE public.estatus_persona (
    id integer NOT NULL DEFAULT nextval('estatus_persona_id_seq'::regclass),
    nombre text NOT NULL,
    id_tipo_entidad integer NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT estatus_persona_pkey PRIMARY KEY (id)
);

-- Set sequence ownership
ALTER SEQUENCE public.estatus_persona_id_seq OWNED BY public.estatus_persona.id;

-- Add id_estatus_persona field to entidades_relacionadas table
ALTER TABLE public.entidades_relacionadas 
ADD COLUMN id_estatus_persona integer;

-- Add foreign key constraint from entidades_relacionadas to estatus_persona
ALTER TABLE public.entidades_relacionadas 
ADD CONSTRAINT fk_entidades_relacionadas_estatus_persona 
FOREIGN KEY (id_estatus_persona) REFERENCES public.estatus_persona(id);

-- Add foreign key constraint from estatus_persona to tipos_entidad
ALTER TABLE public.estatus_persona 
ADD CONSTRAINT fk_estatus_persona_tipos_entidad 
FOREIGN KEY (id_tipo_entidad) REFERENCES public.tipos_entidad(id);

-- Create trigger for automatic timestamp updates on estatus_persona
CREATE TRIGGER update_estatus_persona_updated_at
    BEFORE UPDATE ON public.estatus_persona
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on estatus_persona table
ALTER TABLE public.estatus_persona ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for estatus_persona
CREATE POLICY "Allow all access to estatus_persona" 
ON public.estatus_persona 
FOR ALL 
USING (true) 
WITH CHECK (true);