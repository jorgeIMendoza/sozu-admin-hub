-- Remove id_proyecto from amenidades table to create many-to-many relationship
ALTER TABLE public.amenidades 
DROP COLUMN id_proyecto;

-- Create amenidades_proyectos junction table for many-to-many relationship
CREATE TABLE public.amenidades_proyectos (
  id SERIAL PRIMARY KEY,
  id_amenidad INTEGER NOT NULL REFERENCES public.amenidades(id) ON DELETE CASCADE,
  id_proyecto INTEGER NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id_amenidad, id_proyecto)
);

-- Add some sample amenities
INSERT INTO public.amenidades (nombre, url) VALUES 
('Piscina', null),
('Gimnasio', null),
('Salón de Fiestas', null),
('Área de BBQ', null),
('Cancha de Tenis', null),
('Jardín', null),
('Estacionamiento Subterráneo', null),
('Seguridad 24/7', null),
('Elevadores', null),
('Terraza', null);

-- Create trigger to update updated_at on amenidades_proyectos
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_amenidades_proyectos_updated_at
    BEFORE UPDATE ON public.amenidades_proyectos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();