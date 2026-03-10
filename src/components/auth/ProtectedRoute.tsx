import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldAlert, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: ReactNode;
}

const BLOCKED_ROLE_NAMES = ['Cliente', 'Directores'];

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, mustChangePassword, profile } = useAuth();
  const location = useLocation();

  // Allow Cliente role to access portal-cliente routes
  const isPortalClienteRoute = location.pathname.startsWith('/admin/portal-cliente');

  const handleGoToLogin = () => {
    supabase.auth.signOut().finally(() => {
      window.location.href = '/auth/login';
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (mustChangePassword && location.pathname !== '/auth/change-password') {
    return <Navigate to="/auth/change-password" replace />;
  }

  if (profile && !profile.activo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 bg-card rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-destructive mb-4">Cuenta Desactivada</h1>
          <p className="text-muted-foreground mb-6">
            Tu cuenta ha sido desactivada. Contacta al administrador para más información.
          </p>
        </div>
      </div>
    );
  }

  if (profile && BLOCKED_ROLE_NAMES.includes(profile.rol_nombre) && !isPortalClienteRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 bg-card rounded-lg shadow-lg max-w-md space-y-4">
          <ShieldAlert className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-destructive">
            Acceso No Autorizado
          </h1>
          <p className="text-muted-foreground">
            Tu tipo de usuario no tiene acceso a este sistema.
            Contacta al administrador si crees que esto es un error.
          </p>
          <Button variant="destructive" onClick={handleGoToLogin}>
            <LogIn className="mr-2 h-4 w-4" />
            Iniciar Sesión
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
