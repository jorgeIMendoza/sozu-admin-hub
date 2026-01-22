-- Drop and recreate the function with the p_producto parameter added
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(
  integer[], integer[], text, text, text, text, text, text, integer[], text[], boolean, integer, integer
);

CREATE OR REPLACE FUNCTION public.get_cuentas_cobranza_paginadas(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50,
  p_id_cuenta text DEFAULT NULL,
  p_proyecto text DEFAULT NULL,
  p_clabe text DEFAULT NULL,
  p_no_propiedad text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_compradores text DEFAULT NULL,
  p_producto text DEFAULT NULL,
  p_estatus_ids integer[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_activo boolean DEFAULT true,
  p_proyecto_ids integer[] DEFAULT NULL,
  p_dueno_entity_ids integer[] DEFAULT NULL
)
RETURNS TABLE(
  id integer,
  clabe_stp text,
  fecha_compra date,
  precio_final numeric,
  pagado numeric,
  restante numeric,
  discrepancia numeric,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  id_propiedad integer,
  numero_propiedad text,
  id_producto integer,
  producto text,
  id_proyecto integer,
  proyecto text,
  id_modelo integer,
  modelo text,
  edificio text,
  compradores_json jsonb,
  activo boolean,
  id_oferta integer,
  cash_limit numeric,
  cash_paid numeric,
  cash_payments jsonb,
  tipo text,
  metraje numeric,
  precio_lista numeric,
  dueno text,
  id_entidad_relacionada_dueno integer,
  vendedor text,
  tiene_acuerdos boolean,
  apartado_pagado boolean,
  total_acuerdos numeric,
  collection_id integer,
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
  
  -- Get total count first
  SELECT COUNT(*)
  INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON cc.id_propiedad = prop.id
  LEFT JOIN productos_servicios ps ON cc.id_producto = ps.id
  LEFT JOIN proyectos proy ON cc.id_proyecto = proy.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN entidades_relacionadas_proyectos erp ON cc.id_proyecto = erp.id_proyecto 
    AND erp.id_tipo_relacion = 1 AND erp.activo = true
  LEFT JOIN personas dueno_persona ON erp.id_entidad_relacionada = dueno_persona.id
  WHERE cc.activo = p_activo
    AND (p_proyecto_ids IS NULL OR cc.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR erp.id_entidad_relacionada = ANY(p_dueno_entity_ids))
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (('Propiedad' = ANY(p_tipos) AND cc.id_propiedad IS NOT NULL) OR
          ('Producto' = ANY(p_tipos) AND cc.id_producto IS NOT NULL AND cc.id_propiedad IS NULL)))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0) as pagado,
    cc.precio_final - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0) as restante,
    COALESCE((
      SELECT SUM(ap.monto) - SUM(p.monto)
      FROM pagos p
      LEFT JOIN aplicaciones_pago ap ON ap.id_pago = p.id AND ap.activo = true
      WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true
    ), 0) as discrepancia,
    prop.id_estatus_disponibilidad,
    ed.nombre as estatus_disponibilidad_nombre,
    cc.id_propiedad,
    prop.numero as numero_propiedad,
    cc.id_producto,
    ps.nombre as producto,
    cc.id_proyecto,
    proy.nombre as proyecto,
    em.id_modelo,
    m.nombre as modelo,
    e.nombre as edificio,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id_persona', comp.id_persona,
        'nombre_legal', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje_copropiedad', comp.porcentaje_copropiedad
      ))
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) as compradores_json,
    cc.activo,
    o.id as id_oferta,
    -- Cash limit from acuerdos with concepto 'Efectivo'
    COALESCE((
      SELECT SUM(ap.monto) 
      FROM acuerdos_pago ap 
      JOIN conceptos_pago cp ON ap.id_concepto = cp.id
      WHERE ap.id_cuenta_cobranza = cc.id 
        AND ap.activo = true 
        AND LOWER(cp.nombre) LIKE '%efectivo%'
    ), 0) as cash_limit,
    -- Cash paid: payments made with metodo_pago = 1 (Efectivo)
    COALESCE((
      SELECT SUM(p.monto) 
      FROM pagos p 
      WHERE p.id_cuenta_cobranza = cc.id 
        AND p.activo = true 
        AND p.id_metodos_pago = 1
    ), 0) as cash_paid,
    -- Cash payments details
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', p.fecha_pago,
        'monto', p.monto
      ))
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id 
        AND p.activo = true 
        AND p.id_metodos_pago = 1
    ), '[]'::jsonb) as cash_payments,
    CASE 
      WHEN cc.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN cc.id_producto IS NOT NULL THEN 'Producto'
      ELSE 'Servicio'
    END as tipo,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) as metraje,
    prop.precio_lista,
    dueno_persona.nombre_legal as dueno,
    erp.id_entidad_relacionada as id_entidad_relacionada_dueno,
    (
      SELECT pv.nombre_legal
      FROM personas pv
      WHERE pv.id = o.id_persona_lead
    ) as vendedor,
    EXISTS(SELECT 1 FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true) as tiene_acuerdos,
    EXISTS(SELECT 1 FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true) as apartado_pagado,
    COALESCE((SELECT SUM(ap.monto) FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true), 0) as total_acuerdos,
    cc.collection_id,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON cc.id_propiedad = prop.id
  LEFT JOIN productos_servicios ps ON cc.id_producto = ps.id
  LEFT JOIN proyectos proy ON cc.id_proyecto = proy.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN entidades_relacionadas_proyectos erp ON cc.id_proyecto = erp.id_proyecto 
    AND erp.id_tipo_relacion = 1 AND erp.activo = true
  LEFT JOIN personas dueno_persona ON erp.id_entidad_relacionada = dueno_persona.id
  WHERE cc.activo = p_activo
    AND (p_proyecto_ids IS NULL OR cc.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR erp.id_entidad_relacionada = ANY(p_dueno_entity_ids))
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (('Propiedad' = ANY(p_tipos) AND cc.id_propiedad IS NOT NULL) OR
          ('Producto' = ANY(p_tipos) AND cc.id_producto IS NOT NULL AND cc.id_propiedad IS NULL)))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;