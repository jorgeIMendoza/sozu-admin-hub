-- Script de limpieza: Eliminar pagos STP huérfanos (sin aplicaciones de pago)
-- Excluye cuentas de mantenimiento que pueden tener pagos adelantados

-- 1. Eliminar registros de tabla_datos_cep relacionados
DELETE FROM tabla_datos_cep
WHERE claverastreo IN (
  '38432P01202501223730676954',
  '38432P01202501211631412508',
  '38432P01202501161536377879',
  '38432P01202501221135605377',
  '38432P01202501211137488291',
  '38432P01202501161308403499',
  '38432P01202501211155511131'
);

-- 2. Eliminar los 9 pagos huérfanos de la tabla pagos
DELETE FROM pagos
WHERE id IN (
  SELECT p.id
  FROM pagos p
  JOIN cuentas_cobranza cc ON p.id_cuenta_cobranza = cc.id
  LEFT JOIN aplicaciones_pago ap ON ap.id_pago = p.id AND ap.activo = true
  WHERE p.activo = true
    AND p.id_metodos_pago IN (6, 7)
    AND cc.id_cuenta_cobranza_padre IS NULL
    AND ap.id IS NULL
);

-- 3. Resetear pagos_stp_raw para permitir reprocesamiento
UPDATE pagos_stp_raw
SET es_pago_aplicado = false
WHERE claverastreo IN (
  '38432P01202501223730676954',
  '38432P01202501211631412508',
  '38432P01202501161536377879',
  '38432P01202501221135605377',
  '38432P01202501211137488291',
  '38432P01202501161308403499',
  '38432P01202501211155511131'
);