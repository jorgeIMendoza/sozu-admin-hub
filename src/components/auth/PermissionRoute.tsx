import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAllowedMenus } from '@/hooks/useAllowedMenus';
import { useDynamicMenus } from '@/hooks/useDynamicMenus';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const SIMPLIFIED_ROLES = ["Agente Inmobiliario", "Inmobiliaria"];

interface PermissionRouteProps {
  children: ReactNode;
}

export function PermissionRoute({ children }: PermissionRouteProps) {
  const { isPathAllowed, isLoading, isSuperAdmin, allowedPaths } = useAllowedMenus();
  const { menuItems, isLoading: isMenuLoading } = useDynamicMenus();
  const { profile } = useAuth();
  const location = useLocation();

  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");

  // Always allow access to the access-denied page to prevent infinite redirects
  if (location.pathname === '/admin/access-denied') {
    return <>{children}</>;
  }

  // Always allow access to agent portal routes (permission is role-based via AdminLayout)
  if (location.pathname.startsWith('/admin/agent')) {
    return <>{children}</>;
  }

  // Redirect simplified roles to agent portal if they hit any non-agent admin route
  if (isSimplifiedRole && !location.pathname.startsWith('/admin/agent')) {
    return <Navigate to="/admin/agent/inicio" replace />;
  }

  if (isLoading || isMenuLoading) {
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

  // User doesn't have permission to this specific route
  // Try to redirect to the first allowed menu item instead of showing access denied
  const firstAllowedPath = getFirstAllowedPath(menuItems);
  if (firstAllowedPath) {
    // Only redirect if the target is different from current path to avoid loops
    if (firstAllowedPath !== currentPath) {
      return <Navigate to={firstAllowedPath} replace />;
    }
  }

  // No allowed paths at all - show access denied
  return <Navigate to="/admin/access-denied" replace />;
}

// Helper to get the first allowed path from dynamic menus
function getFirstAllowedPath(menuItems: any[]): string | null {
  for (const item of menuItems) {
    if (item.href) return item.href;
    if (item.children?.length > 0) {
      return item.children[0].href;
    }
  }
  return null;
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
    /^(\/admin\/reportes\/ver)\/\d+$/,
    /^(\/admin\/inmobiliarias\/proyectos)\/\d+$/,
    /^(\/admin\/inmobiliarias\/proyectos)\/\d+\/inventario$/,
  ];
  
  for (const pattern of nestedPatterns) {
    const match = path.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return path;
}
