import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Settings, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserSettingsDialog } from "./UserSettingsDialog";
import { AgentOnboardingWidget } from "./AgentOnboardingWidget";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION } from "@/lib/config";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";
import sozuLogoWhite from "@/assets/sozu-logo-white.png";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AdminHeaderProps {
  onMenuClick: () => void;
}

const SIMPLIFIED_ROLES = ["Agente Inmobiliario", "Inmobiliaria"];

export const AdminHeader = ({ onMenuClick }: AdminHeaderProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { profile, user, signOut } = useAuth();
  const { resolvedTheme } = useTheme();
  const sozuLogo = resolvedTheme === "dark" ? sozuLogoWhite : sozuLogoBlack;
  
  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");

  // Fetch agent commission for simplified roles
  const { data: agentCommission } = useQuery({
    queryKey: ["agent-commission", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return null;
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("porcentaje_comision")
        .eq("id_persona", profile.id_persona)
        .eq("id_tipo_entidad", 19)
        .eq("activo", true)
        .is("id_proyecto", null)
        .maybeSingle();
      return data?.porcentaje_comision ?? null;
    },
    enabled: isSimplifiedRole && !!profile?.id_persona,
  });

  return (
    <>
      <header className="bg-card border-b px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left side */}
          {isSimplifiedRole ? (
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col gap-0.5">
                <img src={sozuLogo} alt="Sozu" className="h-7" />
                <span className="text-[9px] text-muted-foreground/40 select-none">{APP_VERSION}</span>
              </div>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                Hola, <span className="font-medium text-foreground">{profile?.nombre?.split(" ")[0] || "Usuario"}</span>
              </span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="lg:hidden"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Center - Onboarding progress for agents */}
          {isSimplifiedRole && profile?.rol_nombre === "Agente Inmobiliario" && profile?.id_persona && (
            <div className="flex-1 mx-4 max-w-xl hidden sm:block">
              <AgentOnboardingWidget personaId={profile.id_persona} variant="inline" />
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-3 ml-auto">
            {/* User info for simplified roles */}
            {isSimplifiedRole && (
              <div className="flex flex-col items-end mr-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground leading-tight truncate max-w-[120px] sm:max-w-none">
                    {profile?.nombre || "Usuario"}
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary cursor-pointer hover:bg-primary/5">
                          {agentCommission != null ? `${agentCommission} %` : "2.00 %"}
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto px-3 py-1.5 text-xs">
                      Porcentaje de comisión
                    </PopoverContent>
                  </Popover>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 hidden sm:inline-flex">
                    {profile?.rol_nombre || "Agente"}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                  {profile?.email || user?.email}
                </span>
              </div>
            )}

            {!isSimplifiedRole && <ThemeToggle />}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notificaciones">
                  <Bell className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-center py-6">
                <p className="text-sm text-muted-foreground">Por el momento no tienes notificaciones</p>
              </PopoverContent>
            </Popover>
            
            {!isSimplifiedRole && (
              <Button 
                variant="ghost" 
                size="icon" 
                aria-label="Configuración"
                onClick={() => setIsSettingsOpen(true)}
              >
                <Settings className="h-5 w-5" />
              </Button>
            )}

            {isSimplifiedRole && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar sesión"
                onClick={signOut}
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile onboarding - below header content */}
        {isSimplifiedRole && profile?.rol_nombre === "Agente Inmobiliario" && profile?.id_persona && (
          <div className="sm:hidden mt-2">
            <AgentOnboardingWidget personaId={profile.id_persona} variant="inline" />
          </div>
        )}
      </header>

      {!isSimplifiedRole && (
        <UserSettingsDialog 
          open={isSettingsOpen} 
          onOpenChange={setIsSettingsOpen} 
        />
      )}
    </>
  );
};
