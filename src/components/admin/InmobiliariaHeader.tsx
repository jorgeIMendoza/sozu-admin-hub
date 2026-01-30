import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface InmobiliariaData {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  logo_url?: string;
  email?: string;
  tiene_usuario_principal?: boolean;
}

interface InmobiliariaHeaderProps {
  onInmobiliariaChange: (inmobiliariaId: number | null) => void;
  selectedInmobiliariaId: number | null;
}

export function InmobiliariaHeader({ onInmobiliariaChange, selectedInmobiliariaId }: InmobiliariaHeaderProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  const isInmobiliariaRole = profile?.rol_id === 4;

  // Fetch all inmobiliarias with their principal user status for Super Admin
  const { data: inmobiliarias = [], isLoading: loadingInmobiliarias } = useQuery({
    queryKey: ['all-inmobiliarias-header-with-principal'],
    queryFn: async () => {
      // Get entidades_relacionadas of type 5 (Inmobiliarias)
      const { data: entidades, error: entidadesError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_tipo_entidad', 5)
        .eq('activo', true);

      if (entidadesError) throw entidadesError;

      const personaIds = (entidades || []).map((e: any) => e.id_persona).filter(Boolean);
      if (personaIds.length === 0) return [];

      const { data: personas, error: personasError } = await (supabase as any)
        .from('personas')
        .select('id, nombre_legal, nombre_comercial, url_logo, email')
        .in('id', personaIds)
        .eq('activo', true)
        .order('nombre_legal');

      if (personasError) throw personasError;

      // Get all users with Inmobiliaria role (4) to check for principal users
      const { data: usuariosInmobiliaria, error: usuariosError } = await supabase
        .from('usuarios')
        .select('email, id_persona, personas!inner(email)')
        .eq('rol_id', 4)
        .eq('activo', true);

      if (usuariosError) throw usuariosError;

      // Create a set of persona IDs that have a principal user
      const personasConPrincipal = new Set<number>();
      (usuariosInmobiliaria || []).forEach((u: any) => {
        // Usuario principal = email matches persona email
        if (u.id_persona && u.personas?.email && u.email.toLowerCase() === u.personas.email.toLowerCase()) {
          personasConPrincipal.add(u.id_persona);
        }
      });

      return (personas || [])
        .map((p: any) => ({
          id: p.id,
          nombre_legal: p.nombre_legal,
          nombre_comercial: p.nombre_comercial,
          logo_url: p.url_logo,
          email: p.email,
          tiene_usuario_principal: personasConPrincipal.has(p.id),
        }))
        .filter((p: InmobiliariaData) => p.tiene_usuario_principal) as InmobiliariaData[];
    },
    enabled: isSuperAdmin,
  });

  // For Inmobiliaria role, get their own inmobiliaria data
  const { data: userInmobiliaria, isLoading: loadingUserInmobiliaria } = useQuery({
    queryKey: ['user-inmobiliaria-header', profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return null;

      // The user's persona is the inmobiliaria
      const { data, error } = await (supabase as any)
        .from('personas')
        .select('id, nombre_legal, nombre_comercial, url_logo')
        .eq('id', profile.id_persona)
        .single();

      if (error) return null;

      return {
        id: data.id,
        nombre_legal: data.nombre_legal,
        nombre_comercial: data.nombre_comercial,
        logo_url: data.url_logo,
      } as InmobiliariaData;
    },
    enabled: isInmobiliariaRole && !!profile?.id_persona,
  });

  // Auto-select for Inmobiliaria role
  useEffect(() => {
    if (isInmobiliariaRole && userInmobiliaria && selectedInmobiliariaId !== userInmobiliaria.id) {
      onInmobiliariaChange(userInmobiliaria.id);
    }
  }, [isInmobiliariaRole, userInmobiliaria, selectedInmobiliariaId, onInmobiliariaChange]);

  // Auto-select first inmobiliaria for Super Admin if none selected
  useEffect(() => {
    if (isSuperAdmin && inmobiliarias.length > 0 && !selectedInmobiliariaId) {
      onInmobiliariaChange(inmobiliarias[0].id);
    }
  }, [isSuperAdmin, inmobiliarias, selectedInmobiliariaId, onInmobiliariaChange]);

  const isLoading = loadingInmobiliarias || loadingUserInmobiliaria;

  const selectedInmobiliaria = useMemo(() => 
    inmobiliarias.find(i => i.id === selectedInmobiliariaId),
    [inmobiliarias, selectedInmobiliariaId]
  );

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-6 w-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Super Admin: Show searchable selector
  if (isSuperAdmin) {
    return (
      <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-muted-foreground">Selecciona Inmobiliaria:</span>
            </div>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full sm:w-[350px] justify-between"
                >
                  {selectedInmobiliaria ? (
                    <div className="flex items-center gap-2">
                      {selectedInmobiliaria.logo_url && (
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={selectedInmobiliaria.logo_url} alt={selectedInmobiliaria.nombre_legal} />
                          <AvatarFallback className="text-[10px]">
                            {selectedInmobiliaria.nombre_legal.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span className="truncate">
                        {selectedInmobiliaria.nombre_comercial || selectedInmobiliaria.nombre_legal}
                      </span>
                    </div>
                  ) : (
                    "Selecciona una inmobiliaria"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full sm:w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar inmobiliaria..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron inmobiliarias.</CommandEmpty>
                    <CommandGroup>
                      {inmobiliarias.map((inmobiliaria) => (
                        <CommandItem
                          key={inmobiliaria.id}
                          value={`${inmobiliaria.nombre_comercial || ''} ${inmobiliaria.nombre_legal}`}
                          onSelect={() => {
                            onInmobiliariaChange(inmobiliaria.id);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedInmobiliariaId === inmobiliaria.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex items-center gap-2">
                            {inmobiliaria.logo_url ? (
                              <Avatar className="h-6 w-6 ring-1 ring-border bg-muted">
                                <AvatarImage src={inmobiliaria.logo_url} alt={inmobiliaria.nombre_legal} className="object-contain p-0.5" />
                                <AvatarFallback className="text-[10px]">
                                  {inmobiliaria.nombre_legal.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                            <span>{inmobiliaria.nombre_comercial || inmobiliaria.nombre_legal}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Inmobiliaria role: Show white-label header
  if (isInmobiliariaRole && userInmobiliaria) {
    return (
      <Card className="mb-6 border-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shadow-md">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
              {userInmobiliaria.logo_url ? (
                <AvatarImage 
                  src={userInmobiliaria.logo_url} 
                  alt={userInmobiliaria.nombre_legal}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {userInmobiliaria.nombre_legal.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {userInmobiliaria.nombre_comercial || userInmobiliaria.nombre_legal}
              </h2>
              {userInmobiliaria.nombre_comercial && userInmobiliaria.nombre_comercial !== userInmobiliaria.nombre_legal && (
                <p className="text-sm text-muted-foreground">
                  {userInmobiliaria.nombre_legal}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
