-- Fix the id_proyecto filter query - ofertas doesn't have id_proyecto column
-- Need to join through propiedades or productos to get to proyecto
UPDATE reportes 
SET filtros_configuracion = '[
  {
    "nombre": "id_proyecto",
    "label": "Proyecto",
    "tipo": "select",
    "query_opciones": "SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr INNER JOIN edificios ed ON ed.id_proyecto = pr.id INNER JOIN edificios_modelos em ON em.id_edificio = ed.id INNER JOIN propiedades prop ON prop.id_edificio_modelo = em.id INNER JOIN ofertas o ON o.id_propiedad = prop.id INNER JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE pr.activo = true AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL UNION SELECT DISTINCT pr.id, pr.nombre FROM proyectos pr INNER JOIN productos_servicios ps ON ps.id_proyecto = pr.id INNER JOIN ofertas o ON o.id_producto = ps.id INNER JOIN cuentas_cobranza cc ON cc.id_oferta = o.id WHERE pr.activo = true AND cc.activo = true AND cc.id_tipo_cancelacion IS NULL ORDER BY nombre"
  },
  {
    "nombre": "id_dueno",
    "label": "Dueño",
    "tipo": "select",
    "depende_de": "id_proyecto",
    "query_opciones": "SELECT DISTINCT pe.id, pe.nombre_legal as nombre FROM personas pe INNER JOIN entidades_relacionadas er ON er.id_persona = pe.id WHERE er.id_tipo_entidad = 5 AND er.activo = true AND pe.activo = true AND er.id_proyecto = :id_proyecto ORDER BY pe.nombre_legal"
  },
  {
    "nombre": "tipo",
    "label": "Tipo",
    "tipo": "select",
    "opciones_estaticas": [
      {"id": "Propiedad", "nombre": "Propiedad"},
      {"id": "Producto", "nombre": "Producto"}
    ]
  }
]'::jsonb,
fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 5;