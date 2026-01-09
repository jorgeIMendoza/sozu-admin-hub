-- Update the filter configuration to change id_dueno from 'select' to 'multiselect'
UPDATE reportes 
SET filtros_configuracion = jsonb_set(
  filtros_configuracion,
  '{1,tipo}',
  '"multiselect"'
)
WHERE id = 3;