
-- Actualizar el filtro de proyectos para mostrar solo los que tienen datos en el reporte
UPDATE reportes 
SET filtros_configuracion = '[
  {"nombre": "id_proyecto", "tipo": "select", "label": "Proyecto", "requerido": false, "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr WHERE pr.activo = true AND (EXISTS (SELECT 1 FROM cuentas_cobranza cc JOIN ofertas o ON cc.id_oferta = o.id JOIN propiedades p ON o.id_propiedad = p.id JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = pr.id AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL AND o.id_producto IS NULL) OR EXISTS (SELECT 1 FROM cuentas_cobranza cc JOIN ofertas o ON cc.id_oferta = o.id JOIN productos_servicios ps ON o.id_producto = ps.id WHERE ps.id_proyecto = pr.id AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL)) ORDER BY pr.nombre"},
  {"nombre": "id_dueno", "tipo": "select", "label": "Dueño Vendedor", "requerido": false, "depende_de": "id_proyecto", "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe JOIN entidades_relacionadas er ON er.id_persona = pe.id JOIN propiedades p ON p.id_entidad_relacionada_dueno = er.id JOIN edificios_modelos em ON p.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = :id_proyecto AND pe.activo = true ORDER BY pe.nombre_legal"},
  {"nombre": "tipo", "tipo": "select", "label": "Tipo", "requerido": false, "opciones_estaticas": [{"id": "Propiedad", "nombre": "Propiedad"}, {"id": "Producto", "nombre": "Producto"}]},
  {"nombre": "id_categoria", "tipo": "select", "label": "Categoría de Producto", "requerido": false, "query_opciones": "SELECT id, nombre FROM categorias_producto WHERE activo = true ORDER BY nombre"}
]'::jsonb,
fecha_actualizacion = NOW()
WHERE id = 3;
