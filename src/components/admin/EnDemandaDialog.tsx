import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface EnDemandaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  propiedadId?: number;
}

export function EnDemandaDialog({ isOpen, onClose, cuentaCobranzaId, propiedadId }: EnDemandaDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleConfirm = async () => {
    if (!propiedadId) {
      toast({
        title: "Error",
        description: "No se encontró la propiedad asociada a esta cuenta",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update property status to "En demanda" (id=11)
      const { error: propError } = await supabase
        .from('propiedades')
        .update({ 
          id_estatus_disponibilidad: 11,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', propiedadId);

      if (propError) throw propError;

      toast({
        title: "Propiedad en demanda",
        description: "La cuenta ha sido bloqueada y la propiedad marcada como 'En demanda'. No podrá reasignarse hasta que termine el juicio.",
      });

      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["propiedades"] });
      onClose();
    } catch (error) {
      console.error('Error setting property as En demanda:', error);
      toast({
        title: "Error",
        description: "No se pudo marcar la propiedad como 'En demanda'",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Marcar como En Demanda
          </DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-4">
            <p className="font-medium text-foreground">
              Esta acción tiene las siguientes consecuencias:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>La cuenta de cobranza quedará <span className="font-semibold text-amber-600">bloqueada</span> para cualquier modificación</li>
              <li>La propiedad <span className="font-semibold text-amber-600">no podrá reasignarse</span> a otra persona</li>
              <li>Este estado permanecerá hasta que se termine el juicio de demanda</li>
            </ul>
            <p className="text-sm mt-4">
              ¿Está seguro de que desea continuar?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm} 
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? "Procesando..." : "Confirmar En Demanda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
