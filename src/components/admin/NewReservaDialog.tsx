import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

const formSchema = z.object({
  id_acuerdo_pago: z.string().min(1, "Seleccione un acuerdo de pago"),
  id_espacio_reservable_edificio: z.string().min(1, "Seleccione un espacio"),
  fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  hora_reserva: z.string().min(1, "Seleccione una hora"),
  id_estatus_reserva: z.string().min(1, "Seleccione un estatus"),
  notas: z.string().optional(),
});

interface NewReservaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewReservaDialog = ({ open, onOpenChange }: NewReservaDialogProps) => {
  const [selectedEspacio, setSelectedEspacio] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id_acuerdo_pago: "",
      id_espacio_reservable_edificio: "",
      fecha_reserva: format(new Date(), "yyyy-MM-dd"),
      hora_reserva: "09:00",
      id_estatus_reserva: "1",
      notas: "",
    },
  });

  // @ts-ignore - Tablas no están en types aún
  const { data: espacios } = useQuery({
    queryKey: ["espacios_reservables"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("espacios_reservables_edificio")
        .select(`
          *,
          edificios(id, nombre, proyectos(id, nombre)),
          tipos_espacio_reservables(id, nombre)
        `)
        .eq("activo", true);
      if (error) throw error;
      return data as any[];
    },
  });

  // @ts-ignore - Tablas no están en types aún
  const { data: acuerdos } = useQuery({
    queryKey: ["acuerdos_pago_activos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("acuerdos_pago")
        .select(`
          *,
          cuentas_cobranza_mantenimiento(
            id,
            ofertas(
              id,
              personas(id, nombre, apellido_paterno, apellido_materno)
            )
          )
        `)
        .eq("activo", true)
        .eq("pago_completado", false);
      if (error) throw error;
      return data as any[];
    },
  });

  // @ts-ignore - Tablas no están en types aún
  const { data: estatusReserva } = useQuery({
    queryKey: ["estatus_reserva"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estatus_reserva")
        .select("*")
        .eq("activo", true);
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      // Calcular costo final basado en duración y costo por hora
      let costoFinal = 0;
      if (selectedEspacio) {
        const costoPorHr = Number(selectedEspacio.costo_por_hr || 0);
        // Parsear duracion_reserva (formato interval de Postgres ej: "02:00:00")
        const duracion = selectedEspacio.duracion_reserva || "01:00:00";
        const horas = parseFloat(duracion.split(":")[0]) + parseFloat(duracion.split(":")[1]) / 60;
        costoFinal = costoPorHr * horas;
      }

      const { data, error } = await (supabase as any)
        .from("reservas")
        .insert([{
          id_acuerdo_pago: parseInt(values.id_acuerdo_pago),
          id_espacio_reservable_edificio: parseInt(values.id_espacio_reservable_edificio),
          fecha_reserva: values.fecha_reserva,
          hora_reserva: values.hora_reserva,
          costo_final: costoFinal,
          id_estatus_reserva: parseInt(values.id_estatus_reserva),
        }])
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      toast.success("Reserva creada exitosamente");
      onOpenChange(false);
      form.reset();
      setSelectedEspacio(null);
    },
    onError: (error: any) => {
      toast.error(`Error al crear reserva: ${error.message}`);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate(values);
  };

  const handleEspacioChange = (espacioId: string) => {
    const espacio = espacios?.find((e) => e.id.toString() === espacioId);
    setSelectedEspacio(espacio);
    form.setValue("id_espacio_reservable_edificio", espacioId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Reserva</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="id_acuerdo_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente (Acuerdo de Pago)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {acuerdos?.map((acuerdo: any) => (
                        <SelectItem key={acuerdo.id} value={acuerdo.id.toString()}>
                          {acuerdo.cuentas_cobranza_mantenimiento?.ofertas?.personas?.nombre || "N/A"}{" "}
                          {acuerdo.cuentas_cobranza_mantenimiento?.ofertas?.personas?.apellido_paterno || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_espacio_reservable_edificio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Espacio</FormLabel>
                  <Select onValueChange={handleEspacioChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar espacio" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {espacios?.map((espacio: any) => (
                        <SelectItem key={espacio.id} value={espacio.id.toString()}>
                          {espacio.tipos_espacio_reservables?.nombre || "Sin tipo"} - {espacio.edificios?.nombre || "Sin edificio"} 
                          ({espacio.edificios?.proyectos?.nombre || "Sin proyecto"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedEspacio && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm"><strong>Costo por hora:</strong> ${Number(selectedEspacio.costo_por_hr || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                <p className="text-sm"><strong>Duración de reserva:</strong> {selectedEspacio.duracion_reserva || "No definida"}</p>
                {selectedEspacio.descripcion && (
                  <p className="text-sm"><strong>Descripción:</strong> {selectedEspacio.descripcion}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fecha_reserva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                    <FormLabel>Hora</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="id_estatus_reserva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estatus</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estatus" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {estatusReserva?.map((estatus: any) => (
                        <SelectItem key={estatus.id} value={estatus.id.toString()}>
                          {estatus.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Guardando..." : "Guardar Reserva"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
