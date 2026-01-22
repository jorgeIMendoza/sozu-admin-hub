-- Drop the existing function completely
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas;

-- Recreate with the CORRECT signature matching what the hook expects
CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
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
RETURNS TABLE (
  id integer,
  clabe_stp text,
  fecha_compra date,
  precio_final numeric,
  activo boolean,
  id_oferta integer,
  tipo text,
  proyecto text,
  id_proyecto integer,
  modelo text,
  edificio text,
  numero_propiedad text,
  id_propiedad integer,
  producto text,
  id_producto integer,
  comprador text,
  compradores_json jsonb,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  vendedor text,
  dueno text,
  id_entidad_relacionada_dueno integer,
  id_cuenta_cobranza_padre integer,
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
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos proy_prod ON ps.id_proyecto = proy_prod.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy_prod.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND o.id_propiedad IS NULL AND 'Producto' = ANY(p_tipos)));

  RETURN QUERY
  SELECT 
    cc.id::integer,
    cc.clabe_stp::text,
    cc.fecha_compra::date,
    cc.precio_final::numeric,
    cc.activo::boolean,
    cc.id_oferta::integer,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      ELSE 'Servicio'
    END::text as tipo,
    COALESCE(proy.nombre, proy_prod.nombre)::text as proyecto,
    COALESCE(proy.id, proy_prod.id)::integer as id_proyecto,
    m.nombre::text as modelo,
    e.nombre::text as edificio,
    prop.numero_propiedad::text as numero_propiedad,
    o.id_propiedad::integer,
    ps.nombre::text as producto,
    o.id_producto::integer,
    -- First comprador name
    (SELECT pers.nombre_legal FROM compradores comp JOIN personas pers ON comp.id_persona = pers.id WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true LIMIT 1)::text as comprador,
    -- All compradores as JSON
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id_persona', comp.id_persona,
        'nombre_legal', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje_copropiedad', comp.porcentaje_participacion
      ))
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) as compradores_json,
    prop.id_estatus_disponibilidad::integer,
    ed.nombre::text as estatus_disponibilidad_nombre,
    -- Vendedor
    (SELECT pers_v.nombre_legal FROM personas pers_v WHERE pers_v.id = o.id_persona_vendedor)::text as vendedor,
    -- Dueño via entidad_relacionada -> persona
    per.nombre_legal::text as dueno,
    prop.id_entidad_relacionada_dueno::integer,
    cc.id_cuenta_cobranza_padre::integer,
    -- Metraje
    (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0))::numeric as metraje,
    prop.precio_lista::numeric,
    -- Pagado (sum of payments)
    COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0)::numeric as pagado,
    -- Restante (precio_final - pagado)
    (cc.precio_final - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0))::numeric as restante,
    -- Tiene acuerdos
    EXISTS(SELECT 1 FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true)::boolean as tiene_acuerdos,
    -- Apartado pagado
    COALESCE(
      (SELECT ap.pago_completado FROM acuerdos_pago ap 
       JOIN conceptos_pago cp ON ap.id_concepto = cp.id
       WHERE ap.id_cuenta_cobranza = cc.id AND cp.nombre = 'Apartado' AND ap.activo = true LIMIT 1),
      EXISTS(SELECT 1 FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true AND p.monto > 0)
    )::boolean as apartado_pagado,
    -- Total acuerdos
    COALESCE((SELECT SUM(ap.monto) FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true), 0)::numeric as total_acuerdos,
    -- Discrepancia (pagado - applied)
    (
      COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true), 0) -
      COALESCE((SELECT SUM(apl.monto) FROM aplicaciones_pago apl JOIN pagos p ON apl.id_pago = p.id WHERE p.id_cuenta_cobranza = cc.id AND apl.activo = true AND p.activo = true), 0)
    )::numeric as discrepancia,
    -- Cash limit (sum of cash agreements)
    COALESCE((
      SELECT SUM(ap.monto) FROM acuerdos_pago ap
      JOIN conceptos_pago cp ON ap.id_concepto = cp.id
      WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true AND cp.es_efectivo = true
    ), 0)::numeric as cash_limit,
    -- Cash paid
    COALESCE((
      SELECT SUM(p.monto) FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id AND p.activo = true AND p.id_metodos_pago = 2
    ), 0)::numeric as cash_paid,
    -- Cash payments
    (
      SELECT jsonb_agg(jsonb_build_object('fecha_pago', pe.fecha_pago, 'monto', pe.monto))
      FROM pagos pe
      WHERE pe.id_cuenta_cobranza = cc.id AND pe.activo = true AND pe.id_metodos_pago = 2
    ) as cash_payments,
    cc.collection_id::integer,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN entidades_relacionadas ent ON prop.id_entidad_relacionada_dueno = ent.id
  LEFT JOIN personas per ON ent.id_persona = per.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos proy_prod ON ps.id_proyecto = proy_prod.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy_prod.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp 
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
      AND pers.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND o.id_propiedad IS NULL AND 'Producto' = ANY(p_tipos)))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;