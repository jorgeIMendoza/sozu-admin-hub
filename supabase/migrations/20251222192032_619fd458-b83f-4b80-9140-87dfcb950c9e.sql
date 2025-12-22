-- Actualizar la función execute_safe_query para permitir CTEs (WITH ... SELECT)
CREATE OR REPLACE FUNCTION public.execute_safe_query(query_text TEXT, max_rows INTEGER DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
    query_upper TEXT;
    query_clean TEXT;
    query_without_semicolon TEXT;
BEGIN
    -- Limpiar TODO tipo de espacios en blanco (incluidos saltos de línea, tabs, etc)
    query_clean := TRIM(BOTH FROM query_text);
    -- Normalizar espacios múltiples a uno solo
    query_clean := REGEXP_REPLACE(query_clean, '\s+', ' ', 'g');
    -- Asegurar que no haya espacios al inicio después de normalizar
    query_clean := LTRIM(query_clean);
    -- Convertir a mayúsculas para validación
    query_upper := UPPER(query_clean);
    
    -- Validar que empiece con SELECT o WITH (para CTEs)
    IF NOT (query_upper LIKE 'SELECT %' OR query_upper LIKE 'WITH %') THEN
        RAISE EXCEPTION 'Solo se permiten consultas SELECT o WITH (CTEs). Query recibido: "%"', LEFT(query_clean, 150);
    END IF;
    
    -- Validar palabras clave peligrosas
    IF query_upper ~ '\m(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE)\M' THEN
        RAISE EXCEPTION 'Consulta contiene palabras clave no permitidas';
    END IF;
    
    -- Permitir punto y coma al final pero no múltiples consultas
    query_without_semicolon := REGEXP_REPLACE(query_clean, ';\s*$', '');
    IF query_without_semicolon LIKE '%;%' THEN
        RAISE EXCEPTION 'No se permiten múltiples consultas';
    END IF;
    
    -- Remover punto y coma final si existe
    query_clean := query_without_semicolon;
    
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