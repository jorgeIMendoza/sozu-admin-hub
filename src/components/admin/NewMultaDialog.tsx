import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface TipoMulta {
  id: number;
  nombre: string;
  activo: boolean;
}

interface NewMultaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acuerdoId: number;
  cuentaId: number;
  acuerdoMonto: number;
  existingMultas: Array<{ monto: number }>;
}

export function NewMultaDialog({ open, onOpenChange, acuerdoId, cuentaId, acuerdoMonto, existingMultas }: NewMultaDialogProps) {
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [idTipoMulta, setIdTipoMulta] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarCreacion } = useActivityLogger();

  const { data: tiposMulta = [] } = useQuery<TipoMulta[]>({
    queryKey: ["tipos_multa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('execute_safe_query', {
          query_text: 'SELECT id, nombre, activo FROM tipos_multa WHERE activo = true ORDER BY nombre',
          max_rows: 100
        });
      
      if (error) throw error;
      return (data as unknown as TipoMulta[]) || [];
    },
  });

  const createMultaMutation = useMutation({
    mutationFn: async ({ monto, descripcion, idTipoMulta }: { monto: number; descripcion: string; idTipoMulta: number }) => {
      const { error } = await supabase
        .from('multas')
        .insert({
          id_acuerdo_pago: acuerdoId,
          monto,
          descripcion,
          id_tipo_multa: idTipoMulta
        });
      
      if (error) throw error;
      return { monto, descripcion, idTipoMulta };
    },
    onSuccess: async (data) => {
      // Registrar creación de multa
      await registrarCreacion('multas', {
        id_acuerdo_pago: acuerdoId,
        id_cuenta_cobranza: cuentaId,
        monto: data.monto,
        descripcion: data.descripcion,
        id_tipo_multa: data.idTipoMulta
      }, 'crear_multa');
      
      toast({
        title: "Multa agregada",
        description: "La multa ha sido agregada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo agregar la multa",
        variant: "destructive",
      });
      console.error('Error creating multa:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const montoNumber = parseFloat(monto);
    if (isNaN(montoNumber) || montoNumber <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser un número válido mayor a 0",
        variant: "destructive",
      });
      return;
    }

    // Calculate sum of existing penalties
    const sumExistingMultas = existingMultas.reduce((sum, multa) => sum + multa.monto, 0);
    const totalMultasWithNew = sumExistingMultas + montoNumber;

    if (totalMultasWithNew > acuerdoMonto) {
      toast({
        title: "Error",
        description: `La suma total de multas ($${totalMultasWithNew.toLocaleString()}) no puede ser mayor al monto del pago ($${acuerdoMonto.toLocaleString()}). Multas existentes: $${sumExistingMultas.toLocaleString()}`,
        variant: "destructive",
      });
      return;
    }

    if (!descripcion.trim()) {
      toast({
        title: "Error",
        description: "La descripción es requerida",
        variant: "destructive",
      });
      return;
    }

    if (!idTipoMulta) {
      toast({
        title: "Error",
        description: "Debe seleccionar un tipo de multa",
        variant: "destructive",
      });
      return;
    }

    createMultaMutation.mutate({ 
      monto: montoNumber, 
      descripcion: descripcion.trim(),
      idTipoMulta: parseInt(idTipoMulta)
    });
  };

  const handleClose = () => {
    setMonto("");
    setDescripcion("");
    setIdTipoMulta("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Agregar Multa</DialogTitle>
          <DialogDescription>
            Ingrese los detalles de la multa a aplicar a este acuerdo de pago.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tipo" className="text-right">
                Tipo *
              </Label>
              <div className="col-span-3">
                <Select value={idTipoMulta} onValueChange={setIdTipoMulta} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione el tipo de multa" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposMulta.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="monto" className="text-right">
                Monto *
              </Label>
              <div className="col-span-3">
                <Input
                  id="monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="descripcion" className="text-right pt-2">
                Descripción *
              </Label>
              <div className="col-span-3">
                <Textarea
                  id="descripcion"
                  placeholder="Motivo de la multa..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  required
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={createMultaMutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMultaMutation.isPending}>
              {createMultaMutation.isPending ? "Agregando..." : "Agregar Multa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}