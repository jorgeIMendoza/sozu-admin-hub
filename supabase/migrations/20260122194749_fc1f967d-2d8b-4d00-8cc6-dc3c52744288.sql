-- Fix the RPC function - correct data types

DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(text, text, text, text, text, text, text, integer[], text[], integer, integer, boolean, integer[], bigint[]);

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
  p_id_cuenta text DEFAULT NULL,
  p_proyecto text DEFAULT NULL,
  p_clabe text DEFAULT NULL,
  p_no_propiedad text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_compradores text DEFAULT NULL,
  p_producto text DEFAULT NULL,
  p_estatus_ids integer[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50,
  p_activo boolean DEFAULT true,
  p_proyecto_ids integer[] DEFAULT NULL,
  p_dueno_entity_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  clabe_stp text,
  fecha_compra timestamp,
  precio_final numeric,
  activo boolean,
  id_oferta integer,
  tipo text,
  proyecto text,
  id_proyecto integer,
  modelo text,
  edificio text,
  numero_propiedad text,
  id_propiedad bigint,
  producto text,
  id_producto integer,
  comprador text,
  compradores_json jsonb,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  vendedor text,
  dueno text,
  id_entidad_relacionada_dueno bigint,
  id_cuenta_cobranza_padre bigint,
  metraje numeric,
  precio_lista numeric,
  pagado numeric,
  restante numeric,
  tiene_acuerdos boolean,
  apartado_pagado boolean,
  total_acuerdos numeric,
  discrepancia numeric,
  cash_limit numeric,
  cash_paid numeric,
  cash_payments jsonb,
  collection_id bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset integer;
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  SELECT COUNT(*)
  INTO v_total
  FROM cuentas_cobranza cc
  JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  LEFT JOIN proyectos proj ON proj.id = ed.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN estatus_disponibilidad estat ON estat.id = prop.id_estatus_disponibilidad
  LEFT JOIN entidades_relacionadas er_dueno ON er_dueno.id = prop.id_entidad_relacionada_dueno
  LEFT JOIN personas p_dueno ON p_dueno.id = er_dueno.id_persona
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proj.nombre, ps.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM personas pl WHERE pl.id = o.id_persona_lead 
      AND pl.nombre_legal ILIKE '%' || p_compradores || '%'
    ) OR EXISTS (
      SELECT 1 FROM compradores comp 
      JOIN personas pc ON pc.id = comp.id_persona 
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
      AND pc.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_producto IS NULL THEN 'Propiedad'
        ELSE 'Producto'
      END) = ANY(p_tipos)
    )
    AND (p_proyecto_ids IS NULL OR ed.id_proyecto = ANY(p_proyecto_ids) OR ps.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_creacion as fecha_compra,
    cc.precio_final,
    cc.activo,
    cc.id_oferta,
    CASE 
      WHEN o.id_producto IS NULL THEN 'Propiedad'::text
      ELSE 'Producto'::text
    END as tipo,
    COALESCE(proj.nombre, ps_proj.nombre)::text as proyecto,
    COALESCE(ed.id_proyecto, ps.id_proyecto) as id_proyecto,
    m.nombre::text as modelo,
    ed.nombre::text as edificio,
    prop.numero_propiedad::text,
    prop.id as id_propiedad,
    ps.nombre::text as producto,
    ps.id as id_producto,
    COALESCE(
      (SELECT string_agg(pc.nombre_legal, ', ')
       FROM compradores comp 
       JOIN personas pc ON pc.id = comp.id_persona 
       WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true),
      pl.nombre_legal
    )::text as comprador,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id_persona', pc.id,
        'nombre_legal', pc.nombre_legal,
        'rfc', pc.rfc,
        'porcentaje_copropiedad', COALESCE(comp.porcentaje_copropiedad, 100)
      ))
       FROM compradores comp 
       JOIN personas pc ON pc.id = comp.id_persona 
       WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true),
      CASE WHEN pl.id IS NOT NULL THEN 
        jsonb_build_array(jsonb_build_object(
          'id_persona', pl.id,
          'nombre_legal', pl.nombre_legal,
          'rfc', pl.rfc,
          'porcentaje_copropiedad', 100
        ))
      ELSE '[]'::jsonb END
    ) as compradores_json,
    prop.id_estatus_disponibilidad,
    estat.nombre::text as estatus_disponibilidad_nombre,
    o.email_creador::text as vendedor,
    p_dueno.nombre_legal::text as dueno,
    prop.id_entidad_relacionada_dueno,
    cc.id_cuenta_cobranza_padre,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) as metraje,
    prop.precio_lista,
    COALESCE(
      (SELECT SUM(ap.monto) 
       FROM aplicaciones_pago ap 
       JOIN pagos pg ON pg.id = ap.id_pago AND pg.activo = true
       WHERE ap.id_acuerdo_pago IN (
         SELECT ac.id FROM acuerdos_pago ac WHERE ac.id_cuenta_cobranza = cc.id AND ac.activo = true
       ) AND ap.activo = true),
      0
    ) as pagado,
    cc.precio_final - COALESCE(
      (SELECT SUM(ap.monto) 
       FROM aplicaciones_pago ap 
       JOIN pagos pg ON pg.id = ap.id_pago AND pg.activo = true
       WHERE ap.id_acuerdo_pago IN (
         SELECT ac.id FROM acuerdos_pago ac WHERE ac.id_cuenta_cobranza = cc.id AND ac.activo = true
       ) AND ap.activo = true),
      0
    ) as restante,
    EXISTS(SELECT 1 FROM acuerdos_pago ac WHERE ac.id_cuenta_cobranza = cc.id AND ac.activo = true) as tiene_acuerdos,
    COALESCE(
      (SELECT ac2.pago_completado 
       FROM acuerdos_pago ac2 
       WHERE ac2.id_cuenta_cobranza = cc.id AND ac2.activo = true 
       ORDER BY ac2.orden ASC LIMIT 1),
      false
    ) as apartado_pagado,
    COALESCE(
      (SELECT SUM(ac3.monto) FROM acuerdos_pago ac3 WHERE ac3.id_cuenta_cobranza = cc.id AND ac3.activo = true),
      0
    ) as total_acuerdos,
    cc.precio_final - COALESCE(
      (SELECT SUM(ac4.monto) FROM acuerdos_pago ac4 WHERE ac4.id_cuenta_cobranza = cc.id AND ac4.activo = true),
      0
    ) as discrepancia,
    COALESCE(8025 * COALESCE(cc.valor_uma, 0), 0) as cash_limit,
    COALESCE(
      (SELECT SUM(pg2.monto) 
       FROM pagos pg2 
       WHERE pg2.id_cuenta_cobranza = cc.id 
         AND pg2.activo = true 
         AND pg2.id_metodos_pago = 4),
      0
    ) as cash_paid,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pg3.fecha_pago,
        'monto', pg3.monto
      ))
       FROM pagos pg3 
       WHERE pg3.id_cuenta_cobranza = cc.id 
         AND pg3.activo = true 
         AND pg3.id_metodos_pago = 4),
      '[]'::jsonb
    ) as cash_payments,
    cc.collection_id,
    v_total as total_count
  FROM cuentas_cobranza cc
  JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN personas pl ON pl.id = o.id_persona_lead
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  LEFT JOIN proyectos proj ON proj.id = ed.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN proyectos ps_proj ON ps_proj.id = ps.id_proyecto
  LEFT JOIN estatus_disponibilidad estat ON estat.id = prop.id_estatus_disponibilidad
  LEFT JOIN entidades_relacionadas er_dueno ON er_dueno.id = prop.id_entidad_relacionada_dueno
  LEFT JOIN personas p_dueno ON p_dueno.id = er_dueno.id_persona
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proj.nombre, ps_proj.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM personas pl2 WHERE pl2.id = o.id_persona_lead 
      AND pl2.nombre_legal ILIKE '%' || p_compradores || '%'
    ) OR EXISTS (
      SELECT 1 FROM compradores comp 
      JOIN personas pc ON pc.id = comp.id_persona 
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
      AND pc.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_producto IS NULL THEN 'Propiedad'
        ELSE 'Producto'
      END) = ANY(p_tipos)
    )
    AND (p_proyecto_ids IS NULL OR ed.id_proyecto = ANY(p_proyecto_ids) OR ps.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;