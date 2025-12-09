import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield } from "lucide-react";

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

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre')
        .eq('activo', true)
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success(`Rol actualizado correctamente para ${userName}`);
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
            <Select
              value={selectedRoleId}
              onValueChange={setSelectedRoleId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id.toString()}>
                    {role.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
