-- 1. Invertir todos los valores actuales de es_rol_interno
-- Los roles internos (admin, agentes) actualmente tienen false, y los externos (Directores, Cliente) tienen true
-- Esto los corrige a los valores correctos
UPDATE roles 
SET es_rol_interno = NOT es_rol_interno;

-- 2. Cambiar el valor por defecto a TRUE para que nuevos roles sean internos por defecto
ALTER TABLE roles 
ALTER COLUMN es_rol_interno SET DEFAULT true;