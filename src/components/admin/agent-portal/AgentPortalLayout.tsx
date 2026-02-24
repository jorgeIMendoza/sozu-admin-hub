import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, Building2, BarChart3, DollarSign, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/admin/agent/inicio", label: "Inicio", icon: Home },
  { path: "/admin/agent/inventario", label: "Inventario", icon: Building2 },
  { path: "/admin/agent/pipeline", label: "Pipeline", icon: BarChart3 },
  { path: "/admin/agent/comisiones", label: "Comisiones", icon: DollarSign },
  { path: "/admin/agent/perfil", label: "Perfil", icon: User },
];

export const AgentPortalLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="agent-portal min-h-screen flex flex-col" style={{ background: "hsl(var(--agent-bg))" }}>
      {/* Main content area with bottom padding for tab bar */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {TABS.map((tab) => {
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
