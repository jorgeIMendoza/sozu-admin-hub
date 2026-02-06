
UPDATE propiedades
SET id_estatus_disponibilidad = 8,
    fecha_actualizacion = NOW()
WHERE id IN (
  5130, 4853, 4862, 4877, 4882, 4885, 4889, 4892,
  4906, 4928, 4935, 4953, 5096, 5044, 5049, 4941,
  4952, 5149, 5081, 5088, 5133, 5137,
  4897, 4898, 4904, 4918, 4926, 4934, 4962, 5108,
  5020, 5022, 5026, 5042, 5061, 5127, 4932, 4939,
  5148, 4961, 4969, 5009, 5017, 5082, 5109
)
AND id_estatus_disponibilidad = 5
AND activo = true;
