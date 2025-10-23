import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle } from "lucide-react";

interface Residente {
  id_persona: number;
  nombre_legal: string;
  activo: boolean;
}

interface ResidentesDetailDialogProps {
  residentes: Residente[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ResidentesDetailDialog = ({ 
  residentes, 
  open, 
  onOpenChange 
}: ResidentesDetailDialogProps) => {
  const residenteActivo = residentes.find(r => r.activo);
  const residentesInactivos = residentes.filter(r => !r.activo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Residentes</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {residenteActivo && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Residente Actual</h4>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium">{residenteActivo.nombre_legal}</span>
              </div>
            </div>
          )}

          {residentesInactivos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Residentes Anteriores</h4>
              <div className="space-y-2">
                {residentesInactivos.map((residente) => (
                  <div 
                    key={residente.id_persona}
                    className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border opacity-60"
                  >
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{residente.nombre_legal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {residentes.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              No hay residentes asignados
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
