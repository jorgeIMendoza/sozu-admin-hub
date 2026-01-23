import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Check, ChevronsUpDown } from "lucide-react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { cn } from "@/lib/utils";

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

export function ChangeUserRoleDialog({ 
  open, 
  onOpenChange, 
  userEmail, 
  userName, 
  currentRoleId 
}: ChangeUserRoleDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(currentRoleId?.toString() || "");
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();

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

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ email, roleId }: { email: string; roleId: number }) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ rol_id: roleId })
        .eq('email', email);
      
      if (error) throw error;
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
    updateRoleMutation.mutate({ email: userEmail, roleId: parseInt(selectedRoleId) });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedRoleId(currentRoleId?.toString() || "");
    }
    onOpenChange(newOpen);
  };

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
                    ? roles.find((role) => role.id.toString() === selectedRoleId)?.nombre
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
                      {roles.map((role) => (
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
            disabled={updateRoleMutation.isPending || !selectedRoleId || selectedRoleId === currentRoleId?.toString()}
          >
            {updateRoleMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
