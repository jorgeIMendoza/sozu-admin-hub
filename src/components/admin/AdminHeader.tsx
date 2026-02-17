import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Bell, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserSettingsDialog } from "./UserSettingsDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AdminHeaderProps {
  onMenuClick: () => void;
}

const SIMPLIFIED_ROLES = ["Agente Inmobiliario", "Inmobiliaria"];

export const AdminHeader = ({ onMenuClick }: AdminHeaderProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { profile } = useAuth();
  
  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");

  return (
    <>
      <header className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          {!isSimplifiedRole && (
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

          <div className="flex items-center space-x-2 ml-auto">
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
