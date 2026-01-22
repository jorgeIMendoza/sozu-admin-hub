-- Drop existing function
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[]);

-- Recreate with correct column names
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
  p_dueno_entity_ids INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  id_oferta INTEGER,
  clabe_stp TEXT,
  fecha_compra DATE,
  precio_final NUMERIC,
  activo BOOLEAN,
  proyecto TEXT,
  id_proyecto INTEGER,
  numero_propiedad TEXT,
  modelo TEXT,
  edificio TEXT,
  id_estatus_disponibilidad INTEGER,
  estatus_disponibilidad TEXT,
  compradores JSONB,
  tipo TEXT,
  nombre_producto TEXT,
  id_propiedad INTEGER,
  id_persona_lead INTEGER,
  nombre_vendedor TEXT,
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

  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM cuentas_cobranza cc
  JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN estado_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND 'Producto' = ANY(p_tipos)))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_persona_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.id_oferta,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    proy.nombre AS proyecto,
    e.id_proyecto AS id_proyecto,
    prop.numero_propiedad,
    m.nombre AS modelo,
    e.nombre AS edificio,
    prop.id_estatus_disponibilidad,
    ed.nombre AS estatus_disponibilidad,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', per.id,
        'nombre', per.nombre_legal,
        'rfc', per.rfc,
        'email', per.email,
        'porcentaje', oc.porcentaje_compra
      ))
      FROM ofertas_compradores oc
      JOIN personas per ON per.id = oc.id_persona
      WHERE oc.id_oferta = o.id AND oc.activo = true),
      '[]'::jsonb
    ) AS compradores,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      ELSE 'Servicio'
    END AS tipo,
    ps.nombre AS nombre_producto,
    o.id_propiedad,
    o.id_persona_lead,
    (SELECT per2.nombre_legal FROM personas per2 WHERE per2.id = o.id_persona_lead) AS nombre_vendedor,
    v_total AS total_count
  FROM cuentas_cobranza cc
  JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN estado_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (o.id_propiedad IS NOT NULL AND 'Propiedad' = ANY(p_tipos)) OR
         (o.id_producto IS NOT NULL AND 'Producto' = ANY(p_tipos)))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_persona_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;