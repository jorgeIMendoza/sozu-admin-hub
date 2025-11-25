import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  KeyRound,
  ScrollText,
  Bot
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
];

export const AdminSidebar = ({ isOpen, onClose, currentPath }: AdminSidebarProps) => {
  // Auto-expand the group that contains the current path
  const getInitialExpandedGroups = () => {
    const expanded = new Set<string>();
    navigationItems.forEach(item => {
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
        "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-sidebar-foreground border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
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

        {/* Navigation */}
        <ScrollArea className="flex-1 px-4">
          <nav className="py-4 space-y-2">
            {navigationItems.map((item, index) => (
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
        </ScrollArea>

        {/* User Profile */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center space-x-3 p-3 bg-accent rounded-lg">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground font-medium text-sm">JM</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Jorge Mendoza</p>
              <p className="text-xs text-muted-foreground">Super Administrador</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};