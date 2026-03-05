import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Building2, Check, ChevronsUpDown, Mail, MailCheck, MailX } from "lucide-react";
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
const ROLE_INMOBILIARIA = 4;

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
  const isInmobiliariaRole = userRoleId === ROLE_INMOBILIARIA;
  const needsInmobiliaria = isAgentRole || isInmobiliariaRole;
  const showEmailConfirmation = userRoleId === ROLE_AGENTE_INMOBILIARIO || userRoleId === ROLE_INMOBILIARIA;

  // Fetch email confirmation status
  const { data: emailConfirmado, isLoading: isLoadingConfirmation } = useQuery({
    queryKey: ['email_confirmado', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('email_confirmado')
        .eq('email', userEmail)
        .maybeSingle();
      if (error) throw error;
      return data?.email_confirmado ?? true;
    },
    enabled: open && showEmailConfirmation,
  });

  // Fetch inmobiliarias options
  const { data: inmobiliariasOptions = [] } = useQuery({
    queryKey: ['inmobiliarias_options_edit'],
    queryFn: async () => {
      const { data: entidadesData, error: entidadesError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_tipo_entidad', 5)
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
    enabled: open && needsInmobiliaria,
  });

  // Fetch current inmobiliaria for this agent (via entidades_relacionadas tipo 19)
  const { data: currentAgentInmobiliaria, isLoading: isLoadingAgentInmob } = useQuery({
    queryKey: ['agent_inmobiliaria', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return null;
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona_duena_lead')
        .eq('id_persona', userPersonaId)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true)
        .maybeSingle();
      
      if (error) throw error;
      return data?.id_persona_duena_lead || null;
    },
    enabled: open && isAgentRole && !!userPersonaId,
  });

  // Fetch current inmobiliaria for Inmobiliaria role users (via proyectos_acceso)
  const { data: currentInmobInmobiliaria, isLoading: isLoadingInmobInmob } = useQuery({
    queryKey: ['inmob_user_inmobiliaria', userEmail],
    queryFn: async () => {
      if (!userEmail) return null;
      
      const { data: accesos } = await supabase
        .from('proyectos_acceso')
        .select('id_entidad_relacionada_dueno')
        .eq('usuario_id', userEmail)
        .not('id_entidad_relacionada_dueno', 'is', null)
        .eq('activo', true)
        .limit(1);
      
      if (accesos && accesos.length > 0) {
        const erDueno = accesos[0].id_entidad_relacionada_dueno;
        const { data: er } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona')
          .eq('id', erDueno)
          .eq('id_tipo_entidad', 5)
          .maybeSingle();
        return er?.id_persona || null;
      }
      return null;
    },
    enabled: open && isInmobiliariaRole,
  });

  const currentInmobiliaria = isAgentRole ? currentAgentInmobiliaria : currentInmobInmobiliaria;
  const isLoadingInmobiliaria = isAgentRole ? isLoadingAgentInmob : isLoadingInmobInmob;

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setNombre(userName);
      setEmail(userEmail);
    }
  }, [open, userName, userEmail]);

  // Set inmobiliaria when data is loaded
  useEffect(() => {
    if (open && needsInmobiliaria && !isLoadingInmobiliaria) {
      const inmobId = currentInmobiliaria?.toString() || "";
      setSelectedInmobiliariaId(inmobId);
      setOriginalInmobiliariaId(inmobId);
    }
  }, [open, needsInmobiliaria, isLoadingInmobiliaria, currentInmobiliaria]);

  // Resend confirmation email mutation
  const resendConfirmationMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reenviar-confirmacion-email', {
        body: { email: userEmail },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Correo enviado",
        description: "Se reenvió el correo de confirmación.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

        // If email changed for a role that needs confirmation, mark as unconfirmed
        if (showEmailConfirmation) {
          await supabase
            .from('usuarios')
            .update({ email_confirmado: false })
            .eq('email', newEmail);
        }
      }

      // If inmobiliaria changed for agent role, update entidades_relacionadas
      if (isAgentRole && personaId && newInmobiliariaId !== undefined) {
        const { data: existingEntidad } = await supabase
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', personaId)
          .eq('id_tipo_entidad', 19)
          .eq('activo', true)
          .maybeSingle();

        if (existingEntidad) {
          const { error: updateError } = await supabase
            .from('entidades_relacionadas')
            .update({ 
              id_persona_duena_lead: newInmobiliariaId,
              fecha_actualizacion: new Date().toISOString()
            })
            .eq('id', existingEntidad.id);
          
          if (updateError) throw updateError;
        } else {
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
            .maybeSingle();

        if (inmobiliariaPersona?.email) {
          const { data: inmobiliariaAccess } = await supabase
            .from("proyectos_acceso")
            .select("proyecto_id, id_entidad_relacionada_dueno")
            .eq("usuario_id", inmobiliariaPersona.email)
            .eq("activo", true);

          if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
            const finalEmail = oldEmail !== newEmail ? newEmail : oldEmail;
            const { data: existingAccess } = await supabase
              .from("proyectos_acceso")
              .select("proyecto_id")
              .eq("usuario_id", finalEmail)
              .eq("activo", true);

            const existingProjectIds = new Set((existingAccess || []).map(a => a.proyecto_id));

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

      // If inmobiliaria changed for Inmobiliaria role, update proyectos_acceso
      if (isInmobiliariaRole && newInmobiliariaId !== undefined) {
        const finalEmail = oldEmail !== newEmail ? newEmail : oldEmail;
        
        // Resolve the entidad_relacionada ID for the new inmobiliaria
        const { data: inmobEntidad, error: inmobEntidadError } = await supabase
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', newInmobiliariaId)
          .eq('id_tipo_entidad', 5)
          .eq('activo', true)
          .maybeSingle();

        if (inmobEntidadError) {
          console.error('Error finding inmobiliaria entity:', inmobEntidadError);
          throw inmobEntidadError;
        }

        if (!inmobEntidad) {
          throw new Error('No se encontró la entidad de la inmobiliaria seleccionada.');
        }

          // Update existing proyectos_acceso entries
          const { error: updateAccesoError } = await supabase
            .from('proyectos_acceso')
            .update({ 
              id_entidad_relacionada_dueno: inmobEntidad.id,
              fecha_actualizacion: new Date().toISOString()
            })
            .eq('usuario_id', finalEmail);
          
          if (updateAccesoError) {
            console.error('Error updating proyectos_acceso:', updateAccesoError);
            throw updateAccesoError;
          }

          // Also copy any project access from the inmobiliaria primary user
          const { data: inmobiliariaPersona } = await supabase
            .from("personas")
            .select("email")
            .eq("id", newInmobiliariaId)
            .maybeSingle();

          if (inmobiliariaPersona?.email) {
            const { data: inmobiliariaAccess } = await supabase
              .from("proyectos_acceso")
              .select("proyecto_id")
              .eq("usuario_id", inmobiliariaPersona.email)
              .eq("activo", true);

            if (inmobiliariaAccess && inmobiliariaAccess.length > 0) {
              const { data: existingAccess } = await supabase
                .from("proyectos_acceso")
                .select("proyecto_id")
                .eq("usuario_id", finalEmail)
                .eq("activo", true);

              const existingProjectIds = new Set((existingAccess || []).map(a => a.proyecto_id));

              const newAccessEntries = inmobiliariaAccess
                .filter(access => !existingProjectIds.has(access.proyecto_id))
                .map(access => ({
                  usuario_id: finalEmail,
                  proyecto_id: access.proyecto_id,
                  id_entidad_relacionada_dueno: inmobEntidad.id,
                  activo: true
                }));

              if (newAccessEntries.length > 0) {
                const { error: insertAccesoError } = await supabase
                  .from("proyectos_acceso")
                  .insert(newAccessEntries);
                if (insertAccesoError) {
                  console.error('Error inserting proyectos_acceso:', insertAccesoError);
                  throw insertAccesoError;
                }
                console.log(`Added ${newAccessEntries.length} project access entries for inmobiliaria user`);
              }
            }
          }
        }

      return { oldEmail, newEmail, newNombre, newInmobiliariaId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      queryClient.invalidateQueries({ queryKey: ['agent_inmobiliaria'] });
      queryClient.invalidateQueries({ queryKey: ['inmob_user_inmobiliaria'] });
      queryClient.invalidateQueries({ queryKey: ['email_confirmado'] });

      registrarActualizacion('usuario', 
        { email: data.oldEmail, nombre: userName },
        { email: data.newEmail, nombre: data.newNombre }
      );

      toast({
        title: "Usuario actualizado",
        description: data.oldEmail !== data.newEmail && showEmailConfirmation
          ? "Usuario actualizado. El email cambió, se requiere nueva confirmación."
          : "Los datos del usuario se han actualizado correctamente.",
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

    // Inmobiliaria change support for agents and Inmobiliaria role
    updateUserMutation.mutate({
      oldEmail: userEmail,
      newEmail: email.trim(),
      newNombre: nombre.trim(),
      newInmobiliariaId: needsInmobiliaria && selectedInmobiliariaId ? parseInt(selectedInmobiliariaId) : undefined,
      personaId: userPersonaId,
    });
  };

  const inmobiliariaChanged = needsInmobiliaria && selectedInmobiliariaId !== originalInmobiliariaId;
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
          {/* Email confirmation status for Agente Inmobiliario / Inmobiliaria */}
          {showEmailConfirmation && !isLoadingConfirmation && (
            <div className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              emailConfirmado 
                ? "bg-green-500/5 border-green-500/20" 
                : "bg-orange-500/5 border-orange-500/20"
            )}>
              <div className="flex items-center gap-2">
                {emailConfirmado ? (
                  <MailCheck className="h-4 w-4 text-green-600" />
                ) : (
                  <MailX className="h-4 w-4 text-orange-600" />
                )}
                <span className={cn("text-sm font-medium", emailConfirmado ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400")}>
                  {emailConfirmado ? "Email confirmado" : "Email pendiente de confirmación"}
                </span>
              </div>
              {!emailConfirmado && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendConfirmationMutation.mutate()}
                  disabled={resendConfirmationMutation.isPending}
                  className="text-xs h-7 hover:bg-orange-500/10 hover:border-orange-500 hover:text-orange-600"
                >
                  {resendConfirmationMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Mail className="h-3 w-3 mr-1" />
                  )}
                  Reenviar
                </Button>
              )}
            </div>
          )}

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
            {email !== userEmail && showEmailConfirmation && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                ⚠ Al cambiar el email, se requerirá nueva confirmación por correo.
              </p>
            )}
          </div>

          {/* Inmobiliaria selector - for agent and Inmobiliaria roles */}
          {needsInmobiliaria && (
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
              ) : userRoleId === ROLE_AGENTE_INTERNO ? (
                <div className="flex items-center gap-2">
                  <Input
                    value="Real Estate Ventures (Sozu)"
                    disabled
                    className="bg-muted"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">(Bloqueado)</span>
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
