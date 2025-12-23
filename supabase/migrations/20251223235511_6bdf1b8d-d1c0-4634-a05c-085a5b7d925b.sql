-- Insertar la multa vinculada al acuerdo 18013 (Pago a contra entrega)
INSERT INTO multas (id_acuerdo_pago, monto, descripcion, id_tipo_multa, es_pagada, activo)
VALUES (18013, 285097.89, 'Penalización por juicio terminado', 3, false, true);

-- Desactivar el acuerdo 24049 (penalización errónea creada como acuerdo)
UPDATE acuerdos_pago 
SET activo = false, fecha_actualizacion = NOW()
WHERE id = 24049;