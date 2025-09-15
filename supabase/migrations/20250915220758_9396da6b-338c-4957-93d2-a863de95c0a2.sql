-- Add descripcion field to multimedias_modelo table
ALTER TABLE multimedias_modelo 
ADD COLUMN descripcion text;

-- Add habilitar_asignar field to amenidades table
ALTER TABLE amenidades 
ADD COLUMN habilitar_asignar boolean NOT NULL DEFAULT false;

-- Add habilitar_asignar field to caracteristicas table (already exists)
ALTER TABLE caracteristicas 
ADD COLUMN habilitar_asignar boolean NOT NULL DEFAULT false;

-- Create multimedias_propiedad table
CREATE TABLE multimedias_propiedad (
    id integer NOT NULL DEFAULT nextval('multimedias_propiedad_id_seq'::regclass) PRIMARY KEY,
    id_propiedad bigint NOT NULL,
    descripcion text,
    es_imagen boolean NOT NULL DEFAULT true,
    url text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_propiedad) REFERENCES propiedades(id)
);

-- Create sequence for multimedias_propiedad if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS multimedias_propiedad_id_seq;

-- Create propiedades_caracteristicas table
CREATE TABLE propiedades_caracteristicas (
    id integer NOT NULL DEFAULT nextval('propiedades_caracteristicas_id_seq'::regclass) PRIMARY KEY,
    id_propiedad bigint NOT NULL,
    id_caracteristica integer NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    fecha_creacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_propiedad) REFERENCES propiedades(id),
    FOREIGN KEY (id_caracteristica) REFERENCES caracteristicas(id),
    UNIQUE(id_propiedad, id_caracteristica)
);

-- Create sequence for propiedades_caracteristicas
CREATE SEQUENCE IF NOT EXISTS propiedades_caracteristicas_id_seq;

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_multimedias_propiedad_updated_at
    BEFORE UPDATE ON multimedias_propiedad
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_propiedades_caracteristicas_updated_at
    BEFORE UPDATE ON propiedades_caracteristicas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();