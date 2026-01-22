-- Function to get statistics for cuentas de cobranza (fast aggregate query)
CREATE OR REPLACE FUNCTION get_cuentas_cobranza_stats(
  p_proyecto_ids INT[] DEFAULT NULL,
  p_dueno_entity_ids INT[] DEFAULT NULL
)
RETURNS TABLE (
  total_cuentas_activas BIGINT,
  total_propiedades BIGINT,
  total_productos BIGINT,
  total_colocado_propiedades NUMERIC,
  total_colocado_productos NUMERIC,
  total_cobrado_propiedades NUMERIC,
  total_cobrado_productos NUMERIC,
  stats_por_proyecto JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_ids INT[];
  v_entity_ids INT[];
BEGIN
  -- Convert arrays
  v_project_ids := p_proyecto_ids;
  v_entity_ids := p_dueno_entity_ids;

  RETURN QUERY
  WITH cuenta_base AS (
    SELECT 
      cc.id,
      cc.precio_final,
      cc.id_oferta,
      cc.activo,
      o.id_propiedad,
      o.id_producto,
      prop.id_entidad_relacionada_dueno,
      CASE 
        WHEN o.id_producto IS NOT NULL THEN 
          CASE 
            WHEN proy_prod.id_tipo_uso = 9 THEN 'Producto'
            WHEN proy_prod.id_tipo_uso IN (10, 11) THEN 'Servicio'
            ELSE 'Producto'
          END
        ELSE 'Propiedad'
      END as tipo,
      er.id_proyecto
    FROM cuentas_cobranza cc
    JOIN ofertas o ON o.id = cc.id_oferta
    LEFT JOIN propiedades prop ON prop.id = o.id_propiedad
    LEFT JOIN entidades_relacionadas er ON er.id = prop.id_entidad_relacionada_dueno
    LEFT JOIN productos_servicios ps ON ps.id = o.id_producto
    LEFT JOIN entidades_relacionadas er_prod ON er_prod.id = ps.id_entidad_relacionada_dueno
    LEFT JOIN proyectos proy_prod ON proy_prod.id = er_prod.id_proyecto
    WHERE cc.activo = true
      AND cc.id_cuenta_cobranza_padre IS NULL
      AND (v_project_ids IS NULL OR er.id_proyecto = ANY(v_project_ids))
      AND (v_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(v_entity_ids))
  ),
  pagos_por_cuenta AS (
    SELECT 
      cb.id as cuenta_id,
      COALESCE(SUM(ap.monto), 0) as total_pagado
    FROM cuenta_base cb
    LEFT JOIN acuerdos_pago acu ON acu.id_cuenta_cobranza = cb.id AND acu.activo = true
    LEFT JOIN aplicaciones_pago ap ON ap.id_acuerdo_pago = acu.id AND ap.activo = true AND ap.es_multa = false
    GROUP BY cb.id
  ),
  cuenta_con_pagos AS (
    SELECT 
      cb.*,
      COALESCE(pc.total_pagado, 0) as pagado
    FROM cuenta_base cb
    LEFT JOIN pagos_por_cuenta pc ON pc.cuenta_id = cb.id
  ),
  stats AS (
    SELECT 
      COUNT(*) as total_activas,
      COUNT(*) FILTER (WHERE tipo = 'Propiedad') as count_propiedades,
      COUNT(*) FILTER (WHERE tipo IN ('Producto', 'Servicio')) as count_productos,
      COALESCE(SUM(precio_final) FILTER (WHERE tipo = 'Propiedad'), 0) as colocado_propiedades,
      COALESCE(SUM(precio_final) FILTER (WHERE tipo IN ('Producto', 'Servicio')), 0) as colocado_productos,
      COALESCE(SUM(pagado) FILTER (WHERE tipo = 'Propiedad'), 0) as cobrado_propiedades,
      COALESCE(SUM(pagado) FILTER (WHERE tipo IN ('Producto', 'Servicio')), 0) as cobrado_productos
    FROM cuenta_con_pagos
  ),
  proyecto_stats AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'id_proyecto', proy.id_proyecto,
          'proyecto', proy.proyecto,
          'count', proy.count,
          'colocado', proy.colocado,
          'cobrado', proy.cobrado
        ) ORDER BY proy.count DESC
      ) as stats
    FROM (
      SELECT 
        cp.id_proyecto,
        COALESCE(p.nombre, 'Sin proyecto') as proyecto,
        COUNT(*) as count,
        SUM(cp.precio_final) as colocado,
        SUM(cp.pagado) as cobrado
      FROM cuenta_con_pagos cp
      LEFT JOIN proyectos p ON p.id = cp.id_proyecto
      WHERE cp.tipo = 'Propiedad'
      GROUP BY cp.id_proyecto, p.nombre
    ) proy
  )
  SELECT 
    s.total_activas,
    s.count_propiedades,
    s.count_productos,
    s.colocado_propiedades,
    s.colocado_productos,
    s.cobrado_propiedades,
    s.cobrado_productos,
    COALESCE(ps.stats, '[]'::jsonb)
  FROM stats s, proyecto_stats ps;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_cuentas_cobranza_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_cuentas_cobranza_stats TO anon;