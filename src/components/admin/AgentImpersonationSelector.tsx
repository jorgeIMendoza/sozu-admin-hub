import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, UserSearch, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentImpersonationSelector() {
  const { profile } = useAuth();
  const { impersonatedAgentEmail, impersonatedAgentName, setImpersonatedAgent, clearImpersonation, isImpersonating } = useAgentImpersonation();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  if (!isSuperAdmin) return null;

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["all-agents-for-impersonation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("email, rol_id, personas!inner(id, nombre_legal)")
        .in("rol_id", [3, 4, 9])
        .eq("activo", true)
        .order("email");

      if (error) throw error;
      return (data || []).map((u: any) => ({
        email: u.email,
        personaId: u.personas?.id,
        nombre: u.personas?.nombre_legal || u.email,
        rolId: u.rol_id,
      })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: isSuperAdmin,
  });

  return (
    <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-primary/20 bg-primary/5">
      <UserSearch className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Ver como:</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full sm:w-[300px] justify-between h-8 text-sm">
            {isImpersonating ? (
              <span className="truncate">{impersonatedAgentName}</span>
            ) : (
              <span className="text-muted-foreground">Super Admin (todos)</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full sm:w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar agente..." />
            <CommandList>
              <CommandEmpty>No se encontró el agente.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__super_admin__"
                  onSelect={() => {
                    clearImpersonation();
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !isImpersonating ? "opacity-100" : "opacity-0")} />
                  <span className="font-medium">Super Admin (todos)</span>
                </CommandItem>
                {agents.map((agent: any) => (
                  <CommandItem
                    key={agent.email}
                    value={`${agent.nombre} ${agent.email}`}
                    onSelect={() => {
                      setImpersonatedAgent(agent.email, agent.personaId, agent.nombre);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", impersonatedAgentEmail === agent.email ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="text-sm">{agent.nombre}</span>
                      <span className="text-xs text-muted-foreground">{agent.email}</span>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {agent.rolId === 9 ? "Interno" : agent.rolId === 4 ? "Inmob." : "Externo"}
                    </Badge>
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
