import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, Search, Bell, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";

interface AdminHeaderProps {
  onMenuClick: () => void;
}

const getPageInfo = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean);
  const currentPage = segments[segments.length - 1] || 'admin';
  
  const pageMap: { [key: string]: { title: string; description: string } } = {
    admin: { title: "Dashboard", description: "Vista general del sistema" },
    proyectos: { title: "Proyectos", description: "Gestiona tus proyectos de manera eficiente" },
    edificios: { title: "Edificios", description: "Administra los edificios de tus proyectos" },
    propiedades: { title: "Propiedades", description: "Gestiona las propiedades disponibles" },
    usuarios: { title: "Usuarios", description: "Administra los usuarios del sistema" },
    compradores: { title: "Compradores", description: "Gestiona los compradores registrados" },
    beneficiarios: { title: "Beneficiarios", description: "Administra los beneficiarios" },
    comisionistas: { title: "Comisionistas", description: "Gestiona las comisiones de venta" },
    productos: { title: "Productos", description: "Administra los productos disponibles" },
    categorias: { title: "Categorías", description: "Gestiona las categorías de productos" },
    amenidades: { title: "Amenidades", description: "Administra las amenidades de los proyectos" },
    caracteristicas: { title: "Características", description: "Gestiona las características disponibles" },
    "cuentas-cobranza": { title: "Cuentas de Cobranza", description: "Administra las cuentas de cobranza" },
    pagos: { title: "Pagos", description: "Gestiona los pagos registrados" },
    "cuentas-bancarias": { title: "Cuentas Bancarias", description: "Administra las cuentas bancarias" },
    documentos: { title: "Documentos", description: "Gestiona los documentos del sistema" },
  };
  
  return pageMap[currentPage] || { title: "Admin", description: "Panel de administración" };
};

export const AdminHeader = ({ onMenuClick }: AdminHeaderProps) => {
  const location = useLocation();
  const pageInfo = getPageInfo(location.pathname);

  return (
    <header className="bg-card border-b px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold text-foreground">{pageInfo.title}</h1>
            <p className="text-muted-foreground">{pageInfo.description}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10 w-80"
            />
          </div>
          
          <Button variant="ghost" size="sm">
            <Bell className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="sm">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};