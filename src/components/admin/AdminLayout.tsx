import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { PortalInmobiliariaLayout } from "./portal-inmobiliaria/PortalInmobiliariaLayout";
import { PortalClienteLayout } from "./portal-cliente/PortalClienteLayout";
import { AdminHeader } from "./AdminHeader";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import { AgentPortalLayout } from "./agent-portal/AgentPortalLayout";

const SIMPLIFIED_ROLES = ["Agente Inmobiliario"];

export const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { profile } = useAuth();
  const { setTheme } = useTheme();
  
  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");

  useEffect(() => {
    if (isSimplifiedRole) {
      setTheme("light");
    }
  }, [isSimplifiedRole, setTheme]);

  // Use AgentPortalLayout for ALL roles on agent portal routes
  if (location.pathname.startsWith("/admin/agent/")) {
    return <AgentPortalLayout />;
  }

  // Use PortalInmobiliariaLayout for portal inmobiliaria routes
  if (location.pathname.startsWith("/admin/portal-inmobiliaria")) {
    return <PortalInmobiliariaLayout />;
  }

  // Use PortalClienteLayout for portal cliente routes
  if (location.pathname.startsWith("/admin/portal-cliente")) {
    return <PortalClienteLayout />;
  }

  return (
    <div className="min-h-screen bg-background">
      {!isSimplifiedRole && (
        <AdminSidebar 
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentPath={location.pathname}
        />
      )}
      
      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-300",
        !isSimplifiedRole && "lg:ml-64"
      )}>
        {!isSimplifiedRole && (
          <AdminHeader 
            onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          />
        )}
        
        <main className={cn("flex-1", isSimplifiedRole ? "p-0" : "p-6")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};