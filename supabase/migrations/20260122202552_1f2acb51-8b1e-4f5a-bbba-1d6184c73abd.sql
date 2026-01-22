-- Recreate function with corrected cash payment logic
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(integer[], integer[], text, text, text, text, text, text, integer[], text[], boolean, integer, integer);

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
  p_proyecto_ids integer[] DEFAULT NULL,
  p_dueno_entity_ids integer[] DEFAULT NULL,
  p_id_cuenta text DEFAULT NULL,
  p_proyecto text DEFAULT NULL,
  p_clabe text DEFAULT NULL,
  p_no_propiedad text DEFAULT NULL,
  p_modelo text DEFAULT NULL,
  p_compradores text DEFAULT NULL,
  p_estatus_ids integer[] DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_activo boolean DEFAULT true,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50
)
RETURNS TABLE (
  id integer,
  clabe_stp text,
  fecha_compra date,
  precio_final numeric,
  pagado numeric,
  restante numeric,
  discrepancia numeric,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad text,
  id_propiedad integer,
  no_propiedad text,
  id_producto integer,
  producto text,
  id_proyecto integer,
  proyecto text,
  id_modelo integer,
  modelo text,
  compradores_json jsonb,
  activo boolean,
  cash_limit numeric,
  cash_paid numeric,
  tipo text,
  metraje numeric,
  dueno text,
  vendedor text,
  id_oferta integer,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
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
  WHERE cc.activo = p_activo
    AND (p_proyecto_ids IS NULL OR cc.id_proyecto = ANY(p_proyecto_ids))
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
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
    ed.nombre as estatus_disponibilidad,
    cc.id_propiedad,
    prop.numero as no_propiedad,
    cc.id_producto,
    ps.nombre as producto,
    cc.id_proyecto,
    proy.nombre as proyecto,
    em.id_modelo,
    m.nombre as modelo,
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
    -- Cash limit from acuerdos with concepto 'Efectivo' or similar
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
    CASE 
      WHEN cc.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN cc.id_producto IS NOT NULL THEN 'Producto'
      ELSE 'Servicio'
    END as tipo,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) as metraje,
    -- Dueno from propiedad
    (SELECT pers.nombre_legal FROM personas pers WHERE pers.id = prop.id_persona_dueno) as dueno,
    -- Vendedor - null for now
    NULL::text as vendedor,
    cc.id_oferta,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON cc.id_propiedad = prop.id
  LEFT JOIN productos_servicios ps ON cc.id_producto = ps.id
  LEFT JOIN proyectos proy ON cc.id_proyecto = proy.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  WHERE cc.activo = p_activo
    AND (p_proyecto_ids IS NULL OR cc.id_proyecto = ANY(p_proyecto_ids))
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
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