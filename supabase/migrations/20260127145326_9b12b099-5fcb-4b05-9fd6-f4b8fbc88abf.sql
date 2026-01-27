-- =====================================================
-- BACKUP de get_propiedades_paginadas ANTES de modificar
-- Fecha: 2026-01-27
-- Razón: Agregar lógica de propietario basada en estatus
-- =====================================================
-- La lógica anterior siempre mostraba: pers.nombre_legal::TEXT as propietario
-- Nueva lógica: mostrar comprador solo si estatus es 9,7,8,10 (Pagada completamente, Escrituración, Entregado, Asignado)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_propiedades_paginadas(
  p_page INTEGER DEFAULT 1,
  p_per_page INTEGER DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_proyecto_ids INTEGER[] DEFAULT NULL,
  p_modelo_ids INTEGER[] DEFAULT NULL,
  p_recamaras INTEGER DEFAULT NULL,
  p_banos INTEGER DEFAULT NULL,
  p_disponibilidad_ids INTEGER[] DEFAULT NULL,
  p_tipo_transaccion_ids INTEGER[] DEFAULT NULL,
  p_area_min NUMERIC DEFAULT NULL,
  p_area_max NUMERIC DEFAULT NULL,
  p_precio_min NUMERIC DEFAULT NULL,
  p_precio_max NUMERIC DEFAULT NULL,
  p_tiene_bodegas TEXT DEFAULT NULL,
  p_tiene_estacionamientos TEXT DEFAULT NULL,
  p_tiene_cuenta TEXT DEFAULT NULL,
  p_activo BOOLEAN DEFAULT true,
  p_es_aprobado BOOLEAN DEFAULT true,
  p_orden_precio TEXT DEFAULT NULL,
  p_accessible_project_ids INTEGER[] DEFAULT NULL,
  p_ownership_entity_ids INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  numero_propiedad TEXT,
  numero_piso TEXT,
  m2_interiores NUMERIC,
  m2_exteriores NUMERIC,
  m2_reales NUMERIC,
  precio_lista NUMERIC,
  monto_apartado NUMERIC,
  monto_apartado_pagando NUMERIC,
  clabe_stp_tmp_apartado TEXT,
  activo BOOLEAN,
  es_aprobado BOOLEAN,
  id_entidad_relacionada_dueno INTEGER,
  id_edificio_modelo INTEGER,
  id_vista INTEGER,
  id_estatus_disponibilidad INTEGER,
  id_tipo_transaccion INTEGER,
  proyecto TEXT,
  proyecto_id INTEGER,
  edificio TEXT,
  modelo TEXT,
  modelo_id INTEGER,
  numero_recamaras INTEGER,
  numero_completo_banos INTEGER,
  numero_medio_bano INTEGER,
  vista TEXT,
  disponibilidad TEXT,
  tipo_transaccion TEXT,
  propietario TEXT,
  cuenta_cobranza_id INTEGER,
  clabe_stp TEXT,
  precio_final NUMERIC,
  es_comision_venta_efectivo BOOLEAN,
  porcentaje_comision_venta NUMERIC,
  total_pagado NUMERIC,
  restante NUMERIC,
  apartado_pagado BOOLEAN,
  cuenta_sin_esquema BOOLEAN,
  tiene_cuenta_pagada BOOLEAN,
  estacionamientos_count INTEGER,
  bodegas_count INTEGER,
  tiene_ofertas BOOLEAN,
  tiene_ofertas_productos BOOLEAN,
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

  RETURN QUERY
  WITH cuenta_activa AS (
    SELECT DISTINCT ON (o.id_propiedad)
      o.id_propiedad,
      cc.id as cuenta_id,
      cc.clabe_stp,
      cc.precio_final,
      cc.es_comision_venta_efectivo,
      cc.porcentaje_comision_venta,
      o.id as oferta_id
    FROM ofertas o
    JOIN cuentas_cobranza cc ON cc.id_oferta = o.id AND cc.activo = true
    WHERE o.activo = true
      AND o.id_producto IS NULL
    ORDER BY o.id_propiedad, cc.fecha_creacion DESC
  ),
  pagos_info AS (
    SELECT 
      cc.id as cuenta_id,
      COALESCE(SUM(CASE WHEN p.activo = true THEN p.monto ELSE 0 END), 0) as total_pagado
    FROM cuentas_cobranza cc
    LEFT JOIN pagos p ON p.id_cuenta_cobranza = cc.id
    WHERE cc.activo = true
    GROUP BY cc.id
  ),
  acuerdos_info AS (
    SELECT 
      cc.id as cuenta_id,
      bool_or(CASE WHEN ap.id_concepto = 1 AND ap.pago_completado = true THEN true ELSE false END) as apartado_pagado,
      bool_and(ap.pago_completado) as cuenta_pagada,
      COUNT(ap.id) as total_acuerdos
    FROM cuentas_cobranza cc
    LEFT JOIN acuerdos_pago ap ON ap.id_cuenta_cobranza = cc.id AND ap.activo = true
    WHERE cc.activo = true
    GROUP BY cc.id
  ),
  prop_counts AS (
    SELECT 
      e.id_propiedad,
      COUNT(*) as estacionamientos_count
    FROM estacionamientos e
    WHERE e.activo = true
    GROUP BY e.id_propiedad
  ),
  bodega_counts AS (
    SELECT 
      b.id_propiedad,
      COUNT(*) as bodegas_count
    FROM bodegas b
    WHERE b.activo = true
    GROUP BY b.id_propiedad
  ),
  ofertas_prop AS (
    SELECT DISTINCT 
      o.id_propiedad,
      true as tiene_ofertas
    FROM ofertas o
    WHERE o.activo = true
      AND o.id_producto IS NULL
      AND o.id_propiedad IS NOT NULL
  ),
  ofertas_prod AS (
    SELECT DISTINCT 
      o.id_propiedad,
      true as tiene_ofertas_productos
    FROM ofertas o
    WHERE o.activo = true
      AND o.id_producto IS NOT NULL
      AND o.id_propiedad IS NOT NULL
  ),
  -- CTE para obtener el comprador principal de cada cuenta
  compradores_info AS (
    SELECT DISTINCT ON (cc.id)
      cc.id as cuenta_id,
      per.nombre_legal as comprador_principal
    FROM cuentas_cobranza cc
    JOIN compradores c ON c.id_cuenta_cobranza = cc.id AND c.activo = true
    JOIN personas per ON per.id = c.id_persona AND per.activo = true
    WHERE cc.activo = true
    ORDER BY cc.id, c.porcentaje_copropiedad DESC, c.id ASC
  ),
  filtered_props AS (
    SELECT 
      prop.id,
      prop.numero_propiedad,
      prop.numero_piso,
      prop.m2_interiores,
      prop.m2_exteriores,
      (prop.m2_interiores + prop.m2_exteriores) as m2_reales,
      prop.precio_lista,
      prop.monto_apartado,
      prop.monto_apartado_pagando,
      prop.clabe_stp_tmp_apartado,
      prop.activo,
      prop.es_aprobado,
      prop.id_entidad_relacionada_dueno,
      prop.id_edificio_modelo,
      prop.id_vista,
      prop.id_estatus_disponibilidad,
      prop.id_tipo_transaccion,
      proy.nombre as proyecto,
      proy.id as proyecto_id,
      edif.nombre as edificio,
      mod.nombre as modelo,
      mod.id as modelo_id,
      mod.numero_recamaras,
      mod.numero_completo_banos,
      mod.numero_medio_bano,
      vis.nombre as vista,
      ed.nombre as disponibilidad,
      tt.nombre as tipo_transaccion,
      -- Lógica de propietario: mostrar comprador solo si estatus es 9,7,8,10
      -- (Pagada completamente, Escrituración, Entregado, Asignado)
      (CASE 
        WHEN prop.id_estatus_disponibilidad IN (9, 7, 8, 10) 
             AND ci.comprador_principal IS NOT NULL 
        THEN ci.comprador_principal
        ELSE pers.nombre_legal
      END) as propietario,
      ca.cuenta_id as cuenta_cobranza_id,
      ca.clabe_stp,
      ca.precio_final,
      COALESCE(ca.es_comision_venta_efectivo, false) as es_comision_venta_efectivo,
      COALESCE(ca.porcentaje_comision_venta, 0) as porcentaje_comision_venta,
      COALESCE(pi.total_pagado, 0) as total_pagado,
      (COALESCE(ca.precio_final, 0) - COALESCE(pi.total_pagado, 0)) as restante,
      COALESCE(ai.apartado_pagado, false) as apartado_pagado,
      (ca.cuenta_id IS NOT NULL AND COALESCE(ai.total_acuerdos, 0) = 0) as cuenta_sin_esquema,
      COALESCE(ai.cuenta_pagada, false) as tiene_cuenta_pagada,
      COALESCE(pc.estacionamientos_count, 0)::INTEGER as estacionamientos_count,
      COALESCE(bc.bodegas_count, 0)::INTEGER as bodegas_count,
      COALESCE(op.tiene_ofertas, false) as tiene_ofertas,
      COALESCE(oprod.tiene_ofertas_productos, false) as tiene_ofertas_productos,
      COUNT(*) OVER() as total_count
    FROM propiedades prop
    JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
    JOIN edificios edif ON em.id_edificio = edif.id
    JOIN proyectos proy ON edif.id_proyecto = proy.id
    JOIN modelos mod ON em.id_modelo = mod.id
    LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
    LEFT JOIN vistas vis ON prop.id_vista = vis.id
    LEFT JOIN tipos_transaccion tt ON prop.id_tipo_transaccion = tt.id
    LEFT JOIN entidades_relacionadas er ON prop.id_entidad_relacionada_dueno = er.id
    LEFT JOIN personas pers ON er.id_persona = pers.id
    LEFT JOIN cuenta_activa ca ON ca.id_propiedad = prop.id
    LEFT JOIN pagos_info pi ON pi.cuenta_id = ca.cuenta_id
    LEFT JOIN acuerdos_info ai ON ai.cuenta_id = ca.cuenta_id
    LEFT JOIN compradores_info ci ON ci.cuenta_id = ca.cuenta_id
    LEFT JOIN prop_counts pc ON pc.id_propiedad = prop.id
    LEFT JOIN bodega_counts bc ON bc.id_propiedad = prop.id
    LEFT JOIN ofertas_prop op ON op.id_propiedad = prop.id
    LEFT JOIN ofertas_prod oprod ON oprod.id_propiedad = prop.id
    WHERE prop.activo = p_activo
      AND prop.es_aprobado = p_es_aprobado
      AND (p_search IS NULL OR (
        prop.numero_propiedad ILIKE '%' || p_search || '%'
        OR proy.nombre ILIKE '%' || p_search || '%'
        OR edif.nombre ILIKE '%' || p_search || '%'
        OR mod.nombre ILIKE '%' || p_search || '%'
        OR pers.nombre_legal ILIKE '%' || p_search || '%'
        OR ci.comprador_principal ILIKE '%' || p_search || '%'
      ))
      AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
      AND (p_modelo_ids IS NULL OR mod.id = ANY(p_modelo_ids))
      AND (p_recamaras IS NULL OR mod.numero_recamaras = p_recamaras)
      AND (p_banos IS NULL OR mod.numero_completo_banos = p_banos)
      AND (p_disponibilidad_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_disponibilidad_ids))
      AND (p_tipo_transaccion_ids IS NULL OR prop.id_tipo_transaccion = ANY(p_tipo_transaccion_ids))
      AND (p_area_min IS NULL OR (prop.m2_interiores + prop.m2_exteriores) >= p_area_min)
      AND (p_area_max IS NULL OR (prop.m2_interiores + prop.m2_exteriores) <= p_area_max)
      AND (p_precio_min IS NULL OR prop.precio_lista >= p_precio_min)
      AND (p_precio_max IS NULL OR prop.precio_lista <= p_precio_max)
      AND (p_tiene_bodegas IS NULL 
           OR (p_tiene_bodegas = 'si' AND EXISTS (SELECT 1 FROM bodegas b WHERE b.id_propiedad = prop.id AND b.activo = true))
           OR (p_tiene_bodegas = 'no' AND NOT EXISTS (SELECT 1 FROM bodegas b WHERE b.id_propiedad = prop.id AND b.activo = true)))
      AND (p_tiene_estacionamientos IS NULL 
           OR (p_tiene_estacionamientos = 'si' AND EXISTS (SELECT 1 FROM estacionamientos e WHERE e.id_propiedad = prop.id AND e.activo = true))
           OR (p_tiene_estacionamientos = 'no' AND NOT EXISTS (SELECT 1 FROM estacionamientos e WHERE e.id_propiedad = prop.id AND e.activo = true)))
      AND (p_tiene_cuenta IS NULL
           OR (p_tiene_cuenta = 'si' AND ca.cuenta_id IS NOT NULL)
           OR (p_tiene_cuenta = 'no' AND ca.cuenta_id IS NULL))
      AND (p_accessible_project_ids IS NULL OR proy.id = ANY(p_accessible_project_ids))
      AND (p_ownership_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_ownership_entity_ids))
    ORDER BY 
      CASE WHEN p_orden_precio = 'asc' THEN prop.precio_lista END ASC NULLS LAST,
      CASE WHEN p_orden_precio = 'desc' THEN prop.precio_lista END DESC NULLS LAST,
      proy.nombre ASC,
      edif.nombre ASC,
      prop.numero_propiedad ASC
    LIMIT p_per_page
    OFFSET v_offset
  )
  SELECT 
    fp.id::INTEGER,
    fp.numero_propiedad::TEXT,
    fp.numero_piso::TEXT,
    fp.m2_interiores::NUMERIC,
    fp.m2_exteriores::NUMERIC,
    fp.m2_reales::NUMERIC,
    fp.precio_lista::NUMERIC,
    fp.monto_apartado::NUMERIC,
    fp.monto_apartado_pagando::NUMERIC,
    fp.clabe_stp_tmp_apartado::TEXT,
    fp.activo::BOOLEAN,
    fp.es_aprobado::BOOLEAN,
    fp.id_entidad_relacionada_dueno::INTEGER,
    fp.id_edificio_modelo::INTEGER,
    fp.id_vista::INTEGER,
    fp.id_estatus_disponibilidad::INTEGER,
    fp.id_tipo_transaccion::INTEGER,
    fp.proyecto::TEXT,
    fp.proyecto_id::INTEGER,
    fp.edificio::TEXT,
    fp.modelo::TEXT,
    fp.modelo_id::INTEGER,
    fp.numero_recamaras::INTEGER,
    fp.numero_completo_banos::INTEGER,
    fp.numero_medio_bano::INTEGER,
    fp.vista::TEXT,
    fp.disponibilidad::TEXT,
    fp.tipo_transaccion::TEXT,
    fp.propietario::TEXT,
    fp.cuenta_cobranza_id::INTEGER,
    fp.clabe_stp::TEXT,
    fp.precio_final::NUMERIC,
    fp.es_comision_venta_efectivo::BOOLEAN,
    fp.porcentaje_comision_venta::NUMERIC,
    fp.total_pagado::NUMERIC,
    fp.restante::NUMERIC,
    fp.apartado_pagado::BOOLEAN,
    fp.cuenta_sin_esquema::BOOLEAN,
    fp.tiene_cuenta_pagada::BOOLEAN,
    fp.estacionamientos_count::INTEGER,
    fp.bodegas_count::INTEGER,
    fp.tiene_ofertas::BOOLEAN,
    fp.tiene_ofertas_productos::BOOLEAN,
    fp.total_count::BIGINT
  FROM filtered_props fp;
END;
$$;