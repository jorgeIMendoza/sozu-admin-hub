-- Drop and recreate with correct join path: 
-- propiedades -> edificios_modelos -> edificios -> proyectos
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], TEXT[], BOOLEAN, INTEGER[], INTEGER[], TEXT);

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
  fecha_compra TIMESTAMP WITH TIME ZONE,
  precio_final NUMERIC,
  porcentaje_comision_venta NUMERIC,
  id_estatus_cuenta_cobranza INTEGER,
  estatus_cuenta_cobranza TEXT,
  id_oferta INTEGER,
  id_propiedad INTEGER,
  numero_propiedad TEXT,
  id_proyecto INTEGER,
  proyecto TEXT,
  id_modelo INTEGER,
  modelo TEXT,
  id_producto INTEGER,
  producto TEXT,
  compradores JSONB,
  pagos_efectivo JSONB,
  tiene_acuerdos BOOLEAN,
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

  -- Get total count with correct join path
  SELECT COUNT(*)
  INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto_servicio
  WHERE 
    cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR cc.id_estatus_cuenta_cobranza = ANY(p_estatus_ids))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM cuentas_cobranza_compradores ccc
      JOIN personas per ON per.id = ccc.id_persona
      WHERE ccc.id_cuenta_cobranza = cc.id 
        AND ccc.activo = true
        AND (per.nombre_legal ILIKE '%' || p_compradores || '%' OR per.rfc ILIKE '%' || p_compradores || '%')
    ))
    AND (p_vendedor IS NULL OR EXISTS (
      SELECT 1 FROM ofertas of2
      JOIN personas pv ON pv.id = of2.id_persona_vendedor
      WHERE of2.id = cc.id_oferta
        AND pv.nombre_legal ILIKE '%' || p_vendedor || '%'
    ));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.porcentaje_comision_venta,
    cc.id_estatus_cuenta_cobranza,
    ecc.nombre AS estatus_cuenta_cobranza,
    cc.id_oferta,
    o.id_propiedad,
    prop.numero_propiedad,
    proy.id AS id_proyecto,
    proy.nombre AS proyecto,
    m.id AS id_modelo,
    m.nombre AS modelo,
    ps.id AS id_producto,
    ps.nombre AS producto,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', per.id,
        'nombre_legal', per.nombre_legal,
        'rfc', per.rfc,
        'porcentaje_copropiedad', ccc.porcentaje_copropiedad
      ))
      FROM cuentas_cobranza_compradores ccc
      JOIN personas per ON per.id = ccc.id_persona
      WHERE ccc.id_cuenta_cobranza = cc.id AND ccc.activo = true),
      '[]'::jsonb
    ) AS compradores,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', p.fecha_pago,
        'monto', p.monto
      ))
      FROM pagos p
      WHERE p.id_cuenta_cobranza = cc.id 
        AND p.activo = true 
        AND p.id_metodos_pago = 1),
      '[]'::jsonb
    ) AS pagos_efectivo,
    EXISTS (
      SELECT 1 FROM acuerdos_pago ap 
      WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true
    ) AS tiene_acuerdos,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN estatus_cuenta_cobranza ecc ON ecc.id = cc.id_estatus_cuenta_cobranza
  LEFT JOIN ofertas o ON o.id = cc.id_oferta
  LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
  LEFT JOIN edificios_modelos em ON em.id = prop.id_edificio_modelo
  LEFT JOIN edificios e ON e.id = em.id_edificio
  LEFT JOIN proyectos proy ON proy.id = e.id_proyecto
  LEFT JOIN modelos m ON m.id = em.id_modelo
  LEFT JOIN productos_servicios ps ON ps.id = o.id_producto_servicio
  WHERE 
    cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::TEXT ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR cc.id_estatus_cuenta_cobranza = ANY(p_estatus_ids))
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM cuentas_cobranza_compradores ccc
      JOIN personas per ON per.id = ccc.id_persona
      WHERE ccc.id_cuenta_cobranza = cc.id 
        AND ccc.activo = true
        AND (per.nombre_legal ILIKE '%' || p_compradores || '%' OR per.rfc ILIKE '%' || p_compradores || '%')
    ))
    AND (p_vendedor IS NULL OR EXISTS (
      SELECT 1 FROM ofertas of2
      JOIN personas pv ON pv.id = of2.id_persona_vendedor
      WHERE of2.id = cc.id_oferta
        AND pv.nombre_legal ILIKE '%' || p_vendedor || '%'
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;