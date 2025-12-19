-- Recrear la función crear_referencia_bancaria con lógica de búsqueda de huecos
CREATE OR REPLACE FUNCTION public.crear_referencia_bancaria(id_er_dueno integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    contador_final INT;
    temp_bank_ref TEXT;
    suma INT := 0;
    digito_verificador INT;
    multiplicadores INT[] := ARRAY[3,7,1,3,7,1,3,7,1,3,7,1,3,7,1,3,7];
    ultima_cuenta TEXT;
    cuenta_madre_stp_dueno TEXT;
    clabe_existe BOOLEAN;
    temp_ref_sin_digito TEXT;
BEGIN
    -- Obtener la última cuenta considerando propiedades Y productos
    WITH todas_clabes AS (
        -- CLABEs de propiedades (apartado temporal)
        SELECT 
            p.clabe_stp_tmp_apartado as clabe,
            er.cuenta_madre_stp
        FROM propiedades p
        JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
        WHERE er.id = id_er_dueno
          AND p.clabe_stp_tmp_apartado IS NOT NULL
          AND p.clabe_stp_tmp_apartado NOT LIKE '%_TMP'
        
        UNION ALL
        
        -- CLABEs de cuentas de cobranza de propiedades
        SELECT 
            cc.clabe_stp as clabe,
            er.cuenta_madre_stp
        FROM propiedades p
        JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
        JOIN ofertas o ON o.id_propiedad = p.id
        JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
        WHERE er.id = id_er_dueno
          AND cc.clabe_stp IS NOT NULL
          AND cc.clabe_stp NOT LIKE '%_TMP'
        
        UNION ALL
        
        -- CLABEs de productos (apartado temporal en ofertas)
        SELECT 
            o.clabe_stp_tmp_producto as clabe,
            er.cuenta_madre_stp
        FROM ofertas o
        JOIN productos_servicios ps ON o.id_producto = ps.id
        JOIN entidades_relacionadas er ON ps.id_entidad_relacionada_dueno = er.id
        WHERE er.id = id_er_dueno
          AND o.clabe_stp_tmp_producto IS NOT NULL
          AND o.clabe_stp_tmp_producto NOT LIKE '%_TMP'
        
        UNION ALL
        
        -- CLABEs de cuentas de cobranza de productos
        SELECT 
            cc.clabe_stp as clabe,
            er.cuenta_madre_stp
        FROM cuentas_cobranza cc
        JOIN ofertas o ON cc.id_oferta = o.id
        JOIN productos_servicios ps ON o.id_producto = ps.id
        JOIN entidades_relacionadas er ON ps.id_entidad_relacionada_dueno = er.id
        WHERE er.id = id_er_dueno
          AND cc.clabe_stp IS NOT NULL
          AND cc.clabe_stp NOT LIKE '%_TMP'
          AND o.id_producto IS NOT NULL

        UNION ALL

        -- CLABEs de cuentas de cobranza de mantenimientos
        SELECT 
        A.clabe,
        A.cuenta_madre_stp
        FROM
        (  
        SELECT 
            cc.clabe_stp as clabe,
            (SELECT 
                er.cuenta_madre_stp
            FROM entidades_relacionadas er
            WHERE 
                er.id = id_er_dueno) as cuenta_madre_stp
        FROM cuentas_cobranza cc
        WHERE 
            cc.id_oferta is null
        and
            cc.id_cuenta_cobranza_padre is not null  
        ) A
        WHERE 
        LEFT(A.clabe, LENGTH(A.clabe) - 4) = A.cuenta_madre_stp

        UNION ALL

        SELECT 
            er.cuenta_stp_comisiones as clabe,
            (SELECT cuenta_madre_stp FROM entidades_relacionadas where id = id_er_dueno) as cuenta_madre_stp
        FROM 
            entidades_relacionadas er
        WHERE 
        er.id_proyecto = (SELECT id_proyecto FROM entidades_relacionadas where id = id_er_dueno)
    )
    SELECT
        MAX(
            SUBSTRING(
                LEFT(clabe, LENGTH(clabe) - 1)
                FROM '.{3}$'
            )
        )::INT AS ultima_cuenta_num,
        cuenta_madre_stp
    INTO ultima_cuenta, cuenta_madre_stp_dueno
    FROM todas_clabes
    GROUP BY cuenta_madre_stp;

    -- Si no hay resultados, obtener solo la cuenta madre STP
    IF cuenta_madre_stp_dueno IS NULL THEN
        SELECT cuenta_madre_stp INTO cuenta_madre_stp_dueno
        FROM entidades_relacionadas
        WHERE id = id_er_dueno;
        
        IF cuenta_madre_stp_dueno IS NULL THEN
            RAISE EXCEPTION 'La entidad relacionada % no tiene cuenta_madre_stp configurada', id_er_dueno;
        END IF;
    END IF;

    -- Si no hay resultados o es NULL, poner contador en 0
    IF ultima_cuenta IS NULL THEN
        contador_final := 0;
    ELSE
        contador_final := CAST(SUBSTRING(ultima_cuenta FROM '[0-9]+') AS INT);
    END IF;

    -- Incrementar contador
    contador_final := contador_final + 1;

    -- Si contador llega a 1000, buscar huecos desde 001
    IF contador_final >= 1000 THEN
        -- Empezar búsqueda de huecos desde 001
        contador_final := 1;
        
        WHILE contador_final < 1000 LOOP
            -- Construir la referencia temporal sin dígito verificador
            temp_ref_sin_digito := cuenta_madre_stp_dueno || LPAD(contador_final::TEXT, 3, '0');
            
            -- Verificar si existe en alguna de las tablas
            SELECT EXISTS(
                WITH todas_clabes_check AS (
                    -- CLABEs de propiedades (apartado temporal)
                    SELECT p.clabe_stp_tmp_apartado as clabe
                    FROM propiedades p
                    JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
                    WHERE er.id = id_er_dueno
                      AND p.clabe_stp_tmp_apartado IS NOT NULL
                      AND p.clabe_stp_tmp_apartado NOT LIKE '%_TMP'
                    
                    UNION ALL
                    
                    -- CLABEs de cuentas de cobranza de propiedades
                    SELECT cc.clabe_stp as clabe
                    FROM propiedades p
                    JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
                    JOIN ofertas o ON o.id_propiedad = p.id
                    JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
                    WHERE er.id = id_er_dueno
                      AND cc.clabe_stp IS NOT NULL
                      AND cc.clabe_stp NOT LIKE '%_TMP'
                    
                    UNION ALL
                    
                    -- CLABEs de productos (apartado temporal en ofertas)
                    SELECT o.clabe_stp_tmp_producto as clabe
                    FROM ofertas o
                    JOIN productos_servicios ps ON o.id_producto = ps.id
                    JOIN entidades_relacionadas er ON ps.id_entidad_relacionada_dueno = er.id
                    WHERE er.id = id_er_dueno
                      AND o.clabe_stp_tmp_producto IS NOT NULL
                      AND o.clabe_stp_tmp_producto NOT LIKE '%_TMP'
                    
                    UNION ALL
                    
                    -- CLABEs de cuentas de cobranza de productos
                    SELECT cc.clabe_stp as clabe
                    FROM cuentas_cobranza cc
                    JOIN ofertas o ON cc.id_oferta = o.id
                    JOIN productos_servicios ps ON o.id_producto = ps.id
                    JOIN entidades_relacionadas er ON ps.id_entidad_relacionada_dueno = er.id
                    WHERE er.id = id_er_dueno
                      AND cc.clabe_stp IS NOT NULL
                      AND cc.clabe_stp NOT LIKE '%_TMP'
                      AND o.id_producto IS NOT NULL

                    UNION ALL

                    -- CLABEs de cuentas de cobranza de mantenimientos
                    SELECT A.clabe
                    FROM (  
                        SELECT 
                            cc.clabe_stp as clabe,
                            (SELECT er.cuenta_madre_stp FROM entidades_relacionadas er WHERE er.id = id_er_dueno) as cuenta_madre_stp
                        FROM cuentas_cobranza cc
                        WHERE cc.id_oferta is null AND cc.id_cuenta_cobranza_padre is not null  
                    ) A
                    WHERE LEFT(A.clabe, LENGTH(A.clabe) - 4) = A.cuenta_madre_stp

                    UNION ALL

                    SELECT er.cuenta_stp_comisiones as clabe
                    FROM entidades_relacionadas er
                    WHERE er.id_proyecto = (SELECT id_proyecto FROM entidades_relacionadas where id = id_er_dueno)
                )
                SELECT 1 FROM todas_clabes_check WHERE clabe LIKE temp_ref_sin_digito || '%'
            ) INTO clabe_existe;
            
            -- Si no existe, encontramos un hueco
            IF NOT clabe_existe THEN
                EXIT; -- Salir del bucle
            END IF;
            
            contador_final := contador_final + 1;
        END LOOP;
        
        -- Si llegamos a 1000 y no encontramos hueco, error
        IF contador_final >= 1000 THEN
            RAISE EXCEPTION 'SIN_HUECOS_DISPONIBLES: Todos los números del 001 al 999 están ocupados para la cuenta madre %', cuenta_madre_stp_dueno;
        END IF;
    END IF;

    -- Formatear con ceros a la izquierda
    temp_bank_ref := cuenta_madre_stp_dueno || LPAD(contador_final::TEXT, 3, '0');

    -- Calcular dígito verificador
    FOR i IN 1..17 LOOP
        suma := suma + ((CAST(SUBSTRING(temp_bank_ref, i, 1) AS INT) * multiplicadores[i]) % 10);
    END LOOP;

    digito_verificador := (10 - (suma % 10)) % 10;

    RETURN temp_bank_ref || digito_verificador::TEXT;
END;
$function$;