-- Enable REPLICA IDENTITY FULL for realtime updates on permission-related tables
ALTER TABLE usuarios REPLICA IDENTITY FULL;
ALTER TABLE submenus_permisos REPLICA IDENTITY FULL;
ALTER TABLE roles REPLICA IDENTITY FULL;
ALTER TABLE proyectos_acceso REPLICA IDENTITY FULL;

-- Add these tables to the supabase_realtime publication
-- First check if the publication exists and create if not
DO $$
BEGIN
  -- Check if tables are already in the publication and add them if not
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'usuarios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE usuarios;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'submenus_permisos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE submenus_permisos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'roles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE roles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'proyectos_acceso'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE proyectos_acceso;
  END IF;
END $$;