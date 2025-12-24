UPDATE reportes 
SET query_sql = 'WITH pagos_propiedades AS (
  SELECT 
    ''propiedad'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er_dueno.id AS id_dueno,
    pe_dueno.nombre_legal AS nombre_dueno,
    p.numero_propiedad AS numero_departamento,
    CONCAT(e.nombre, '' - '', m.nombre) AS edificio_modelo,
    pago.fecha_pago,
    pago.monto,
    mp.nombre AS metodo_pago,
    pago.clave_rastreo,
    pago.descripcion,
    cc.id AS id_cuenta_cobranza,
    pe.nombre_legal AS comprador,
    pe.rfc AS rfc_comprador,
    pe.email AS email_comprador,
    pe.direccion_fiscal_calle AS direccion_fiscal
  FROM pagos pago
  JOIN cuentas_cobranza cc ON pago.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN propiedades p ON o.id_propiedad = p.id
  JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
  JOIN edificios e ON em.id_edificio = e.id
  JOIN modelos m ON em.id_modelo = m.id
  JOIN proyectos pr ON e.id_proyecto = pr.id
  LEFT JOIN entidades_relacionadas er_dueno ON p.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  JOIN metodos_pago mp ON pago.id_metodos_pago = mp.id
  JOIN personas pe ON o.id_persona_lead = pe.id
  WHERE pago.activo = true
    AND cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_propiedad IS NOT NULL
    AND o.id_producto IS NULL
    {{AND date_trunc(''month'', pago.fecha_pago) = date_trunc(''month'', to_date(:mes_pago, ''YYYY-MM-DD''))}}
),
pagos_productos AS (
  SELECT 
    ''producto'' AS tipo,
    pr.id AS id_proyecto,
    pr.nombre AS proyecto,
    er_dueno.id AS id_dueno,
    pe_dueno.nombre_legal AS nombre_dueno,
    ps.nombre AS numero_departamento,
    cat.nombre AS edificio_modelo,
    pago.fecha_pago,
    pago.monto,
    mp.nombre AS metodo_pago,
    pago.clave_rastreo,
    pago.descripcion,
    cc.id AS id_cuenta_cobranza,
    pe.nombre_legal AS comprador,
    pe.rfc AS rfc_comprador,
    pe.email AS email_comprador,
    pe.direccion_fiscal_calle AS direccion_fiscal
  FROM pagos pago
  JOIN cuentas_cobranza cc ON pago.id_cuenta_cobranza = cc.id
  JOIN ofertas o ON cc.id_oferta = o.id
  JOIN productos_servicios ps ON o.id_producto = ps.id
  JOIN proyectos pr ON ps.id_proyecto = pr.id
  LEFT JOIN categorias_producto cat ON ps.id_categoria = cat.id
  LEFT JOIN entidades_relacionadas er_dueno ON ps.id_entidad_relacionada_dueno = er_dueno.id
  LEFT JOIN personas pe_dueno ON er_dueno.id_persona = pe_dueno.id
  JOIN metodos_pago mp ON pago.id_metodos_pago = mp.id
  JOIN personas pe ON o.id_persona_lead = pe.id
  WHERE pago.activo = true
    AND cc.activo = true
    AND cc.id_tipo_cancelacion IS NULL
    AND o.id_producto IS NOT NULL
    {{AND date_trunc(''month'', pago.fecha_pago) = date_trunc(''month'', to_date(:mes_pago, ''YYYY-MM-DD''))}}
)
SELECT 
  tipo,
  id_proyecto,
  proyecto,
  id_dueno,
  nombre_dueno,
  numero_departamento,
  edificio_modelo,
  fecha_pago,
  monto,
  metodo_pago,
  clave_rastreo,
  descripcion,
  id_cuenta_cobranza,
  comprador,
  rfc_comprador,
  email_comprador,
  direccion_fiscal
FROM (
  SELECT * FROM pagos_propiedades
  UNION ALL
  SELECT * FROM pagos_productos
) combined
{{WHERE id_proyecto = :id_proyecto}}
{{AND id_dueno = :id_dueno}}
ORDER BY fecha_pago DESC, proyecto, numero_departamento',
fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 8;