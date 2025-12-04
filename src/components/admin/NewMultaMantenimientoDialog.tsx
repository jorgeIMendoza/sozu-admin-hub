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

interface TipoMulta {
  id: number;
  nombre: string;
  activo: boolean;
}

interface NewMultaMantenimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaId: number;
}

export function NewMultaMantenimientoDialog({ open, onOpenChange, cuentaId }: NewMultaMantenimientoDialogProps) {
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [idTipoMulta, setIdTipoMulta] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      // Step 1: Calculate next orden number
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from('acuerdos_pago')
        .select('orden')
        .eq('id_cuenta_cobranza', cuentaId)
        .order('orden', { ascending: false })
        .limit(1);
      
      if (acuerdosError) throw acuerdosError;
      const nextOrden = (acuerdos?.[0]?.orden || 0) + 1;

      // Step 2: Create new acuerdo_pago
      const { data: nuevoAcuerdo, error: acuerdoError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_cuenta_cobranza: cuentaId,
          id_concepto: 13, // Pago de multa
          fecha_pago: new Date().toISOString().split('T')[0],
          monto: monto,
          orden: nextOrden,
          activo: true,
          pago_completado: false
        })
        .select()
        .single();
      
      if (acuerdoError) throw acuerdoError;
      if (!nuevoAcuerdo) throw new Error('No se pudo crear el acuerdo de pago');

      // Step 3: Create multa associated with the new acuerdo
      const { error: multaError } = await supabase
        .from('multas')
        .insert({
          id_acuerdo_pago: nuevoAcuerdo.id,
          monto,
          descripcion,
          id_tipo_multa: idTipoMulta,
          es_pagada: false,
          activo: true
        });
      
      if (multaError) throw multaError;
    },
    onSuccess: () => {
      toast({
        title: "Multa o Pago extra agregado",
        description: "Se ha agregado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuenta_mantenimiento_detalle", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["multas_mantenimiento", cuentaId] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo agregar la multa o pago extra",
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
        description: "Debe seleccionar un tipo",
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
          <DialogTitle>Agregar Multa o Pago extra</DialogTitle>
          <DialogDescription>
            Ingrese los detalles. Se creará un nuevo acuerdo de pago.
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
                    <SelectValue placeholder="Seleccione el tipo" />
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
                  placeholder="Motivo de la multa o pago extra..."
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
              {createMultaMutation.isPending ? "Agregando..." : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
