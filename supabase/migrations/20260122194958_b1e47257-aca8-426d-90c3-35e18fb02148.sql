
-- Drop ALL versions of the function to resolve overload conflict
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[]);
DROP FUNCTION IF EXISTS public.get_cuentas_cobranza_paginadas(text, text, text, text, text, text, text, integer[], text[], integer, integer, boolean, integer[], bigint[]);

-- Recreate with single consistent signature
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
  id bigint,
  clabe_stp text,
  precio_final numeric,
  tipo text,
  proyecto text,
  id_proyecto bigint,
  modelo text,
  edificio text,
  numero_propiedad text,
  compradores jsonb,
  id_propiedad bigint,
  id_entidad_relacionada_dueno bigint,
  metraje numeric,
  pagado numeric,
  restante numeric,
  id_estatus_disponibilidad integer,
  estatus_disponibilidad text,
  cash_limit numeric,
  cash_paid numeric,
  tiene_acuerdos boolean,
  pagos_efectivo jsonb,
  fecha_compra timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset integer;
  v_total bigint;
BEGIN
  v_offset := (p_page - 1) * p_per_page;
  
  -- Get total count
  SELECT COUNT(DISTINCT cc.id) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN proyectos p ON COALESCE(e.id_proyecto, m.id_proyecto) = p.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pp ON ps.id_proyecto = pp.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(p.nombre, pp.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 
          CASE WHEN ps.id_categoria = 9 THEN 'Servicio' ELSE 'Producto' END
        ELSE 'Propiedad'
      END = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(p.id, pp.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids));

  RETURN QUERY
  SELECT 
    cc.id,
    cc.clabe_stp,
    cc.precio_final,
    CASE 
      WHEN o.id_producto IS NOT NULL THEN 
        CASE WHEN ps.id_categoria = 9 THEN 'Servicio'::text ELSE 'Producto'::text END
      ELSE 'Propiedad'::text
    END as tipo,
    COALESCE(p.nombre, pp.nombre)::text as proyecto,
    COALESCE(p.id, pp.id) as id_proyecto,
    m.nombre::text as modelo,
    e.nombre::text as edificio,
    prop.numero_propiedad::text,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pers.id,
        'nombre', pers.nombre_legal,
        'rfc', pers.rfc,
        'porcentaje', ccp.porcentaje_propiedad
      ))
      FROM compradores_cuenta_cobranza ccp
      JOIN personas pers ON ccp.id_persona = pers.id
      WHERE ccp.id_cuenta_cobranza = cc.id AND ccp.activo = true
    ) as compradores,
    prop.id as id_propiedad,
    prop.id_entidad_relacionada_dueno,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) as metraje,
    COALESCE((
      SELECT SUM(pag.monto) 
      FROM pagos pag 
      WHERE pag.id_cuenta_cobranza = cc.id AND pag.activo = true
    ), 0) as pagado,
    cc.precio_final - COALESCE((
      SELECT SUM(pag.monto) 
      FROM pagos pag 
      WHERE pag.id_cuenta_cobranza = cc.id AND pag.activo = true
    ), 0) as restante,
    prop.id_estatus_disponibilidad,
    ed.nombre::text as estatus_disponibilidad,
    COALESCE(8025 * COALESCE(cc.valor_uma, 0), 0) as cash_limit,
    COALESCE((
      SELECT SUM(pag.monto) 
      FROM pagos pag 
      WHERE pag.id_cuenta_cobranza = cc.id 
        AND pag.activo = true 
        AND pag.id_metodos_pago = 1
    ), 0) as cash_paid,
    EXISTS(SELECT 1 FROM acuerdos_pago ap WHERE ap.id_cuenta_cobranza = cc.id AND ap.activo = true) as tiene_acuerdos,
    (
      SELECT jsonb_agg(jsonb_build_object('fecha_pago', pag.fecha_pago, 'monto', pag.monto))
      FROM pagos pag
      WHERE pag.id_cuenta_cobranza = cc.id AND pag.activo = true AND pag.id_metodos_pago = 1
    ) as pagos_efectivo,
    cc.fecha_creacion as fecha_compra,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios e ON em.id_edificio = e.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN proyectos p ON COALESCE(e.id_proyecto, m.id_proyecto) = p.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pp ON ps.id_proyecto = pp.id
  LEFT JOIN estado_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_proyecto IS NULL OR COALESCE(p.nombre, pp.nombre, '') ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 
          CASE WHEN ps.id_categoria = 9 THEN 'Servicio' ELSE 'Producto' END
        ELSE 'Propiedad'
      END = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(p.id, pp.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;
