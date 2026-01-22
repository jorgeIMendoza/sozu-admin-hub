-- Drop existing function
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(
  p_page integer,
  p_per_page integer,
  p_id_cuenta text,
  p_proyecto text,
  p_clabe text,
  p_no_propiedad text,
  p_modelo text,
  p_compradores text,
  p_producto text,
  p_estatus_ids integer[],
  p_tipos text[],
  p_activo boolean,
  p_proyecto_ids integer[],
  p_dueno_entity_ids integer[]
);

-- Recreate function with correct column name (id_producto instead of id_producto_servicio)
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
  valor_uma numeric,
  porcentaje_comision_venta numeric,
  activo boolean,
  id_oferta integer,
  numero_propiedad text,
  nombre_proyecto text,
  nombre_modelo text,
  nombre_edificio text,
  id_proyecto integer,
  id_propiedad integer,
  id_producto integer,
  nombre_producto text,
  tipo text,
  vendedor text,
  dueno text,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad_nombre text,
  apartado_pagado boolean,
  compradores jsonb,
  cash_payments jsonb,
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
  SELECT COUNT(*)::bigint INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN proyectos pr ON edif.id_proyecto = pr.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr2 ON ps.id_proyecto = pr2.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(pr.nombre, pr2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        WHEN ps.id IS NOT NULL THEN 'Servicio'
        ELSE 'Propiedad'
      END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(pr.id, pr2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      LEFT JOIN personas pers ON comp.id_persona = pers.id
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
    cc.valor_uma,
    cc.porcentaje_comision_venta,
    cc.activo,
    cc.id_oferta,
    prop.numero_propiedad,
    COALESCE(pr.nombre, pr2.nombre) AS nombre_proyecto,
    m.nombre AS nombre_modelo,
    edif.nombre AS nombre_edificio,
    COALESCE(pr.id, pr2.id) AS id_proyecto,
    prop.id AS id_propiedad,
    ps.id AS id_producto,
    ps.nombre AS nombre_producto,
    CASE 
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'::text
      WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'::text
      WHEN ps.id IS NOT NULL THEN 'Servicio'::text
      ELSE 'Propiedad'::text
    END AS tipo,
    pers_vendedor.nombre_legal AS vendedor,
    pers_dueno.nombre_legal AS dueno,
    prop.id_estatus_disponibilidad,
    ed.nombre AS estatus_disponibilidad_nombre,
    COALESCE(
      (SELECT ap.pago_completado 
       FROM acuerdos_pago ap 
       JOIN conceptos_pago cp ON ap.id_concepto = cp.id 
       WHERE ap.id_cuenta_cobranza = cc.id 
         AND cp.nombre ILIKE '%apartado%' 
         AND ap.activo = true 
       LIMIT 1),
      EXISTS(SELECT 1 FROM pagos pg WHERE pg.id_cuenta_cobranza = cc.id AND pg.activo = true)
    ) AS apartado_pagado,
    (SELECT jsonb_agg(jsonb_build_object(
        'id', comp.id_persona,
        'nombre_legal', p_comp.nombre_legal,
        'rfc', p_comp.rfc,
        'porcentaje', comp.porcentaje_copropiedad
      ))
      FROM compradores comp
      LEFT JOIN personas p_comp ON comp.id_persona = p_comp.id
      WHERE comp.id_cuenta_cobranza = cc.id AND comp.activo = true) AS compradores,
    (SELECT jsonb_agg(jsonb_build_object(
        'fecha_pago', pg.fecha_pago,
        'monto', pg.monto
      ))
      FROM pagos pg
      JOIN metodos_pago mp ON pg.id_metodos_pago = mp.id
      WHERE pg.id_cuenta_cobranza = cc.id 
        AND pg.activo = true 
        AND mp.nombre ILIKE '%efectivo%') AS cash_payments,
    v_total AS total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN proyectos pr ON edif.id_proyecto = pr.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr2 ON ps.id_proyecto = pr2.id
  LEFT JOIN personas pers_vendedor ON o.id_persona_lead = pers_vendedor.id
  LEFT JOIN personas pers_dueno ON prop.id_entidad_relacionada_dueno = pers_dueno.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  WHERE cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(pr.nombre, pr2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      (CASE 
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        WHEN ps.id IS NOT NULL AND ps.id_categoria = 1 THEN 'Producto'
        WHEN ps.id IS NOT NULL THEN 'Servicio'
        ELSE 'Propiedad'
      END) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(pr.id, pr2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      LEFT JOIN personas pers ON comp.id_persona = pers.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND (pers.nombre_legal ILIKE '%' || p_compradores || '%' OR pers.rfc ILIKE '%' || p_compradores || '%')
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;