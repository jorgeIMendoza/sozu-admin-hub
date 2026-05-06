
CREATE OR REPLACE FUNCTION public.scan_legacy_urls()
RETURNS TABLE(tabla text, columna text, pendientes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE %I LIKE %L',
        r.table_name, r.column_name, '%api.sozu.com%'
      ) INTO cnt;
      IF cnt > 0 THEN
        tabla := r.table_name;
        columna := r.column_name;
        pendientes := cnt;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- skip columns that can't be scanned
      NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_legacy_urls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_legacy_urls() TO service_role;
