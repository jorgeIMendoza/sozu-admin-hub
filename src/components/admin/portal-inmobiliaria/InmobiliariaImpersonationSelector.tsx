import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaImpersonation } from "@/contexts/InmobiliariaImpersonationContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, Building2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function InmobiliariaImpersonationSelector() {
  const { profile } = useAuth();
  const {
    impersonatedInmobiliariaEmail,
    impersonatedInmobiliariaName,
    setImpersonatedInmobiliaria,
    clearImpersonation,
    isImpersonating,
  } = useInmobiliariaImpersonation();
  const [open, setOpen] = useState(false);

  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  if (!isSuperAdmin) return null;

  const { data: inmobiliarias = [] } = useQuery({
    queryKey: ["all-inmobiliarias-for-impersonation"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("usuarios")
        .select("email, rol_id, personas!inner(id, nombre_legal, nombre_comercial)")
        .eq("rol_id", 4)
        .eq("activo", true)
        .order("email");

      if (error) throw error;
      return (data || [])
        .map((u: any) => ({
          email: u.email,
          personaId: u.personas?.id,
          nombre: u.personas?.nombre_comercial || u.personas?.nombre_legal || u.email,
        }))
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    },
    enabled: isSuperAdmin,
  });

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full sm:w-[260px] justify-between h-8 text-sm"
          >
            {isImpersonating ? (
              <span className="truncate">{impersonatedInmobiliariaName}</span>
            ) : (
              <span className="text-muted-foreground">Seleccionar inmobiliaria...</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full sm:w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar inmobiliaria..." />
            <CommandList>
              <CommandEmpty>No se encontró la inmobiliaria.</CommandEmpty>
              <CommandGroup>
                {inmobiliarias.map((item: any) => (
                  <CommandItem
                    key={item.email}
                    value={`${item.nombre} ${item.email}`}
                    onSelect={() => {
                      setImpersonatedInmobiliaria(item.email, item.personaId, item.nombre);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        impersonatedInmobiliariaEmail === item.email ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">{item.nombre}</span>
                      <span className="text-xs text-muted-foreground">{item.email}</span>
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
