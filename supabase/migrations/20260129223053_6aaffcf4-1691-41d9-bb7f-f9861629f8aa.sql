
-- Step 1: Create personas for Carolina and Emily (tipo_persona = 'Física' for agents)
INSERT INTO personas (nombre_legal, email, tipo_persona, activo)
VALUES 
  ('Carolina Flores', 'carolina.flores@daiku.com.mx', 'Física', true),
  ('Emily Vazquez', 'emily.vazquez@daiku.com.mx', 'Física', true)
ON CONFLICT (email) DO NOTHING;

-- Step 2: Create entidades_relacionadas tipo 19 (Agente) for Carolina and Emily linking them to Sozu (persona 186)
-- We need to do this after getting the persona IDs, so we'll use a DO block
DO $$
DECLARE
  carolina_persona_id INT;
  emily_persona_id INT;
BEGIN
  -- Get Carolina's persona ID
  SELECT id INTO carolina_persona_id FROM personas WHERE email = 'carolina.flores@daiku.com.mx' AND activo = true LIMIT 1;
  -- Get Emily's persona ID  
  SELECT id INTO emily_persona_id FROM personas WHERE email = 'emily.vazquez@daiku.com.mx' AND activo = true LIMIT 1;
  
  -- Create entidad_relacionada for Carolina if persona exists
  IF carolina_persona_id IS NOT NULL THEN
    INSERT INTO entidades_relacionadas (id_persona, id_persona_duena_lead, id_tipo_entidad, activo)
    VALUES (carolina_persona_id, 186, 19, true)
    ON CONFLICT DO NOTHING;
    
    -- Update usuario to link to persona
    UPDATE usuarios SET id_persona = carolina_persona_id WHERE email = 'carolina.flores@daiku.com.mx';
  END IF;
  
  -- Create entidad_relacionada for Emily if persona exists
  IF emily_persona_id IS NOT NULL THEN
    INSERT INTO entidades_relacionadas (id_persona, id_persona_duena_lead, id_tipo_entidad, activo)
    VALUES (emily_persona_id, 186, 19, true)
    ON CONFLICT DO NOTHING;
    
    -- Update usuario to link to persona
    UPDATE usuarios SET id_persona = emily_persona_id WHERE email = 'emily.vazquez@daiku.com.mx';
  END IF;
END $$;

-- Step 3: Delete ALL independent project access for agents (roles 3 and 9)
-- The trigger sync_inmobiliaria_project_access will handle the sync when we update the inmobiliarias
DELETE FROM proyectos_acceso 
WHERE usuario_id IN (
  SELECT email FROM usuarios WHERE rol_id IN (3, 9) AND activo = true
);

-- Step 4: Re-sync all agents' access based on their inmobiliaria
-- For each agent, copy the project access from their parent inmobiliaria
INSERT INTO proyectos_acceso (usuario_id, proyecto_id, id_entidad_relacionada_dueno, activo)
SELECT 
  agente.email as usuario_id,
  inmob_access.proyecto_id,
  inmob_access.id_entidad_relacionada_dueno,
  true as activo
FROM usuarios agente
-- Get the agent's persona
JOIN personas p ON agente.id_persona = p.id
-- Get the agent's entidad_relacionada (tipo 19) to find their inmobiliaria
JOIN entidades_relacionadas er ON er.id_persona = p.id AND er.id_tipo_entidad = 19 AND er.activo = true
-- Get the inmobiliaria persona
JOIN personas inmob_persona ON er.id_persona_duena_lead = inmob_persona.id
-- Get the inmobiliaria user
JOIN usuarios inmob_user ON inmob_user.id_persona = inmob_persona.id AND inmob_user.rol_id = 4 AND inmob_user.activo = true
-- Get the inmobiliaria's project access
JOIN proyectos_acceso inmob_access ON inmob_access.usuario_id = inmob_user.email AND inmob_access.activo = true
WHERE agente.rol_id IN (3, 9) AND agente.activo = true AND agente.id_persona IS NOT NULL
ON CONFLICT (usuario_id, proyecto_id) DO UPDATE SET 
  id_entidad_relacionada_dueno = EXCLUDED.id_entidad_relacionada_dueno,
  activo = true;
