-- Drop and recreate the function without vendedor reference (not in schema)
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[], TEXT);

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
  p_page INTEGER DEFAULT 1,
  p_per_page INTEGER DEFAULT 50,
  p_id_cuenta TEXT DEFAULT NULL,
  p_proyecto TEXT DEFAULT NULL,
  p_clabe TEXT DEFAULT NULL,
  p_no_propiedad TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_compradores TEXT DEFAULT NULL,
  p_producto TEXT DEFAULT NULL,
  p_estatus_ids INTEGER[] DEFAULT NULL,
  p_tipos TEXT[] DEFAULT NULL,
  p_activo BOOLEAN DEFAULT TRUE,
  p_proyecto_ids INTEGER[] DEFAULT NULL,
  p_dueno_entity_ids INTEGER[] DEFAULT NULL,
  p_vendedor TEXT DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  clabe_stp TEXT,
  fecha_compra TIMESTAMP WITH TIME ZONE,
  precio_final NUMERIC,
  activo BOOLEAN,
  id_oferta INTEGER,
  tipo TEXT,
  nombre_proyecto TEXT,
  id_proyecto INTEGER,
  nombre_modelo TEXT,
  numero_propiedad TEXT,
  id_propiedad INTEGER,
  nombre_producto TEXT,
  id_producto INTEGER,
  compradores JSONB,
  id_estatus_disponibilidad INTEGER,
  nombre_vendedor TEXT,
  pagos_efectivo JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Get total count first (without vendedor filter as it doesn't exist in schema)
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
  LEFT JOIN proyectos proy2 ON ps.id_proyecto = proy2.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy2.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR COALESCE(prop.numero_propiedad, '') ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR COALESCE(m.nombre, '') ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR COALESCE(ps.nombre, '') ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND o.id_producto IS NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND 'Producto' = ANY(p_tipos)))
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids));

  -- Return paginated results with total count
  RETURN QUERY
  SELECT 
    cc.id::INTEGER,
    cc.clabe_stp::TEXT,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    cc.id_oferta::INTEGER,
    CASE 
      WHEN o.id_propiedad IS NOT NULL AND o.id_producto IS NULL THEN 'Propiedad'::TEXT
      WHEN o.id_producto IS NOT NULL THEN 'Producto'::TEXT
      ELSE 'Servicio'::TEXT
    END AS tipo,
    COALESCE(proy.nombre, proy2.nombre)::TEXT AS nombre_proyecto,
    COALESCE(proy.id, proy2.id)::INTEGER AS id_proyecto,
    m.nombre::TEXT AS nombre_modelo,
    prop.numero_propiedad::TEXT AS numero_propiedad,
    prop.id::INTEGER AS id_propiedad,
    ps.nombre::TEXT AS nombre_producto,
    ps.id::INTEGER AS id_producto,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pers.id,
        'nombre_legal', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', ccp.porcentaje_participacion
      ))
      FROM compradores_cuentas_cobranza ccp
      JOIN personas pers ON ccp.id_persona = pers.id
      WHERE ccp.id_cuenta_cobranza = cc.id AND ccp.activo = true
    ) AS compradores,
    prop.id_estatus_disponibilidad::INTEGER,
    NULL::TEXT AS nombre_vendedor,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', p.fecha_pago,
        'monto', p.monto
      ))
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id 
        AND p.activo = true 
        AND p.id_metodos_pago = 1
    ) AS pagos_efectivo,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN proyectos proy ON e.id_proyecto = proy.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos proy2 ON ps.id_proyecto = proy2.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy2.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR COALESCE(prop.numero_propiedad, '') ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR COALESCE(m.nombre, '') ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR COALESCE(ps.nombre, '') ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND o.id_producto IS NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND 'Producto' = ANY(p_tipos)))
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;