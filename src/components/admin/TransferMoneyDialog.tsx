import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface CuentaCobranza {
  id: number;
  precio_final: number;
  compradores: Array<{
    nombre_legal: string;
    rfc: string | null;
  }>;
  proyecto: string;
  numero_propiedad: string;
}

interface TransferMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaOrigen: CuentaCobranza | null;
  onTransfer: (cuentaDestinoId: number) => void;
}

export function TransferMoneyDialog({
  open,
  onOpenChange,
  cuentaOrigen,
  onTransfer,
}: TransferMoneyDialogProps) {
  const [selectedCuentaDestino, setSelectedCuentaDestino] = useState<string>("");
  const [pagosTotales, setPagosTotales] = useState<number>(0);
  const { toast } = useToast();

  // Fetch available accounts for transfer
  const { data: cuentasDisponibles } = useQuery({
    queryKey: ["cuentas_cobranza_disponibles", cuentaOrigen?.id],
    queryFn: async () => {
      if (!cuentaOrigen) return [];

      // Get basic cuenta cobranza data
      const { data: cuentas, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          precio_final,
          id_oferta,
          activo
        `)
        .eq('activo', true)
        .neq('id', cuentaOrigen.id);

      if (cuentasError) throw cuentasError;
      if (!cuentas || cuentas.length === 0) return [];

      // Get ofertas with properties
      const ofertaIds = cuentas.map(c => c.id_oferta);
      const { data: ofertas, error: ofertasError } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          propiedades!ofertas_id_propiedad_fkey(
            numero_propiedad,
            id_entidad_relacionada_dueno
          )
        `)
        .in('id', ofertaIds);

      if (ofertasError) throw ofertasError;

      // Get compradores
      const cuentaIds = cuentas.map(c => c.id);
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza,
          personas!compradores_id_persona_fkey(nombre_legal, rfc)
        `)
        .in('id_cuenta_cobranza', cuentaIds);

      // Get entidades relacionadas and proyectos
      const entidadIds = ofertas?.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const { data: entidades } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
        `)
        .in('id', entidadIds);

      return cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const entidad = entidades?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const cuentaCompradores = compradores?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];

        return {
          id: cuenta.id,
          precio_final: cuenta.precio_final || 0,
          compradores: cuentaCompradores.map(c => ({
            nombre_legal: c.personas?.nombre_legal || '',
            rfc: c.personas?.rfc || null
          })),
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número'
        };
      });
    },
    enabled: open && !!cuentaOrigen,
  });

  // Get total payments for the source account
  useEffect(() => {
    if (!cuentaOrigen || !open) return;

    const fetchTotalPayments = async () => {
      const { data: aplicaciones, error } = await supabase
        .from('aplicaciones_pago')
        .select(`
          monto,
          id_pago
        `)
        .eq('activo', true);

      if (error) {
        console.error('Error fetching aplicaciones:', error);
        return;
      }

      if (!aplicaciones || aplicaciones.length === 0) {
        setPagosTotales(0);
        return;
      }

      // Get pagos for this cuenta
      const pagoIds = aplicaciones.map(ap => ap.id_pago);
      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('id, id_cuenta_cobranza')
        .in('id', pagoIds)
        .eq('id_cuenta_cobranza', cuentaOrigen.id);

      if (pagosError) {
        console.error('Error fetching pagos:', pagosError);
        return;
      }

      const validPagoIds = pagos?.map(p => p.id) || [];
      const totalPagado = aplicaciones
        .filter(ap => validPagoIds.includes(ap.id_pago))
        .reduce((sum, ap) => sum + (ap.monto || 0), 0);

      setPagosTotales(totalPagado);
    };

    fetchTotalPayments();
  }, [cuentaOrigen, open]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const handleTransfer = () => {
    if (!selectedCuentaDestino) {
      toast({
        title: "Error",
        description: "Debe seleccionar una cuenta de destino",
        variant: "destructive",
      });
      return;
    }

    onTransfer(parseInt(selectedCuentaDestino));
    onOpenChange(false);
    setSelectedCuentaDestino("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transferir Dinero</DialogTitle>
          <DialogDescription>
            Seleccione la cuenta de destino para transferir los pagos realizados a esta cuenta de cobranza.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información de la cuenta origen */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Cuenta de Origen</h4>
            <div className="space-y-2">
              <div>
                <strong>ID:</strong> CC-{String(cuentaOrigen?.id || 0).padStart(6, '0')}
              </div>
              <div>
                <strong>Proyecto:</strong> {cuentaOrigen?.proyecto}
              </div>
              <div>
                <strong>Propiedad:</strong> {cuentaOrigen?.numero_propiedad}
              </div>
              <div>
                <strong>Compradores:</strong>
                <div className="flex flex-wrap gap-1 mt-1">
                  {cuentaOrigen?.compradores.map((comprador, index) => (
                    <Badge key={index} variant="secondary">
                      {comprador.nombre_legal}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <strong>Total Pagado:</strong> {formatCurrency(pagosTotales)}
              </div>
            </div>
          </div>

          {/* Selección de cuenta destino */}
          <div className="space-y-2">
            <Label htmlFor="cuenta-destino">Cuenta de Destino</Label>
            <Select value={selectedCuentaDestino} onValueChange={setSelectedCuentaDestino}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione una cuenta de destino" />
              </SelectTrigger>
              <SelectContent>
                {cuentasDisponibles?.map((cuenta) => (
                  <SelectItem key={cuenta.id} value={cuenta.id.toString()}>
                    <div className="flex flex-col">
                      <div className="font-medium">
                        CC-{String(cuenta.id).padStart(6, '0')} - {cuenta.proyecto}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Propiedad: {cuenta.numero_propiedad} | 
                        Compradores: {cuenta.compradores.map(c => c.nombre_legal).join(', ')}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pagosTotales > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h4 className="text-yellow-800 font-medium mb-2">⚠️ Advertencia</h4>
              <p className="text-yellow-700 text-sm">
                Esta cuenta tiene pagos por un total de {formatCurrency(pagosTotales)}. 
                Al transferir el dinero, todos los pagos aplicados a esta cuenta se reasignarán 
                a la cuenta de destino seleccionada.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={!selectedCuentaDestino}>
            Transferir Dinero
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}