import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AllowedMenu {
  path: string;
  canRead: boolean;
}

export function useAllowedMenus() {
  const { profile, isLoading: isAuthLoading, user, permissionVersion } = useAuth();
  const [allowedPaths, setAllowedPaths] = useState<Set<string>>(new Set());
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);

  // Super Admin has access to everything - only check when profile is loaded
  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  
  // Profile is still loading if we have a user but no profile yet
  const isProfileStillLoading = !!user && !profile && !isAuthLoading;

  const fetchAllowedMenus = useCallback(async () => {
    if (!profile?.rol_id) return;
    
    try {
      setIsLoadingPermissions(true);
      
      // Get all submenus where user has 'leer' permission
      // First get the 'leer' permission id
      const { data: permisoData } = await supabase
        .from('permisos')
        .select('id')
        .eq('nombre', 'leer')
        .single();

      if (!permisoData) {
        setAllowedPaths(new Set());
        return;
      }

      // Get submenus_permisos for this role and permission
      const { data: permisosData, error: permisosError } = await supabase
        .from('submenus_permisos')
        .select('submenu_id')
        .eq('rol_id', profile.rol_id)
        .eq('permiso_id', permisoData.id)
        .eq('activo', true);

      if (permisosError) {
        console.error('Error fetching permissions:', permisosError);
        setAllowedPaths(new Set());
        return;
      }

      // Get the submenu paths
      const submenuIds = permisosData?.map(p => p.submenu_id) || [];
      
      if (submenuIds.length === 0) {
        setAllowedPaths(new Set());
        return;
      }

      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('vista_front_end')
        .in('id', submenuIds)
        .eq('activo', true);

      if (submenusError) {
        console.error('Error fetching submenus:', submenusError);
        setAllowedPaths(new Set());
        return;
      }

      const paths = new Set<string>();
      submenusData?.forEach((item: any) => {
        if (item.vista_front_end) {
          paths.add(item.vista_front_end);
        }
      });

      setAllowedPaths(paths);
    } catch (err) {
      console.error('Error in fetchAllowedMenus:', err);
      setAllowedPaths(new Set());
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [profile?.rol_id]);

  useEffect(() => {
    // Wait for auth to finish loading
    if (isAuthLoading) {
      return;
    }

    // If we have a user but profile hasn't loaded yet, wait
    if (user && !profile) {
      return;
    }

    // If Super Admin, skip fetching permissions
    if (isSuperAdmin) {
      setAllowedPaths(new Set(['*']));
      setIsLoadingPermissions(false);
      return;
    }

    // If no profile (not logged in), stop loading
    if (!profile?.rol_id) {
      setIsLoadingPermissions(false);
      return;
    }

    fetchAllowedMenus();
  }, [profile?.rol_id, isSuperAdmin, isAuthLoading, user, profile, permissionVersion, fetchAllowedMenus]);

  const isPathAllowed = (path: string): boolean => {
    if (isSuperAdmin || allowedPaths.has('*')) {
      return true;
    }
    
    // Caso especial: /admin/reportes/ver requiere acceso a cualquier submenu de reportes
    if (path === '/admin/reportes/ver' || path.startsWith('/admin/reportes/ver/')) {
      for (const allowedPath of allowedPaths) {
        if (allowedPath.includes('/reportes/') || allowedPath.includes('/configuracion-reportes')) {
          return true;
        }
      }
      return false;
    }
    
    return allowedPaths.has(path);
  };

  // Loading = auth loading OR profile still loading OR permissions loading (but not if super admin)
  const isLoading = isAuthLoading || isProfileStillLoading || (isLoadingPermissions && !isSuperAdmin);

  return {
    isPathAllowed,
    allowedPaths,
    isLoading,
    isSuperAdmin,
  };
}
