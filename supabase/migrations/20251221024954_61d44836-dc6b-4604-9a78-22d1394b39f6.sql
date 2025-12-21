-- Add 'prendido' field to reportes table
-- 'activo' = controls visibility (deleted/not deleted)
-- 'prendido' = controls if report is enabled/disabled in the menu
ALTER TABLE public.reportes 
ADD COLUMN IF NOT EXISTS prendido boolean NOT NULL DEFAULT true;