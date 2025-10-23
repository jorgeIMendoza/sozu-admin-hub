import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formSchema = z.object({
  fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  hora_reserva: z.string().min(1, "Seleccione una hora"),
});

interface EditReservaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservaId: number | null;
}

export const EditReservaDialog = ({
  open,
  onOpenChange,
  reservaId,
}: EditReservaDialogProps) => {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const queryClient = useQueryClient();

  // Obtener datos de la reserva
  const { data: reserva, isLoading } = useQuery({
    queryKey: ["reserva", reservaId],
    queryFn: async () => {
      if (!reservaId) return null;

      const { data, error } = await (supabase as any)
        .from("reservas")
        .select(`
          *,
          espacios_reservables_edificio(
            id,
            descripcion,
            costo_por_hr,
            duracion_reserva
          ),
          estatus_reserva(id, nombre),
          persona_que_reserva:personas!reservas_id_persona_que_reserva_fkey(id, nombre_legal),
          acuerdos_pago(pago_completado)
        `)
        .eq("id", reservaId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!reservaId && open,
  });


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fecha_reserva: "",
      hora_reserva: "",
    },
  });

  useEffect(() => {
    if (reserva && open) {
      form.reset({
        fecha_reserva: reserva.fecha_reserva,
        hora_reserva: reserva.hora_reserva,
      });
    }
  }, [reserva, open, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (!reservaId) throw new Error("No hay reserva seleccionada");

      // Validar fecha y hora
      const now = new Date();
      const selectedDateTime = new Date(`${values.fecha_reserva}T${values.hora_reserva}`);
      
      if (selectedDateTime < now) {
        throw new Error("No se puede programar una reserva en el pasado");
      }

      const { error } = await (supabase as any)
        .from("reservas")
        .update({
          fecha_reserva: values.fecha_reserva,
          hora_reserva: values.hora_reserva,
        })
        .eq("id", reservaId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["reserva", reservaId] });
      toast.success("Reserva actualizada exitosamente");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar reserva");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!reservaId) throw new Error("No hay reserva seleccionada");

      const { data, error } = await supabase.functions.invoke('cancelar-reserva', {
        body: { reserva_id: reservaId }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Error al cancelar');
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["reserva", reservaId] });
      toast.success(data.message || "Operación exitosa");
      setShowCancelDialog(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al cancelar reserva");
      setShowCancelDialog(false);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateMutation.mutate(values);
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = () => {
    cancelMutation.mutate();
  };

  const canEdit = reserva && reserva.id_estatus_reserva <= 2;
  const canCancel = reserva && reserva.id_estatus_reserva <= 2;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="text-center py-8">Cargando...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!reserva) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Persona que reservó</p>
                <p className="font-medium">{reserva.persona_que_reserva?.nombre_legal || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Espacio</p>
                <p className="font-medium">{reserva.espacios_reservables_edificio?.descripcion || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo</p>
                <p className="font-medium">
                  ${Number(reserva.costo_final || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estatus actual</p>
                <Badge variant="outline">{reserva.estatus_reserva?.nombre || "N/A"}</Badge>
              </div>
            </div>

            {reserva.id_estatus_reserva === 2 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Esta reserva está pagada. Si cancelas tendrías que reagendar en otra fecha, no hay devolución de dinero.
                </p>
              </div>
            )}

            {reserva.id_estatus_reserva > 2 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg">
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  Esta reserva es de solo lectura y no se puede editar porque ya está {reserva.estatus_reserva?.nombre?.toLowerCase() || 'finalizada'}.
                </p>
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fecha_reserva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Reserva</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          disabled={!canEdit}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hora_reserva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora de Reserva</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={!canEdit}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar hora" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 13 }, (_, i) => i + 8).map((hour) => {
                              const hourStr = hour.toString().padStart(2, '0');
                              return (
                                <SelectItem key={hourStr} value={`${hourStr}:00`}>
                                  {hourStr}:00
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between gap-2 pt-4">
                  <div>
                    {canCancel && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={cancelMutation.isPending}
                      >
                        Cancelar Reserva
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cerrar
                    </Button>
                    {canEdit && (
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              {reserva?.id_estatus_reserva === 1 && (
                <span>
                  Esta reserva se marcará como <strong>Cancelada</strong>.
                </span>
              )}
              {reserva?.id_estatus_reserva === 2 && (
                <span>
                  Como esta reserva está <strong>Pagada</strong>, se marcará como <strong>Reagendada</strong> y 
                  se creará una nueva reserva con el mismo monto pagado para que pueda ser reprogramada.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Procesando..." : "Sí, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
