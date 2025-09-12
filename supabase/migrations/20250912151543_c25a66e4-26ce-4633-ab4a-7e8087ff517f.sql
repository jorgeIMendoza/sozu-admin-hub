-- Add image fields to proyectos table
ALTER TABLE public.proyectos 
ADD COLUMN url_logo TEXT,
ADD COLUMN url_firma_recibos TEXT,
ADD COLUMN nombre_firmante_recibos TEXT,
ADD COLUMN url_imagen_portada TEXT;