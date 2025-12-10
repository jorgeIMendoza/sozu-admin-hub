import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AccessDenied = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth/login');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="text-center space-y-6 max-w-md px-6">
        {/* Icono */}
        <div className="flex items-center justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldAlert className="h-16 w-16 text-destructive" />
          </div>
        </div>

        {/* Código de error */}
        <p className="text-6xl font-bold text-destructive/30">403</p>

        {/* Mensaje */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Acceso Denegado
          </h1>
          <p className="text-muted-foreground">
            No tienes permisos para acceder a esta sección. 
            Contacta al administrador si crees que esto es un error.
          </p>
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver atrás
          </Button>
          <Button variant="destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
