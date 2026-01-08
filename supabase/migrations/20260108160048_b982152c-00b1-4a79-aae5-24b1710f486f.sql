-- Actualizar el filtro id_dueno para incluir placeholder :id_proyecto que se filtrará dinámicamente
UPDATE reportes 
SET filtros_configuracion = '[
  {
    "nombre": "id_proyecto",
    "label": "Proyecto",
    "tipo": "select",
    "requerido": false,
    "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr WHERE pr.activo = true AND (EXISTS (SELECT 1 FROM cuentas_cobranza cc JOIN ofertas o ON cc.id_oferta = o.id JOIN propiedades p ON o.id_propiedad = p.id JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = pr.id AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL AND o.id_producto IS NULL) OR EXISTS (SELECT 1 FROM cuentas_cobranza cc JOIN ofertas o ON cc.id_oferta = o.id JOIN productos_servicios ps ON o.id_producto = ps.id WHERE ps.id_proyecto = pr.id AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL AND o.id_producto IS NOT NULL)) ORDER BY pr.nombre"
  },
  {
    "nombre": "id_dueno",
    "label": "Dueño Vendedor",
    "tipo": "select",
    "requerido": false,
    "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe JOIN entidades_relacionadas er ON er.id_persona = pe.id WHERE pe.activo = true AND ((er.id_tipo_entidad = 5 AND EXISTS (SELECT 1 FROM propiedades p JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE p.id_entidad_relacionada_dueno = er.id AND e.id_proyecto IN (:id_proyecto))) OR (er.id_tipo_entidad = 5 AND EXISTS (SELECT 1 FROM productos_servicios ps WHERE ps.id_entidad_relacionada_dueno = er.id AND ps.id_proyecto IN (:id_proyecto)))) ORDER BY pe.nombre_legal"
  },
  {
    "nombre": "tipo",
    "label": "Tipo",
    "tipo": "select",
    "requerido": false,
    "opciones_estaticas": [
      {"id": "Propiedad", "nombre": "Propiedad"},
      {"id": "Producto", "nombre": "Producto"}
    ]
  },
  {
    "nombre": "id_categoria",
    "label": "Categoría de Producto",
    "tipo": "select",
    "requerido": false,
    "query_opciones": "SELECT id, nombre FROM categorias_producto WHERE activo = true ORDER BY nombre"
  }
]'::jsonb,
fecha_actualizacion = NOW()
WHERE id = 3;