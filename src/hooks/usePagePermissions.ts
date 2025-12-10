import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PagePermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canConfigure: boolean;
  canGenerateOffer: boolean;
}

const DEFAULT_PERMISSIONS: PagePermissions = {
  canRead: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
  canConfigure: false,
  canGenerateOffer: false,
};

const SUPER_ADMIN_PERMISSIONS: PagePermissions = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canApprove: true,
  canExport: true,
  canConfigure: true,
  canGenerateOffer: true,
};

export function usePagePermissions(pagePath: string) {
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState<PagePermissions>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);

  // Super Admin has all permissions
  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';

  useEffect(() => {
    const fetchPermissions = async () => {
      if (isSuperAdmin) {
        setPermissions(SUPER_ADMIN_PERMISSIONS);
        setIsLoading(false);
        return;
      }

      if (!profile?.rol_id || !pagePath) {
        setPermissions(DEFAULT_PERMISSIONS);
        setIsLoading(false);
        return;
      }

      try {
        // First get the submenu_id for this path
        const { data: submenuData, error: submenuError } = await supabase
          .from('submenus')
          .select('id')
          .eq('vista_front_end', pagePath)
          .eq('activo', true)
          .single();

        if (submenuError || !submenuData) {
          console.error('Error fetching submenu:', submenuError);
          setPermissions(DEFAULT_PERMISSIONS);
          setIsLoading(false);
          return;
        }

        // Get all permissions for this submenu and role
        const { data: permissionsData, error: permissionsError } = await supabase
          .from('submenus_permisos')
          .select(`
            permisos!inner (
              nombre
            )
          `)
          .eq('submenu_id', submenuData.id)
          .eq('rol_id', profile.rol_id)
          .eq('activo', true);

        if (permissionsError) {
          console.error('Error fetching permissions:', permissionsError);
          setPermissions(DEFAULT_PERMISSIONS);
          setIsLoading(false);
          return;
        }

        // Map permissions
        const permissionNames = new Set(
          permissionsData?.map((p: any) => p.permisos?.nombre) || []
        );

        setPermissions({
          canRead: permissionNames.has('leer'),
          canCreate: permissionNames.has('crear'),
          canUpdate: permissionNames.has('actualizar'),
          canDelete: permissionNames.has('eliminar'),
          canApprove: permissionNames.has('aprobar'),
          canExport: permissionNames.has('exportar'),
          canConfigure: permissionNames.has('configurar'),
          canGenerateOffer: permissionNames.has('generar_oferta'),
        });
      } catch (err) {
        console.error('Error in fetchPermissions:', err);
        setPermissions(DEFAULT_PERMISSIONS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, [profile?.rol_id, pagePath, isSuperAdmin]);

  return {
    ...permissions,
    isLoading,
    isSuperAdmin,
  };
}
