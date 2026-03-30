import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, UserSearch, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentPortalImpersonationSelector() {
  const { profile } = useAuth();
  const {
    impersonatedAgentEmail,
    impersonatedAgentName,
    setImpersonatedAgent,
    clearImpersonation,
    isImpersonating,
  } = useAgentImpersonation();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  if (!isSuperAdmin) return null;

  const { data: agents = [] } = useQuery({
    queryKey: ["all-agents-for-portal-impersonation"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("usuarios")
        .select("email, rol_id, personas!inner(id, nombre_legal)")
        .in("rol_id", [3, 9])
        .eq("activo", true)
        .order("email");

      if (error) throw error;
      return (data || [])
        .map((u: any) => ({
          email: u.email,
          personaId: u.personas?.id,
          nombre: u.personas?.nombre_legal || u.email,
        }))
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: isSuperAdmin,
  });

  return (
    <div className="flex items-center gap-2">
      <UserSearch className="h-4 w-4 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full sm:w-[260px] justify-between h-8 text-sm"
          >
            {isImpersonating ? (
              <span className="truncate">{impersonatedAgentName}</span>
            ) : (
              <span className="text-muted-foreground">Seleccionar agente...</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full sm:w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar agente..." />
            <CommandList>
              <CommandEmpty>No se encontró el agente.</CommandEmpty>
              <CommandGroup>
                {agents.map((agent: any) => (
                  <CommandItem
                    key={agent.email}
                    value={`${agent.nombre} ${agent.email}`}
                    onSelect={() => {
                      setImpersonatedAgent(agent.email, agent.personaId, agent.nombre);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        impersonatedAgentEmail === agent.email ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">{agent.nombre}</span>
                      <span className="text-xs text-muted-foreground">{agent.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isImpersonating && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearImpersonation}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
