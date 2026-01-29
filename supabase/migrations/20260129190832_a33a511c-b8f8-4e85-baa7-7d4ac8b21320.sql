-- Crear usuario para Luis Edmundo Vielma Ordoñez (Agente Inmobiliario vinculado a Sozu)
-- Nota: Este usuario no podrá iniciar sesión hasta que se use "Restablecer contraseña" desde la UI
-- Los accesos a proyectos se heredarán automáticamente de Sozu cuando tenga auth_user_id

-- 1. Insertar en tabla usuarios
INSERT INTO public.usuarios (
  email,
  nombre,
  rol_id,
  activo,
  id_persona,
  debe_cambiar_password,
  auth_user_id
) VALUES (
  'luis.vielma@investimento.mx',
  'Luis Edmundo Vielma Ordoñez',
  3, -- Agente Inmobiliario
  true,
  42, -- id_persona de Luis Edmundo Vielma
  true,
  NULL -- Sin auth user por ahora, se creará al restablecer contraseña
);

-- 2. Crear/Actualizar entidad_relacionada para vincular a Sozu (inmobiliaria 186)
DO $$
DECLARE
  existing_relation_id INT;
BEGIN
  -- Buscar si ya existe relación tipo Agente
  SELECT id INTO existing_relation_id
  FROM public.entidades_relacionadas
  WHERE id_persona = 42
    AND id_tipo_entidad = 19
    AND activo = true
  LIMIT 1;
  
  IF existing_relation_id IS NOT NULL THEN
    -- Actualizar para vincular a Sozu
    UPDATE public.entidades_relacionadas
    SET id_persona_duena_lead = 186
    WHERE id = existing_relation_id;
  ELSE
    -- Crear nueva relación
    INSERT INTO public.entidades_relacionadas (
      id_persona,
      id_tipo_entidad,
      id_persona_duena_lead,
      activo
    ) VALUES (
      42, -- Luis Edmundo Vielma
      19, -- Tipo: Agente
      186, -- Sozu (Real Estate Ventures)
      true
    );
  END IF;
END $$;