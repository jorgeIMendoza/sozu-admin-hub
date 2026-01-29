
-- STEP 1: Delete ALL project access for Sozu users (inmobiliaria + all agents)
DELETE FROM proyectos_acceso 
WHERE usuario_id IN (
  'joseramon.escobar2@sozu.com',
  'allan.diaz@sozu.com',
  'bernardo.ortiz@sozu.com',
  'carolina.flores@daiku.com.mx',
  'emily.vazquez@daiku.com.mx',
  'joseramon.escobar@investimento.mx',
  'keity.galindo@sozu.com',
  'luis.vielma@investimento.mx',
  'manuel.nava@sozu.com',
  'pablo.espinosa@sozu.com',
  'pedroemmanuel96@sozu.com',
  'yenisse.delgadillo@sozu.com'
);

-- STEP 2: Fix the trigger - ensure it uses the correct persona lookup
CREATE OR REPLACE FUNCTION public.sync_inmobiliaria_project_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inmobiliaria_persona_id INT;
  agent_email TEXT;
BEGIN
  -- Get the persona_id of the user making the change
  SELECT p.id INTO inmobiliaria_persona_id
  FROM usuarios u
  JOIN personas p ON p.email = u.email
  WHERE u.email = COALESCE(NEW.usuario_id, OLD.usuario_id)
  AND u.rol_id = 4;  -- Only for Inmobiliaria role

  -- Only proceed if we found an inmobiliaria
  IF inmobiliaria_persona_id IS NOT NULL THEN
    -- Handle INSERT or UPDATE - propagate access to agents
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      -- Find all agents linked to this inmobiliaria
      FOR agent_email IN
        SELECT u.email
        FROM entidades_relacionadas er
        JOIN personas p ON p.id = er.id_persona
        JOIN usuarios u ON u.email = p.email
        WHERE er.id_persona_duena_lead = inmobiliaria_persona_id
        AND er.id_tipo_entidad = 19 -- Agente entity type
        AND er.activo = true
        AND u.rol_id IN (3, 9) -- Agente Inmobiliario (3) AND Agente Interno (9)
        AND u.activo = true
      LOOP
        INSERT INTO proyectos_acceso (usuario_id, proyecto_id, id_entidad_relacionada_dueno, activo)
        VALUES (agent_email, NEW.proyecto_id, NEW.id_entidad_relacionada_dueno, NEW.activo)
        ON CONFLICT (usuario_id, proyecto_id) 
        DO UPDATE SET 
          id_entidad_relacionada_dueno = EXCLUDED.id_entidad_relacionada_dueno,
          activo = EXCLUDED.activo,
          fecha_actualizacion = now();
      END LOOP;
    END IF;

    -- Handle DELETE - remove access from agents
    IF TG_OP = 'DELETE' THEN
      FOR agent_email IN
        SELECT u.email
        FROM entidades_relacionadas er
        JOIN personas p ON p.id = er.id_persona
        JOIN usuarios u ON u.email = p.email
        WHERE er.id_persona_duena_lead = inmobiliaria_persona_id
        AND er.id_tipo_entidad = 19
        AND er.activo = true
        AND u.rol_id IN (3, 9)
        AND u.activo = true
      LOOP
        DELETE FROM proyectos_acceso 
        WHERE usuario_id = agent_email 
        AND proyecto_id = OLD.proyecto_id;
      END LOOP;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
