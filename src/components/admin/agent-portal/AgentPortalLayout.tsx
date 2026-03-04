import { Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { Home, Building2, BarChart3, DollarSign, User, LucideIcon, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useDynamicMenus } from "@/hooks/useDynamicMenus";
import { useAgentHasInmobiliaria } from "@/hooks/useAgentHasInmobiliaria";

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
  const { hasInmobiliaria } = useAgentHasInmobiliaria();

  const { profile } = useAuth();
  const isAgentRole = profile?.rol_nombre === 'Agente Inmobiliario';

  // Check if user has other menus beyond Portal de Agente
  const { data: hasOtherMenus = false } = useQuery({
    queryKey: ['has-other-menus', profile?.rol_id],
    queryFn: async () => {
      if (!profile?.rol_id) return false;
      const { data, error } = await (supabase as any)
        .from('submenus')
        .select('menu_id')
        .neq('menu_id', AGENT_MENU_ID)
        .eq('activo', true);
      if (error || !data) return false;
      const uniqueMenuIds = [...new Set(data.map((s: any) => s.menu_id))];
      return uniqueMenuIds.length > 0;
    },
    enabled: !isAgentRole && !!profile?.rol_id,
    staleTime: 10 * 60_000,
  });

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

  // Filtrar tabs por permiso de lectura + ocultar comisiones si tiene inmobiliaria
  const tabs = permLoading
    ? allTabs
    : allTabs.filter((tab) => {
        // Hide comisiones for agents with linked inmobiliaria
        if (hasInmobiliaria && tab.path === '/admin/agent/comisiones') return false;
        const perm = permissions[tab.path as keyof typeof permissions];
        return perm?.canRead !== false;
      });

  // Block route access to comisiones if agent has inmobiliaria
  if (hasInmobiliaria && location.pathname.startsWith('/admin/agent/comisiones')) {
    return <Navigate to="/admin/agent/inicio" replace />;
  }

  const isActive = (path: string) => location.pathname.startsWith(path);

  const showBackButton = !isAgentRole && hasOtherMenus;

  return (
    <div className="agent-portal min-h-screen flex flex-col" style={{ background: "hsl(var(--agent-bg))" }}>
      {showBackButton && (
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-2">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--agent-text-secondary))] hover:text-[hsl(var(--agent-text))] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Menú principal
          </button>
        </div>
      )}
      <main className="flex-1 pb-24 overflow-y-auto">
        <Outlet context={{ permissions, isAgentRole }} />
      </main>

      <nav className="fixed bottom-4 left-4 right-4 z-50">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-gray-100/50">
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
