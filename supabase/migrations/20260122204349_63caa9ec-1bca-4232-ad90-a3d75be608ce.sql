-- Drop and recreate the RPC with correct column references
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer,integer,text,text,text,text,text,text,text,integer[],text[],boolean,integer[],integer[]);

CREATE OR REPLACE FUNCTION public.get_cuentas_cobranza_paginadas(
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
  porcentaje_comision_venta numeric,
  valor_uma numeric,
  activo boolean,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad text,
  id_propiedad integer,
  numero_propiedad text,
  modelo text,
  id_proyecto integer,
  proyecto text,
  edificio text,
  id_oferta integer,
  id_producto integer,
  producto text,
  tipo text,
  compradores jsonb,
  vendedor text,
  pagos_efectivo jsonb,
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
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN estado_disponibilidad ed ON cc.id_estatus_disponibilidad = ed.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto_ids IS NULL OR COALESCE(edif.id_proyecto, ps.id_proyecto) = ANY(p_proyecto_ids))
    AND (p_proyecto IS NULL OR EXISTS (
      SELECT 1 FROM proyectos proy 
      WHERE proy.id = COALESCE(edif.id_proyecto, ps.id_proyecto) 
      AND proy.nombre ILIKE '%' || p_proyecto || '%'
    ))
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR EXISTS (
      SELECT 1 FROM modelos m 
      WHERE m.id = em.id_modelo 
      AND m.nombre ILIKE '%' || p_modelo || '%'
    ))
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores_cuentas_cobranza ccc
      JOIN personas pers ON ccc.id_persona = pers.id
      WHERE ccc.id_cuenta_cobranza = cc.id
      AND ccc.activo = true
      AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ))
    AND (p_estatus_ids IS NULL OR cc.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        ELSE 'Servicio'
      END = ANY(p_tipos)
    )
    AND (p_dueno_entity_ids IS NULL OR EXISTS (
      SELECT 1 FROM duenos_proyectos dp
      WHERE dp.id_proyecto = COALESCE(edif.id_proyecto, ps.id_proyecto)
      AND dp.id_entidad_duena = ANY(p_dueno_entity_ids)
      AND dp.activo = true
    ));

  -- Return paginated results
  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.fecha_compra,
    cc.precio_final,
    cc.porcentaje_comision_venta,
    cc.valor_uma,
    cc.activo,
    cc.id_estatus_disponibilidad,
    ed.nombre AS estatus_disponibilidad,
    prop.id AS id_propiedad,
    prop.numero AS numero_propiedad,
    m.nombre AS modelo,
    COALESCE(edif.id_proyecto, ps.id_proyecto) AS id_proyecto,
    proy.nombre AS proyecto,
    edif.nombre AS edificio,
    o.id AS id_oferta,
    ps.id AS id_producto,
    ps.nombre AS producto,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      ELSE 'Servicio'
    END AS tipo,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pers.id,
        'nombre', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', ccc.porcentaje_participacion
      ))
      FROM compradores_cuentas_cobranza ccc
      JOIN personas pers ON ccc.id_persona = pers.id
      WHERE ccc.id_cuenta_cobranza = cc.id AND ccc.activo = true
    ), '[]'::jsonb) AS compradores,
    pers_vend.nombre_legal AS vendedor,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pago.fecha_pago,
        'monto', pago.monto
      ))
      FROM pagos pago
      WHERE pago.id_cuenta_cobranza = cc.id 
      AND pago.activo = true 
      AND pago.id_metodos_pago = 1
    ), '[]'::jsonb) AS pagos_efectivo,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos proy ON COALESCE(edif.id_proyecto, ps.id_proyecto) = proy.id
  LEFT JOIN estado_disponibilidad ed ON cc.id_estatus_disponibilidad = ed.id
  LEFT JOIN personas pers_vend ON o.id_persona_lead = pers_vend.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto_ids IS NULL OR COALESCE(edif.id_proyecto, ps.id_proyecto) = ANY(p_proyecto_ids))
    AND (p_proyecto IS NULL OR proy.nombre ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores_cuentas_cobranza ccc
      JOIN personas pers ON ccc.id_persona = pers.id
      WHERE ccc.id_cuenta_cobranza = cc.id
      AND ccc.activo = true
      AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ))
    AND (p_estatus_ids IS NULL OR cc.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        ELSE 'Servicio'
      END = ANY(p_tipos)
    )
    AND (p_dueno_entity_ids IS NULL OR EXISTS (
      SELECT 1 FROM duenos_proyectos dp
      WHERE dp.id_proyecto = COALESCE(edif.id_proyecto, ps.id_proyecto)
      AND dp.id_entidad_duena = ANY(p_dueno_entity_ids)
      AND dp.activo = true
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;