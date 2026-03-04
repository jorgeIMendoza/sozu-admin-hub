import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, BarChart3, UserSearch,
  Calendar, DollarSign, FileText, Settings, ArrowLeft, LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";

const PORTAL_INMOB_MENU_ID = 17;

const iconMap: Record<string, LucideIcon> = {
  "/admin/portal-inmobiliaria/dashboard": LayoutDashboard,
  "/admin/portal-inmobiliaria/agentes": Users,
  "/admin/portal-inmobiliaria/pipeline": BarChart3,
  "/admin/portal-inmobiliaria/prospectos": UserSearch,
  "/admin/portal-inmobiliaria/citas": Calendar,
  "/admin/portal-inmobiliaria/comisiones": DollarSign,
  "/admin/portal-inmobiliaria/reportes": FileText,
  "/admin/portal-inmobiliaria/configuracion": Settings,
};

const FALLBACK_TABS = [
  { path: "/admin/portal-inmobiliaria/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/portal-inmobiliaria/agentes", label: "Agentes", icon: Users },
  { path: "/admin/portal-inmobiliaria/pipeline", label: "Pipeline", icon: BarChart3 },
  { path: "/admin/portal-inmobiliaria/prospectos", label: "Prospectos", icon: UserSearch },
  { path: "/admin/portal-inmobiliaria/citas", label: "Citas", icon: Calendar },
  { path: "/admin/portal-inmobiliaria/comisiones", label: "Comisiones", icon: DollarSign },
  { path: "/admin/portal-inmobiliaria/reportes", label: "Reportes", icon: FileText },
  { path: "/admin/portal-inmobiliaria/configuracion", label: "Configuración", icon: Settings },
];

export const PortalInmobiliariaLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isInmobiliariaRole = profile?.rol_nombre === "Inmobiliaria";
  const { personaId } = useInmobiliariaPersonaId();

  // Fetch agency name
  const { data: agencyName } = useQuery({
    queryKey: ["inmob-agency-name", personaId],
    queryFn: async () => {
      if (!personaId) return "Mi Inmobiliaria";
      const { data } = await (supabase as any)
        .from("personas")
        .select("nombre_comercial, nombre_legal")
        .eq("id", personaId)
        .single();
      return data?.nombre_comercial || data?.nombre_legal || "Mi Inmobiliaria";
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  // Fetch tabs from DB
  const { data: tabs = FALLBACK_TABS } = useQuery({
    queryKey: ["portal-inmob-tabs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("submenus")
        .select("nombre, vista_front_end, orden")
        .eq("menu_id", PORTAL_INMOB_MENU_ID)
        .eq("activo", true)
        .order("orden");
      if (error || !data || data.length === 0) return FALLBACK_TABS;
      return data.map((s: any) => ({
        path: s.vista_front_end,
        label: s.nombre,
        icon: iconMap[s.vista_front_end] || LayoutDashboard,
      }));
    },
    staleTime: 5 * 60_000,
  });

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");
  const showBackButton = !isInmobiliariaRole;

  return (
    <div className="sozu-theme min-h-screen flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r border-border bg-background fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <img src={sozuLogoBlack} alt="SOZU" className="h-7" />
        </div>

        {/* Agency name */}
        <div className="px-6 py-4 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inmobiliaria</p>
          <p className="text-sm font-semibold text-foreground truncate mt-0.5">
            {agencyName || "Cargando..."}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Back button */}
        {showBackButton && (
          <div className="px-3 py-4 border-t border-border">
            <button
              onClick={() => navigate("/admin")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Menú principal
            </button>
          </div>
        )}
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
        <div className="flex items-center justify-around h-16 px-2 overflow-x-auto">
          {tabs.slice(0, 5).map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors min-w-0",
                  active ? "text-accent" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className={cn("text-[10px] truncate", active ? "font-semibold" : "font-medium")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 lg:ml-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <img src={sozuLogoBlack} alt="SOZU" className="h-6" />
          {showBackButton && (
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </header>

        <main className="p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
