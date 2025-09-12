-- Add new date fields that don't exist yet
ALTER TABLE proyectos 
ADD COLUMN IF NOT EXISTS fecha_lanzamiento_proyecto date,
ADD COLUMN IF NOT EXISTS fecha_entrega_proyecto date;

-- Rename existing fecha_inicio to fecha_inicio_construccion  
ALTER TABLE proyectos 
RENAME COLUMN fecha_inicio TO fecha_inicio_construccion;