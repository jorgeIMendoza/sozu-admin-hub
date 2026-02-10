
-- One-time data fix: Update Bottura precio_m2_actual to correct value
UPDATE proyectos 
SET precio_m2_actual = 80939.95, 
    fecha_actualizacion = CURRENT_TIMESTAMP 
WHERE id = 2;
