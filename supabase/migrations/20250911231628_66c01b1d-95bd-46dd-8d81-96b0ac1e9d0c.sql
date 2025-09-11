-- Step 1: Remove the foreign key constraint fk_personas_representante if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'fk_personas_representante' 
               AND table_name = 'personas') THEN
        ALTER TABLE personas DROP CONSTRAINT fk_personas_representante;
    END IF;
END $$;

-- Step 2: Remove the id_tipo_relacion column from personas table
ALTER TABLE personas DROP COLUMN IF EXISTS id_tipo_relacion;

-- Step 3: Rename id_representente_legal to id_entidad_relacionada_rep_leg
ALTER TABLE personas 
RENAME COLUMN id_representente_legal TO id_entidad_relacionada_rep_leg;

-- Step 4: Create the new foreign key constraint for id_entidad_relacionada_rep_leg
ALTER TABLE personas 
ADD CONSTRAINT fk_personas_entidad_relacionada_rep_leg 
FOREIGN KEY (id_entidad_relacionada_rep_leg) 
REFERENCES entidades_relacionadas(id) 
ON DELETE SET NULL;