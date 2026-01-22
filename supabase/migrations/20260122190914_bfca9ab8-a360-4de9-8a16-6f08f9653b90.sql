
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(
  p_page INTEGER,
  p_per_page INTEGER,
  p_id_cuenta TEXT,
  p_proyecto TEXT,
  p_clabe TEXT,
  p_no_propiedad TEXT,
  p_modelo TEXT,
  p_compradores TEXT,
  p_producto TEXT,
  p_estatus_ids INTEGER[],
  p_tipos TEXT[],
  p_activo BOOLEAN,
  p_proyecto_ids INTEGER[],
  p_dueno_entity_ids INTEGER[]
);

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
  p_dueno_entity_ids INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  clabe_stp TEXT,
  fecha_compra TIMESTAMP WITH TIME ZONE,
  precio_final NUMERIC,
  id_oferta INTEGER,
  tipo TEXT,
  id_estatus_disponibilidad INTEGER,
  estatus_nombre TEXT,
  id_proyecto INTEGER,
  proyecto_nombre TEXT,
  proyecto_logo TEXT,
  id_edificio INTEGER,
  edificio_nombre TEXT,
  id_modelo INTEGER,
  modelo_nombre TEXT,
  no_propiedad TEXT,
  producto_nombre TEXT,
  id_producto INTEGER,
  compradores JSONB,
  nombre_vendedor TEXT,
  porcentaje_comision_venta NUMERIC,
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
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = cc.id_producto
  LEFT JOIN estatus_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR cc.tipo = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_persona_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id::INTEGER,
    cc.clabe_stp::TEXT,
    cc.fecha_compra,
    cc.precio_final,
    cc.id_oferta::INTEGER,
    cc.tipo::TEXT,
    prop.id_estatus_disponibilidad::INTEGER,
    ed.nombre::TEXT AS estatus_nombre,
    e.id_proyecto::INTEGER AS id_proyecto,
    proy.nombre::TEXT AS proyecto_nombre,
    proy.url_logo::TEXT AS proyecto_logo,
    e.id::INTEGER AS id_edificio,
    e.nombre::TEXT AS edificio_nombre,
    em.id_modelo::INTEGER AS id_modelo,
    m.nombre::TEXT AS modelo_nombre,
    prop.numero_propiedad::TEXT AS no_propiedad,
    ps.nombre::TEXT AS producto_nombre,
    cc.id_producto::INTEGER,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', comp.id_persona,
        'nombre', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', comp.porcentaje_propiedad
      ))
      FROM compradores comp
      JOIN personas pers ON pers.id = comp.id_persona
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true),
      '[]'::jsonb
    ) AS compradores,
    (SELECT pers2.nombre_legal 
     FROM personas pers2 
     WHERE pers2.id = o.id_persona_vendedor
     LIMIT 1)::TEXT AS nombre_vendedor,
    cc.porcentaje_comision_venta,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pe.fecha_pago,
        'monto', pe.monto
      ))
      FROM pagos_efectivo pe
      WHERE pe.id_cuenta_cobranza = cc.id AND pe.activo = true),
      '[]'::jsonb
    ) AS pagos_efectivo,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = cc.id_producto
  LEFT JOIN estatus_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR cc.tipo = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_persona_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;
