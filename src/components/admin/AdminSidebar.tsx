import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useAllowedMenus } from "@/hooks/useAllowedMenus";

const LOGS_ALLOWED_EMAIL = 'jorge.mendoza@sozu.com';
import { Loader2 } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Building,
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
  Briefcase,
  ChevronDown,
  ChevronRight,
  Car,
  Warehouse,
  Eye,
  UserSearch,
  Wallet,
  BadgeDollarSign,
  UserCheck,
  UserCog,
  Scale,
  Receipt,
  Banknote,
  Landmark,
  Shield,
  Wrench,
  Activity,
  KeyRound,
  ScrollText,
  Bot,
  LogOut,
  UserPlus,
  BarChart3,
  ClipboardList,
  DollarSign,
  Cog
} from "lucide-react";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
}

interface NavigationChild {
  title: string;
  href: string;
  icon: any;
}

interface NavigationItem {
  title: string;
  href?: string;
  icon: any;
  children?: NavigationChild[];
}

const navigationItems: NavigationItem[] = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Pregunta a Aloris-IA",
    href: "/admin/consultas-ia",
    icon: Bot,
  },
  {
    title: "Inventarios",
    icon: Building2,
    children: [
      { title: "Proyectos", href: "/admin/proyectos", icon: Building2 },
      { title: "Propiedades", href: "/admin/propiedades", icon: Building },
      { title: "Modelos", href: "/admin/modelos", icon: Home },
      { title: "Vistas", href: "/admin/vistas", icon: Eye },
      { title: "Estacionamientos", href: "/admin/estacionamientos", icon: Car },
      { title: "Bodegas", href: "/admin/bodegas", icon: Warehouse },
    ]
  },
  {
    title: "Entidades",
    icon: Users,
    children: [
      { title: "Entidades Legales", href: "/admin/entidades-legales", icon: Shield },
      { title: "Desarrolladores", href: "/admin/desarrolladores", icon: Building2 },
      { title: "Inmobiliarias", href: "/admin/inmobiliarias", icon: KeyRound },
      { title: "Administradoras", href: "/admin/administradoras", icon: Wrench },
      { title: "Notarías", href: "/admin/notarias", icon: ScrollText },
      { title: "Bancos", href: "/admin/bancos", icon: Landmark },
    ]
  },
  {
    title: "Personas",
    icon: User,
    children: [
      { title: "Prospectos", href: "/admin/prospectos", icon: UserSearch },
      { title: "Compradores", href: "/admin/compradores", icon: Wallet },
      { title: "Vendedores", href: "/admin/vendedores", icon: BadgeDollarSign },
      { title: "Dueños", href: "/admin/duenos", icon: UserCheck },
      { title: "Residentes", href: "/admin/residentes", icon: Home },
      { title: "Agentes", href: "/admin/agentes", icon: Briefcase },
      { title: "Administradores", href: "/admin/administradores-personas", icon: UserCog },
      { title: "Representantes Legales", href: "/admin/representantes-legales", icon: Scale },
      { title: "Representantes Comerciales", href: "/admin/representantes-comerciales", icon: Briefcase },
    ]
  },
  {
    title: "Productos",
    icon: Package,
    children: [
      { title: "Productos", href: "/admin/productos", icon: Package },
      { title: "Servicios", href: "/admin/servicios", icon: Wrench },
      { title: "Categorías Productos", href: "/admin/categorias-productos", icon: ShoppingCart },
    ]
  },
  {
    title: "Finanzas",
    icon: CreditCard,
    children: [
      { title: "Cuentas de cobranza", href: "/admin/cuentas-cobranza", icon: Receipt },
      { title: "Comisiones", href: "/admin/comisiones", icon: Banknote },
      { title: "Aprobación de Comisiones", href: "/admin/aprobacion-comisiones", icon: BadgeDollarSign },
      { title: "Comisiones externas", href: "/admin/comisiones-externas", icon: Briefcase },
      { title: "Pagar comisiones", href: "/admin/pagar-comisiones", icon: CreditCard },
    ]
  },
  {
    title: "Mantenimientos",
    icon: Wrench,
    children: [
      { title: "Cuentas de mantenimientos", href: "/admin/cuentas-mantenimiento", icon: Wrench },
      { title: "Reservas de espacios", href: "/admin/reservas", icon: Calendar },
    ]
  },
  {
    title: "Notarios",
    icon: ScrollText,
    children: [
      { title: "Revision de documentacion", href: "/admin/notarios/revision-documentacion", icon: FileText },
    ]
  },
  {
    title: "Legal",
    icon: Scale,
    children: [
      { title: "Contratos", href: "/admin/legal/contratos", icon: FileText },
    ]
  },
  {
    title: "Reportes",
    icon: BarChart3,
    children: [
      { title: "Inventarios", href: "/admin/reportes/inventarios", icon: ClipboardList },
      { title: "Finanzas", href: "/admin/reportes/finanzas", icon: DollarSign },
    ]
  },
  {
    title: "Sistema",
    icon: Settings,
    children: [
      { title: "Usuarios del Sistema", href: "/admin/usuarios", icon: UserPlus },
      { title: "Usuarios Directivos", href: "/admin/usuarios-directivos", icon: Users },
      { title: "Usuarios Clientes", href: "/admin/usuarios-clientes", icon: UserCheck },
      { title: "Roles y Permisos", href: "/admin/roles-permisos", icon: Shield },
    ]
  },
];

// Este menú siempre va al final, sin importar qué otros menús se agreguen
const logsMenuItem: NavigationItem = {
  title: "Configuraciones/Logs",
  icon: Activity,
  children: [
    { title: "Logs de Actividad", href: "/admin/logs-actividad", icon: Activity },
    { title: "Rastreo CLABEs STP", href: "/admin/rastreo-clabes-stp", icon: CreditCard },
    { title: "Rastreo Pagos STP", href: "/admin/rastreo-pagos-stp", icon: CreditCard },
    { title: "Configuración Reportes", href: "/admin/configuracion-reportes", icon: Cog },
  ]
};

export const AdminSidebar = ({ isOpen, onClose, currentPath }: AdminSidebarProps) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { isPathAllowed, isLoading: isLoadingPermissions, isSuperAdmin } = useAllowedMenus();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth/login");
  };

  // Get user initials for avatar
  const getInitials = (name: string | undefined) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const userEmail = profile?.email;

  // Filter navigation items based on permissions
  const filteredNavigationItems = useMemo(() => {
    const filterItems = (items: NavigationItem[]) => {
      return items
        .map(item => {
          if (item.href) {
            // Single item with href - check if allowed
            if (isSuperAdmin) return item;
            return isPathAllowed(item.href) ? item : null;
          } else if (item.children) {
            // Group with children - filter children
            const allowedChildren = item.children.filter(child => {
              if (isSuperAdmin) return true;
              return isPathAllowed(child.href);
            });
            
            // Only show group if it has allowed children
            if (allowedChildren.length > 0) {
              return { ...item, children: allowedChildren };
            }
            return null;
          }
          return null;
        })
        .filter(Boolean) as NavigationItem[];
    };

    const filteredMain = filterItems(navigationItems);
    
    // Filtrar el menú de logs (solo para jorge.mendoza@sozu.com)
    if (userEmail === LOGS_ALLOWED_EMAIL) {
      const filteredLogsChildren = logsMenuItem.children?.filter(child => {
        if (isSuperAdmin) return true;
        return isPathAllowed(child.href);
      }) || [];
      
      if (filteredLogsChildren.length > 0) {
        filteredMain.push({ ...logsMenuItem, children: filteredLogsChildren });
      }
    }
    
    return filteredMain;
  }, [isPathAllowed, isSuperAdmin, userEmail]);

  // Auto-expand the group that contains the current path
  const getInitialExpandedGroups = () => {
    const expanded = new Set<string>();
    filteredNavigationItems.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => currentPath === child.href);
        if (hasActiveChild) {
          expanded.add(item.title);
        }
      }
    });
    return expanded;
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(getInitialExpandedGroups());

  const toggleGroup = (groupTitle: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupTitle)) {
      newExpanded.delete(groupTitle);
    } else {
      newExpanded.add(groupTitle);
    }
    setExpandedGroups(newExpanded);
  };

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
        "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-sidebar-foreground border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">S</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">SOZU</h1>
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation - con scroll */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-4">
          {isLoadingPermissions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <nav className="py-4 space-y-2">
              {filteredNavigationItems.map((item, index) => (
                <div key={index}>
                  {item.href ? (
                    <Link
                      to={item.href}
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors",
                        currentPath === item.href
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      )}
                      onClick={onClose}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  ) : (
                    <div className="space-y-1">
                      <button
                        onClick={() => toggleGroup(item.title)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all"
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                        </div>
                        {expandedGroups.has(item.title) ? (
                          <ChevronDown className="h-4 w-4 transition-transform" />
                        ) : (
                          <ChevronRight className="h-4 w-4 transition-transform" />
                        )}
                      </button>
                      {expandedGroups.has(item.title) && (
                        <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                          {item.children?.map((child, childIndex) => (
                            <Link
                              key={childIndex}
                              to={child.href}
                              className={cn(
                                "flex items-center space-x-3 pl-8 pr-3 py-2 rounded-lg transition-colors text-sm",
                                currentPath === child.href
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent"
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
                  )}
                </div>
              ))}
            </nav>
          )}
          </ScrollArea>
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center space-x-3 p-3 bg-accent rounded-lg">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground font-medium text-sm">
                {getInitials(profile?.nombre)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{profile?.nombre || "Usuario"}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.rol_nombre || "Sin rol"}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
