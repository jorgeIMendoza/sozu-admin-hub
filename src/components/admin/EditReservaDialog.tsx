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
import { useActivityLogger } from "@/hooks/useActivityLogger";

const formSchema = z.object({
  fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  hora_reserva: z.string().min(1, "Seleccione una hora"),
});

const reagendarFormSchema = z.object({
  nueva_fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  nueva_hora_reserva: z.string().min(1, "Seleccione una hora"),
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
  const [showReagendarDialog, setShowReagendarDialog] = useState(false);
  const queryClient = useQueryClient();
  const { registrarActualizacion, registrarCancelacion } = useActivityLogger();

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

  const reagendarForm = useForm<z.infer<typeof reagendarFormSchema>>({
    resolver: zodResolver(reagendarFormSchema),
    defaultValues: {
      nueva_fecha_reserva: "",
      nueva_hora_reserva: "",
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
    onSuccess: async (_, variables) => {
      // Registrar actualización de reserva
      await registrarActualizacion('reservas', 
        { id: reservaId, fecha_reserva: reserva?.fecha_reserva, hora_reserva: reserva?.hora_reserva },
        { id: reservaId, fecha_reserva: variables.fecha_reserva, hora_reserva: variables.hora_reserva },
        'actualizar_reserva'
      );
      
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
    mutationFn: async (params?: { nueva_fecha_reserva?: string; nueva_hora_reserva?: string }) => {
      if (!reservaId) throw new Error("No hay reserva seleccionada");

      const { data, error } = await supabase.functions.invoke('cancelar-reserva', {
        body: { 
          reserva_id: reservaId,
          nueva_fecha_reserva: params?.nueva_fecha_reserva,
          nueva_hora_reserva: params?.nueva_hora_reserva
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Error al cancelar');
      
      return data;
    },
    onSuccess: async (data, variables) => {
      // Registrar cancelación/reagendación de reserva
      const esReagendacion = !!variables?.nueva_fecha_reserva;
      await registrarCancelacion('reservas', {
        id_reserva: reservaId,
        tipo: esReagendacion ? 'reagendacion' : 'cancelacion',
        nueva_fecha_reserva: variables?.nueva_fecha_reserva,
        nueva_hora_reserva: variables?.nueva_hora_reserva
      }, esReagendacion ? 'reagendar_reserva' : 'cancelar_reserva');
      
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["reserva", reservaId] });
      toast.success(data.message || "Operación exitosa");
      setShowCancelDialog(false);
      setShowReagendarDialog(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al cancelar reserva");
      setShowCancelDialog(false);
      setShowReagendarDialog(false);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    updateMutation.mutate(values);
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = () => {
    // Si es reserva pagada, mostrar dialog de reagendación
    if (reserva?.id_estatus_reserva === 2) {
      setShowCancelDialog(false);
      setShowReagendarDialog(true);
    } else {
      // Si es reserva agendada, cancelar directamente
      cancelMutation.mutate(undefined);
    }
  };

  const confirmReagendar = (values: z.infer<typeof reagendarFormSchema>) => {
    // Validar fecha y hora
    const now = new Date();
    const selectedDateTime = new Date(`${values.nueva_fecha_reserva}T${values.nueva_hora_reserva}`);
    
    if (selectedDateTime < now) {
      toast.error("No se puede programar una reserva en el pasado");
      return;
    }

    cancelMutation.mutate({
      nueva_fecha_reserva: values.nueva_fecha_reserva,
      nueva_hora_reserva: values.nueva_hora_reserva
    });
  };

  const handleCancelReagendar = () => {
    setShowReagendarDialog(false);
    reagendarForm.reset();
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
                        <Input 
                          type="time" 
                          {...field} 
                          disabled={!canEdit}
                          min="08:00"
                          max="20:00"
                        />
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
                  se creará una nueva reserva con el mismo monto pagado. A continuación deberás seleccionar el nuevo horario.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Procesando..." : "Sí, continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReagendarDialog} onOpenChange={(_open) => {}}>
        <DialogContent 
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Seleccionar nuevo horario</DialogTitle>
          </DialogHeader>

          <Form {...reagendarForm}>
            <form onSubmit={reagendarForm.handleSubmit(confirmReagendar)} className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Selecciona la nueva fecha y hora para la reserva. El pago ya realizado se aplicará automáticamente.
                </p>
              </div>

              <FormField
                control={reagendarForm.control}
                name="nueva_fecha_reserva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nueva Fecha</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={reagendarForm.control}
                name="nueva_hora_reserva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nueva Hora</FormLabel>
                    <FormControl>
                      <Input 
                        type="time" 
                        {...field}
                        min="08:00"
                        max="20:00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancelReagendar}
                  disabled={cancelMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? "Procesando..." : "Confirmar Reagendación"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};
