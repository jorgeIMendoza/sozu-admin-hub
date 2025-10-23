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
  id_proyecto: z.string().min(1, "Seleccione un proyecto"),
  id_edificio: z.string().min(1, "Seleccione un edificio"),
  id_propiedad: z.string().min(1, "Seleccione una propiedad"),
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
  const [selectedCuentaMantenimiento, setSelectedCuentaMantenimiento] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id_proyecto: "",
      id_edificio: "",
      id_propiedad: "",
      id_espacio_reservable_edificio: "",
      fecha_reserva: format(new Date(), "yyyy-MM-dd"),
      hora_reserva: "09:00",
    },
  });

  // Fetch proyectos
  const { data: proyectos } = useQuery({
    queryKey: ["proyectos_activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data;
    },
  });

  // Fetch edificios filtrados por proyecto
  const { data: edificios } = useQuery({
    queryKey: ["edificios_por_proyecto", form.watch("id_proyecto")],
    queryFn: async () => {
      const proyectoId = form.watch("id_proyecto");
      if (!proyectoId) return [];

      const { data, error } = await supabase
        .from("edificios")
        .select("id, nombre")
        .eq("id_proyecto", parseInt(proyectoId))
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data;
    },
    enabled: !!form.watch("id_proyecto"),
  });

  // Fetch propiedades filtradas por edificio con cuenta de mantenimiento
  const { data: propiedades } = useQuery({
    queryKey: ["propiedades_por_edificio", form.watch("id_edificio")],
    queryFn: async () => {
      const edificioId = form.watch("id_edificio");
      if (!edificioId) return [];

      // Get propiedades through edificios_modelos
      const { data: propiedadesData, error: propError } = await supabase
        .from("propiedades")
        .select(`
          id,
          numero_propiedad,
          id_edificio_modelo,
          edificios_modelos!propiedades_id_edificio_modelo_fkey(
            id_edificio
          )
        `)
        .eq("activo", true);

      if (propError) throw propError;

      // Filter by edificio
      const propiedadesEdificio = (propiedadesData || []).filter(
        (p: any) => p.edificios_modelos?.id_edificio === parseInt(edificioId)
      );

      // For each propiedad, get cuenta de mantenimiento
      const propiedadesConCuenta = await Promise.all(
        propiedadesEdificio.map(async (prop: any) => {
          // Get oferta for this propiedad
          const { data: oferta } = await supabase
            .from("ofertas")
            .select("id")
            .eq("id_propiedad", prop.id)
            .eq("activo", true)
            .maybeSingle();

          if (!oferta) return null;

          // Get cuenta de cobranza (parent)
          const { data: cuentaPadre } = await supabase
            .from("cuentas_cobranza")
            .select("id")
            .eq("id_oferta", oferta.id)
            .eq("activo", true)
            .is("id_cuenta_cobranza_padre", null)
            .maybeSingle();

          if (!cuentaPadre) return null;

          // Get cuenta de mantenimiento (child with id_cuenta_cobranza_padre)
          const { data: cuentaMantenimiento } = await supabase
            .from("cuentas_cobranza")
            .select("id")
            .eq("id_cuenta_cobranza_padre", cuentaPadre.id)
            .eq("activo", true)
            .maybeSingle();

          if (!cuentaMantenimiento) return null;

          return {
            id: prop.id,
            numero_propiedad: prop.numero_propiedad,
            id_cuenta_mantenimiento: cuentaMantenimiento.id,
          };
        })
      );

      return propiedadesConCuenta.filter(Boolean);
    },
    enabled: !!form.watch("id_edificio"),
  });

  // Fetch compradores de la cuenta de mantenimiento seleccionada
  const { data: compradores } = useQuery({
    queryKey: ["compradores_cuenta", selectedCuentaMantenimiento?.id],
    queryFn: async () => {
      if (!selectedCuentaMantenimiento?.id) return [];

      const { data, error } = await supabase
        .from("compradores")
        .select(`
          id,
          porcentaje_copropiedad,
          personas!compradores_id_persona_fkey(
            nombre_legal
          )
        `)
        .eq("id_cuenta_cobranza", selectedCuentaMantenimiento.id)
        .eq("activo", true);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedCuentaMantenimiento?.id,
  });

  // Fetch espacios reservables filtrados por proyecto
  const proyectoIdSelected = form.watch("id_proyecto");

  const { data: espacios } = useQuery({
    queryKey: ["espacios_reservables", proyectoIdSelected],
    queryFn: async () => {
      if (!proyectoIdSelected) return [];

      const { data, error } = await (supabase as any)
        .from("espacios_reservables_edificio")
        .select(`
          *,
          edificios(
            id, 
            nombre, 
            id_proyecto,
            proyectos!fk_edificios_proyecto(id, nombre)
          ),
          tipos_espacio_reservables(id, nombre)
        `)
        .eq("activo", true);

      if (error) throw error;

      // Filter by proyecto
      const filtered = (data || []).filter((espacio: any) => 
        espacio.edificios?.id_proyecto === parseInt(proyectoIdSelected)
      );

      return filtered as any[];
    },
    enabled: !!proyectoIdSelected,
  });


  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (!selectedCuentaMantenimiento) {
        throw new Error("No se encontró la cuenta de mantenimiento");
      }

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
      const { data: acuerdo, error: acuerdoError } = await supabase
        .from("acuerdos_pago")
        .insert({
          id_cuenta_cobranza: selectedCuentaMantenimiento.id,
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

  const handlePropiedadChange = (propiedadId: string) => {
    const propiedad = propiedades?.find((p: any) => p.id.toString() === propiedadId);
    if (propiedad) {
      setSelectedCuentaMantenimiento({ id: propiedad.id_cuenta_mantenimiento });
    }
    form.setValue("id_propiedad", propiedadId);
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
              name="id_proyecto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proyecto</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("id_edificio", "");
                        form.setValue("id_propiedad", "");
                        form.setValue("id_espacio_reservable_edificio", "");
                        setSelectedCuentaMantenimiento(null);
                      }}
                      options={(proyectos || []).map((proyecto: any) => ({
                        value: proyecto.id.toString(),
                        label: proyecto.nombre,
                      }))}
                      placeholder="Seleccionar proyecto"
                      searchPlaceholder="Buscar proyecto..."
                      emptyText="No se encontraron proyectos"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_edificio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edificio</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("id_propiedad", "");
                        setSelectedCuentaMantenimiento(null);
                      }}
                      options={(edificios || []).map((edificio: any) => ({
                        value: edificio.id.toString(),
                        label: edificio.nombre,
                      }))}
                      placeholder="Seleccionar edificio"
                      searchPlaceholder="Buscar edificio..."
                      emptyText="No se encontraron edificios"
                      disabled={!form.watch("id_proyecto")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_propiedad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Propiedad</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={handlePropiedadChange}
                      options={(propiedades || []).map((propiedad: any) => ({
                        value: propiedad.id.toString(),
                        label: `${propiedad.numero_propiedad} - ${formatCuentaMantenimientoId(propiedad.id_cuenta_mantenimiento)}`,
                      }))}
                      placeholder="Seleccionar propiedad"
                      searchPlaceholder="Buscar por número o cuenta..."
                      emptyText="No se encontraron propiedades"
                      disabled={!form.watch("id_edificio")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {compradores && compradores.length > 0 && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm font-semibold">Compradores:</p>
                {compradores.map((comprador: any) => (
                  <p key={comprador.id} className="text-sm">
                    • {comprador.personas?.nombre_legal} ({comprador.porcentaje_copropiedad}%)
                  </p>
                ))}
              </div>
            )}

            <FormField
              control={form.control}
              name="id_espacio_reservable_edificio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Espacio Reservable</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={handleEspacioChange}
                      options={(espacios || []).map((espacio: any) => ({
                        value: espacio.id.toString(),
                        label: `${espacio.tipos_espacio_reservables?.nombre || "Sin tipo"} - ${espacio.edificios?.nombre || "Sin edificio"}`,
                      }))}
                      placeholder="Seleccionar espacio"
                      searchPlaceholder="Buscar espacio..."
                      emptyText="No se encontraron espacios"
                      disabled={!form.watch("id_proyecto")}
                    />
                  </FormControl>
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
