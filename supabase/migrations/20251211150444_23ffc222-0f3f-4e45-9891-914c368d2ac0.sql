-- Agregar columna id_proyecto a productos_servicios (nullable para servicios)
ALTER TABLE productos_servicios 
ADD COLUMN id_proyecto INTEGER REFERENCES proyectos(id);

-- Crear índice para mejorar performance en búsquedas
CREATE INDEX idx_productos_servicios_id_proyecto ON productos_servicios(id_proyecto);