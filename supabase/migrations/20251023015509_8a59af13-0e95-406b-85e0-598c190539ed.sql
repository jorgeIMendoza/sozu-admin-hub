-- Rename constraints in tipos_espacio_reservables table
ALTER TABLE public.tipos_espacio_reservables 
  RENAME CONSTRAINT tipos_espacio_rentables_pkey TO tipos_espacio_reservables_pkey;

-- Rename constraints in espacios_reservables_edificio table
ALTER TABLE public.espacios_reservables_edificio 
  RENAME CONSTRAINT espacios_rentables_edificio_pkey TO espacios_reservables_edificio_pkey;

ALTER TABLE public.espacios_reservables_edificio 
  RENAME CONSTRAINT espacios_rentables_edificio_id_edificio_fkey TO espacios_reservables_edificio_id_edificio_fkey;