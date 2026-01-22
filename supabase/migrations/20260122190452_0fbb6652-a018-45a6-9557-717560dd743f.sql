
-- Drop existing function
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[]);

-- Recreate with correct table name: estatus_disponibilidad (NOT estado_disponibilidad)
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
RETURNS TABLE(
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
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR em.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR cc.tipo = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR e.id_proyecto = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_persona_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id::BIGINT,
    cc.id_oferta,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    proy.nombre AS proyecto,
    e.id_proyecto,
    prop.numero AS numero_propiedad,
    em.nombre AS modelo,
    e.nombre AS edificio,
    prop.id_estatus_disponibilidad,
    ed.nombre AS estatus_disponibilidad,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', per.id,
        'nombre', per.nombre_legal,
        'rfc', per.rfc,
        'email', per.email
      ))
      FROM compradores_cuenta_cobranza ccc
      JOIN personas per ON per.id = ccc.id_persona
      WHERE ccc.id_cuenta_cobranza = cc.id AND ccc.activo = true
    ) AS compradores,
    cc.tipo,
    ps.nombre AS nombre_producto,
    cc.id_propiedad,
    o.id_persona_lead,
    (
      SELECT pv.nombre_legal
      FROM personas pv
      JOIN agentes_vendedor av ON av.id_persona = pv.id
      WHERE av.id = o.id_agente_vendedor
      LIMIT 1
    ) AS nombre_vendedor,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN propiedades prop ON prop.id = cc.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN estatus_disponibilidad ed ON ed.id = prop.id_estatus_disponibilidad
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR em.nombre ILIKE '%' || p_modelo || '%')
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
