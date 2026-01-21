import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { CurrencyInput } from "@/components/ui/currency-input";

interface ReventaDialogProps {
  propertyId: number;
  propertyNumber: string;
  currentPrecioFinal: number | null;
  currentPrecioLista: number;
  currentMontoApartado: number | null;
  onSuccess?: () => void;
}

export const ReventaDialog = ({
  propertyId,
  propertyNumber,
  currentPrecioFinal,
  currentPrecioLista,
  currentMontoApartado,
  onSuccess,
}: ReventaDialogProps) => {
  const [open, setOpen] = useState(false);
  const [nuevoPrecioLista, setNuevoPrecioLista] = useState<number>(0);
  const [nuevoMontoApartado, setNuevoMontoApartado] = useState<number>(0);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();

  // Initialize values when dialog opens
  useEffect(() => {
    if (open) {
      // Use precio_final if available, otherwise precio_lista
      const precioInicial = currentPrecioFinal || currentPrecioLista;
      setNuevoPrecioLista(Math.round(precioInicial * 100)); // Convert to cents for CurrencyInput
      setNuevoMontoApartado(Math.round((currentMontoApartado || 0) * 100));
    }
  }, [open, currentPrecioFinal, currentPrecioLista, currentMontoApartado]);

  const reventaMutation = useMutation({
    mutationFn: async () => {
      // 1. Get the ID for "Reventa" transaction type
      const { data: tipoReventa, error: tipoError } = await supabase
        .from('tipos_transaccion')
        .select('id')
        .eq('nombre', 'Reventa')
        .eq('activo', true)
        .single();

      if (tipoError || !tipoReventa) {
        throw new Error('No se encontró el tipo de transacción "Reventa"');
      }

      // 2. Update property: status to Disponible (2), transaction type to Reventa, clear CLABE
      const { error: updateError } = await supabase
        .from('propiedades')
        .update({
          id_estatus_disponibilidad: 2, // Disponible
          id_tipo_transaccion: tipoReventa.id,
          precio_lista: nuevoPrecioLista / 100, // Convert from cents
          monto_apartado: nuevoMontoApartado / 100, // Convert from cents
          clabe_stp_tmp_apartado: null, // Clear temporary CLABE
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', propertyId);

      if (updateError) {
        throw updateError;
      }

      return { tipoReventaId: tipoReventa.id };
    },
    onSuccess: async () => {
      // Log the activity
      await registrarActualizacion(
        'propiedades',
        { id: propertyId, numero_propiedad: propertyNumber },
        { 
          id: propertyId, 
          accion: 'reventa',
          nuevo_precio_lista: nuevoPrecioLista / 100,
          nuevo_monto_apartado: nuevoMontoApartado / 100,
        },
        `Propiedad ${propertyNumber} convertida a reventa`
      );

      toast({
        title: "Propiedad en Reventa",
        description: `La propiedad ${propertyNumber} ahora está disponible para reventa.`,
      });

      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['propiedades'] });
      
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo procesar la reventa",
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (nuevoPrecioLista <= 0) {
      toast({
        title: "Error",
        description: "El precio de lista debe ser mayor a 0",
        variant: "destructive",
      });
      return;
    }
    reventaMutation.mutate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setOpen(true)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Poner en Reventa</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Poner Propiedad en Reventa
            </DialogTitle>
            <DialogDescription>
              Propiedad: <strong>{propertyNumber}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Al confirmar, se realizarán los siguientes cambios:</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>El <strong>tipo de transacción</strong> cambiará a <strong>"Reventa"</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>El <strong>estatus de la propiedad</strong> cambiará a <strong>"Disponible"</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>La <strong>cuenta de cobranza</strong> y <strong>cuenta CLABE</strong> ya no se mostrarán para esta propiedad</span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>Las ofertas futuras solo podrán generarse en modo <strong>Manual</strong></span>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Precio actual (Precio Final)</Label>
                <div className="text-lg font-semibold text-muted-foreground">
                  {formatCurrency(currentPrecioFinal || currentPrecioLista)}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nuevoPrecio">Nuevo Precio de Lista</Label>
                <CurrencyInput
                  value={nuevoPrecioLista}
                  onChange={setNuevoPrecioLista}
                  decimals={2}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Este será el nuevo precio de lista para la propiedad
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nuevoApartado">Nuevo Monto de Apartado</Label>
                <CurrencyInput
                  value={nuevoMontoApartado}
                  onChange={setNuevoMontoApartado}
                  decimals={2}
                />
                <p className="text-xs text-muted-foreground">
                  Monto requerido para apartar la propiedad
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={reventaMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={reventaMutation.isPending}
            >
              {reventaMutation.isPending ? "Procesando..." : "Confirmar Reventa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
