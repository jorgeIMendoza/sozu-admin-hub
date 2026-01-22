-- Update the export RPC to handle large exports without default limit
CREATE OR REPLACE FUNCTION public.get_cuentas_cobranza_export(
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
  p_dueno_entity_ids integer[] DEFAULT NULL,
  p_limit integer DEFAULT 50000
)
RETURNS TABLE(
  id integer,
  clabe_stp text,
  fecha_compra text,
  precio_final numeric,
  tipo text,
  proyecto text,
  modelo text,
  edificio text,
  numero_propiedad text,
  producto text,
  comprador text,
  estatus_disponibilidad_nombre text,
  vendedor text,
  dueno text,
  metraje numeric,
  precio_lista numeric,
  pagado numeric,
  restante numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $function$
BEGIN
  RETURN QUERY
  WITH pagos_sum AS (
    SELECT p.id_cuenta_cobranza, SUM(p.monto) as total_pagado
    FROM pagos p
    WHERE p.activo = true
    GROUP BY p.id_cuenta_cobranza
  ),
  primer_comprador AS (
    SELECT DISTINCT ON (comp.id_cuenta_cobranza)
      comp.id_cuenta_cobranza,
      pers.nombre_legal
    FROM compradores comp
    JOIN personas pers ON comp.id_persona = pers.id
    WHERE comp.activo = true
    ORDER BY comp.id_cuenta_cobranza, pers.id
  )
  SELECT
    cc.id::integer AS id,
    cc.clabe_stp,
    cc.fecha_compra::text,
    cc.precio_final,
    CASE
      WHEN o.id_producto IS NOT NULL THEN 'Producto'
      WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
      ELSE 'Servicio'
    END AS tipo,
    COALESCE(pr.nombre, pr2.nombre) AS proyecto,
    m.nombre AS modelo,
    edif.nombre AS edificio,
    prop.numero_propiedad,
    ps.nombre AS producto,
    pc.nombre_legal AS comprador,
    ed.nombre AS estatus_disponibilidad_nombre,
    vendedor_pers.nombre_legal AS vendedor,
    dueno_pers.nombre_legal AS dueno,
    COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0) AS metraje,
    prop.precio_lista,
    COALESCE(psum.total_pagado, 0) AS pagado,
    cc.precio_final - COALESCE(psum.total_pagado, 0) AS restante
  FROM cuentas_cobranza cc
  JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN proyectos pr ON edif.id_proyecto = pr.id
  LEFT JOIN modelos m ON em.id_modelo = m.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN proyectos pr2 ON ps.id_proyecto = pr2.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN personas vendedor_pers ON vendedor_pers.id = o.id_persona_lead
  LEFT JOIN entidades_relacionadas er ON er.id = prop.id_entidad_relacionada_dueno AND er.activo = true
  LEFT JOIN personas dueno_pers ON dueno_pers.id = er.id_persona
  LEFT JOIN pagos_sum psum ON psum.id_cuenta_cobranza = cc.id
  LEFT JOIN primer_comprador pc ON pc.id_cuenta_cobranza = cc.id
  WHERE cc.activo = p_activo
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND (p_id_cuenta IS NULL OR cc.id::text ILIKE '%' || p_id_cuenta || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_proyecto IS NULL OR COALESCE(pr.nombre, pr2.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR m.nombre ILIKE '%' || p_modelo || '%')
    AND (p_compradores IS NULL OR pc.nombre_legal ILIKE '%' || p_compradores || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_tipos IS NULL OR (
      CASE
        WHEN o.id_producto IS NOT NULL THEN 'Producto'
        WHEN o.id_propiedad IS NOT NULL THEN 'Propiedad'
        ELSE 'Servicio'
      END
    ) = ANY(p_tipos))
    AND (p_proyecto_ids IS NULL OR COALESCE(pr.id, pr2.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
  ORDER BY cc.id DESC
  LIMIT p_limit;
END;
$function$;