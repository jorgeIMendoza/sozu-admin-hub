
CREATE OR REPLACE FUNCTION public.scan_legacy_urls()
RETURNS TABLE(tabla text, columna text, pendientes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
DECLARE
  r record;
  cnt bigint;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text','character varying')
      AND (
        c.column_name ILIKE '%url%' OR c.column_name ILIKE '%logo%'
        OR c.column_name ILIKE '%foto%' OR c.column_name ILIKE '%imagen%'
        OR c.column_name ILIKE '%image%' OR c.column_name ILIKE '%portada%'
        OR c.column_name ILIKE '%brochure%' OR c.column_name ILIKE '%plano%'
        OR c.column_name ILIKE '%archivo%' OR c.column_name ILIKE '%documento%'
        OR c.column_name ILIKE '%file%' OR c.column_name ILIKE '%avatar%'
        OR c.column_name ILIKE '%pdf%' OR c.column_name ILIKE '%video%'
        OR c.column_name ILIKE '%media%' OR c.column_name ILIKE '%adjunto%'
        OR c.column_name ILIKE '%comprobante%' OR c.column_name ILIKE '%evidencia%'
        OR c.column_name ILIKE '%firma%' OR c.column_name ILIKE '%ine%'
        OR c.column_name ILIKE '%path%' OR c.column_name ILIKE '%link%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE %I LIKE %L',
        r.table_name, r.column_name, '%api.sozu.com%'
      ) INTO cnt;
      IF cnt > 0 THEN
        tabla := r.table_name; columna := r.column_name; pendientes := cnt;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_legacy_urls() TO postgres, anon, authenticated, service_role;
