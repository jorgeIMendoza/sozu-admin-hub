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
import { Combobox } from "@/components/ui/combobox";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import { format } from "date-fns";

const formSchema = z.object({
  id_cuenta_mantenimiento: z.string().min(1, "Seleccione un departamento"),
  id_espacio_reservable_edificio: z.string().min(1, "Seleccione un espacio"),
  fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  hora_reserva: z.string().min(1, "Seleccione una hora"),
});

interface NewReservaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCuentaMantenimientoId?: number;
}

export const NewReservaDialog = ({ 
  open, 
  onOpenChange, 
  preselectedCuentaMantenimientoId 
}: NewReservaDialogProps) => {
  const [selectedEspacio, setSelectedEspacio] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id_cuenta_mantenimiento: preselectedCuentaMantenimientoId?.toString() || "",
      id_espacio_reservable_edificio: "",
      fecha_reserva: format(new Date(), "yyyy-MM-dd"),
      hora_reserva: "09:00",
    },
  });

  // Update form when preselectedCuentaMantenimientoId changes
  useEffect(() => {
    if (preselectedCuentaMantenimientoId) {
      form.setValue("id_cuenta_mantenimiento", preselectedCuentaMantenimientoId.toString());
    }
  }, [preselectedCuentaMantenimientoId, form]);

  // Fetch cuentas de mantenimiento con info de departamento y propietarios
  const { data: cuentasMantenimiento } = useQuery({
    queryKey: ["cuentas_mantenimiento_para_reservas"],
    queryFn: async () => {
      // Get all cuentas de mantenimiento (those with id_cuenta_cobranza_padre)
      const { data: cuentas, error } = await (supabase as any)
        .from("cuentas_cobranza")
        .select("id, id_cuenta_cobranza_padre")
        .not("id_cuenta_cobranza_padre", "is", null)
        .eq("activo", true);

      if (error) throw error;

      // For each cuenta, get property and owners info
      const cuentasConInfo = await Promise.all(
        (cuentas || []).map(async (cuenta: any) => {
          let numeroDepartamento = "Sin número";
          let propietarios: string[] = [];

          if (cuenta.id_cuenta_cobranza_padre) {
            // Get parent cuenta to get oferta
            const { data: parentCuenta } = await (supabase as any)
              .from("cuentas_cobranza")
              .select("id_oferta")
              .eq("id", cuenta.id_cuenta_cobranza_padre)
              .maybeSingle();

            if (parentCuenta?.id_oferta) {
              // Get propiedad from oferta
              const { data: oferta } = await (supabase as any)
                .from("ofertas")
                .select(`
                  propiedades!ofertas_id_propiedad_fkey(numero_propiedad)
                `)
                .eq("id", parentCuenta.id_oferta)
                .maybeSingle();

              numeroDepartamento = oferta?.propiedades?.numero_propiedad || "Sin número";

              // Get propietarios (compradores)
              const { data: compradores } = await (supabase as any)
                .from("compradores")
                .select(`
                  personas!compradores_id_persona_fkey(nombre_legal)
                `)
                .eq("id_cuenta_cobranza", cuenta.id_cuenta_cobranza_padre)
                .eq("activo", true);

              propietarios = compradores?.map((c: any) => c.personas?.nombre_legal).filter(Boolean) || [];
            }
          }

          return {
            id: cuenta.id,
            numero_departamento: numeroDepartamento,
            propietarios: propietarios.join(", ") || "Sin propietario",
          };
        })
      );

      return cuentasConInfo;
    },
  });

  // Get proyecto from selected cuenta de mantenimiento
  const { data: proyectoData } = useQuery({
    queryKey: ["proyecto_from_cuenta", form.watch("id_cuenta_mantenimiento")],
    queryFn: async () => {
      const cuentaId = form.watch("id_cuenta_mantenimiento");
      if (!cuentaId) return null;

      // Get cuenta padre
      const { data: cuentaMantenimiento, error: errorCuenta } = await (supabase as any)
        .from("cuentas_cobranza")
        .select("id_cuenta_cobranza_padre")
        .eq("id", parseInt(cuentaId))
        .maybeSingle();

      if (errorCuenta || !cuentaMantenimiento?.id_cuenta_cobranza_padre) return null;

      // Get oferta from cuenta padre
      const { data: cuentaPadre, error: errorPadre } = await (supabase as any)
        .from("cuentas_cobranza")
        .select("id_oferta")
        .eq("id", cuentaMantenimiento.id_cuenta_cobranza_padre)
        .maybeSingle();

      if (errorPadre || !cuentaPadre?.id_oferta) return null;

      // Get propiedad from oferta
      const { data: oferta, error: errorOferta } = await (supabase as any)
        .from("ofertas")
        .select("id_propiedad")
        .eq("id", cuentaPadre.id_oferta)
        .maybeSingle();

      if (errorOferta || !oferta?.id_propiedad) return null;

      // Get edificio_modelo from propiedad
      const { data: propiedad, error: errorPropiedad } = await (supabase as any)
        .from("propiedades")
        .select("id_edificio_modelo")
        .eq("id", oferta.id_propiedad)
        .maybeSingle();

      if (errorPropiedad || !propiedad?.id_edificio_modelo) return null;

      // Get edificio from edificio_modelo
      const { data: edificioModelo, error: errorEdificioModelo } = await (supabase as any)
        .from("edificios_modelos")
        .select("id_edificio")
        .eq("id", propiedad.id_edificio_modelo)
        .maybeSingle();

      if (errorEdificioModelo || !edificioModelo?.id_edificio) return null;

      // Get proyecto from edificio
      const { data: edificio, error: errorEdificio } = await (supabase as any)
        .from("edificios")
        .select("id_proyecto")
        .eq("id", edificioModelo.id_edificio)
        .maybeSingle();

      if (errorEdificio) return null;

      return edificio?.id_proyecto;
    },
    enabled: !!form.watch("id_cuenta_mantenimiento"),
  });

  const { data: espacios } = useQuery({
    queryKey: ["espacios_reservables", proyectoData],
    queryFn: async () => {
      if (!proyectoData) return [];

      const { data, error } = await (supabase as any)
        .from("espacios_reservables_edificio")
        .select(`
          *,
          edificios!espacios_reservables_edificio_id_edificio_fkey(
            id, 
            nombre, 
            id_proyecto,
            proyectos!edificios_id_proyecto_fkey(id, nombre)
          ),
          tipos_espacio_reservables!espacios_reservables_edificio_id_tipo_espacio_reservable_fkey(id, nombre)
        `)
        .eq("activo", true);

      if (error) throw error;

      // Filter by proyecto
      const filtered = (data || []).filter((espacio: any) => 
        espacio.edificios?.id_proyecto === proyectoData
      );

      return filtered as any[];
    },
    enabled: !!proyectoData,
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

      // First, create an acuerdo_pago for this reserva
      const { data: acuerdo, error: acuerdoError } = await (supabase as any)
        .from("acuerdos_pago")
        .insert({
          id_cuenta_cobranza: parseInt(values.id_cuenta_mantenimiento),
          id_concepto: 1, // Default concept for reservations
          monto: costoFinal,
          fecha_pago: values.fecha_reserva,
          orden: 1,
        })
        .select()
        .single();

      if (acuerdoError) throw acuerdoError;

      // Then create the reserva with default status "Agendada" (1)
      const { data, error } = await (supabase as any)
        .from("reservas")
        .insert([{
          id_acuerdo_pago: acuerdo.id,
          id_espacio_reservable_edificio: parseInt(values.id_espacio_reservable_edificio),
          fecha_reserva: values.fecha_reserva,
          hora_reserva: values.hora_reserva,
          costo_final: costoFinal,
          id_estatus_reserva: 1,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Reserva</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="id_cuenta_mantenimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={field.onChange}
                      options={(cuentasMantenimiento || []).map((cuenta: any) => ({
                        value: cuenta.id.toString(),
                        label: `${cuenta.numero_departamento} - ${formatCuentaMantenimientoId(cuenta.id)} - ${cuenta.propietarios}`,
                      }))}
                      placeholder="Seleccionar departamento"
                      searchPlaceholder="Buscar por número, cuenta o propietario..."
                      emptyText="No se encontraron departamentos"
                      disabled={!!preselectedCuentaMantenimientoId}
                    />
                  </FormControl>
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
