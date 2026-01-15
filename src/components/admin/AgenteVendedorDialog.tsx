import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Building2 } from "lucide-react";

interface AgenteVendedorInfo {
  nombre: string;
  email: string;
  telefono: string | null;
  tipoAgente: 'interno' | 'inmobiliario' | 'otro';
  organizacion: string | null;
  rolNombre?: string;
}

interface AgenteVendedorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agente: AgenteVendedorInfo | null;
}

export function AgenteVendedorDialog({ isOpen, onClose, agente }: AgenteVendedorDialogProps) {
  if (!agente) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalles del Agente Vendedor
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">{agente.nombre}</p>
              {agente.tipoAgente === 'interno' && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Agente Sozu
                </Badge>
              )}
              {agente.tipoAgente === 'inmobiliario' && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  Agente Inmobiliario
                </Badge>
              )}
              {agente.tipoAgente === 'otro' && (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">
                  {agente.rolNombre || 'Usuario'}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Correo:</span>
              <a href={`mailto:${agente.email}`} className="text-primary hover:underline">
                {agente.email}
              </a>
            </div>

            {agente.telefono && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Teléfono:</span>
                <a href={`tel:${agente.telefono}`} className="text-primary hover:underline">
                  {agente.telefono}
                </a>
              </div>
            )}

            {agente.organizacion && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Organización:</span>
                <span className="font-medium">{agente.organizacion}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { AgenteVendedorInfo };
