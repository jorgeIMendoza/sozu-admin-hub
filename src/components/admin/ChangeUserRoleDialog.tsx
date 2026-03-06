import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Combobox } from "@/components/ui/combobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Check, ChevronsUpDown } from "lucide-react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

// Role IDs
const ROLE_ADMINISTRADOR_PROYECTO = 2;
const ROLE_AGENTE_INMOBILIARIO = 3;
const ROLE_INMOBILIARIA = 4;

// Roles that require an inmobiliaria selector
const ROLES_CON_INMOBILIARIA = [ROLE_AGENTE_INMOBILIARIO, ROLE_INMOBILIARIA];

// Roles that Administrador de Proyecto can assign
const ROLES_ADMINISTRADOR_PROYECTO_PUEDE_ASIGNAR = [ROLE_AGENTE_INMOBILIARIO, ROLE_INMOBILIARIA];

interface ChangeUserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  userName: string;
  currentRoleId: number | null;
}

type Role = {
  id: number;
  nombre: string;
};

type InmobiliariaOption = {
  value: string; // entidad_relacionada.id
  label: string;
  idPersona: number;
};

export function ChangeUserRoleDialog({ 
  open, 
  onOpenChange, 
  userEmail, 
  userName, 
  currentRoleId 
}: ChangeUserRoleDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(currentRoleId?.toString() || "");
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<string>("");
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();
  const { profile } = useAuth();

  // Check if current user is Administrador de Proyecto
  const isAdministradorProyecto = profile?.rol_id === ROLE_ADMINISTRADOR_PROYECTO;

  const requiresInmobiliaria = ROLES_CON_INMOBILIARIA.includes(parseInt(selectedRoleId));

  // Fetch roles (only internal roles)
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre')
        .eq('activo', true)
        .eq('es_rol_interno', true)
        .order('nombre');
      
      if (error) throw error;
      return (data || []) as Role[];
    },
  });

  // Fetch inmobiliarias activas
  const { data: inmobiliariaOptions = [] } = useQuery({
    queryKey: ['inmobiliarias-for-role-change'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('entidades_relacionadas')
        .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_comercial, nombre_legal)')
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .order('id');
      
      if (error) throw error;
      return (data || []).map((e: any) => ({
        value: e.id.toString(),
        label: e.personas?.nombre_comercial || e.personas?.nombre_legal || `Inmobiliaria #${e.id}`,
        idPersona: e.id_persona,
      })) as InmobiliariaOption[];
    },
    enabled: open,
  });

  // Fetch current user's inmobiliaria association to pre-select
  const { data: currentInmobiliaria } = useQuery({
    queryKey: ['user-current-inmobiliaria', userEmail],
    queryFn: async () => {
      // Get user's id_persona
      const { data: usuario } = await (supabase as any)
        .from('usuarios')
        .select('id_persona')
        .eq('email', userEmail)
        .maybeSingle();
      
      if (!usuario?.id_persona) return null;

      // Find the entidad_relacionada for this persona with tipo 5
      const { data: entidad } = await (supabase as any)
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', usuario.id_persona)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .order('id')
        .maybeSingle();

      if (entidad) return entidad.id.toString();

      // Fallback: check proyectos_acceso for id_entidad_relacionada_dueno
      const { data: accesos } = await (supabase as any)
        .from('proyectos_acceso')
        .select('id_entidad_relacionada_dueno')
        .eq('usuario_id', userEmail)
        .eq('activo', true)
        .not('id_entidad_relacionada_dueno', 'is', null)
        .limit(1);

      if (accesos && accesos.length > 0) {
        return accesos[0].id_entidad_relacionada_dueno.toString();
      }

      return null;
    },
    enabled: open && ROLES_CON_INMOBILIARIA.includes(currentRoleId || 0),
  });

  // Pre-select inmobiliaria when data loads
  useEffect(() => {
    if (currentInmobiliaria && !selectedInmobiliariaId) {
      setSelectedInmobiliariaId(currentInmobiliaria);
    }
  }, [currentInmobiliaria]);

  // Filter roles based on current user's role
  const availableRoles = useMemo(() => {
    if (isAdministradorProyecto) {
      return roles.filter(rol => ROLES_ADMINISTRADOR_PROYECTO_PUEDE_ASIGNAR.includes(rol.id));
    }
    return roles;
  }, [roles, isAdministradorProyecto]);

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ email, roleId, inmobiliariaEntidadId }: { email: string; roleId: number; inmobiliariaEntidadId?: string }) => {
      const updateData: any = { rol_id: roleId };

      // If assigning Inmobiliaria role and an agency was selected, update id_persona
      if (roleId === ROLE_INMOBILIARIA && inmobiliariaEntidadId) {
        const selectedInmob = inmobiliariaOptions.find(o => o.value === inmobiliariaEntidadId);
        if (selectedInmob) {
          updateData.id_persona = selectedInmob.idPersona;
        }
      }

      const { error } = await supabase
        .from('usuarios')
        .update(updateData)
        .eq('email', email);
      
      if (error) throw error;

      // Sync proyectos_acceso if inmobiliaria was selected
      if (inmobiliariaEntidadId && ROLES_CON_INMOBILIARIA.includes(roleId)) {
        // Update existing project access records to point to the new inmobiliaria
        await (supabase as any)
          .from('proyectos_acceso')
          .update({ id_entidad_relacionada_dueno: parseInt(inmobiliariaEntidadId) })
          .eq('usuario_id', email)
          .eq('activo', true);
      }

      // If moving away from Inmobiliaria/Agent role, clear the owner link
      if (currentRoleId && ROLES_CON_INMOBILIARIA.includes(currentRoleId) && !ROLES_CON_INMOBILIARIA.includes(roleId)) {
        await (supabase as any)
          .from('proyectos_acceso')
          .update({ id_entidad_relacionada_dueno: null })
          .eq('usuario_id', email)
          .eq('activo', true);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success(`Rol actualizado correctamente para ${userName}`);
      
      // Registrar actividad
      const rolAnterior = roles.find(r => r.id === currentRoleId)?.nombre;
      const rolNuevo = roles.find(r => r.id === variables.roleId)?.nombre;
      registrarActualizacion('usuario_rol', 
        { email: userEmail, rol_id: currentRoleId, rol_nombre: rolAnterior },
        { email: userEmail, rol_id: variables.roleId, rol_nombre: rolNuevo }
      );
      
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Error al actualizar el rol: " + error.message);
    },
  });

  const handleSubmit = () => {
    if (!selectedRoleId) {
      toast.error("Debes seleccionar un rol");
      return;
    }
    if (requiresInmobiliaria && !selectedInmobiliariaId) {
      toast.error("Debes seleccionar una inmobiliaria");
      return;
    }
    updateRoleMutation.mutate({ 
      email: userEmail, 
      roleId: parseInt(selectedRoleId),
      inmobiliariaEntidadId: requiresInmobiliaria ? selectedInmobiliariaId : undefined
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedRoleId(currentRoleId?.toString() || "");
      setSelectedInmobiliariaId("");
    }
    onOpenChange(newOpen);
  };

  const canSave = selectedRoleId 
    && (selectedRoleId !== currentRoleId?.toString() || (requiresInmobiliaria && selectedInmobiliariaId))
    && (!requiresInmobiliaria || selectedInmobiliariaId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Cambiar Rol de Usuario
          </DialogTitle>
          <DialogDescription>
            Cambiar el rol de <strong>{userName}</strong> ({userEmail})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">Nuevo rol</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between",
                    !selectedRoleId && "text-muted-foreground"
                  )}
                >
                  {selectedRoleId
                    ? availableRoles.find((role) => role.id.toString() === selectedRoleId)?.nombre
                    : "Selecciona un rol"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar rol..." />
                  <CommandList>
                    <CommandEmpty>No se encontró el rol.</CommandEmpty>
                    <CommandGroup>
                      {availableRoles.map((role) => (
                        <CommandItem
                          key={role.id}
                          value={role.nombre}
                          onSelect={() => setSelectedRoleId(role.id.toString())}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedRoleId === role.id.toString()
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {role.nombre}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {requiresInmobiliaria && (
            <div className="space-y-2">
              <Label>Inmobiliaria</Label>
              <Combobox
                value={selectedInmobiliariaId}
                onValueChange={setSelectedInmobiliariaId}
                options={inmobiliariaOptions.map(o => ({ value: o.value, label: o.label }))}
                placeholder="Selecciona una inmobiliaria"
                searchPlaceholder="Buscar inmobiliaria..."
                emptyText="No se encontró la inmobiliaria."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={updateRoleMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateRoleMutation.isPending || !canSave}
          >
            {updateRoleMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
