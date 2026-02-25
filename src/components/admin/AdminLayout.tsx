import { useState, useEffect } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
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

  // Redirect simplified roles to agent portal if they hit /admin directly
  if (isSimplifiedRole && location.pathname === "/admin") {
    return <Navigate to="/admin/agent/inicio" replace />;
  }

  // Use AgentPortalLayout for agent portal routes
  if (isSimplifiedRole && location.pathname.startsWith("/admin/agent")) {
    return <AgentPortalLayout />;
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