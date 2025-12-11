-- Force schema cache refresh by adding a comment to the documentos table
COMMENT ON COLUMN documentos.id_estatus_verificacion IS 'Estado de verificación del documento: 1=Pendiente, 2=Validado, 3=Rechazado, 4=Expirado. Reemplaza la columna es_verificado';

-- Ensure the column has correct default
ALTER TABLE documentos ALTER COLUMN id_estatus_verificacion SET DEFAULT 1;

-- Notify PostgREST to reload schema (this happens automatically on schema changes)
NOTIFY pgrst, 'reload schema';