import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, BarChart3, UserSearch,
  Calendar, DollarSign, FileText, Settings, ArrowLeft, LucideIcon, LogOut, Percent,
  Building2, BarChart2, CalendarDays, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { APP_VERSION } from "@/lib/config";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const PORTAL_INMOB_MENU_ID = 17;

const iconMap: Record<string, LucideIcon> = {
  "/admin/portal-inmobiliaria/dashboard": LayoutDashboard,
  "/admin/portal-inmobiliaria/agentes": Users,
  "/admin/portal-inmobiliaria/pipeline": BarChart2,
  "/admin/portal-inmobiliaria/prospectos": UserCheck,
  "/admin/portal-inmobiliaria/citas": CalendarDays,
  "/admin/portal-inmobiliaria/comisiones": DollarSign,
  "/admin/portal-inmobiliaria/reportes": BarChart3,
  "/admin/portal-inmobiliaria/configuracion": Settings,
};

const FALLBACK_TABS = [
  { path: "/admin/portal-inmobiliaria/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/portal-inmobiliaria/agentes", label: "Agentes", icon: Users },
  { path: "/admin/portal-inmobiliaria/pipeline", label: "Pipeline", icon: BarChart2 },
  { path: "/admin/portal-inmobiliaria/prospectos", label: "Prospectos", icon: UserCheck },
  { path: "/admin/portal-inmobiliaria/citas", label: "Citas", icon: CalendarDays },
  { path: "/admin/portal-inmobiliaria/comisiones", label: "Comisiones", icon: DollarSign },
  { path: "/admin/portal-inmobiliaria/reportes", label: "Reportes", icon: BarChart3 },
  { path: "/admin/portal-inmobiliaria/configuracion", label: "Configuración", icon: Settings },
];

const SECTION_LABELS: Record<string, string> = {
  "/admin/portal-inmobiliaria/dashboard": "Dashboard",
  "/admin/portal-inmobiliaria/agentes": "Agentes",
  "/admin/portal-inmobiliaria/pipeline": "Pipeline",
  "/admin/portal-inmobiliaria/prospectos": "Prospectos",
  "/admin/portal-inmobiliaria/citas": "Citas",
  "/admin/portal-inmobiliaria/comisiones": "Comisiones",
  "/admin/portal-inmobiliaria/reportes": "Reportes",
  "/admin/portal-inmobiliaria/configuracion": "Configuración",
};

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export const PortalInmobiliariaLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const isInmobiliariaRole = profile?.rol_nombre === "Inmobiliaria";
  const { personaId } = useInmobiliariaPersonaId();

  // Fetch agency name + comision
  const { data: agencyInfo } = useQuery({
    queryKey: ["inmob-agency-info", personaId],
    queryFn: async () => {
      if (!personaId) return { name: "Mi Inmobiliaria", comisionPct: null as number | null };
      const { data } = await (supabase as any)
        .from("personas")
        .select("nombre_comercial, nombre_legal")
        .eq("id", personaId)
        .single();
      const name = data?.nombre_comercial || data?.nombre_legal || "Mi Inmobiliaria";

      let comisionPct: number | null = null;
      const { data: comisionRows } = await supabase
        .from("entidades_relacionadas")
        .select("porcentaje_comision")
        .eq("id_persona", personaId)
        .eq("id_tipo_entidad", 5)
        .eq("activo", true) as any;

      if (comisionRows?.length) {
        const vals = (comisionRows as any[])
          .map((r: any) => Number(r.porcentaje_comision))
          .filter((v: number) => !isNaN(v) && v > 0);
        if (vals.length > 0) {
          const freq = new Map<number, number>();
          vals.forEach((v: number) => freq.set(v, (freq.get(v) || 0) + 1));
          let best = vals[0];
          let bestCount = 0;
          freq.forEach((count, val) => { if (count > bestCount) { best = val; bestCount = count; } });
          comisionPct = best;
        }
      }

      return { name, comisionPct };
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });
  const agencyName = agencyInfo?.name || "Mi Inmobiliaria";
  const comisionPct = agencyInfo?.comisionPct;

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

  // Current section label for topbar breadcrumb
  const currentSection = Object.entries(SECTION_LABELS).find(([path]) => isActive(path))?.[1] || "";

  const userInitials = profile?.email ? profile.email.substring(0, 2).toUpperCase() : "U";

  return (
    <div className="inmob-portal min-h-screen flex">
      {/* ── Sidebar (desktop) ── */}
      <aside
        className="hidden lg:flex lg:flex-col border-r border-border bg-[hsl(var(--card))] fixed inset-y-0 left-0 z-30"
        style={{ width: "var(--inmob-sidebar-width)" }}
      >
        {/* Logo area */}
        <div className="px-4 pt-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--inmob-green))] text-white text-sm font-bold shrink-0">
              S
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-foreground leading-tight">SOZU</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Panel Inmobiliaria</p>
            </div>
          </div>
        </div>

        {/* Agency info */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Inmobiliaria</p>
          <p className="text-sm font-semibold text-foreground truncate mt-0.5">{agencyName}</p>
          {comisionPct !== null && comisionPct !== undefined && (
            <Badge variant="outline" className="mt-1.5 text-[10px] font-semibold border-primary/30 text-primary">
              <Percent className="h-3 w-3 mr-0.5" />
              Comisión: {comisionPct.toFixed(2)}%
            </Badge>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-lg text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-[hsl(var(--inmob-green-light))] text-[hsl(var(--inmob-green))] font-semibold"
                    : "text-muted-foreground hover:bg-[hsl(var(--inmob-border-light))] hover:text-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2 : 1.75} />
                {tab.label}
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
            {showBackButton && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Menú principal
              </button>
            )}
            <button
              onClick={signOut}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-50">
        <div className="relative max-w-lg mx-auto">
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-10 rounded-r-2xl bg-gradient-to-l from-background to-transparent" />
          <div
            className="flex items-center h-16 bg-[hsl(var(--card))] rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-border/50 overflow-x-auto inmob-mobile-nav"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            <style>{`.inmob-mobile-nav::-webkit-scrollbar { display: none; }`}</style>
            {tabs.map((tab) => {
              const active = isActive(tab.path);
              const Icon = tab.icon;
              return (
                <button
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-w-[64px] px-2 h-full transition-colors shrink-0",
                    active ? "text-[hsl(var(--inmob-green))]" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                  <span className={cn("text-[10px] truncate", active ? "font-semibold" : "font-medium")}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
            <button
              onClick={signOut}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] px-2 h-full transition-colors shrink-0 text-destructive"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
              <span className="text-[10px] font-medium">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="flex-1 lg:ml-[232px]">
        {/* Topbar (desktop) */}
        <header
          className="hidden lg:flex items-center justify-between sticky top-0 z-20 bg-[hsl(var(--card))] border-b border-border px-6"
          style={{ height: "var(--inmob-topbar-height)" }}
        >
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium truncate max-w-[200px]">{agencyName}</span>
            {currentSection && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{currentSection}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-[hsl(var(--inmob-green))] text-white text-[13px] font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-[hsl(var(--card))] border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--inmob-green))] text-white text-xs font-bold">S</div>
            <span className="text-sm font-bold text-foreground">SOZU</span>
            <span className="text-[10px] text-muted-foreground/50 font-mono">{APP_VERSION}</span>
          </div>
          {showBackButton && (
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </header>

        <main className="p-8 lg:px-10 lg:py-8 pb-28 lg:pb-8 bg-[hsl(var(--background))] min-h-[calc(100vh-var(--inmob-topbar-height))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
