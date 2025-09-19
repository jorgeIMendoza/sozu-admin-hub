-- Add columns to proyectos table to control what elements show in PDF offers
ALTER TABLE public.proyectos 
ADD COLUMN mostrar_precio_m2_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_piso_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_seccion_efectivo_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_estacionamientos_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_bodega_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_modelo_en_oferta boolean NOT NULL DEFAULT true,
ADD COLUMN mostrar_edificio_en_oferta boolean NOT NULL DEFAULT true;