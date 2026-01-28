import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  userName: string;
}

export function EditUserDialog({
  open,
  onOpenChange,
  userEmail,
  userName,
}: EditUserDialogProps) {
  const [nombre, setNombre] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setNombre(userName);
      setEmail(userEmail);
    }
  }, [open, userName, userEmail]);

  const updateUserMutation = useMutation({
    mutationFn: async ({ oldEmail, newEmail, newNombre }: { oldEmail: string; newEmail: string; newNombre: string }) => {
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

      return { oldEmail, newEmail, newNombre };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });

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

    updateUserMutation.mutate({
      oldEmail: userEmail,
      newEmail: email.trim(),
      newNombre: nombre.trim(),
    });
  };

  const hasChanges = nombre !== userName || email !== userEmail;

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
