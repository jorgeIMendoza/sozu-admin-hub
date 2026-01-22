-- Drop any existing versions of this function to avoid conflicts
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[]);

-- Recreate the function with correct column references
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
  p_vendedor TEXT DEFAULT NULL,
  p_estatus_ids INTEGER[] DEFAULT NULL,
  p_tipos TEXT[] DEFAULT NULL,
  p_activo BOOLEAN DEFAULT TRUE,
  p_proyecto_ids INTEGER[] DEFAULT NULL,
  p_dueno_entity_ids INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  clabe_stp TEXT,
  fecha_compra DATE,
  precio_final NUMERIC,
  activo BOOLEAN,
  es_aprobado BOOLEAN,
  id_oferta INTEGER,
  id_tipo_cancelacion BIGINT,
  id_cuenta_cobranza_padre BIGINT,
  fecha_escritura DATE,
  numero_escritura TEXT,
  proyecto_nombre TEXT,
  id_proyecto INTEGER,
  edificio_nombre TEXT,
  modelo_nombre TEXT,
  no_propiedad TEXT,
  id_propiedad INTEGER,
  id_estatus_disponibilidad INTEGER,
  producto_nombre TEXT,
  tipo_cuenta TEXT,
  compradores JSONB,
  total_acuerdos NUMERIC,
  total_pagado NUMERIC,
  total_aplicado NUMERIC,
  vendedor_nombre TEXT,
  pagos_efectivo JSONB,
  total_count BIGINT
) AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;
  
  -- First get total count
  SELECT COUNT(*)
  INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN proyectos proy ON proy.id = ed.id_proyecto OR proy.id = m.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN entidades_relacionadas er ON er.id = prop.id_entidad_relacionada_dueno
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (CASE 
           WHEN o.id_producto IS NOT NULL THEN 'Producto'
           WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
           ELSE 'Servicio'
         END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR er.id = ANY(p_dueno_entity_ids));

  RETURN QUERY
  WITH cuenta_acuerdos AS (
    SELECT 
      acu.id_cuenta_cobranza,
      COALESCE(SUM(acu.monto), 0) as total_acuerdos
    FROM acuerdos_pago acu
    WHERE acu.activo = true
    GROUP BY acu.id_cuenta_cobranza
  ),
  cuenta_pagos AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(p.monto), 0) as total_pagado,
      jsonb_agg(
        CASE WHEN mp.nombre ILIKE '%efectivo%' THEN
          jsonb_build_object('fecha_pago', p.fecha_pago, 'monto', p.monto)
        ELSE NULL END
      ) FILTER (WHERE mp.nombre ILIKE '%efectivo%') as pagos_efectivo
    FROM pagos p
    LEFT JOIN metodos_pago mp ON mp.id = p.id_metodos_pago
    WHERE p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  cuenta_aplicaciones AS (
    SELECT 
      p.id_cuenta_cobranza,
      COALESCE(SUM(ap.monto), 0) as total_aplicado
    FROM aplicaciones_pago ap
    JOIN pagos p ON p.id = ap.id_pago
    WHERE ap.activo = true AND p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  cuenta_compradores AS (
    SELECT 
      oc.id_oferta,
      jsonb_agg(
        jsonb_build_object(
          'id', pers.id,
          'nombre', pers.nombre_legal,
          'rfc', pers.rfc,
          'porcentaje', oc.porcentaje_participacion
        )
      ) as compradores
    FROM ofertas_compradores oc
    JOIN personas pers ON pers.id = oc.id_persona
    WHERE oc.activo = true
    GROUP BY oc.id_oferta
  ),
  vendedor_info AS (
    SELECT 
      ov.id_oferta,
      pers.nombre_legal as vendedor_nombre
    FROM ofertas_vendedores ov
    JOIN personas pers ON pers.id = ov.id_persona
    WHERE ov.activo = true
  )
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.activo,
    cc.es_aprobado,
    cc.id_oferta,
    cc.id_tipo_cancelacion,
    cc.id_cuenta_cobranza_padre,
    cc.fecha_escritura,
    cc.numero_escritura,
    proy.nombre as proyecto_nombre,
    proy.id::INTEGER as id_proyecto,
    ed.nombre as edificio_nombre,
    m.nombre as modelo_nombre,
    prop.numero as no_propiedad,
    prop.id::INTEGER as id_propiedad,
    prop.id_estatus_disponibilidad::INTEGER,
    ps.nombre as producto_nombre,
    CASE 
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      ELSE 'Servicio'
    END as tipo_cuenta,
    COALESCE(ccomp.compradores, '[]'::jsonb) as compradores,
    COALESCE(ca.total_acuerdos, 0) as total_acuerdos,
    COALESCE(cp.total_pagado, 0) as total_pagado,
    COALESCE(cap.total_aplicado, 0) as total_aplicado,
    vi.vendedor_nombre,
    cp.pagos_efectivo,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios ed ON ed.id = em.id_edificio
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN proyectos proy ON proy.id = ed.id_proyecto OR proy.id = m.id_proyecto
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
  LEFT JOIN entidades_relacionadas er ON er.id = prop.id_entidad_relacionada_dueno
  LEFT JOIN cuenta_acuerdos ca ON ca.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_pagos cp ON cp.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_aplicaciones cap ON cap.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_compradores ccomp ON ccomp.id_oferta = cc.id_oferta
  LEFT JOIN vendedor_info vi ON vi.id_oferta = cc.id_oferta
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(ccomp.compradores) elem
      WHERE elem->>'nombre' ILIKE '%' || p_compradores || '%'
         OR elem->>'rfc' ILIKE '%' || p_compradores || '%'
    ))
    AND (p_vendedor IS NULL OR vi.vendedor_nombre ILIKE '%' || p_vendedor || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
         (CASE 
           WHEN o.id_producto IS NOT NULL THEN 'Producto'
           WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
           ELSE 'Servicio'
         END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR er.id = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;