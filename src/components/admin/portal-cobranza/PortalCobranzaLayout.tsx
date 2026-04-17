import { useState, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Inbox, FileText, CreditCard, FileCheck,
  AlertTriangle, Handshake, Megaphone, FileStack, Send, Activity,
  HardHat, BarChart3, Settings, ArrowLeft, LogOut, LucideIcon,
  ChevronDown, ChevronRight, Menu,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCobranzaImpersonation } from "@/contexts/CobranzaImpersonationContext";
import { CobranzaImpersonationSelector } from "./CobranzaImpersonationSelector";
import { APP_VERSION } from "@/lib/config";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  separator?: boolean;
  children?: { label: string; path: string; icon: LucideIcon }[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/admin/portal-cobranza/dashboard", icon: LayoutDashboard },
  { label: "Bandeja Operativa", path: "/admin/portal-cobranza/bandeja", icon: Inbox },
  { label: "Atención de Clientes", path: "/admin/portal-cobranza/atencion", icon: FileText },
  { label: "Relación de Pagos", path: "/admin/portal-cobranza/pagos", icon: CreditCard },
  { label: "CEPs Pendientes", path: "/admin/portal-cobranza/ceps", icon: FileCheck },
  { label: "Conciliaciones", path: "/admin/portal-cobranza/conciliaciones", icon: AlertTriangle },
  { label: "Promesas de Pago", path: "/admin/portal-cobranza/promesas", icon: Handshake },
  { separator: true, label: "", path: "", icon: LayoutDashboard },
  {
    label: "Comunicación", path: "/admin/portal-cobranza/comunicacion", icon: Megaphone,
    children: [
      { label: "Administrar Avisos", path: "/admin/portal-cobranza/comunicacion/avisos", icon: FileStack },
      { label: "Enviar Avisos", path: "/admin/portal-cobranza/comunicacion/enviar", icon: Send },
      { label: "Ejecuciones", path: "/admin/portal-cobranza/comunicacion/ejecuciones", icon: Activity },
      { label: "Plantillas", path: "/admin/portal-cobranza/comunicacion/plantillas", icon: FileText },
    ],
  },
  { separator: true, label: "", path: "", icon: LayoutDashboard },
  { label: "Inputs de Obra", path: "/admin/portal-cobranza/inputs-obra", icon: HardHat },
  { label: "Reportes", path: "/admin/portal-cobranza/reportes", icon: BarChart3 },
  { label: "Configuración", path: "/admin/portal-cobranza/configuracion", icon: Settings },
];

const SECTION_LABELS: Record<string, string> = {
  "/admin/portal-cobranza/dashboard": "Dashboard",
  "/admin/portal-cobranza/bandeja": "Bandeja Operativa",
  "/admin/portal-cobranza/atencion": "Atención de Clientes",
  "/admin/portal-cobranza/pagos": "Relación de Pagos",
  "/admin/portal-cobranza/ceps": "CEPs Pendientes",
  "/admin/portal-cobranza/conciliaciones": "Conciliaciones",
  "/admin/portal-cobranza/promesas": "Promesas de Pago",
  "/admin/portal-cobranza/comunicacion/avisos": "Administrar Avisos",
  "/admin/portal-cobranza/comunicacion/enviar": "Enviar Avisos",
  "/admin/portal-cobranza/comunicacion/ejecuciones": "Ejecuciones",
  "/admin/portal-cobranza/comunicacion/plantillas": "Plantillas",
  "/admin/portal-cobranza/inputs-obra": "Inputs de Obra",
  "/admin/portal-cobranza/reportes": "Reportes",
  "/admin/portal-cobranza/configuracion": "Configuración",
};

export const PortalCobranzaLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { impersonatedName, impersonatedEmail, isImpersonating } = useCobranzaImpersonation();
  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const { data: personaName } = useQuery({
    queryKey: ["cobranza-persona-name", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return null;
      const { data } = await (supabase as any)
        .from("personas")
        .select("nombre_comercial, nombre_legal")
        .eq("id", profile.id_persona)
        .single();
      return data?.nombre_comercial || data?.nombre_legal || null;
    },
    enabled: !!profile?.id_persona,
  });

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const currentSection = Object.entries(SECTION_LABELS).find(([path]) => isActive(path))?.[1] || "Cobranza 360";

  const activeUserName = isImpersonating
    ? impersonatedName || impersonatedEmail || profile?.nombre || profile?.email || "Usuario"
    : personaName || profile?.nombre || profile?.email || "Usuario";

  const userInitials = activeUserName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 pt-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
            S
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground leading-tight">SOZU</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Cobranza 360</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item, idx) => {
          if (item.separator) {
            return <div key={`sep-${idx}`} className="my-2 mx-2 border-t border-border" />;
          }

          if (item.children) {
            const isExpanded = expandedMenu === item.path || item.children.some(c => isActive(c.path));
            return (
              <div key={item.path}>
                <button
                  onClick={() => setExpandedMenu(isExpanded ? null : item.path)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-[9px] rounded-lg text-sm font-medium transition-all duration-150",
                    item.children.some(c => isActive(c.path))
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {item.children.map((child) => {
                      const active = isActive(child.path);
                      return (
                        <button
                          key={child.path}
                          onClick={() => handleNavigate(child.path)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150",
                            active
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <child.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2 : 1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div className="min-w-0 px-1">
          <p className="text-xs text-muted-foreground truncate">{profile?.email || "—"}</p>
          <p className="text-[10px] text-muted-foreground/50 font-mono">{APP_VERSION}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleNavigate("/admin")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Menú principal
          </button>
          <button
            onClick={signOut}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col border-r border-border bg-card fixed inset-y-0 left-0 z-30"
        style={{ width: 232 }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sheet Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[260px] flex flex-col bg-card">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 lg:ml-[232px]">
        {/* Topbar */}
        <header className="hidden lg:flex items-center justify-between sticky top-0 z-20 bg-card border-b border-border px-6 h-14">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span className="font-medium">Cobranza 360</span>
            {currentSection && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{currentSection}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isSuperAdmin && <CobranzaImpersonationSelector />}
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium text-foreground truncate">{activeUserName}</p>
                <p className="text-xs text-muted-foreground truncate">Cobranza</p>
              </div>
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-[13px] font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Mobile Topbar */}
        <header className="flex lg:hidden items-center justify-between sticky top-0 z-20 bg-card border-b border-border px-3 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-1 rounded-md text-foreground hover:bg-muted transition-colors"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground leading-tight truncate">Cobranza 360</p>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{currentSection}</p>
            </div>
          </div>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-[12px] font-bold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="p-4 lg:px-10 lg:py-8 bg-background min-h-[calc(100vh-56px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
