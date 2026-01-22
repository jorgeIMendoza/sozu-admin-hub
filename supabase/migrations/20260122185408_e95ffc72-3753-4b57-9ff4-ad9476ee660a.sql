-- Drop all existing overloaded versions of the function
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[]);
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[], text);

-- Recreate the function with the correct parameter order (vendedor at the end)
CREATE OR REPLACE FUNCTION public.get_cuentas_cobranza_paginadas(
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
  fecha_compra DATE,
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
  
  -- Count total matching records
  SELECT COUNT(*) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN proyectos proy ON prop.id_proyecto = proy.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN productos_servicios ps ON o.id_producto_servicio = ps.id
  WHERE 
    -- Filter by active status
    cc.activo = p_activo
    -- Filter by tipo_pago (exclude maintenance accounts - tipo_pago = 3)
    AND cc.id_tipo_pago != 3
    -- ID filter
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    -- Project name filter
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    -- CLABE filter
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    -- Property number filter
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    -- Model filter
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    -- Product filter
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    -- Buyers filter
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ))
    -- Status filter
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    -- Type filter (Propiedad/Producto/Servicio)
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        ELSE 'Servicio'
      END) = ANY(p_tipos)
    )
    -- Project access filter
    AND (p_proyecto_ids IS NULL OR prop.id_proyecto = ANY(p_proyecto_ids))
    -- Owner entity filter
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids));

  -- Return paginated results
  RETURN QUERY
  SELECT 
    cc.id::INTEGER,
    cc.clabe_stp::TEXT,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    cc.id_oferta::INTEGER,
    (CASE 
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
      ELSE 'Servicio'
    END)::TEXT AS tipo,
    proy.nombre::TEXT AS nombre_proyecto,
    proy.id::INTEGER AS id_proyecto,
    m.nombre::TEXT AS nombre_modelo,
    prop.numero_propiedad::TEXT,
    prop.id::INTEGER AS id_propiedad,
    ps.nombre::TEXT AS nombre_producto,
    ps.id::INTEGER AS id_producto,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pers.id,
        'nombre_legal', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', comp.porcentaje_copropiedad
      )), '[]'::jsonb)
      FROM compradores comp
      JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true
    ) AS compradores,
    prop.id_estatus_disponibilidad::INTEGER,
    NULL::TEXT AS nombre_vendedor,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fecha_pago', p.fecha_pago,
        'monto', p.monto
      )), '[]'::jsonb)
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id 
        AND p.activo = true 
        AND p.id_metodos_pago = 1
    ) AS pagos_efectivo,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN proyectos proy ON prop.id_proyecto = proy.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN productos_servicios ps ON o.id_producto_servicio = ps.id
  WHERE 
    cc.activo = p_activo
    AND cc.id_tipo_pago != 3
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp2
      JOIN personas pers2 ON comp2.id_persona = pers2.id
      WHERE comp2.id_cuenta_cobranza = cc.id 
        AND comp2.activo = true
        AND (pers2.nombre_legal ILIKE '%' || p_compradores || '%' OR pers2.rfc ILIKE '%' || p_compradores || '%')
    ))
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        ELSE 'Servicio'
      END) = ANY(p_tipos)
    )
    AND (p_proyecto_ids IS NULL OR prop.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;