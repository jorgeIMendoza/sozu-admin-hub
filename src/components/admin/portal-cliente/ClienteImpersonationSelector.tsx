import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, UserSearch, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClienteImpersonationSelector() {
  const { profile } = useAuth();
  const { impersonatedClienteEmail, impersonatedClienteName, setImpersonatedCliente, clearImpersonation, isImpersonating } = useClienteImpersonation();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  if (!isSuperAdmin) return null;

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients-for-impersonation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("email, rol_id, personas!inner(id, nombre_legal)")
        .eq("rol_id", 23)
        .eq("activo", true)
        .order("email");

      if (error) throw error;
      return (data || []).map((u: any) => ({
        email: u.email,
        personaId: u.personas?.id,
        nombre: u.personas?.nombre_legal || u.email,
      })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: isSuperAdmin,
  });

  return (
    <div className="flex items-center gap-2">
      <UserSearch className="h-4 w-4 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full sm:w-[260px] justify-between h-8 text-sm">
            {isImpersonating ? (
              <span className="truncate">{impersonatedClienteName}</span>
            ) : (
              <span className="text-muted-foreground">Seleccionar cliente...</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full sm:w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar cliente..." />
            <CommandList>
              <CommandEmpty>No se encontró el cliente.</CommandEmpty>
              <CommandGroup>
                {clients.map((client: any) => (
                  <CommandItem
                    key={client.email}
                    value={`${client.nombre} ${client.email}`}
                    onSelect={() => {
                      setImpersonatedCliente(client.email, client.personaId, client.nombre);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", impersonatedClienteEmail === client.email ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="text-sm">{client.nombre}</span>
                      <span className="text-xs text-muted-foreground">{client.email}</span>
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
