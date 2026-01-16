import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface EditPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId: number | null;
  cuentaCobranzaId: number;
}

export function EditPaymentDialog({
  isOpen,
  onClose,
  paymentId,
  cuentaCobranzaId,
}: EditPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();
  const originalPaymentRef = useRef<any>(null);
  
  const [formData, setFormData] = useState({
    monto: 0, // Store as cents (integer)
    fecha_pago: "",
    id_metodos_pago: "",
    clave_rastreo: "",
    descripcion: "",
  });

  // Fetch payment data
  const { data: paymentData, isLoading: isLoadingPayment } = useQuery({
    queryKey: ["payment_detail", paymentId],
    queryFn: async () => {
      if (!paymentId) return null;
      
      const { data, error } = await supabase
        .from("pagos")
        .select("*")
        .eq("id", paymentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!paymentId && isOpen,
  });

  // Fetch payment methods
  const { data: metodosData } = useQuery({
    queryKey: ["metodos_pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metodos_pago")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data;
    },
  });

  // Populate form with payment data and store original
  useEffect(() => {
    if (paymentData) {
      // Store original payment data for logging
      originalPaymentRef.current = {
        id: paymentData.id,
        monto: paymentData.monto,
        fecha_pago: paymentData.fecha_pago,
        id_metodos_pago: paymentData.id_metodos_pago,
        clave_rastreo: paymentData.clave_rastreo,
        descripcion: paymentData.descripcion
      };
      
      setFormData({
        monto: paymentData.monto ? Math.round(paymentData.monto * 100) : 0, // Convert to cents
        fecha_pago: paymentData.fecha_pago || "",
        id_metodos_pago: paymentData.id_metodos_pago?.toString() || "",
        clave_rastreo: paymentData.clave_rastreo || "",
        descripcion: paymentData.descripcion || "",
      });
    }
  }, [paymentData]);

  const updatePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentId) throw new Error("No payment ID provided");

      const monto = formData.monto / 100; // Convert from cents to actual value
      if (monto <= 0) {
        throw new Error("El monto debe ser mayor a 0");
      }

      // Update payment
      const { error: updateError } = await supabase
        .from("pagos")
        .update({
          monto,
          fecha_pago: formData.fecha_pago,
          id_metodos_pago: parseInt(formData.id_metodos_pago),
          clave_rastreo: formData.clave_rastreo || null,
          descripcion: formData.descripcion || null,
        })
        .eq("id", paymentId);

      if (updateError) throw updateError;

      // Update all applications for this payment with the new amount
      const { error: updateApplicationsError } = await supabase
        .from("aplicaciones_pago")
        .update({ monto })
        .eq("id_pago", paymentId)
        .eq("activo", true);

      if (updateApplicationsError) throw updateApplicationsError;
      
      return { paymentId, monto };
    },
    onSuccess: async (data) => {
      // Registrar la actualización en el log de actividades
      if (originalPaymentRef.current) {
        await registrarActualizacion('pagos', 
          originalPaymentRef.current,
          {
            id: data.paymentId,
            monto: formData.monto / 100,
            fecha_pago: formData.fecha_pago,
            id_metodos_pago: parseInt(formData.id_metodos_pago),
            clave_rastreo: formData.clave_rastreo || null,
            descripcion: formData.descripcion || null
          },
          'editar_pago'
        );
      }
      
      toast({
        title: "Pago actualizado",
        description: "El pago ha sido actualizado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaCobranzaId] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el pago",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePaymentMutation.mutate();
  };

  const handleClose = () => {
    setFormData({
      monto: 0,
      fecha_pago: "",
      id_metodos_pago: "",
      clave_rastreo: "",
      descripcion: "",
    });
    onClose();
  };

  if (isLoadingPayment) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Pago</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monto">Monto *</Label>
            <CurrencyInput
              id="monto"
              value={formData.monto}
              onChange={(value) =>
                setFormData({ ...formData, monto: value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha_pago">Fecha de Pago *</Label>
            <Input
              id="fecha_pago"
              type="date"
              value={formData.fecha_pago}
              onChange={(e) =>
                setFormData({ ...formData, fecha_pago: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metodo_pago">Método de Pago *</Label>
            <Select
              value={formData.id_metodos_pago}
              onValueChange={(value) =>
                setFormData({ ...formData, id_metodos_pago: value })
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un método" />
              </SelectTrigger>
              <SelectContent>
                {metodosData
                  ?.filter((m) => m.id !== 6) // Exclude STP
                  .map((metodo) => (
                    <SelectItem key={metodo.id} value={metodo.id.toString()}>
                      {metodo.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {formData.id_metodos_pago === "7" && (
            <div className="space-y-2">
              <Label htmlFor="clave_rastreo">Clave de Rastreo (Opcional)</Label>
              <Input
                id="clave_rastreo"
                type="text"
                placeholder="Ingresa la clave de rastreo"
                value={formData.clave_rastreo}
                onChange={(e) =>
                  setFormData({ ...formData, clave_rastreo: e.target.value })
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción (Opcional)</Label>
            <Textarea
              id="descripcion"
              placeholder="Agrega una descripción del pago"
              value={formData.descripcion}
              onChange={(e) =>
                setFormData({ ...formData, descripcion: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={updatePaymentMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updatePaymentMutation.isPending}
            >
              {updatePaymentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
