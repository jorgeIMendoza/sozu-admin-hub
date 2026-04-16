-- ============================================================
-- MIGRACIÓN 1: Backfill inmediato de CLABEs _TMP en Monócolo (proyecto 1902)
-- ============================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN 
    SELECT p.id, p.id_entidad_relacionada_dueno::int AS id_er
    FROM propiedades p
    JOIN entidades_relacionadas er ON er.id = p.id_entidad_relacionada_dueno
    WHERE p.clabe_stp_tmp_apartado LIKE '%\_TMP' ESCAPE '\'
      AND er.id_proyecto = 1902
      AND er.cuenta_madre_stp IS NOT NULL
    ORDER BY p.id
  LOOP
    UPDATE propiedades 
    SET clabe_stp_tmp_apartado = crear_referencia_bancaria(r.id_er)
    WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- MIGRACIÓN 2: Endurecer etl_propiedades — paso 11 ya no trata _TMP como CLABE válida
-- ============================================================
CREATE OR REPLACE FUNCTION public.etl_propiedades()
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
    SET statement_timeout TO '300s';

    UPDATE propiedades_stagin ps
    SET id_vista = (
        SELECT v.id::text FROM vistas v
        JOIN proyectos p ON v.id_proyecto = p.id
        WHERE v.activo = true AND p.activo = true
          AND upper(trim(p.nombre)) = upper(trim(ps.id_proyecto))
          AND upper(trim(v.nombre)) = upper(trim(ps.id_vista))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_tipo_transaccion = (
        SELECT tt.id::text FROM tipos_transaccion tt
        WHERE tt.activo = true
          AND upper(trim(ps.id_tipo_transaccion)) = upper(trim(tt.nombre))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_tipo_propiedad = (
        SELECT tp.id::text FROM tipos_propiedad tp
        WHERE tp.activo = true
          AND upper(trim(ps.id_tipo_propiedad)) = upper(trim(tp.nombre))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_estatus_disponibilidad = (
        SELECT ed.id::text FROM estatus_disponibilidad ed
        WHERE ed.activo = true
          AND upper(trim(ps.id_estatus_disponibilidad)) = upper(trim(ed.nombre))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_proyecto = (
        SELECT pr.id::text FROM proyectos pr
        WHERE pr.activo = true
          AND upper(trim(ps.id_proyecto)) = upper(trim(pr.nombre))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_edificio = (
        SELECT e.id::text FROM edificios e
        JOIN proyectos p ON e.id_proyecto = p.id
        WHERE e.activo = true AND p.activo = true
          AND p.id = ps.id_proyecto::int
          AND upper(trim(e.nombre)) = upper(trim(ps.id_edificio))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_modelo = (
        SELECT m.id::text FROM modelos m
        JOIN proyectos p ON m.id_proyecto = p.id
        WHERE m.activo = true AND p.activo = true
          AND p.id = ps.id_proyecto::int
          AND upper(trim(m.nombre)) = upper(trim(ps.id_modelo))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_edificio_modelo = (
        SELECT em.id FROM edificios_modelos em
        WHERE em.activo = true
          AND em.id_edificio::text = ps.id_edificio
          AND em.id_modelo::text   = ps.id_modelo
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET nombre_propietario = (
        SELECT per.id::text FROM personas per
        WHERE per.activo = true
          AND upper(trim(ps.nombre_propietario)) = upper(trim(per.nombre_legal))
        LIMIT 1
    );

    UPDATE propiedades_stagin ps
    SET id_propietario = (
        SELECT er.id FROM entidades_relacionadas er
        WHERE er.activo = true
          AND er.id_proyecto::text = ps.id_proyecto
          AND er.id_persona::text  = ps.nombre_propietario
        LIMIT 1
    );

    /* 11. id_actual + clabe_stp — ENDURECIDO: _TMP NO se considera CLABE válida */
    UPDATE propiedades_stagin ps
    SET id_actual = p.id,
        clabe_stp = COALESCE(
            CASE 
              WHEN p.clabe_stp_tmp_apartado LIKE '%\_TMP' ESCAPE '\' THEN NULL
              ELSE p.clabe_stp_tmp_apartado
            END,
            cc.clabe_stp
        )
    FROM propiedades p
    JOIN entidades_relacionadas er 
         ON p.id_entidad_relacionada_dueno = er.id
    LEFT JOIN ofertas o ON o.id_propiedad = p.id
    LEFT JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
    WHERE p.activo = true
      AND (
        (p.clabe_stp_tmp_apartado IS NOT NULL 
         AND p.clabe_stp_tmp_apartado NOT LIKE '%\_TMP' ESCAPE '\')
        OR cc.clabe_stp IS NOT NULL
      )
      AND upper(trim(ps.numero_propiedad)) = upper(trim(p.numero_propiedad))
      AND ps.id_proyecto::int = er.id_proyecto
      AND er.id_tipo_entidad IN (4, 15);

    UPDATE propiedades_stagin
    SET m2_interiores = CASE WHEN m2_interiores ~ '^[0-9]+(\.[0-9]+)?$' THEN m2_interiores ELSE NULL END;
    UPDATE propiedades_stagin
    SET m2_exteriores = CASE WHEN m2_exteriores ~ '^[0-9]+(\.[0-9]+)?$' THEN m2_exteriores ELSE NULL END;
    UPDATE propiedades_stagin
    SET m2_loft = CASE WHEN m2_loft ~ '^[0-9]+(\.[0-9]+)?$' THEN m2_loft ELSE NULL END;
    UPDATE propiedades_stagin
    SET precio_lista = CASE WHEN precio_lista ~ '^[0-9]+(\.[0-9]+)?$' THEN precio_lista ELSE NULL END;
    UPDATE propiedades_stagin
    SET monto_apartado = CASE WHEN monto_apartado ~ '^[0-9]+(\.[0-9]+)?$' THEN monto_apartado ELSE NULL END;

    IF EXISTS (
        SELECT 1 FROM propiedades_stagin
        WHERE id_vista IS NULL
           OR id_tipo_transaccion IS NULL
           OR id_edificio IS NULL
           OR id_tipo_propiedad IS NULL
           OR id_estatus_disponibilidad IS NULL
           OR numero_propiedad IS NULL
           OR numero_piso IS NULL
           OR m2_interiores IS NULL
           OR m2_exteriores IS NULL
           OR m2_loft IS NULL
           OR precio_lista IS NULL
           OR monto_apartado IS NULL
           OR id_modelo IS NULL
           OR id_edificio_modelo IS NULL
           OR id_propietario IS NULL
           OR id_proyecto IS NULL
    ) THEN
        RETURN false;
    ELSE
        RETURN true;
    END IF;
END;$function$;

-- ============================================================
-- MIGRACIÓN 3: RPC regenerar_clabes_faltantes
-- ============================================================
CREATE OR REPLACE FUNCTION public.regenerar_clabes_faltantes(
  p_id_proyecto integer DEFAULT NULL,
  p_id_entidad integer DEFAULT NULL
) RETURNS integer 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE 
  r RECORD; 
  n INT := 0;
BEGIN
  FOR r IN 
    SELECT p.id, p.id_entidad_relacionada_dueno::int AS id_er
    FROM propiedades p
    JOIN entidades_relacionadas er ON er.id = p.id_entidad_relacionada_dueno
    WHERE p.activo = true
      AND (p.clabe_stp_tmp_apartado IS NULL 
           OR p.clabe_stp_tmp_apartado LIKE '%\_TMP' ESCAPE '\')
      AND er.cuenta_madre_stp IS NOT NULL
      AND (p_id_proyecto IS NULL OR er.id_proyecto = p_id_proyecto)
      AND (p_id_entidad IS NULL OR p.id_entidad_relacionada_dueno = p_id_entidad)
    ORDER BY p.id
  LOOP
    UPDATE propiedades 
    SET clabe_stp_tmp_apartado = crear_referencia_bancaria(r.id_er)
    WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;