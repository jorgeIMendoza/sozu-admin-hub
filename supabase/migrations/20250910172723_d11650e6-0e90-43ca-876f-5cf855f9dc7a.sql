-- Update the get_properties_with_details function to include the COALESCE logic for clabe_stp
CREATE OR REPLACE FUNCTION public.get_properties_with_details()
 RETURNS TABLE(id bigint, "dueño" text, numero_propiedad text, numero_piso integer, m2_reales numeric, precio_lista numeric, clabe_stp text, vista text, transaccion text, tipo_propiedad text, disponibilidad text, modelo text, activo boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        per.nombre_legal as dueño,
        p.numero_propiedad,
        p.numero_piso,
        p.m2_reales,
        p.precio_lista,
        COALESCE(p.clabe_stp_tmp_apartado, cc.clabe_stp) as clabe_stp,
        v.nombre as vista,
        tt.nombre as transaccion,
        tp.nombre as tipo_propiedad,
        ed.nombre as disponibilidad,
        m.nombre as modelo,
        p.activo
    FROM propiedades p
    JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id
    JOIN personas per ON er.id_persona = per.id
    JOIN vistas v ON p.id_vista = v.id
    JOIN tipos_transaccion tt ON p.id_tipo_transaccion = tt.id
    JOIN tipos_propiedad tp ON p.id_tipo_propiedad = tp.id
    JOIN estatus_disponibilidad ed ON p.id_estatus_disponibilidad = ed.id
    JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
    JOIN modelos m ON em.id_modelo = m.id
    LEFT JOIN ofertas o ON o.id_propiedad = p.id
    LEFT JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
    ORDER BY p.numero_propiedad;
END;
$function$