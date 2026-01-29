
-- STEP 1: Delete all current problematic records for Sozu
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

-- STEP 2: Drop and recreate the trigger with fixed logic
DROP TRIGGER IF EXISTS trigger_sync_inmobiliaria_project_access ON proyectos_acceso;

CREATE OR REPLACE FUNCTION public.sync_inmobiliaria_project_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inmobiliaria_persona_id INT;
  agent_email TEXT;
  target_usuario_id TEXT;
  target_proyecto_id INT;
  target_activo BOOLEAN;
  target_dueno_id INT;
BEGIN
  -- Determine which record to use
  IF TG_OP = 'DELETE' THEN
    target_usuario_id := OLD.usuario_id;
    target_proyecto_id := OLD.proyecto_id;
  ELSE
    target_usuario_id := NEW.usuario_id;
    target_proyecto_id := NEW.proyecto_id;
    target_activo := NEW.activo;
    target_dueno_id := NEW.id_entidad_relacionada_dueno;
  END IF;

  -- Check if the user is an Inmobiliaria (rol_id = 4)
  SELECT p.id INTO inmobiliaria_persona_id
  FROM usuarios u
  JOIN personas p ON p.email = u.email
  WHERE u.email = target_usuario_id
  AND u.rol_id = 4
  AND u.activo = true;

  -- Only proceed if this is an inmobiliaria user
  IF inmobiliaria_persona_id IS NOT NULL THEN
    
    -- Handle INSERT or UPDATE
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      -- Find ALL agents linked to this inmobiliaria via entidades_relacionadas
      FOR agent_email IN
        SELECT u.email
        FROM entidades_relacionadas er
        JOIN personas p ON p.id = er.id_persona
        JOIN usuarios u ON u.email = p.email
        WHERE er.id_persona_duena_lead = inmobiliaria_persona_id
        AND er.id_tipo_entidad = 19 -- Agente entity type
        AND er.activo = true
        AND u.rol_id IN (3, 9) -- Agente Inmobiliario AND Agente Interno
        AND u.activo = true
      LOOP
        -- Upsert the agent's project access with same values as inmobiliaria
        INSERT INTO proyectos_acceso (usuario_id, proyecto_id, id_entidad_relacionada_dueno, activo)
        VALUES (agent_email, target_proyecto_id, target_dueno_id, target_activo)
        ON CONFLICT (usuario_id, proyecto_id) 
        DO UPDATE SET 
          id_entidad_relacionada_dueno = EXCLUDED.id_entidad_relacionada_dueno,
          activo = EXCLUDED.activo,
          fecha_actualizacion = now();
      END LOOP;
    END IF;

    -- Handle DELETE - also delete from agents
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
        AND proyecto_id = target_proyecto_id;
      END LOOP;
    END IF;
  END IF;

  -- Return appropriate value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER trigger_sync_inmobiliaria_project_access
  AFTER INSERT OR UPDATE OR DELETE ON proyectos_acceso
  FOR EACH ROW
  EXECUTE FUNCTION sync_inmobiliaria_project_access();
