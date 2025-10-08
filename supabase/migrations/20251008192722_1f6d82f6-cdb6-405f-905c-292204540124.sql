-- Add descripcion field to pagos table
ALTER TABLE pagos
ADD COLUMN descripcion TEXT DEFAULT NULL;