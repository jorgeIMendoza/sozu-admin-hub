import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Building2, BarChart3, DollarSign, User, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";

const AGENT_MENU_ID = 16;

const iconMap: Record<string, LucideIcon> = {
  '/admin/agent/inicio': Home,
  '/admin/agent/inventario': Building2,
  '/admin/agent/pipeline': BarChart3,
  '/admin/agent/comisiones': DollarSign,
  '/admin/agent/perfil': User,
};

const FALLBACK_TABS = [
  { path: "/admin/agent/inicio", label: "Inicio", icon: Home },
  { path: "/admin/agent/inventario", label: "Inventario", icon: Building2 },
  { path: "/admin/agent/pipeline", label: "Pipeline", icon: BarChart3 },
  { path: "/admin/agent/comisiones", label: "Comisiones", icon: DollarSign },
  { path: "/admin/agent/perfil", label: "Perfil", icon: User },
];

export const AgentPortalLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { permissions, isLoading: permLoading } = useAgentPortalPermissions();

  const { data: allTabs = FALLBACK_TABS } = useQuery({
    queryKey: ['agent-portal-tabs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('submenus')
        .select('nombre, vista_front_end, orden')
        .eq('menu_id', AGENT_MENU_ID)
        .eq('activo', true)
        .order('orden');

      if (error || !data || data.length === 0) return FALLBACK_TABS;

      return data.map((s: any) => ({
        path: s.vista_front_end,
        label: s.nombre,
        icon: iconMap[s.vista_front_end] || Home,
      }));
    },
    staleTime: 5 * 60_000,
  });

  // Filtrar tabs por permiso de lectura
  const tabs = permLoading
    ? allTabs
    : allTabs.filter((tab) => {
        const perm = permissions[tab.path as keyof typeof permissions];
        return perm?.canRead !== false;
      });

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="agent-portal min-h-screen flex flex-col" style={{ background: "hsl(var(--agent-bg))" }}>
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet context={{ permissions }} />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  active
                    ? "text-[hsl(var(--agent-primary))]"
                    : "text-[hsl(var(--agent-muted))]"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
