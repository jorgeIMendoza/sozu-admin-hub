import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  userName: string;
  userRoleId?: number;
  userPersonaId?: number;
}

type InmobiliariaOption = {
  id: number;
  nombre: string;
};

const ROLE_AGENTE_INMOBILIARIO = 3;
const ROLE_AGENTE_INTERNO = 9;

export function EditUserDialog({
  open,
  onOpenChange,
  userEmail,
  userName,
  userRoleId,
  userPersonaId,
}: EditUserDialogProps) {
  const [nombre, setNombre] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<string>("");
  const [originalInmobiliariaId, setOriginalInmobiliariaId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();

  const isAgentRole = userRoleId === ROLE_AGENTE_INMOBILIARIO || userRoleId === ROLE_AGENTE_INTERNO;

  // Fetch inmobiliarias options
  const { data: inmobiliariasOptions = [] } = useQuery({
    queryKey: ['inmobiliarias_options_edit'],
    queryFn: async () => {
      const { data: entidadesData, error: entidadesError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_tipo_entidad', 5) // Inmobiliaria
        .eq('activo', true);
      
      if (entidadesError) throw entidadesError;
      
      const personaIds = (entidadesData || []).map(e => e.id_persona).filter(Boolean);
      
      if (personaIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal, nombre_comercial')
        .in('id', personaIds)
        .eq('activo', true)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map(item => ({
        id: item.id,
        nombre: item.nombre_comercial || item.nombre_legal
      })) as InmobiliariaOption[];
    },
    enabled: open && isAgentRole,
  });

  // Fetch current inmobiliaria for this agent
  const { data: currentInmobiliaria, isLoading: isLoadingInmobiliaria } = useQuery({
    queryKey: ['agent_inmobiliaria', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return null;
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona_duena_lead')
        .eq('id_persona', userPersonaId)
        .eq('id_tipo_entidad', 19) // Agente
        .eq('activo', true)
        .maybeSingle();
      
      if (error) throw error;
      return data?.id_persona_duena_lead || null;
    },
    enabled: open && isAgentRole && !!userPersonaId,
  });

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setNombre(userName);
      setEmail(userEmail);
      const inmobId = currentInmobiliaria?.toString() || "";
      setSelectedInmobiliariaId(inmobId);
      setOriginalInmobiliariaId(inmobId);
    }
  }, [open, userName, userEmail, currentInmobiliaria]);

  const updateUserMutation = useMutation({
    mutationFn: async ({ 
      oldEmail, 
      newEmail, 
      newNombre,
      newInmobiliariaId,
      personaId
    }: { 
      oldEmail: string; 
      newEmail: string; 
      newNombre: string;
      newInmobiliariaId?: number;
      personaId?: number;
    }) => {
      // Update nombre in usuarios table
      const { error: nombreError } = await supabase
        .from('usuarios')
        .update({ 
          nombre: newNombre,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('email', oldEmail);

      if (nombreError) throw nombreError;

      // If email changed, use edge function to update both auth.users and usuarios table
      if (oldEmail !== newEmail) {
        const response = await supabase.functions.invoke('update-user-email', {
          body: { oldEmail, newEmail },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        if (response.data && !response.data.success) {
          throw new Error(response.data.message || 'Error al actualizar email');
        }
      }

      // If inmobiliaria changed and user is an agent, update entidades_relacionadas
      if (personaId && newInmobiliariaId !== undefined) {
        const { data: existingEntidad } = await supabase
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', personaId)
          .eq('id_tipo_entidad', 19)
          .eq('activo', true)
          .maybeSingle();

        if (existingEntidad) {
          // Update existing
          const { error: updateError } = await supabase
            .from('entidades_relacionadas')
            .update({ 
              id_persona_duena_lead: newInmobiliariaId,
              fecha_actualizacion: new Date().toISOString()
            })
            .eq('id', existingEntidad.id);
          
          if (updateError) throw updateError;
        } else {
          // Create new
          const { error: insertError } = await supabase
            .from('entidades_relacionadas')
            .insert({
              id_persona: personaId,
              id_tipo_entidad: 19,
              id_persona_duena_lead: newInmobiliariaId,
              activo: true
            });
          
          if (insertError) throw insertError;
        }

        // Copy project access from the inmobiliaria (avoid duplicates)
        const { data: inmobiliariaPersona } = await supabase
          .from("personas")
          .select("email")
          .eq("id", newInmobiliariaId)
          .single();

        if (inmobiliariaPersona?.email) {
          const { data: inmobiliariaAccess } = await supabase
            .from("proyectos_acceso")
            .select("proyecto_id, id_entidad_relacionada_dueno")
            .eq("usuario_id", inmobiliariaPersona.email)
            .eq("activo", true);

          if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
            // Get existing access for this user
            const finalEmail = oldEmail !== newEmail ? newEmail : oldEmail;
            const { data: existingAccess } = await supabase
              .from("proyectos_acceso")
              .select("proyecto_id")
              .eq("usuario_id", finalEmail)
              .eq("activo", true);

            const existingProjectIds = new Set((existingAccess || []).map(a => a.proyecto_id));

            // Only insert access for projects that don't already exist
            const newAccessEntries = inmobiliariaAccess
              .filter(access => !existingProjectIds.has(access.proyecto_id))
              .map(access => ({
                usuario_id: finalEmail,
                proyecto_id: access.proyecto_id,
                id_entidad_relacionada_dueno: access.id_entidad_relacionada_dueno,
                activo: true
              }));

            if (newAccessEntries.length > 0) {
              await supabase
                .from("proyectos_acceso")
                .insert(newAccessEntries);
              
              console.log(`Added ${newAccessEntries.length} new project access entries`);
            }
          }
        }
      }

      return { oldEmail, newEmail, newNombre, newInmobiliariaId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      queryClient.invalidateQueries({ queryKey: ['agent_inmobiliaria'] });

      registrarActualizacion('usuario', 
        { email: data.oldEmail, nombre: userName },
        { email: data.newEmail, nombre: data.newNombre }
      );

      toast({
        title: "Usuario actualizado",
        description: "Los datos del usuario se han actualizado correctamente.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Error al actualizar usuario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!nombre.trim()) {
      toast({
        title: "Error",
        description: "El nombre es requerido.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      toast({
        title: "Error",
        description: "Ingresa un email válido.",
        variant: "destructive",
      });
      return;
    }

    // Validate inmobiliaria for agent roles
    if (isAgentRole && !selectedInmobiliariaId) {
      toast({
        title: "Error",
        description: "Por favor selecciona una inmobiliaria para el agente.",
        variant: "destructive",
      });
      return;
    }

    updateUserMutation.mutate({
      oldEmail: userEmail,
      newEmail: email.trim(),
      newNombre: nombre.trim(),
      newInmobiliariaId: isAgentRole && selectedInmobiliariaId ? parseInt(selectedInmobiliariaId) : undefined,
      personaId: userPersonaId,
    });
  };

  const inmobiliariaChanged = isAgentRole && selectedInmobiliariaId !== originalInmobiliariaId;
  const hasChanges = nombre !== userName || email !== userEmail || inmobiliariaChanged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Usuario
          </DialogTitle>
          <DialogDescription>
            Actualiza el nombre y email del usuario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-nombre">Nombre</Label>
            <Input
              id="edit-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@email.com"
            />
          </div>

          {/* Inmobiliaria selector - only for agent roles */}
          {isAgentRole && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Inmobiliaria
              </Label>
              {isLoadingInmobiliaria ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando...
                </div>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !selectedInmobiliariaId && "text-muted-foreground"
                      )}
                    >
                      {selectedInmobiliariaId
                        ? inmobiliariasOptions.find((inmob) => inmob.id.toString() === selectedInmobiliariaId)?.nombre
                        : "Seleccionar inmobiliaria..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar inmobiliaria..." />
                      <CommandList>
                        <CommandEmpty>No se encontró la inmobiliaria.</CommandEmpty>
                        <CommandGroup>
                          {inmobiliariasOptions.map((inmob) => (
                            <CommandItem
                              key={inmob.id}
                              value={inmob.nombre}
                              onSelect={() => {
                                setSelectedInmobiliariaId(inmob.id.toString());
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedInmobiliariaId === inmob.id.toString()
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {inmob.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {inmobiliariaChanged && (
                <Alert className="bg-amber-500/10 border-amber-500/20">
                  <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                    Al cambiar la inmobiliaria, se heredarán los accesos a proyectos de la nueva inmobiliaria (sin duplicar los existentes).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateUserMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateUserMutation.isPending || !hasChanges}
          >
            {updateUserMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
