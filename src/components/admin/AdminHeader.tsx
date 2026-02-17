import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Settings, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserSettingsDialog } from "./UserSettingsDialog";
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

  return (
    <>
      <header className="bg-card border-b px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left side */}
          {isSimplifiedRole ? (
            <div className="flex flex-col gap-1">
              <img src={sozuLogo} alt="Sozu" className="h-7" />
              <span className="text-[9px] text-muted-foreground/40 select-none">{APP_VERSION}</span>
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

          {/* Right side */}
          <div className="flex items-center gap-3 ml-auto">
            {/* User info for simplified roles */}
            {isSimplifiedRole && (
              <div className="hidden sm:flex flex-col items-end mr-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {profile?.nombre || "Usuario"}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {profile?.rol_nombre || "Agente"}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground leading-tight">
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
