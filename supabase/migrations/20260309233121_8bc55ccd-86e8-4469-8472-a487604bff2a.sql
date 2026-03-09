
-- Crear aplicaciones de pago vinculando reembolsos a acuerdos de devolución (concepto 9)

-- CC-1748: pago 20835 → acuerdo 25797
INSERT INTO aplicaciones_pago (id_pago, id_acuerdo_pago, monto, activo, es_multa)
VALUES (20835, 25797, 638699.77, true, false);

-- CCP-1166: pago 20836 → acuerdo 25798
INSERT INTO aplicaciones_pago (id_pago, id_acuerdo_pago, monto, activo, es_multa)
VALUES (20836, 25798, 259774.47, true, false);
