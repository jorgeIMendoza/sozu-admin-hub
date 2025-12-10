import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePermissions() {
  const { profile } = useAuth();
  const [permissionCache, setPermissionCache] = useState<Record<string, boolean>>({});

  const hasPermission = useCallback(async (path: string, action: string): Promise<boolean> => {
    const cacheKey = `${path}:${action}`;
    
    if (permissionCache[cacheKey] !== undefined) {
      return permissionCache[cacheKey];
    }

    try {
      const { data, error } = await supabase.rpc('user_has_permission', {
        _submenu_path: path,
        _permission_name: action,
      });

      if (error) {
        console.error('Error checking permission:', error);
        return false;
      }

      const hasAccess = data === true;
      setPermissionCache(prev => ({ ...prev, [cacheKey]: hasAccess }));
      return hasAccess;
    } catch (err) {
      console.error('Error in hasPermission:', err);
      return false;
    }
  }, [permissionCache]);

  const canView = useCallback((path: string) => hasPermission(path, 'leer'), [hasPermission]);
  const canCreate = useCallback((path: string) => hasPermission(path, 'crear'), [hasPermission]);
  const canUpdate = useCallback((path: string) => hasPermission(path, 'actualizar'), [hasPermission]);
  const canDelete = useCallback((path: string) => hasPermission(path, 'eliminar'), [hasPermission]);
  const canApprove = useCallback((path: string) => hasPermission(path, 'aprobar'), [hasPermission]);
  const canExport = useCallback((path: string) => hasPermission(path, 'exportar'), [hasPermission]);
  const canGenerateOffer = useCallback((path: string) => hasPermission(path, 'generar_oferta'), [hasPermission]);

  // Check if user is Super Admin (has all permissions)
  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';

  return {
    hasPermission,
    canView,
    canCreate,
    canUpdate,
    canDelete,
    canApprove,
    canExport,
    canGenerateOffer,
    isSuperAdmin,
  };
}
