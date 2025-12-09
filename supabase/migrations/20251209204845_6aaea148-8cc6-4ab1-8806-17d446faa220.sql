-- Step 1: Create a security definer function to check if user is Super Administrador
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN roles r ON u.rol_id = r.id
    WHERE u.auth_user_id = user_id
      AND r.nombre = 'Super Administrador'
  )
$$;

-- Step 2: Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.usuarios;
DROP POLICY IF EXISTS "Admins can modify users" ON public.usuarios;
DROP POLICY IF EXISTS "Users can view own record" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir lectura de usuarios a usuarios autenticados" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir lectura de usuarios con anon" ON public.usuarios;

-- Step 3: Create new policies using the security definer function
-- Policy for users to view their own record
CREATE POLICY "Users can view own record"
ON public.usuarios
FOR SELECT
USING (auth_user_id = auth.uid());

-- Policy for Super Admins to view all users
CREATE POLICY "Super admins can view all users"
ON public.usuarios
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Policy for Super Admins to insert users
CREATE POLICY "Super admins can insert users"
ON public.usuarios
FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

-- Policy for Super Admins to update users
CREATE POLICY "Super admins can update users"
ON public.usuarios
FOR UPDATE
USING (public.is_super_admin(auth.uid()));

-- Policy for Super Admins to delete users
CREATE POLICY "Super admins can delete users"
ON public.usuarios
FOR DELETE
USING (public.is_super_admin(auth.uid()));