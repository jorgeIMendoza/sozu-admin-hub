
CREATE OR REPLACE FUNCTION public.get_inventario_disponible_v2(
  p_accessible_project_ids int[] DEFAULT NULL,
  p_project_names text[] DEFAULT NULL,
  p_model_names text[] DEFAULT NULL,
  p_bedrooms int[] DEFAULT NULL,
  p_levels text[] DEFAULT NULL,
  p_has_bodega boolean DEFAULT NULL,
  p_has_estacionamiento boolean DEFAULT NULL,
  p_sort_price text DEFAULT NULL,
  p_page_size int DEFAULT 30,
  p_page int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    WITH inv_base AS (
      SELECT
        p.id, p.numero_propiedad, p.numero_piso, p.precio_lista,
        p.m2_interiores, p.m2_exteriores,
        pr.id AS proyecto_id, pr.nombre AS proyecto_nombre,
        ed.nombre AS edificio_nombre,
        mo.id AS modelo_id, mo.nombre AS modelo_nombre,
        mo.numero_recamaras, mo.numero_completo_banos, mo.numero_medio_bano,
        COALESCE(bod.cnt, 0) AS bodegas_count,
        COALESCE(est.cnt, 0) AS estacionamientos_count,
        COALESCE(est.tipos, '[]'::jsonb) AS estacionamientos_tipos,
        COALESCE(pimg.imgs, '[]'::jsonb) AS propiedad_imagenes
      FROM propiedades p
      INNER JOIN edificios_modelos em ON em.id = p.id_edificio_modelo
      INNER JOIN edificios ed ON ed.id = em.id_edificio
      INNER JOIN proyectos pr ON pr.id = ed.id_proyecto
      INNER JOIN modelos mo ON mo.id = em.id_modelo
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS cnt FROM bodegas b WHERE b.id_propiedad = p.id AND b.activo = true
      ) bod ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS cnt,
          jsonb_agg(DISTINCT te.nombre) FILTER (WHERE te.nombre IS NOT NULL) AS tipos
        FROM estacionamientos e
        LEFT JOIN tipos_estacionamiento te ON te.id = e.id_tipo
        WHERE e.id_propiedad = p.id AND e.activo = true
      ) est ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', mp.id, 'url', mp.url) ORDER BY mp.id) AS imgs
        FROM multimedias_propiedad mp
        WHERE mp.id_propiedad = p.id AND mp.activo = true AND mp.es_imagen = true
      ) pimg ON true
      WHERE p.id_estatus_disponibilidad = 2
        AND pr.activo = true AND pr.publicar = true
        AND (p_accessible_project_ids IS NULL OR pr.id = ANY(p_accessible_project_ids))
        AND (p_project_names IS NULL OR pr.nombre = ANY(p_project_names))
        AND (p_model_names IS NULL OR mo.nombre = ANY(p_model_names))
        AND (p_bedrooms IS NULL OR mo.numero_recamaras = ANY(p_bedrooms))
        AND (p_levels IS NULL OR p.numero_piso = ANY(p_levels))
        AND (p_has_bodega IS NULL OR (p_has_bodega = true AND COALESCE(bod.cnt, 0) > 0) OR (p_has_bodega = false AND COALESCE(bod.cnt, 0) = 0))
        AND (p_has_estacionamiento IS NULL OR (p_has_estacionamiento = true AND COALESCE(est.cnt, 0) > 0) OR (p_has_estacionamiento = false AND COALESCE(est.cnt, 0) = 0))
    ),
    inv_count AS (
      SELECT count(*)::int AS total FROM inv_base
    ),
    inv_page AS (
      SELECT * FROM inv_base
      ORDER BY
        CASE WHEN p_sort_price = 'asc' THEN precio_lista END ASC NULLS LAST,
        CASE WHEN p_sort_price = 'desc' THEN precio_lista END DESC NULLS LAST,
        CASE WHEN p_sort_price IS NULL OR p_sort_price NOT IN ('asc','desc') THEN random() END
      LIMIT p_page_size OFFSET p_page * p_page_size
    ),
    page_modelo_imgs AS (
      SELECT DISTINCT ON (mid) b.modelo_id AS mid,
        (SELECT jsonb_agg(jsonb_build_object('id', mm.id, 'url', mm.url) ORDER BY mm.id)
         FROM multimedias_modelo mm
         WHERE mm.id_modelo = b.modelo_id AND mm.activo = true AND mm.es_imagen = true AND mm.ver_como_imagen_de_propiedad = true
        ) AS imgs
      FROM inv_page b
    ),
    page_esquemas AS (
      SELECT DISTINCT ON (pid) b.proyecto_id AS pid,
        (SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'nombre', s.nombre, 'id_proyecto', s.id_proyecto,
          'porcentaje_enganche', s.porcentaje_enganche,
          'porcentaje_mensualidades', s.porcentaje_mensualidades,
          'porcentaje_entrega', s.porcentaje_entrega,
          'numero_mensualidades', s.numero_mensualidades,
          'porcentaje_descuento_aumento', s.porcentaje_descuento_aumento
        ) ORDER BY s.nombre)
        FROM esquemas_pago s
        WHERE s.id_proyecto = b.proyecto_id AND s.activo = true AND s.es_manual = false
        ) AS schemes
      FROM inv_page b
    )
    SELECT jsonb_build_object(
      'total_count', (SELECT total FROM inv_count),
      'propiedades', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'numero_propiedad', b.numero_propiedad, 'numero_piso', b.numero_piso,
        'precio_lista', b.precio_lista, 'm2_interiores', b.m2_interiores, 'm2_exteriores', b.m2_exteriores,
        'proyecto_id', b.proyecto_id, 'proyecto_nombre', b.proyecto_nombre,
        'edificio_nombre', b.edificio_nombre, 'modelo_id', b.modelo_id, 'modelo_nombre', b.modelo_nombre,
        'numero_recamaras', b.numero_recamaras, 'numero_completo_banos', b.numero_completo_banos,
        'numero_medio_bano', b.numero_medio_bano, 'bodegas_count', b.bodegas_count,
        'estacionamientos_count', b.estacionamientos_count, 'estacionamientos_tipos', b.estacionamientos_tipos,
        'propiedad_imagenes', b.propiedad_imagenes
      )) FROM inv_page b), '[]'::jsonb),
      'modelo_imagenes', COALESCE((SELECT jsonb_object_agg(mid::text, imgs) FROM page_modelo_imgs WHERE imgs IS NOT NULL), '{}'::jsonb),
      'esquemas_pago_proyecto', COALESCE((SELECT jsonb_object_agg(pid::text, schemes) FROM page_esquemas WHERE schemes IS NOT NULL), '{}'::jsonb),
      'filter_options', jsonb_build_object(
        'proyectos', COALESCE((SELECT jsonb_agg(DISTINCT proyecto_nombre ORDER BY proyecto_nombre) FROM inv_base), '[]'::jsonb),
        'modelos', COALESCE((SELECT jsonb_agg(DISTINCT modelo_nombre ORDER BY modelo_nombre) FROM inv_base), '[]'::jsonb),
        'recamaras', COALESCE((SELECT jsonb_agg(DISTINCT numero_recamaras ORDER BY numero_recamaras) FROM inv_base WHERE numero_recamaras > 0), '[]'::jsonb),
        'niveles', COALESCE((SELECT jsonb_agg(DISTINCT numero_piso ORDER BY numero_piso) FROM inv_base WHERE numero_piso IS NOT NULL), '[]'::jsonb)
      )
    )
  );
END;
$$;
