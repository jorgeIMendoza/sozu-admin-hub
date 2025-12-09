import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AllowedMenu {
  path: string;
  canRead: boolean;
}

export function useAllowedMenus() {
  const { profile } = useAuth();
  const [allowedPaths, setAllowedPaths] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Super Admin has access to everything
  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';

  useEffect(() => {
    const fetchAllowedMenus = async () => {
      if (isSuperAdmin) {
        // Super Admin can access everything
        setAllowedPaths(new Set(['*']));
        setIsLoading(false);
        return;
      }

      try {
        // Get all submenus where user has 'leer' permission
        const { data, error } = await supabase
          .from('submenus_permisos')
          .select(`
            submenu_id,
            submenus!inner (
              vista_front_end,
              activo
            ),
            permisos!inner (
              nombre
            )
          `)
          .eq('rol_id', profile?.rol_id)
          .eq('activo', true)
          .eq('submenus.activo', true)
          .eq('permisos.nombre', 'leer');

        if (error) {
          console.error('Error fetching allowed menus:', error);
          setAllowedPaths(new Set());
          setIsLoading(false);
          return;
        }

        const paths = new Set<string>();
        data?.forEach((item: any) => {
          if (item.submenus?.vista_front_end) {
            paths.add(item.submenus.vista_front_end);
          }
        });

        setAllowedPaths(paths);
      } catch (err) {
        console.error('Error in fetchAllowedMenus:', err);
        setAllowedPaths(new Set());
      } finally {
        setIsLoading(false);
      }
    };

    if (profile?.rol_id) {
      fetchAllowedMenus();
    } else {
      setIsLoading(false);
    }
  }, [profile?.rol_id, isSuperAdmin]);

  const isPathAllowed = (path: string): boolean => {
    if (isSuperAdmin || allowedPaths.has('*')) {
      return true;
    }
    return allowedPaths.has(path);
  };

  return {
    isPathAllowed,
    allowedPaths,
    isLoading,
    isSuperAdmin,
  };
}
