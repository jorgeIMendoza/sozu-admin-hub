-- Corregir el orden de los conceptos de cancelación en la cuenta 55
UPDATE acuerdos_pago SET orden = 15 WHERE id = 24453;
UPDATE acuerdos_pago SET orden = 16 WHERE id = 24454;