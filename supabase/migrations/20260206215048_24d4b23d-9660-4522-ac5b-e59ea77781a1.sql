
DROP FUNCTION IF EXISTS public.get_cuentas_mantenimiento_paginadas(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER[], INTEGER[]);

CREATE OR REPLACE FUNCTION public.get_cuentas_mantenimiento_paginadas(
  p_page INTEGER DEFAULT 1,
  p_per_page INTEGER DEFAULT 50,
  p_id_cuenta TEXT DEFAULT NULL,
  p_propietarios TEXT DEFAULT NULL,
  p_clabe TEXT DEFAULT NULL,
  p_proyecto TEXT DEFAULT NULL,
  p_no_propiedad TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_clave_catastral TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_proyecto_ids INTEGER[] DEFAULT NULL,
  p_dueno_entity_ids INTEGER[] DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  clabe_stp TEXT,
  activo BOOLEAN,
  id_oferta INTEGER,
  id_cuenta_cobranza_padre BIGINT,
  numero_propiedad TEXT,
  clave_catastral TEXT,
  id_propiedad BIGINT,
  proyecto TEXT,
  id_proyecto INTEGER,
  edificio TEXT,
  modelo TEXT,
  dueno TEXT,
  pago_acumulado NUMERIC,
  total_pagado NUMERIC,
  saldo_pendiente NUMERIC,
  compradores_json JSONB,
  residentes_json JSONB,
  proxima_fecha_pago DATE,
  tiene_multas_pendientes BOOLEAN,
  bodegas_json JSONB,
  estacionamientos_json JSONB,
  productos_json JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INTEGER;
  v_id_filter BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_per_page;

  IF p_id_cuenta IS NOT NULL AND p_id_cuenta <> '' THEN
    BEGIN
      v_id_filter := CAST(REPLACE(LOWER(p_id_cuenta), 'cm-', '') AS BIGINT);
    EXCEPTION WHEN OTHERS THEN
      v_id_filter := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
  base_accounts AS (
    SELECT
      cc.id AS cuenta_id,
      cc.clabe_stp::TEXT AS cuenta_clabe_stp,
      cc.activo AS cuenta_activo,
      cc.id_oferta AS cuenta_id_oferta,
      cc.id_cuenta_cobranza_padre,
      pp.id AS prop_id,
      pp.numero_propiedad::TEXT AS prop_numero,
      parent_cc.clave_catastral::TEXT AS prop_clave_catastral,
      proy.nombre AS proyecto_nombre,
      proy.id AS proyecto_id,
      ed.nombre AS edificio_nombre,
      mod.nombre AS modelo_nombre,
      per_dueno.nombre_legal AS dueno_nombre,
      er.id AS entidad_id
    FROM cuentas_cobranza cc
    LEFT JOIN cuentas_cobranza parent_cc ON parent_cc.id = cc.id_cuenta_cobranza_padre
    LEFT JOIN ofertas parent_of ON parent_of.id = parent_cc.id_oferta
    LEFT JOIN propiedades pp ON pp.id = parent_of.id_propiedad
    LEFT JOIN entidades_relacionadas er ON er.id = pp.id_entidad_relacionada_dueno
    LEFT JOIN personas per_dueno ON per_dueno.id = er.id_persona
    LEFT JOIN proyectos proy ON proy.id = er.id_proyecto
    LEFT JOIN edificios_modelos em ON em.id = pp.id_edificio_modelo
    LEFT JOIN edificios ed ON ed.id = em.id_edificio
    LEFT JOIN modelos mod ON mod.id = em.id_modelo
    WHERE cc.id_cuenta_cobranza_padre IS NOT NULL
      AND cc.activo = true
      AND (p_proyecto_ids IS NULL OR proy.id = ANY(p_proyecto_ids))
      AND (p_dueno_entity_ids IS NULL OR er.id = ANY(p_dueno_entity_ids))
  ),
  acuerdos_info AS (
    SELECT ap.id_cuenta_cobranza, COALESCE(SUM(ap.monto), 0) AS total_acuerdos
    FROM acuerdos_pago ap
    WHERE ap.activo = true AND ap.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
    GROUP BY ap.id_cuenta_cobranza
  ),
  pagos_info AS (
    SELECT p.id_cuenta_cobranza, COALESCE(SUM(p.monto), 0) AS total_pagos_real
    FROM pagos p
    WHERE p.activo = true AND p.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
    GROUP BY p.id_cuenta_cobranza
  ),
  compradores_info AS (
    SELECT c.id_cuenta_cobranza,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id_persona', per.id, 'nombre_legal', per.nombre_legal,
        'rfc', per.rfc, 'porcentaje_copropiedad', c.porcentaje_copropiedad
      )) FILTER (WHERE per.nombre_legal IS NOT NULL), '[]'::jsonb) AS compradores
    FROM compradores c LEFT JOIN personas per ON per.id = c.id_persona
    WHERE c.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
    GROUP BY c.id_cuenta_cobranza
  ),
  residentes_info AS (
    SELECT r.id_cuenta_cobranza,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id_persona', r.id_persona, 'nombre_legal', per.nombre_legal, 'activo', r.activo
      )) FILTER (WHERE per.nombre_legal IS NOT NULL), '[]'::jsonb) AS residentes
    FROM residentes r LEFT JOIN personas per ON per.id = r.id_persona
    WHERE r.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
    GROUP BY r.id_cuenta_cobranza
  ),
  proxima_fecha AS (
    SELECT ap.id_cuenta_cobranza, MAX(ap.fecha_pago) AS fecha_maxima
    FROM acuerdos_pago ap
    WHERE ap.activo = true AND ap.pago_completado = false AND ap.fecha_pago IS NOT NULL
      AND ap.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
    GROUP BY ap.id_cuenta_cobranza
  ),
  multas_info AS (
    SELECT DISTINCT ap.id_cuenta_cobranza
    FROM acuerdos_pago ap INNER JOIN multas m ON m.id_acuerdo_pago = ap.id
    WHERE ap.activo = true AND m.activo = true AND m.es_pagada = false
      AND ap.id_cuenta_cobranza IN (SELECT cuenta_id FROM base_accounts)
  ),
  bodegas_info AS (
    SELECT ba.prop_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'nombre', b.nombre, 'm2', b.m2, 'ubicacion', b.ubicacion, 'es_incluido', b.es_incluido
      )), '[]'::jsonb) AS bodegas
    FROM (SELECT DISTINCT prop_id FROM base_accounts WHERE prop_id IS NOT NULL) ba
    INNER JOIN bodegas b ON b.id_propiedad = ba.prop_id AND b.activo = true
    GROUP BY ba.prop_id
  ),
  estacionamientos_info AS (
    SELECT ea.prop_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'nombre', e.nombre, 'tipo', COALESCE(te.nombre, 'Sin tipo'),
        'm2', e.m2, 'ubicacion', e.ubicacion, 'es_incluido', e.es_incluido
      )), '[]'::jsonb) AS estacionamientos
    FROM (SELECT DISTINCT prop_id FROM base_accounts WHERE prop_id IS NOT NULL) ea
    INNER JOIN estacionamientos e ON e.id_propiedad = ea.prop_id AND e.activo = true
    LEFT JOIN tipos_estacionamiento te ON te.id = e.id_tipo
    GROUP BY ea.prop_id
  ),
  productos_info AS (
    SELECT parent_of.id_propiedad AS prop_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'nombre', ps.nombre, 'categoria', COALESCE(cp.nombre, 'Sin categoría'),
        'precio', COALESCE(ps.precio_lista, 0)
      )), '[]'::jsonb) AS productos
    FROM base_accounts ba
    INNER JOIN cuentas_cobranza parent_cc ON parent_cc.id = ba.id_cuenta_cobranza_padre
    INNER JOIN ofertas parent_of ON parent_of.id = parent_cc.id_oferta AND parent_of.id_producto IS NOT NULL
    INNER JOIN productos_servicios ps ON ps.id = parent_of.id_producto
    LEFT JOIN categorias_producto cp ON cp.id = ps.id_categoria
    WHERE parent_of.id_propiedad IS NOT NULL
      AND (cp.nombre IS NULL OR cp.nombre NOT IN ('Bodega', 'Estacionamiento'))
    GROUP BY parent_of.id_propiedad
  ),
  filtered AS (
    SELECT ba.*,
      COALESCE(ai.total_acuerdos, 0) AS calc_pago_acumulado,
      COALESCE(pi.total_pagos_real, 0) AS calc_total_pagado,
      COALESCE(ai.total_acuerdos, 0) - COALESCE(pi.total_pagos_real, 0) AS calc_saldo,
      COALESCE(ci.compradores, '[]'::jsonb) AS calc_compradores,
      COALESCE(ri.residentes, '[]'::jsonb) AS calc_residentes,
      pf.fecha_maxima AS calc_proxima_fecha,
      (mi.id_cuenta_cobranza IS NOT NULL) AS calc_tiene_multas,
      COALESCE(bi.bodegas, '[]'::jsonb) AS calc_bodegas,
      COALESCE(ei.estacionamientos, '[]'::jsonb) AS calc_estacionamientos,
      COALESCE(pri.productos, '[]'::jsonb) AS calc_productos
    FROM base_accounts ba
    LEFT JOIN acuerdos_info ai ON ai.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN pagos_info pi ON pi.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN compradores_info ci ON ci.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN residentes_info ri ON ri.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN proxima_fecha pf ON pf.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN multas_info mi ON mi.id_cuenta_cobranza = ba.cuenta_id
    LEFT JOIN bodegas_info bi ON bi.prop_id = ba.prop_id
    LEFT JOIN estacionamientos_info ei ON ei.prop_id = ba.prop_id
    LEFT JOIN productos_info pri ON pri.prop_id = ba.prop_id
    WHERE
      (v_id_filter IS NULL OR ba.cuenta_id = v_id_filter)
      AND (p_clabe IS NULL OR ba.cuenta_clabe_stp ILIKE '%' || p_clabe || '%')
      AND (p_proyecto IS NULL OR ba.proyecto_nombre ILIKE '%' || p_proyecto || '%')
      AND (p_no_propiedad IS NULL OR ba.prop_numero ILIKE '%' || p_no_propiedad || '%')
      AND (p_modelo IS NULL OR ba.modelo_nombre ILIKE '%' || p_modelo || '%')
      AND (p_clave_catastral IS NULL OR ba.prop_clave_catastral ILIKE '%' || p_clave_catastral || '%')
      AND (p_propietarios IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(ci.compradores, '[]'::jsonb)) AS elem
        WHERE elem->>'nombre_legal' ILIKE '%' || p_propietarios || '%'
           OR elem->>'rfc' ILIKE '%' || p_propietarios || '%'
      ))
      AND (p_search IS NULL OR (
        ba.cuenta_id::TEXT ILIKE '%' || p_search || '%'
        OR ba.cuenta_clabe_stp ILIKE '%' || p_search || '%'
        OR ba.proyecto_nombre ILIKE '%' || p_search || '%'
        OR ba.prop_numero ILIKE '%' || p_search || '%'
        OR ba.modelo_nombre ILIKE '%' || p_search || '%'
        OR ba.dueno_nombre ILIKE '%' || p_search || '%'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(ci.compradores, '[]'::jsonb)) AS elem
          WHERE elem->>'nombre_legal' ILIKE '%' || p_search || '%'
             OR elem->>'rfc' ILIKE '%' || p_search || '%'
        )
      ))
  )
  SELECT
    f.cuenta_id,
    f.cuenta_clabe_stp,
    f.cuenta_activo,
    f.cuenta_id_oferta,
    f.id_cuenta_cobranza_padre,
    f.prop_numero,
    f.prop_clave_catastral,
    f.prop_id,
    f.proyecto_nombre,
    f.proyecto_id,
    f.edificio_nombre,
    f.modelo_nombre,
    f.dueno_nombre,
    f.calc_pago_acumulado,
    f.calc_total_pagado,
    f.calc_saldo,
    f.calc_compradores,
    f.calc_residentes,
    f.calc_proxima_fecha,
    f.calc_tiene_multas,
    f.calc_bodegas,
    f.calc_estacionamientos,
    f.calc_productos,
    (SELECT COUNT(*) FROM filtered)::BIGINT
  FROM filtered f
  ORDER BY f.cuenta_id DESC
  OFFSET v_offset
  LIMIT p_per_page;
END;
$$;
