-- Corregir función execute_safe_query para manejar espacios en blanco correctamente

CREATE OR REPLACE FUNCTION execute_safe_query(
    query_text TEXT,
    max_rows INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
DECLARE
    result JSONB;
    query_upper TEXT;
    query_clean TEXT;
BEGIN
    -- Limpiar espacios en blanco y normalizar
    query_clean := TRIM(BOTH FROM query_text);
    query_upper := UPPER(query_clean);
    
    -- Validar que sea SELECT (después de limpiar espacios)
    IF NOT query_upper LIKE 'SELECT %' THEN
        RAISE EXCEPTION 'Solo se permiten consultas SELECT. Query recibido: %', LEFT(query_clean, 100);
    END IF;
    
    -- Validar palabras clave peligrosas usando word boundaries
    IF query_upper ~ '\m(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE)\M' THEN
        RAISE EXCEPTION 'Consulta contiene palabras clave no permitidas';
    END IF;
    
    -- No permitir múltiples consultas
    IF query_clean LIKE '%;%' THEN
        RAISE EXCEPTION 'No se permiten múltiples consultas';
    END IF;
    
    -- Agregar LIMIT si no existe
    IF NOT query_upper LIKE '%LIMIT%' THEN
        query_clean := query_clean || ' LIMIT ' || max_rows;
    END IF;
    
    -- Ejecutar query y convertir a JSONB
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_clean) INTO result;
    
    -- Si result es null, retornar array vacío
    IF result IS NULL THEN
        result := '[]'::JSONB;
    END IF;
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error ejecutando consulta: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION execute_safe_query IS 'Ejecuta consultas SQL SELECT de forma segura con validaciones y límites mejoradas';