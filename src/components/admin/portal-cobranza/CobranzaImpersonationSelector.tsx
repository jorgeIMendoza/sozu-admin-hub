import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCobranzaImpersonation } from "@/contexts/CobranzaImpersonationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, UserCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CobranzaImpersonationSelector() {
  const { profile } = useAuth();
  const {
    impersonatedEmail,
    impersonatedName,
    setImpersonated,
    clearImpersonation,
    isImpersonating,
  } = useCobranzaImpersonation();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;

  // First get roles that have permissions on Portal Cobranza submenus
  const { data: allowedRoles = [] } = useQuery({
    queryKey: ["cobranza-allowed-roles"],
    queryFn: async () => {
      // Step 1: get menu id
      const { data: menuData } = await (supabase as any)
        .from("menus")
        .select("id")
        .eq("nombre", "Portal Cobranza")
        .single();
      if (!menuData) return [];

      // Step 2: get submenu ids for that menu
      const { data: subData } = await (supabase as any)
        .from("submenus")
        .select("id")
        .eq("menu_id", menuData.id)
        .eq("activo", true);
      if (!subData || subData.length === 0) return [];

      const subIds = subData.map((s: any) => s.id);

      // Step 3: get distinct roles with permissions on those submenus
      const { data: permData } = await (supabase as any)
        .from("submenus_permisos")
        .select("rol_id")
        .in("submenu_id", subIds)
        .eq("activo", true);

      const roleIds = [...new Set((permData || []).map((r: any) => r.rol_id))];
      return roleIds as number[];
    },
    enabled: isSuperAdmin,
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ["cobranza-impersonation-users", allowedRoles],
    queryFn: async () => {
      if (allowedRoles.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("usuarios")
        .select("email, rol_id, id_persona, personas:personas!usuarios_id_persona_fkey(id, nombre_legal, nombre_comercial), roles:roles!inner(nombre)")
        .eq("activo", true)
        .in("rol_id", allowedRoles)
        .order("email");

      if (error) {
        console.error("Error fetching cobranza users:", error);
        throw error;
      }
      return (data || [])
        .map((u: any) => ({
          email: u.email,
          personaId: u.personas?.id,
          nombre: u.personas?.nombre_comercial || u.personas?.nombre_legal || u.email,
          rol: u.roles?.nombre || "Sin rol",
        }))
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: isSuperAdmin && allowedRoles.length > 0,
  });

  if (!isSuperAdmin) return null;

  return (
    <div className="flex items-center gap-2">
      <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-8 justify-between text-xs gap-1 min-w-[180px] max-w-[280px]",
              isImpersonating && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20"
            )}
          >
            <span className="truncate">
              {isImpersonating ? `👁 ${impersonatedName}` : "Ver como usuario..."}
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Buscar usuario..." className="h-9" />
            <CommandList>
              <CommandEmpty>No se encontró usuario.</CommandEmpty>
              <CommandGroup>
                {usuarios.map((u: any) => (
                  <CommandItem
                    key={u.email}
                    value={`${u.nombre} ${u.email}`}
                    onSelect={() => {
                      setImpersonated(u.email, u.nombre, u.personaId);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        impersonatedEmail === u.email ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm truncate">{u.nombre}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{u.rol}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">{u.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isImpersonating && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearImpersonation}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
