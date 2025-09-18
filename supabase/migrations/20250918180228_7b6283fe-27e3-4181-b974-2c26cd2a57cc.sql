-- Function to get offers with agent information
CREATE OR REPLACE FUNCTION get_offers_with_agent(property_id INTEGER)
RETURNS TABLE(
  id INTEGER,
  fecha_generacion TIMESTAMP WITHOUT TIME ZONE,
  activo BOOLEAN,
  id_persona_lead INTEGER,
  agent_name TEXT,
  lead_name TEXT,
  lead_email TEXT,
  lead_telefono TEXT,
  esquema_id INTEGER,
  esquema_nombre TEXT,
  esquema_enganche NUMERIC,
  esquema_mensualidades NUMERIC,
  esquema_entrega NUMERIC,
  esquema_numero_meses INTEGER,
  esquema_es_manual BOOLEAN,
  cuenta_precio_final NUMERIC,
  cuenta_fecha_compra TIMESTAMP WITHOUT TIME ZONE,
  cuenta_es_aprobado BOOLEAN,
  cuenta_clabe_stp TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.fecha_generacion,
    o.activo,
    o.id_persona_lead,
    COALESCE(u.nombre, o.email_creador) as agent_name,
    p.nombre_legal as lead_name,
    p.email as lead_email,
    p.telefono as lead_telefono,
    ep.id as esquema_id,
    ep.nombre as esquema_nombre,
    ep.porcentaje_enganche as esquema_enganche,
    ep.porcentaje_mensualidades as esquema_mensualidades,
    ep.porcentaje_entrega as esquema_entrega,
    ep.numero_mensualidades as esquema_numero_meses,
    ep.es_manual as esquema_es_manual,
    cc.precio_final as cuenta_precio_final,
    cc.fecha_compra as cuenta_fecha_compra,
    cc.es_aprobado as cuenta_es_aprobado,
    cc.clabe_stp as cuenta_clabe_stp
  FROM ofertas o
  LEFT JOIN usuarios u ON u.email = o.email_creador
  LEFT JOIN personas p ON p.id = o.id_persona_lead
  LEFT JOIN esquemas_pago ep ON ep.id = o.id_esquema_pago_seleccionado
  LEFT JOIN cuentas_cobranza cc ON cc.id_oferta = o.id
  WHERE o.id_propiedad = property_id 
    AND o.activo = true
  ORDER BY o.fecha_generacion DESC;
END;
$$;