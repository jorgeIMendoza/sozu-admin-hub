import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  Home,
  Package,
  ShoppingCart,
  Settings,
  X,
  FileText,
  CreditCard,
  MapPin,
  User,
  Calendar,
  Briefcase
} from "lucide-react";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
}

const navigationItems = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Entidades",
    icon: Building2,
    children: [
      { title: "Proyectos", href: "/admin/proyectos", icon: Building2 },
      { title: "Propiedades", href: "/admin/propiedades", icon: MapPin },
    ]
  },
  {
    title: "Personas",
    icon: Users,
    children: [
      { title: "Usuarios", href: "/admin/usuarios", icon: User },
      { title: "Compradores", href: "/admin/compradores", icon: Users },
      { title: "Beneficiarios", href: "/admin/beneficiarios", icon: User },
      { title: "Comisionistas", href: "/admin/comisionistas", icon: Briefcase },
    ]
  },
  {
    title: "Productos/Servicios",
    icon: Package,
    children: [
      { title: "Productos", href: "/admin/productos", icon: Package },
      { title: "Categorías", href: "/admin/categorias", icon: ShoppingCart },
      { title: "Amenidades", href: "/admin/amenidades", icon: Calendar },
      { title: "Características", href: "/admin/caracteristicas", icon: Settings },
      { title: "Modelos", href: "/admin/modelos", icon: Home },
    ]
  },
  {
    title: "Finanzas",
    icon: CreditCard,
    children: [
      { title: "Cuentas Cobranza", href: "/admin/cuentas-cobranza", icon: CreditCard },
      { title: "Pagos", href: "/admin/pagos", icon: CreditCard },
      { title: "Cuentas Bancarias", href: "/admin/cuentas-bancarias", icon: CreditCard },
    ]
  },
  {
    title: "Documentos",
    href: "/admin/documentos",
    icon: FileText,
  },
];

export const AdminSidebar = ({ isOpen, onClose, currentPath }: AdminSidebarProps) => {
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-admin-sidebar text-admin-sidebar-foreground transform transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-admin-sidebar-accent rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">SOZU</h1>
              <p className="text-xs opacity-70">Admin Panel</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigationItems.map((item, index) => (
            <div key={index}>
              {item.href ? (
                <Link
                  to={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors",
                    currentPath === item.href
                      ? "bg-admin-sidebar-accent text-white"
                      : "hover:bg-white/10"
                  )}
                  onClick={onClose}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.title}</span>
                </Link>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center space-x-3 px-3 py-2 text-sm font-medium opacity-70">
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
                  </div>
                  {item.children?.map((child, childIndex) => (
                    <Link
                      key={childIndex}
                      to={child.href}
                      className={cn(
                        "flex items-center space-x-3 pl-8 pr-3 py-2 rounded-lg transition-colors text-sm",
                        currentPath === child.href
                          ? "bg-admin-sidebar-accent text-white"
                          : "hover:bg-white/10"
                      )}
                      onClick={onClose}
                    >
                      <child.icon className="h-4 w-4" />
                      <span>{child.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg">
            <div className="w-8 h-8 bg-admin-sidebar-accent rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">JM</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Jorge Mendoza</p>
              <p className="text-xs opacity-70">Super Administrador</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};