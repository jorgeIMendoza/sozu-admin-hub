ALTER TABLE public.avisos_roles_destinatarios
ALTER COLUMN id_rol DROP NOT NULL;

ALTER TABLE public.avisos_roles_destinatarios
DROP CONSTRAINT IF EXISTS avisos_roles_destinatarios_aviso_id_rol_id_key;

DROP INDEX IF EXISTS public.avisos_roles_destinatarios_aviso_id_rol_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS avisos_roles_destinatarios_aviso_id_rol_id_key
ON public.avisos_roles_destinatarios (id_aviso, id_rol)
WHERE id_rol IS NOT NULL;