
-- Step 1: Create the tiered payment scheme for property 713
INSERT INTO esquemas_pago (
  id_proyecto, nombre, porcentaje_descuento_aumento, 
  porcentaje_enganche, porcentaje_mensualidades, 
  numero_mensualidades, porcentaje_entrega, 
  activo, es_manual, numero_pagos_enganche, tramos_mensualidad
) VALUES (
  1453,
  'manual_713_Omar_Castro_escalonado',
  0.00,
  5.00,
  25.00,
  48,
  70.00,
  true,
  true,
  1,
  '[{"monto": 22500, "numero_mensualidades": 12, "orden": 1}, {"monto": 27500, "numero_mensualidades": 12, "orden": 2}, {"monto": 32500, "numero_mensualidades": 24, "orden": 3}]'::jsonb
);

-- Step 2: Create new offer with the tiered scheme
INSERT INTO ofertas (
  id_persona_lead, id_propiedad, fecha_generacion,
  id_esquema_pago_seleccionado, activo, email_creador,
  mostrar_piso_en_oferta, mostrar_precio_m2_en_oferta,
  mostrar_seccion_efectivo_en_oferta
) 
SELECT 
  1189, -- Omar Castro Castro
  5276, -- Propiedad 713
  NOW(),
  (SELECT id FROM esquemas_pago WHERE nombre = 'manual_713_Omar_Castro_escalonado' ORDER BY id DESC LIMIT 1),
  true,
  'pablo.espinosa@sozu.com',
  true, true, true;

-- Step 3: Update cuentas_cobranza to link to the new offer
UPDATE cuentas_cobranza 
SET id_oferta = (SELECT id FROM ofertas WHERE id_persona_lead = 1189 AND id_propiedad = 5276 ORDER BY id DESC LIMIT 1)
WHERE id = 1676;

-- Step 4: Update acuerdos_pago dates to match PDF
-- Apartado (orden 1): 15/1/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-01-15' WHERE id_cuenta_cobranza = 1676 AND orden = 1;

-- Enganche (orden 2): 16/2/2026  
UPDATE acuerdos_pago SET fecha_pago = '2026-02-16' WHERE id_cuenta_cobranza = 1676 AND orden = 2;

-- Parcialidad 1 (orden 3): 16/3/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-03-16' WHERE id_cuenta_cobranza = 1676 AND orden = 3;

-- Parcialidad 2 (orden 4): 16/4/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-04-16' WHERE id_cuenta_cobranza = 1676 AND orden = 4;

-- Parcialidad 3 (orden 5): 16/5/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-05-16' WHERE id_cuenta_cobranza = 1676 AND orden = 5;

-- Parcialidad 4 (orden 6): 16/6/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-06-16' WHERE id_cuenta_cobranza = 1676 AND orden = 6;

-- Parcialidad 5 (orden 7): 16/7/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-07-16' WHERE id_cuenta_cobranza = 1676 AND orden = 7;

-- Parcialidad 6 (orden 8): 16/8/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-08-16' WHERE id_cuenta_cobranza = 1676 AND orden = 8;

-- Parcialidad 7 (orden 9): 16/9/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-09-16' WHERE id_cuenta_cobranza = 1676 AND orden = 9;

-- Parcialidad 8 (orden 10): 16/10/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-10-16' WHERE id_cuenta_cobranza = 1676 AND orden = 10;

-- Parcialidad 9 (orden 11): 16/11/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-11-16' WHERE id_cuenta_cobranza = 1676 AND orden = 11;

-- Parcialidad 10 (orden 12): 16/12/2026
UPDATE acuerdos_pago SET fecha_pago = '2026-12-16' WHERE id_cuenta_cobranza = 1676 AND orden = 12;

-- Parcialidad 11 (orden 13): 16/1/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-01-16' WHERE id_cuenta_cobranza = 1676 AND orden = 13;

-- Parcialidad 12 (orden 14): 16/2/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-02-16' WHERE id_cuenta_cobranza = 1676 AND orden = 14;

-- Parcialidad 13 (orden 15): 16/3/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-03-16' WHERE id_cuenta_cobranza = 1676 AND orden = 15;

-- Parcialidad 14 (orden 16): 16/4/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-04-16' WHERE id_cuenta_cobranza = 1676 AND orden = 16;

-- Parcialidad 15 (orden 17): 16/5/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-05-16' WHERE id_cuenta_cobranza = 1676 AND orden = 17;

-- Parcialidad 16 (orden 18): 16/6/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-06-16' WHERE id_cuenta_cobranza = 1676 AND orden = 18;

-- Parcialidad 17 (orden 19): 16/7/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-07-16' WHERE id_cuenta_cobranza = 1676 AND orden = 19;

-- Parcialidad 18 (orden 20): 16/8/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-08-16' WHERE id_cuenta_cobranza = 1676 AND orden = 20;

-- Parcialidad 19 (orden 21): 16/9/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-09-16' WHERE id_cuenta_cobranza = 1676 AND orden = 21;

-- Parcialidad 20 (orden 22): 16/10/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-10-16' WHERE id_cuenta_cobranza = 1676 AND orden = 22;

-- Parcialidad 21 (orden 23): 16/11/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-11-16' WHERE id_cuenta_cobranza = 1676 AND orden = 23;

-- Parcialidad 22 (orden 24): 16/12/2027
UPDATE acuerdos_pago SET fecha_pago = '2027-12-16' WHERE id_cuenta_cobranza = 1676 AND orden = 24;

-- Parcialidad 23 (orden 25): 16/1/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-01-16' WHERE id_cuenta_cobranza = 1676 AND orden = 25;

-- Parcialidad 24 (orden 26): 16/2/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-02-16' WHERE id_cuenta_cobranza = 1676 AND orden = 26;

-- Parcialidad 25 (orden 27): 16/3/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-03-16' WHERE id_cuenta_cobranza = 1676 AND orden = 27;

-- Parcialidad 26 (orden 28): 16/4/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-04-16' WHERE id_cuenta_cobranza = 1676 AND orden = 28;

-- Parcialidad 27 (orden 29): 16/5/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-05-16' WHERE id_cuenta_cobranza = 1676 AND orden = 29;

-- Parcialidad 28 (orden 30): 16/6/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-06-16' WHERE id_cuenta_cobranza = 1676 AND orden = 30;

-- Parcialidad 29 (orden 31): 16/7/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-07-16' WHERE id_cuenta_cobranza = 1676 AND orden = 31;

-- Parcialidad 30 (orden 32): 16/8/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-08-16' WHERE id_cuenta_cobranza = 1676 AND orden = 32;

-- Parcialidad 31 (orden 33): 16/9/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-09-16' WHERE id_cuenta_cobranza = 1676 AND orden = 33;

-- Parcialidad 32 (orden 34): 16/10/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-10-16' WHERE id_cuenta_cobranza = 1676 AND orden = 34;

-- Parcialidad 33 (orden 35): 16/11/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-11-16' WHERE id_cuenta_cobranza = 1676 AND orden = 35;

-- Parcialidad 34 (orden 36): 16/12/2028
UPDATE acuerdos_pago SET fecha_pago = '2028-12-16' WHERE id_cuenta_cobranza = 1676 AND orden = 36;

-- Parcialidad 35 (orden 37): 16/1/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-01-16' WHERE id_cuenta_cobranza = 1676 AND orden = 37;

-- Parcialidad 36 (orden 38): 16/2/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-02-16' WHERE id_cuenta_cobranza = 1676 AND orden = 38;

-- Parcialidad 37 (orden 39): 16/3/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-03-16' WHERE id_cuenta_cobranza = 1676 AND orden = 39;

-- Parcialidad 38 (orden 40): 16/4/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-04-16' WHERE id_cuenta_cobranza = 1676 AND orden = 40;

-- Parcialidad 39 (orden 41): 16/5/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-05-16' WHERE id_cuenta_cobranza = 1676 AND orden = 41;

-- Parcialidad 40 (orden 42): 16/6/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-06-16' WHERE id_cuenta_cobranza = 1676 AND orden = 42;

-- Parcialidad 41 (orden 43): 16/7/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-07-16' WHERE id_cuenta_cobranza = 1676 AND orden = 43;

-- Parcialidad 42 (orden 44): 16/8/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-08-16' WHERE id_cuenta_cobranza = 1676 AND orden = 44;

-- Parcialidad 43 (orden 45): 16/9/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-09-16' WHERE id_cuenta_cobranza = 1676 AND orden = 45;

-- Parcialidad 44 (orden 46): 16/10/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-10-16' WHERE id_cuenta_cobranza = 1676 AND orden = 46;

-- Parcialidad 45 (orden 47): 16/11/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-11-16' WHERE id_cuenta_cobranza = 1676 AND orden = 47;

-- Parcialidad 46 (orden 48): 16/12/2029
UPDATE acuerdos_pago SET fecha_pago = '2029-12-16' WHERE id_cuenta_cobranza = 1676 AND orden = 48;

-- Parcialidad 47 (orden 49): 16/1/2030
UPDATE acuerdos_pago SET fecha_pago = '2030-01-16' WHERE id_cuenta_cobranza = 1676 AND orden = 49;

-- Parcialidad 48 (orden 50): 16/2/2030
UPDATE acuerdos_pago SET fecha_pago = '2030-02-16' WHERE id_cuenta_cobranza = 1676 AND orden = 50;

-- Contraentrega (orden 51): 16/3/2030
UPDATE acuerdos_pago SET fecha_pago = '2030-03-16' WHERE id_cuenta_cobranza = 1676 AND orden = 51;
