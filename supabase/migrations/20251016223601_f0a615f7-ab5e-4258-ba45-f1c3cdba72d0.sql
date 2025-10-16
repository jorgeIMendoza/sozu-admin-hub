-- Corregir advertencias de seguridad: agregar search_path a las funciones
-- Esto previene ataques de inyección mediante modificación del search_path

-- 1. Actualizar función actualizar_precio_m2_proyecto con search_path
CREATE OR REPLACE FUNCTION public.actualizar_precio_m2_proyecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_precio_final NUMERIC;
    v_m2_total NUMERIC;
    v_precio_por_m2_actual NUMERIC;
    v_precio_m2_actual_proyecto NUMERIC;
    v_id_proyecto INTEGER;
BEGIN
    -- Solo ejecutar cuando el estatus cambia a "Apartado" (id=4)
    IF NEW.id_estatus_disponibilidad = 4 AND (OLD.id_estatus_disponibilidad IS NULL OR OLD.id_estatus_disponibilidad != 4) THEN
        
        -- Obtener la suma de m2_interiores + m2_exteriores de la propiedad
        SELECT (COALESCE(m2_interiores, 0) + COALESCE(m2_exteriores, 0)) INTO v_m2_total
        FROM propiedades
        WHERE id = NEW.id;
        
        -- Obtener precio_final de la cuenta de cobranza asociada
        SELECT cc.precio_final, er.id_proyecto
        INTO v_precio_final, v_id_proyecto
        FROM cuentas_cobranza cc
        JOIN ofertas o ON cc.id_oferta = o.id
        JOIN propiedades p ON o.id_propiedad = p.id
        JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
        WHERE o.id_propiedad = NEW.id
          AND cc.activo = true
        ORDER BY cc.fecha_creacion DESC
        LIMIT 1;
        
        -- Validar que tengamos los datos necesarios
        IF v_precio_final IS NOT NULL AND v_m2_total IS NOT NULL AND v_m2_total > 0 AND v_id_proyecto IS NOT NULL THEN
            
            -- Calcular precio por m2 actual y redondear a 2 decimales
            v_precio_por_m2_actual := ROUND(v_precio_final / v_m2_total, 2);
            
            -- Obtener el precio_m2_actual actual del proyecto
            SELECT precio_m2_actual INTO v_precio_m2_actual_proyecto
            FROM proyectos
            WHERE id = v_id_proyecto;
            
            -- Si el precio_m2_actual del proyecto es NULL o menor al recién calculado, actualizarlo
            IF v_precio_m2_actual_proyecto IS NULL OR v_precio_m2_actual_proyecto < v_precio_por_m2_actual THEN
                UPDATE proyectos
                SET precio_m2_actual = v_precio_por_m2_actual,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = v_id_proyecto;
                
                RAISE NOTICE 'Actualizado precio_m2_actual del proyecto % a %', v_id_proyecto, v_precio_por_m2_actual;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- 2. Actualizar función incrementar_precio_m2_mensual con search_path
CREATE OR REPLACE FUNCTION public.incrementar_precio_m2_mensual()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_proyecto RECORD;
    v_nuevo_precio NUMERIC;
    v_todas_vendidas BOOLEAN;
BEGIN
    -- Iterar sobre proyectos activos que tienen precio_m2_actual
    FOR v_proyecto IN 
        SELECT id, precio_m2_actual
        FROM proyectos
        WHERE activo = true 
          AND precio_m2_actual IS NOT NULL
          AND precio_m2_actual > 0
    LOOP
        -- Verificar si TODAS las propiedades del proyecto están en estatus >= 5
        SELECT NOT EXISTS(
            SELECT 1
            FROM propiedades p
            JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
            WHERE er.id_proyecto = v_proyecto.id
              AND p.activo = true
              AND p.id_estatus_disponibilidad < 5
        ) INTO v_todas_vendidas;
        
        -- Si todas están vendidas/apartadas, incrementar el precio
        IF v_todas_vendidas THEN
            -- Incrementar 10/12 = 0.833333% y redondear a 2 decimales
            v_nuevo_precio := ROUND(v_proyecto.precio_m2_actual * 1.00833333, 2);
            
            UPDATE proyectos
            SET precio_m2_actual = v_nuevo_precio,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = v_proyecto.id;
            
            RAISE NOTICE 'Proyecto %: precio_m2_actual actualizado de % a %', 
                v_proyecto.id, v_proyecto.precio_m2_actual, v_nuevo_precio;
        END IF;
    END LOOP;
END;
$function$;