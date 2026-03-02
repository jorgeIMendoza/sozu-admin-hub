
-- Generate unique CLABEs for each Margot reventa property one by one
-- The function crear_referencia_bancaria reads MAX existing CLABE,
-- so we must commit each assignment before generating the next.
-- Using a DO block with sequential updates ensures each call sees the previous CLABE.

DO $$
DECLARE
  prop_ids INT[] := ARRAY[4842, 5062, 5085, 5097, 5112];
  prop_id INT;
  nueva_clabe TEXT;
BEGIN
  FOREACH prop_id IN ARRAY prop_ids LOOP
    -- Generate a new unique CLABE for this property
    nueva_clabe := crear_referencia_bancaria(1137);
    
    -- Assign it to the property
    UPDATE propiedades 
    SET clabe_stp_tmp_apartado = nueva_clabe,
        fecha_actualizacion = now()
    WHERE id = prop_id 
      AND clabe_stp_tmp_apartado IS NULL;
    
    RAISE NOTICE 'Property % assigned CLABE: %', prop_id, nueva_clabe;
  END LOOP;
END $$;

-- Invalidate cached offer PDFs for these properties so they regenerate with banking data
UPDATE ofertas
SET url = NULL
WHERE id_propiedad IN (4842, 5062, 5085, 5097, 5112)
  AND activo = true
  AND url IS NOT NULL;
