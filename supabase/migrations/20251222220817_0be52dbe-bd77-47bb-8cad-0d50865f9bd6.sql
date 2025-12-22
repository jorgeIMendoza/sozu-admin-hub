-- Parte 1: Agregar columna ver_todos_duenos a la tabla roles
ALTER TABLE public.roles 
ADD COLUMN ver_todos_duenos boolean NOT NULL DEFAULT true;

-- Poner en false para Representante de empresa dueña (14) y Desarrollador (15)
UPDATE public.roles 
SET ver_todos_duenos = false 
WHERE id IN (14, 15);

-- Parte 2: Agregar columna id_entidad_relacionada_dueno a la tabla proyectos_acceso
ALTER TABLE public.proyectos_acceso 
ADD COLUMN id_entidad_relacionada_dueno integer REFERENCES public.entidades_relacionadas(id);

-- Comentario: NULL = puede ver todos los dueños del proyecto
-- Con valor = solo puede ver data de ese dueño específico