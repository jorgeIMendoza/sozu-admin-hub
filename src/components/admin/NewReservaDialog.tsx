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
  id_comprador: z.string().min(1, "Seleccione un propietario"),
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
      id_comprador: "",
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

  // Fetch propiedades filtradas por edificio con cuenta de mantenimiento (solo entregadas)
  const { data: propiedades, isLoading: propiedadesLoading } = useQuery({
    queryKey: ["propiedades_por_edificio_mantenimiento", form.watch("id_edificio")],
    queryFn: async () => {
      const edificioId = form.watch("id_edificio");
      if (!edificioId) return [];

      console.log("Buscando propiedades para edificio:", edificioId);

      // Strategy: Get all propiedades for this edificio first
      const { data: propiedadesData, error: propError } = await supabase
        .from("propiedades")
        .select(`
          id,
          numero_propiedad,
          id_edificio_modelo,
          id_estatus_disponibilidad,
          edificios_modelos!propiedades_id_edificio_modelo_fkey(
            id,
            id_edificio
          )
        `)
        .eq("activo", true)
        .eq("id_estatus_disponibilidad", 8);

      if (propError) {
        console.error("Error fetching propiedades:", propError);
        throw propError;
      }

      console.log("Propiedades encontradas (todas):", propiedadesData?.length);

      // Filter by edificio
      const propiedadesEdificio = (propiedadesData || []).filter(
        (p: any) => p.edificios_modelos?.id_edificio === parseInt(edificioId)
      );

      console.log("Propiedades filtradas por edificio:", propiedadesEdificio.length);

      if (propiedadesEdificio.length === 0) return [];

      // Get all ofertas for these propiedades in one query
      const propiedadIds = propiedadesEdificio.map((p: any) => p.id);
      const { data: ofertas, error: ofertasError } = await supabase
        .from("ofertas")
        .select("id, id_propiedad")
        .in("id_propiedad", propiedadIds)
        .eq("activo", true);

      if (ofertasError) {
        console.error("Error fetching ofertas:", ofertasError);
        throw ofertasError;
      }

      console.log("Ofertas encontradas:", ofertas?.length);

      if (!ofertas || ofertas.length === 0) return [];

      // Get all cuentas_cobranza (parent) for these ofertas
      const ofertaIds = ofertas.map((o: any) => o.id);
      const { data: cuentasPadre, error: cuentasPadreError } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_oferta")
        .in("id_oferta", ofertaIds)
        .eq("activo", true)
        .is("id_cuenta_cobranza_padre", null);

      if (cuentasPadreError) {
        console.error("Error fetching cuentas padre:", cuentasPadreError);
        throw cuentasPadreError;
      }

      console.log("Cuentas padre encontradas:", cuentasPadre?.length);

      if (!cuentasPadre || cuentasPadre.length === 0) return [];

      // Get all cuentas de mantenimiento (children) for these parent cuentas
      const cuentaPadreIds = cuentasPadre.map((c: any) => c.id);
      const { data: cuentasMantenimiento, error: cuentasMantenimientoError } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_cuenta_cobranza_padre")
        .in("id_cuenta_cobranza_padre", cuentaPadreIds)
        .eq("activo", true);

      if (cuentasMantenimientoError) {
        console.error("Error fetching cuentas mantenimiento:", cuentasMantenimientoError);
        throw cuentasMantenimientoError;
      }

      console.log("Cuentas mantenimiento encontradas:", cuentasMantenimiento?.length);

      if (!cuentasMantenimiento || cuentasMantenimiento.length === 0) return [];

      // Map everything together
      const propiedadesConCuenta = propiedadesEdificio
        .map((prop: any) => {
          // Find oferta for this propiedad
          const oferta = ofertas.find((o: any) => o.id_propiedad === prop.id);
          if (!oferta) return null;

          // Find cuenta padre for this oferta
          const cuentaPadre = cuentasPadre.find((c: any) => c.id_oferta === oferta.id);
          if (!cuentaPadre) return null;

          // Find cuenta mantenimiento for this cuenta padre
          const cuentaMantenimiento = cuentasMantenimiento.find(
            (c: any) => c.id_cuenta_cobranza_padre === cuentaPadre.id
          );
          if (!cuentaMantenimiento) return null;

          return {
            id: prop.id,
            numero_propiedad: prop.numero_propiedad,
            id_cuenta_mantenimiento: cuentaMantenimiento.id,
          };
        })
        .filter(Boolean);

      console.log("Propiedades finales con cuenta de mantenimiento:", propiedadesConCuenta.length);

      return propiedadesConCuenta;
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
          id_persona,
          id_cuenta_cobranza,
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
    form.setValue("id_comprador", ""); // Reset comprador selection
  };

  // Auto-select comprador if only one exists
  useEffect(() => {
    if (compradores && compradores.length === 1) {
      form.setValue("id_comprador", compradores[0].id_persona.toString());
    }
  }, [compradores, form]);

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
                        form.setValue("id_comprador", "");
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
                        form.setValue("id_comprador", "");
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
                        label: `${propiedad.numero_propiedad} - Cuenta: ${formatCuentaMantenimientoId(propiedad.id_cuenta_mantenimiento)}`,
                      }))}
                      placeholder="Seleccionar propiedad"
                      searchPlaceholder="Buscar por número o cuenta..."
                      emptyText={propiedadesLoading ? "Cargando propiedades..." : "No se encontraron propiedades entregadas con cuenta de mantenimiento"}
                      disabled={!form.watch("id_edificio") || propiedadesLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {compradores && compradores.length > 0 && (
              <FormField
                control={form.control}
                name="id_comprador"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Propietario</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar propietario" />
                        </SelectTrigger>
                        <SelectContent>
                          {compradores.map((comprador: any) => (
                            <SelectItem key={comprador.id_persona} value={comprador.id_persona.toString()}>
                              {comprador.personas?.nombre_legal} ({comprador.porcentaje_copropiedad}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
