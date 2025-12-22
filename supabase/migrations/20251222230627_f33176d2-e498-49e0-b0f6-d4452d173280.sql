-- Drop and recreate the execute_safe_query function with better comment handling
DROP FUNCTION IF EXISTS public.execute_safe_query(text, integer);

CREATE OR REPLACE FUNCTION public.execute_safe_query(query_text text, max_rows integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    result JSONB;
    query_upper TEXT;
    query_clean TEXT;
    query_without_semicolon TEXT;
BEGIN
    -- Limpiar espacios en blanco
    query_clean := TRIM(BOTH FROM query_text);
    
    -- Convertir a mayúsculas para validación
    query_upper := UPPER(query_clean);
    
    -- Validar que CONTENGA SELECT o WITH (para permitir comentarios al inicio)
    IF NOT (query_upper ~ '\mSELECT\s' OR query_upper ~ '\mWITH\s') THEN
        RAISE EXCEPTION 'Solo se permiten consultas SELECT o WITH (CTEs). Query recibido: "%"', LEFT(query_clean, 150);
    END IF;
    
    -- Validar palabras clave peligrosas (excluyendo SELECT/WITH del match)
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
    
    -- Ejecutar query usando el query original con LIMIT
    IF NOT query_upper LIKE '%LIMIT%' THEN
        query_clean := query_clean || ' LIMIT ' || max_rows;
    END IF;
    
    -- Ejecutar query
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
$function$;