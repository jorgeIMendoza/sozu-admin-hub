
-- ============================================================
-- Homologar CC-1748 y CCP-1166 con el flujo estándar de cancelación
-- ============================================================

-- 1. Desactivar acuerdos concepto 3 (entrega) no pagados
UPDATE acuerdos_pago SET activo = false WHERE id = 25792;
UPDATE acuerdos_pago SET activo = false WHERE id = 21523;

-- 2. Insertar acuerdos de cancelación para CC-1748
INSERT INTO acuerdos_pago (id_cuenta_cobranza, id_concepto, orden, monto, pago_completado, activo)
VALUES (1748, 7, 22, 259774.47, true, true);

INSERT INTO acuerdos_pago (id_cuenta_cobranza, id_concepto, orden, monto, pago_completado, activo)
VALUES (1748, 9, 23, 638699.77, true, true);

-- 3. Insertar acuerdo de cancelación para CCP-1166
INSERT INTO acuerdos_pago (id_cuenta_cobranza, id_concepto, orden, monto, pago_completado, activo)
VALUES (1166, 9, 3, 259774.47, true, true);

-- 4. Insertar pagos de reembolso (sin url_recibo para evitar constraint unique)
-- La evidencia del cheque ya está en cuentas_cobranza.url_evidencia_reembolso
INSERT INTO pagos (id_cuenta_cobranza, monto, fecha_pago, id_metodos_pago, activo, descripcion)
VALUES (1748, 638699.77, '2024-03-26', 2, true, 'Reembolso por cancelación - Cheque 708');

INSERT INTO pagos (id_cuenta_cobranza, monto, fecha_pago, id_metodos_pago, activo, descripcion)
VALUES (1166, 259774.47, '2024-03-26', 2, true, 'Reembolso por cancelación - Cheque 708');
