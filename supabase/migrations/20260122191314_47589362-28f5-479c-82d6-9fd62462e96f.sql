DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[]);

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
  fecha_compra DATE,
  precio_final NUMERIC,
  valor_uma NUMERIC,
  porcentaje_comision_venta NUMERIC,
  activo BOOLEAN,
  id_oferta INTEGER,
  id_estatus_disponibilidad INTEGER,
  estatus_nombre TEXT,
  id_propiedad INTEGER,
  numero_propiedad TEXT,
  piso TEXT,
  id_edificio_modelo INTEGER,
  edificio_nombre TEXT,
  modelo_nombre TEXT,
  id_proyecto INTEGER,
  proyecto_nombre TEXT,
  compradores JSONB,
  id_producto INTEGER,
  producto_nombre TEXT,
  tipo TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Get total count
  SELECT COUNT(*)
  INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN proyectos proy_prod ON proy_prod.id = ps.id_proyecto
  LEFT JOIN estado_disponibilidad ed ON ed.id = cc.id_estatus_disponibilidad
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR cc.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (CASE 
           WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
           WHEN o.id_producto IS NOT NULL THEN 'Producto'
           ELSE 'Servicio'
         END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(e.id_proyecto, ps.id_proyecto) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id::INTEGER,
    cc.clabe_stp::TEXT,
    cc.fecha_compra::DATE,
    cc.precio_final::NUMERIC,
    cc.valor_uma::NUMERIC,
    cc.porcentaje_comision_venta::NUMERIC,
    cc.activo::BOOLEAN,
    cc.id_oferta::INTEGER,
    cc.id_estatus_disponibilidad::INTEGER,
    ed.nombre::TEXT AS estatus_nombre,
    prop.id::INTEGER AS id_propiedad,
    prop.numero_propiedad::TEXT,
    prop.piso::TEXT,
    em.id::INTEGER AS id_edificio_modelo,
    e.nombre::TEXT AS edificio_nombre,
    m.nombre::TEXT AS modelo_nombre,
    COALESCE(e.id_proyecto, ps.id_proyecto)::INTEGER AS id_proyecto,
    COALESCE(proy.nombre, proy_prod.nombre)::TEXT AS proyecto_nombre,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre_legal,
        'rfc', p.rfc
      ))
      FROM compradores_cuenta_cobranza ccc
      JOIN personas p ON p.id = ccc.id_persona
      WHERE ccc.id_cuenta_cobranza = cc.id AND ccc.activo = true),
      '[]'::jsonb
    ) AS compradores,
    o.id_producto::INTEGER,
    ps.nombre::TEXT AS producto_nombre,
    (CASE 
       WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
       WHEN o.id_producto IS NOT NULL THEN 'Producto'
       ELSE 'Servicio'
     END)::TEXT AS tipo,
    v_total::BIGINT AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN proyectos proy_prod ON proy_prod.id = ps.id_proyecto
  LEFT JOIN estado_disponibilidad ed ON ed.id = cc.id_estatus_disponibilidad
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR cc.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (CASE 
           WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
           WHEN o.id_producto IS NOT NULL THEN 'Producto'
           ELSE 'Servicio'
         END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(e.id_proyecto, ps.id_proyecto) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;