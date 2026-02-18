
CREATE OR REPLACE FUNCTION get_inventario_disponible(
  p_accessible_project_ids int[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'numero_propiedad', p.numero_propiedad,
      'numero_piso', p.numero_piso,
      'precio_lista', p.precio_lista,
      'm2_interiores', p.m2_interiores,
      'm2_exteriores', p.m2_exteriores,
      'proyecto_id', pr.id,
      'proyecto_nombre', pr.nombre,
      'edificio_nombre', ed.nombre,
      'modelo_id', mo.id,
      'modelo_nombre', mo.nombre,
      'numero_recamaras', mo.numero_recamaras,
      'numero_completo_banos', mo.numero_completo_banos,
      'numero_medio_bano', mo.numero_medio_bano,
      'bodegas_count', COALESCE(bod.cnt, 0),
      'estacionamientos_count', COALESCE(est.cnt, 0),
      'estacionamientos_tipos', COALESCE(est.tipos, '[]'::jsonb),
      'propiedad_imagenes', COALESCE(pimg.imgs, '[]'::jsonb),
      'modelo_imagenes', COALESCE(mimg.imgs, '[]'::jsonb),
      'esquemas_pago', COALESCE(ep.schemes, '[]'::jsonb)
    ) AS row_data
    FROM propiedades p
    INNER JOIN edificios_modelos em ON em.id = p.id_edificio_modelo
    INNER JOIN edificios ed ON ed.id = em.id_edificio
    INNER JOIN proyectos pr ON pr.id = ed.id_proyecto
    INNER JOIN modelos mo ON mo.id = em.id_modelo
    -- Bodegas count
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM bodegas b
      WHERE b.id_propiedad = p.id AND b.activo = true
    ) bod ON true
    -- Estacionamientos count + types
    LEFT JOIN LATERAL (
      SELECT 
        count(*)::int AS cnt,
        jsonb_agg(DISTINCT te.nombre) FILTER (WHERE te.nombre IS NOT NULL) AS tipos
      FROM estacionamientos e
      LEFT JOIN tipos_estacionamiento te ON te.id = e.id_tipo
      WHERE e.id_propiedad = p.id AND e.activo = true
    ) est ON true
    -- Property images
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', mp.id, 'url', mp.url) ORDER BY mp.id) AS imgs
      FROM multimedias_propiedad mp
      WHERE mp.id_propiedad = p.id AND mp.activo = true AND mp.es_imagen = true
    ) pimg ON true
    -- Model images (fallback)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', mm.id, 'url', mm.url) ORDER BY mm.id) AS imgs
      FROM multimedias_modelo mm
      WHERE mm.id_modelo = mo.id AND mm.activo = true AND mm.es_imagen = true AND mm.ver_como_imagen_de_propiedad = true
    ) mimg ON true
    -- Payment schemes for the project
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'nombre', s.nombre,
        'id_proyecto', s.id_proyecto,
        'porcentaje_enganche', s.porcentaje_enganche,
        'porcentaje_mensualidades', s.porcentaje_mensualidades,
        'porcentaje_entrega', s.porcentaje_entrega,
        'numero_mensualidades', s.numero_mensualidades,
        'porcentaje_descuento_aumento', s.porcentaje_descuento_aumento
      ) ORDER BY s.nombre) AS schemes
      FROM esquemas_pago s
      WHERE s.id_proyecto = pr.id AND s.activo = true AND s.es_manual = false
    ) ep ON true
    WHERE p.id_estatus_disponibilidad = 2
      AND pr.activo = true
      AND pr.publicar = true
      AND (p_accessible_project_ids IS NULL OR pr.id = ANY(p_accessible_project_ids))
    ORDER BY pr.nombre, ed.nombre, p.numero_propiedad
  ) sub;
$$;
