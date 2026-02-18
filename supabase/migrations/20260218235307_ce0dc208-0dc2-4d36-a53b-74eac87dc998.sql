INSERT INTO ab_tests (nombre, descripcion, pagina, activo, variantes, porcentaje_distribucion)
VALUES (
  'Inventario Grid vs Carrusel',
  'Comparar vista grid (A) contra carrusel horizontal por proyecto (B)',
  '/admin/inmobiliarias/inventario',
  true,
  '["A","B"]',
  '{"A":50,"B":50}'
);