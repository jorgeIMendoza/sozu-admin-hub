-- Step 1: Add column to roles table
ALTER TABLE roles 
ADD COLUMN IF NOT EXISTS ver_todos_prospectos_compradores BOOLEAN DEFAULT FALSE;

-- Step 2: Set TRUE for Super Admin (1) and Admin Proyecto (2)
UPDATE roles SET ver_todos_prospectos_compradores = TRUE WHERE id IN (1, 2);

-- Step 3: Create helper function to check if current user can view all prospects
CREATE OR REPLACE FUNCTION public.can_view_all_prospects()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT ver_todos_prospectos_compradores 
     FROM roles 
     WHERE id = public.get_current_user_role()),
    FALSE
  )
$$;

-- Step 4: Update RLS policy on entidades_relacionadas to use the new function
DROP POLICY IF EXISTS "select_entidades_relacionadas" ON entidades_relacionadas;

CREATE POLICY "select_entidades_relacionadas" ON entidades_relacionadas
FOR SELECT USING (
  -- Admins or roles with ver_todos_prospectos_compradores can see everything
  public.is_admin_user() 
  OR public.can_view_all_prospects()
  -- Other entity types (not prospects/buyers) are visible to all
  OR id_tipo_entidad NOT IN (2, 7)
  -- Prospects/buyers only visible to the lead owner
  OR (
    id_tipo_entidad IN (2, 7)
    AND public.get_current_user_persona_id() IS NOT NULL 
    AND id_persona_duena_lead = public.get_current_user_persona_id()
  )
);