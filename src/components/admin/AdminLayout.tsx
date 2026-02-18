import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const SIMPLIFIED_ROLES = ["Agente Inmobiliario", "Inmobiliaria"];

export const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { profile } = useAuth();
  
  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");

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
        <AdminHeader 
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />
        
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};