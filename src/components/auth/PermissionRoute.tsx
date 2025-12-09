import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAllowedMenus } from '@/hooks/useAllowedMenus';
import { Loader2 } from 'lucide-react';

interface PermissionRouteProps {
  children: ReactNode;
}

// Navigation items to determine first allowed path
const NAVIGATION_PATHS = [
  '/admin',
  '/admin/proyectos',
  '/admin/propiedades',
  '/admin/modelos',
  '/admin/vistas',
  '/admin/estacionamientos',
  '/admin/bodegas',
  '/admin/cuentas-cobranza',
  '/admin/cuentas-mantenimiento',
  '/admin/comisiones',
  '/admin/aprobacion-comisiones',
  '/admin/pagar-comisiones',
  '/admin/prospectos',
  '/admin/compradores',
  '/admin/vendedores',
  '/admin/duenos',
  '/admin/residentes',
  '/admin/agentes',
  '/admin/administradores-personas',
  '/admin/representantes-legales',
  '/admin/productos',
  '/admin/servicios',
  '/admin/categorias-productos',
  '/admin/usuarios',
  '/admin/roles-permisos',
  '/admin/entidades-legales',
  '/admin/desarrolladores',
  '/admin/inmobiliarias',
  '/admin/administradoras',
  '/admin/notarias',
  '/admin/bancos',
  '/admin/reservas',
  '/admin/legal/contratos',
  '/admin/consultas-ia',
  '/admin/reportes/discrepancias',
];

export function PermissionRoute({ children }: PermissionRouteProps) {
  const { isPathAllowed, isLoading, isSuperAdmin, allowedPaths } = useAllowedMenus();
  const location = useLocation();
  const [firstAllowedPath, setFirstAllowedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      // Find first allowed path
      const firstPath = NAVIGATION_PATHS.find(path => isPathAllowed(path));
      setFirstAllowedPath(firstPath || null);
    }
  }, [isLoading, isSuperAdmin, allowedPaths, isPathAllowed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Super Admin has access to everything
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Check if current path is allowed
  const currentPath = location.pathname;
  
  // Handle nested routes (e.g., /admin/cuentas-cobranza/:id/detalle)
  const basePath = getBasePath(currentPath);
  
  if (isPathAllowed(basePath)) {
    return <>{children}</>;
  }

  // User doesn't have permission to this route
  // Redirect to first allowed path or access denied page
  if (firstAllowedPath) {
    return <Navigate to={firstAllowedPath} replace />;
  }

  // No allowed paths at all - show access denied
  return <Navigate to="/admin/access-denied" replace />;
}

// Helper function to get base path for nested routes
function getBasePath(fullPath: string): string {
  // Remove trailing slashes
  const path = fullPath.replace(/\/$/, '');
  
  // Special cases for nested routes
  const nestedPatterns = [
    /^(\/admin\/cuentas-cobranza)\/\d+\/detalle$/,
    /^(\/admin\/cuentas-mantenimiento)\/\d+\/detalle$/,
    /^(\/admin\/usuarios)\/nuevo$/,
  ];
  
  for (const pattern of nestedPatterns) {
    const match = path.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return path;
}
