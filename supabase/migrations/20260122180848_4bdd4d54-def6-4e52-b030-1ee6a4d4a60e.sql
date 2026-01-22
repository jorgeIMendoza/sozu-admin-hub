-- =====================================================
-- FUNCIÓN RPC: get_cuentas_cobranza_paginadas
-- Optimiza la carga de cuentas de cobranza con paginación real en SQL
-- =====================================================

CREATE OR REPLACE FUNCTION get_cuentas_cobranza_paginadas(
  p_page INTEGER DEFAULT 1,
  p_per_page INTEGER DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_id_cuenta INTEGER DEFAULT NULL,
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
  id INTEGER,
  tipo TEXT,
  producto_nombre TEXT,
  clabe_stp TEXT,
  precio_final NUMERIC,
  precio_lista NUMERIC,
  es_comision_venta_efectivo BOOLEAN,
  porcentaje_comision_venta NUMERIC,
  pagado NUMERIC,
  restante NUMERIC,
  cash_limit NUMERIC,
  cash_paid NUMERIC,
  cash_remaining NUMERIC,
  cash_percentage NUMERIC,
  dueno TEXT,
  proyecto TEXT,
  edificio TEXT,
  numero_propiedad TEXT,
  modelo TEXT,
  activo BOOLEAN,
  id_oferta INTEGER,
  motivo_cancelacion TEXT,
  apartado_pagado BOOLEAN,
  tiene_acuerdos BOOLEAN,
  tiene_multas_pendientes BOOLEAN,
  id_estatus_disponibilidad INTEGER,
  estatus_propiedad TEXT,
  collection_id INTEGER,
  total_acuerdos NUMERIC,
  discrepancia NUMERIC,
  metraje NUMERIC,
  precio_por_m2 NUMERIC,
  id_proyecto INTEGER,
  id_entidad_relacionada_dueno INTEGER,
  compradores JSONB,
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

  -- Count total matching records first
  SELECT COUNT(DISTINCT cc.id) INTO v_total
  FROM cuentas_cobranza cc
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN proyectos proy ON edif.id_proyecto = proy.id
  LEFT JOIN modelos mod ON em.id_modelo = mod.id
  LEFT JOIN entidades_relacionadas er ON prop.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas pers_dueno ON er.id_persona = pers_dueno.id
  LEFT JOIN entidades_relacionadas er_prod ON ps.id_entidad_relacionada_dueno = er_prod.id
  LEFT JOIN proyectos proy_prod ON er_prod.id_proyecto = proy_prod.id
  LEFT JOIN personas pers_dueno_prod ON er_prod.id_persona = pers_dueno_prod.id
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    -- ID cuenta filter
    AND (p_id_cuenta IS NULL OR cc.id = p_id_cuenta)
    -- Proyecto filter
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre) ILIKE '%' || p_proyecto || '%')
    -- CLABE filter
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    -- Numero propiedad filter
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    -- Modelo filter
    AND (p_modelo IS NULL OR mod.nombre ILIKE '%' || p_modelo || '%')
    -- Producto filter
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    -- Estatus disponibilidad filter
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    -- Project access filter
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy_prod.id) = ANY(p_proyecto_ids))
    -- Owner entity filter
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    -- Tipo filter (Propiedad, Producto, Servicio)
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NULL THEN 'Propiedad'
        WHEN proy_prod.id_tipo_uso = 9 THEN 'Producto'
        WHEN proy_prod.id_tipo_uso IN (10, 11) THEN 'Servicio'
        ELSE 'Producto'
      END = ANY(p_tipos)
    )
    -- Search filter (compradores)
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas p ON comp.id_persona = p.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND p.nombre_legal ILIKE '%' || p_compradores || '%'
    ));

  RETURN QUERY
  WITH cuenta_pagos AS (
    SELECT 
      acu.id_cuenta_cobranza,
      COALESCE(SUM(CASE WHEN ap.es_multa = false THEN ap.monto ELSE 0 END), 0) as total_pagado,
      COALESCE(SUM(acu.monto), 0) as total_acuerdos_monto,
      bool_or(acu.id IS NOT NULL) as tiene_acuerdos_flag,
      -- Check if apartado or cesion_derechos is paid
      bool_or(acu.id_concepto IN (1, 6) AND acu.pago_completado = true) as apartado_pagado_flag
    FROM acuerdos_pago acu
    LEFT JOIN aplicaciones_pago ap ON ap.id_acuerdo_pago = acu.id AND ap.activo = true
    WHERE acu.activo = true
    GROUP BY acu.id_cuenta_cobranza
  ),
  cuenta_multas AS (
    SELECT DISTINCT acu.id_cuenta_cobranza
    FROM acuerdos_pago acu
    JOIN multas m ON m.id_acuerdo_pago = acu.id
    WHERE acu.activo = true AND m.activo = true AND m.es_pagada = false
  ),
  cuenta_cash AS (
    SELECT 
      acu.id_cuenta_cobranza,
      COALESCE(SUM(CASE WHEN pag.id_metodos_pago = 1 AND ap.es_multa = false THEN ap.monto ELSE 0 END), 0) as cash_pagado
    FROM acuerdos_pago acu
    JOIN aplicaciones_pago ap ON ap.id_acuerdo_pago = acu.id AND ap.activo = true
    JOIN pagos pag ON pag.id = ap.id_pago AND pag.activo = true
    WHERE acu.activo = true
    GROUP BY acu.id_cuenta_cobranza
  ),
  cuenta_compradores AS (
    SELECT 
      comp.id_cuenta_cobranza,
      jsonb_agg(
        jsonb_build_object(
          'nombre_legal', p.nombre_legal,
          'rfc', p.rfc,
          'porcentaje_copropiedad', comp.porcentaje_copropiedad,
          'id_persona', comp.id_persona
        ) ORDER BY comp.porcentaje_copropiedad DESC
      ) as compradores_json
    FROM compradores comp
    JOIN personas p ON comp.id_persona = p.id
    WHERE comp.activo = true
    GROUP BY comp.id_cuenta_cobranza
  )
  SELECT 
    cc.id::INTEGER,
    CASE 
      WHEN o.id_producto IS NULL THEN 'Propiedad'::TEXT
      WHEN proy_prod.id_tipo_uso = 9 THEN 'Producto'::TEXT
      WHEN proy_prod.id_tipo_uso IN (10, 11) THEN 'Servicio'::TEXT
      ELSE 'Producto'::TEXT
    END as tipo,
    ps.nombre::TEXT as producto_nombre,
    cc.clabe_stp::TEXT,
    cc.precio_final::NUMERIC,
    prop.precio_lista::NUMERIC,
    COALESCE(cc.es_comision_venta_efectivo, false)::BOOLEAN,
    COALESCE(cc.porcentaje_comision_venta, 0)::NUMERIC,
    COALESCE(cp.total_pagado, 0)::NUMERIC as pagado,
    ROUND(GREATEST(cc.precio_final - COALESCE(cp.total_pagado, 0), 0), 2)::NUMERIC as restante,
    (COALESCE(cc.valor_uma, 0) * 8025)::NUMERIC as cash_limit,
    COALESCE(cca.cash_pagado, 0)::NUMERIC as cash_paid,
    ROUND(GREATEST((COALESCE(cc.valor_uma, 0) * 8025) - COALESCE(cca.cash_pagado, 0), 0), 2)::NUMERIC as cash_remaining,
    CASE 
      WHEN (COALESCE(cc.valor_uma, 0) * 8025) > 0 
      THEN ROUND((COALESCE(cca.cash_pagado, 0) / (COALESCE(cc.valor_uma, 0) * 8025)) * 100, 2)
      ELSE 0 
    END::NUMERIC as cash_percentage,
    COALESCE(pers_dueno.nombre_legal, pers_dueno_prod.nombre_legal, 'Sin dueño')::TEXT as dueno,
    COALESCE(proy.nombre, proy_prod.nombre, 'Sin proyecto')::TEXT as proyecto,
    COALESCE(edif.nombre, 'Sin edificio')::TEXT as edificio,
    COALESCE(prop.numero_propiedad, 'Sin número')::TEXT as numero_propiedad,
    COALESCE(mod.nombre, 'Sin modelo')::TEXT as modelo,
    cc.activo::BOOLEAN,
    cc.id_oferta::INTEGER,
    tc.nombre::TEXT as motivo_cancelacion,
    COALESCE(cp.apartado_pagado_flag, false)::BOOLEAN as apartado_pagado,
    COALESCE(cp.tiene_acuerdos_flag, false)::BOOLEAN as tiene_acuerdos,
    (cm.id_cuenta_cobranza IS NOT NULL)::BOOLEAN as tiene_multas_pendientes,
    prop.id_estatus_disponibilidad::INTEGER,
    ed.nombre::TEXT as estatus_propiedad,
    cc.collection_id::INTEGER,
    COALESCE(cp.total_acuerdos_monto, 0)::NUMERIC as total_acuerdos,
    CASE 
      WHEN COALESCE(cp.tiene_acuerdos_flag, false) 
      THEN ROUND(cc.precio_final - COALESCE(cp.total_acuerdos_monto, 0), 2)
      ELSE 0 
    END::NUMERIC as discrepancia,
    CASE 
      WHEN o.id_producto IS NULL THEN (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0))
      ELSE NULL 
    END::NUMERIC as metraje,
    CASE 
      WHEN o.id_producto IS NULL AND (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)) > 0
      THEN ROUND(cc.precio_final / (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)), 2)
      ELSE NULL 
    END::NUMERIC as precio_por_m2,
    COALESCE(proy.id, proy_prod.id)::INTEGER as id_proyecto,
    prop.id_entidad_relacionada_dueno::INTEGER,
    COALESCE(ccmp.compradores_json, '[]'::jsonb) as compradores,
    v_total as total_count
  FROM cuentas_cobranza cc
  LEFT JOIN tipos_cancelacion tc ON cc.id_tipo_cancelacion = tc.id
  LEFT JOIN ofertas o ON cc.id_oferta = o.id
  LEFT JOIN propiedades prop ON o.id_propiedad = prop.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  LEFT JOIN productos_servicios ps ON o.id_producto = ps.id
  LEFT JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  LEFT JOIN edificios edif ON em.id_edificio = edif.id
  LEFT JOIN proyectos proy ON edif.id_proyecto = proy.id
  LEFT JOIN modelos mod ON em.id_modelo = mod.id
  LEFT JOIN entidades_relacionadas er ON prop.id_entidad_relacionada_dueno = er.id
  LEFT JOIN personas pers_dueno ON er.id_persona = pers_dueno.id
  LEFT JOIN entidades_relacionadas er_prod ON ps.id_entidad_relacionada_dueno = er_prod.id
  LEFT JOIN proyectos proy_prod ON er_prod.id_proyecto = proy_prod.id
  LEFT JOIN personas pers_dueno_prod ON er_prod.id_persona = pers_dueno_prod.id
  LEFT JOIN cuenta_pagos cp ON cp.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_multas cm ON cm.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_cash cca ON cca.id_cuenta_cobranza = cc.id
  LEFT JOIN cuenta_compradores ccmp ON ccmp.id_cuenta_cobranza = cc.id
  WHERE cc.id_cuenta_cobranza_padre IS NULL
    AND cc.activo = p_activo
    AND (p_id_cuenta IS NULL OR cc.id = p_id_cuenta)
    AND (p_proyecto IS NULL OR COALESCE(proy.nombre, proy_prod.nombre) ILIKE '%' || p_proyecto || '%')
    AND (p_clabe IS NULL OR cc.clabe_stp ILIKE '%' || p_clabe || '%')
    AND (p_no_propiedad IS NULL OR prop.numero_propiedad ILIKE '%' || p_no_propiedad || '%')
    AND (p_modelo IS NULL OR mod.nombre ILIKE '%' || p_modelo || '%')
    AND (p_producto IS NULL OR ps.nombre ILIKE '%' || p_producto || '%')
    AND (p_estatus_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_estatus_ids))
    AND (p_proyecto_ids IS NULL OR COALESCE(proy.id, proy_prod.id) = ANY(p_proyecto_ids))
    AND (p_dueno_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_dueno_entity_ids))
    AND (p_tipos IS NULL OR 
      CASE 
        WHEN o.id_producto IS NULL THEN 'Propiedad'
        WHEN proy_prod.id_tipo_uso = 9 THEN 'Producto'
        WHEN proy_prod.id_tipo_uso IN (10, 11) THEN 'Servicio'
        ELSE 'Producto'
      END = ANY(p_tipos)
    )
    AND (p_compradores IS NULL OR EXISTS (
      SELECT 1 FROM compradores comp
      JOIN personas p ON comp.id_persona = p.id
      WHERE comp.id_cuenta_cobranza = cc.id 
        AND comp.activo = true
        AND p.nombre_legal ILIKE '%' || p_compradores || '%'
    ))
  ORDER BY cc.id DESC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;

-- =====================================================
-- FUNCIÓN RPC: get_propiedades_paginadas
-- Optimiza la carga de propiedades con paginación real en SQL
-- =====================================================

CREATE OR REPLACE FUNCTION get_propiedades_paginadas(
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
  p_activo BOOLEAN DEFAULT TRUE,
  p_es_aprobado BOOLEAN DEFAULT TRUE,
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
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  -- Count total matching records
  SELECT COUNT(*) INTO v_total
  FROM propiedades prop
  JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id
  JOIN edificios edif ON em.id_edificio = edif.id
  JOIN proyectos proy ON edif.id_proyecto = proy.id
  JOIN modelos mod ON em.id_modelo = mod.id
  LEFT JOIN estatus_disponibilidad ed ON prop.id_estatus_disponibilidad = ed.id
  WHERE prop.activo = p_activo
    AND prop.es_aprobado = p_es_aprobado
    -- Search filter
    AND (p_search IS NULL OR 
      prop.numero_propiedad ILIKE '%' || p_search || '%' OR
      proy.nombre ILIKE '%' || p_search || '%' OR
      edif.nombre ILIKE '%' || p_search || '%'
    )
    -- Project filter
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    -- Model filter
    AND (p_modelo_ids IS NULL OR mod.id = ANY(p_modelo_ids))
    -- Recamaras filter
    AND (p_recamaras IS NULL OR mod.numero_recamaras = p_recamaras)
    -- Baños filter
    AND (p_banos IS NULL OR mod.numero_completo_banos = p_banos)
    -- Disponibilidad filter
    AND (p_disponibilidad_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_disponibilidad_ids))
    -- Tipo transaccion filter
    AND (p_tipo_transaccion_ids IS NULL OR prop.id_tipo_transaccion = ANY(p_tipo_transaccion_ids))
    -- Area filter
    AND (p_area_min IS NULL OR (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)) >= p_area_min)
    AND (p_area_max IS NULL OR (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)) <= p_area_max)
    -- Precio filter
    AND (p_precio_min IS NULL OR prop.precio_lista >= p_precio_min)
    AND (p_precio_max IS NULL OR prop.precio_lista <= p_precio_max)
    -- Project access filter
    AND (p_accessible_project_ids IS NULL OR proy.id = ANY(p_accessible_project_ids))
    -- Owner entity filter
    AND (p_ownership_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_ownership_entity_ids));

  RETURN QUERY
  WITH prop_counts AS (
    SELECT 
      e.id_propiedad,
      COUNT(*) FILTER (WHERE e.activo = true) as est_count
    FROM estacionamientos e
    GROUP BY e.id_propiedad
  ),
  bodega_counts AS (
    SELECT 
      b.id_propiedad,
      COUNT(*) FILTER (WHERE b.activo = true) as bod_count
    FROM bodegas b
    GROUP BY b.id_propiedad
  ),
  ofertas_prop AS (
    SELECT DISTINCT o.id_propiedad
    FROM ofertas o
    WHERE o.activo = true AND o.id_producto IS NULL
  ),
  ofertas_prod AS (
    SELECT DISTINCT o.id_propiedad
    FROM ofertas o
    WHERE o.activo = true AND o.id_producto IS NOT NULL
  ),
  cuentas_activas AS (
    SELECT 
      o.id_propiedad,
      cc.id as cuenta_id,
      cc.clabe_stp,
      cc.precio_final,
      cc.es_comision_venta_efectivo,
      cc.porcentaje_comision_venta,
      COALESCE(
        (SELECT SUM(ap.monto) 
         FROM acuerdos_pago acu 
         JOIN aplicaciones_pago ap ON ap.id_acuerdo_pago = acu.id AND ap.activo = true AND ap.es_multa = false
         WHERE acu.id_cuenta_cobranza = cc.id AND acu.activo = true
        ), 0
      ) as total_pagado,
      COALESCE(
        (SELECT bool_or(acu.pago_completado) 
         FROM acuerdos_pago acu 
         WHERE acu.id_cuenta_cobranza = cc.id AND acu.activo = true AND acu.id_concepto IN (1, 6)
        ), false
      ) as apartado_pagado,
      NOT EXISTS (
        SELECT 1 FROM acuerdos_pago acu WHERE acu.id_cuenta_cobranza = cc.id AND acu.activo = true
      ) as sin_esquema,
      EXISTS (
        SELECT 1 FROM cuentas_cobranza cc_mant 
        WHERE cc_mant.id_cuenta_cobranza_padre = cc.id AND cc_mant.activo = true
      ) as tiene_mantenimiento,
      ROW_NUMBER() OVER (PARTITION BY o.id_propiedad ORDER BY cc.id DESC) as rn
    FROM ofertas o
    JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
    WHERE o.activo = true 
      AND o.id_producto IS NULL
      AND cc.activo = true
      AND cc.id_cuenta_cobranza_padre IS NULL
  )
  SELECT 
    prop.id::INTEGER,
    prop.numero_propiedad::TEXT,
    prop.numero_piso::TEXT,
    prop.m2_interiores::NUMERIC,
    prop.m2_exteriores::NUMERIC,
    (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0))::NUMERIC as m2_reales,
    prop.precio_lista::NUMERIC,
    prop.monto_apartado::NUMERIC,
    prop.monto_apartado_pagando::NUMERIC,
    prop.clabe_stp_tmp_apartado::TEXT,
    prop.activo::BOOLEAN,
    prop.es_aprobado::BOOLEAN,
    prop.id_entidad_relacionada_dueno::INTEGER,
    prop.id_edificio_modelo::INTEGER,
    prop.id_vista::INTEGER,
    prop.id_estatus_disponibilidad::INTEGER,
    prop.id_tipo_transaccion::INTEGER,
    proy.nombre::TEXT as proyecto,
    proy.id::INTEGER as proyecto_id,
    edif.nombre::TEXT as edificio,
    mod.nombre::TEXT as modelo,
    mod.id::INTEGER as modelo_id,
    mod.numero_recamaras::INTEGER,
    mod.numero_completo_banos::INTEGER,
    mod.numero_medio_bano::INTEGER,
    vis.nombre::TEXT as vista,
    ed.nombre::TEXT as disponibilidad,
    tt.nombre::TEXT as tipo_transaccion,
    pers.nombre_legal::TEXT as propietario,
    ca.cuenta_id::INTEGER as cuenta_cobranza_id,
    ca.clabe_stp::TEXT,
    ca.precio_final::NUMERIC,
    COALESCE(ca.es_comision_venta_efectivo, false)::BOOLEAN,
    COALESCE(ca.porcentaje_comision_venta, 0)::NUMERIC,
    COALESCE(ca.total_pagado, 0)::NUMERIC,
    ROUND(GREATEST(COALESCE(ca.precio_final, 0) - COALESCE(ca.total_pagado, 0), 0), 2)::NUMERIC as restante,
    COALESCE(ca.apartado_pagado, false)::BOOLEAN,
    COALESCE(ca.sin_esquema, false)::BOOLEAN as cuenta_sin_esquema,
    COALESCE(ca.tiene_mantenimiento, false)::BOOLEAN as tiene_cuenta_pagada,
    COALESCE(pc.est_count, 0)::INTEGER as estacionamientos_count,
    COALESCE(bc.bod_count, 0)::INTEGER as bodegas_count,
    (op.id_propiedad IS NOT NULL)::BOOLEAN as tiene_ofertas,
    (oprod.id_propiedad IS NOT NULL)::BOOLEAN as tiene_ofertas_productos,
    v_total as total_count
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
  LEFT JOIN prop_counts pc ON pc.id_propiedad = prop.id
  LEFT JOIN bodega_counts bc ON bc.id_propiedad = prop.id
  LEFT JOIN ofertas_prop op ON op.id_propiedad = prop.id
  LEFT JOIN ofertas_prod oprod ON oprod.id_propiedad = prop.id
  LEFT JOIN cuentas_activas ca ON ca.id_propiedad = prop.id AND ca.rn = 1
  WHERE prop.activo = p_activo
    AND prop.es_aprobado = p_es_aprobado
    AND (p_search IS NULL OR 
      prop.numero_propiedad ILIKE '%' || p_search || '%' OR
      proy.nombre ILIKE '%' || p_search || '%' OR
      edif.nombre ILIKE '%' || p_search || '%'
    )
    AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
    AND (p_modelo_ids IS NULL OR mod.id = ANY(p_modelo_ids))
    AND (p_recamaras IS NULL OR mod.numero_recamaras = p_recamaras)
    AND (p_banos IS NULL OR mod.numero_completo_banos = p_banos)
    AND (p_disponibilidad_ids IS NULL OR prop.id_estatus_disponibilidad = ANY(p_disponibilidad_ids))
    AND (p_tipo_transaccion_ids IS NULL OR prop.id_tipo_transaccion = ANY(p_tipo_transaccion_ids))
    AND (p_area_min IS NULL OR (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)) >= p_area_min)
    AND (p_area_max IS NULL OR (COALESCE(prop.m2_interiores, 0) + COALESCE(prop.m2_exteriores, 0)) <= p_area_max)
    AND (p_precio_min IS NULL OR prop.precio_lista >= p_precio_min)
    AND (p_precio_max IS NULL OR prop.precio_lista <= p_precio_max)
    AND (p_accessible_project_ids IS NULL OR proy.id = ANY(p_accessible_project_ids))
    AND (p_ownership_entity_ids IS NULL OR prop.id_entidad_relacionada_dueno = ANY(p_ownership_entity_ids))
    -- Filtros de bodegas/estacionamientos/cuenta (aplicados después del JOIN)
    AND (p_tiene_bodegas IS NULL OR 
      (p_tiene_bodegas = 'si' AND COALESCE(bc.bod_count, 0) > 0) OR
      (p_tiene_bodegas = 'no' AND COALESCE(bc.bod_count, 0) = 0)
    )
    AND (p_tiene_estacionamientos IS NULL OR 
      (p_tiene_estacionamientos = 'si' AND COALESCE(pc.est_count, 0) > 0) OR
      (p_tiene_estacionamientos = 'no' AND COALESCE(pc.est_count, 0) = 0)
    )
    AND (p_tiene_cuenta IS NULL OR 
      (p_tiene_cuenta = 'si' AND ca.cuenta_id IS NOT NULL) OR
      (p_tiene_cuenta = 'no' AND ca.cuenta_id IS NULL)
    )
  ORDER BY 
    CASE WHEN p_orden_precio = 'asc' THEN prop.precio_lista END ASC NULLS LAST,
    CASE WHEN p_orden_precio = 'desc' THEN prop.precio_lista END DESC NULLS LAST,
    prop.numero_propiedad ASC
  LIMIT p_per_page
  OFFSET v_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_cuentas_cobranza_paginadas TO authenticated;
GRANT EXECUTE ON FUNCTION get_cuentas_cobranza_paginadas TO anon;
GRANT EXECUTE ON FUNCTION get_propiedades_paginadas TO authenticated;
GRANT EXECUTE ON FUNCTION get_propiedades_paginadas TO anon;

-- Create indexes to support the new functions if they don't exist
CREATE INDEX IF NOT EXISTS idx_cuentas_cobranza_activo_padre ON cuentas_cobranza(activo, id_cuenta_cobranza_padre);
CREATE INDEX IF NOT EXISTS idx_propiedades_activo_aprobado ON propiedades(activo, es_aprobado);
CREATE INDEX IF NOT EXISTS idx_acuerdos_pago_cuenta_activo ON acuerdos_pago(id_cuenta_cobranza, activo);
CREATE INDEX IF NOT EXISTS idx_aplicaciones_pago_acuerdo_activo ON aplicaciones_pago(id_acuerdo_pago, activo);