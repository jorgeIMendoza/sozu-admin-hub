-- Add precio_lista field to productos_servicios table
ALTER TABLE productos_servicios 
ADD COLUMN precio_lista NUMERIC DEFAULT 0.00;