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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const formSchema = z.object({
  id_proyecto: z.string().min(1, "Seleccione un proyecto"),
  id_edificio: z.string().min(1, "Seleccione un edificio"),
  id_propiedad: z.string().min(1, "Seleccione una propiedad"),
  id_comprador: z.string().min(1, "Seleccione un propietario"),
  id_espacio_reservable_edificio: z.string().min(1, "Seleccione un espacio"),
  fecha_reserva: z.string().min(1, "Seleccione una fecha"),
  hora_reserva: z.string().min(1, "Seleccione una hora"),
}).refine((data) => {
  const now = new Date();
  const selectedDateTime = new Date(`${data.fecha_reserva}T${data.hora_reserva}`);
  return selectedDateTime >= now;
}, {
  message: "No se puede crear una reserva en el pasado",
  path: ["hora_reserva"],
});

interface NewReservaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCuentaMantenimientoId?: number;
  preselectedFecha?: string;
  preselectedHora?: string;
}

export const NewReservaDialog = ({ 
  open, 
  onOpenChange, 
  preselectedCuentaMantenimientoId,
  preselectedFecha,
  preselectedHora 
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

  // Query para obtener datos de la cuenta de mantenimiento preseleccionada
  const { data: cuentaMantenimientoData } = useQuery({
    queryKey: ["cuenta_mantenimiento_prellenado", preselectedCuentaMantenimientoId],
    queryFn: async () => {
      if (!preselectedCuentaMantenimientoId) return null;

      // Get cuenta mantenimiento
      const { data: cuentaMant, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('id, id_cuenta_cobranza_padre')
        .eq('id', preselectedCuentaMantenimientoId)
        .maybeSingle();

      if (cuentaError || !cuentaMant?.id_cuenta_cobranza_padre) return null;

      // Get cuenta padre with oferta
      const { data: cuentaPadre, error: padreError } = await supabase
        .from('cuentas_cobranza')
        .select('id_oferta')
        .eq('id', cuentaMant.id_cuenta_cobranza_padre)
        .maybeSingle();

      if (padreError || !cuentaPadre?.id_oferta) return null;

      // Get oferta with propiedad
      const { data: oferta, error: ofertaError } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .eq('id', cuentaPadre.id_oferta)
        .maybeSingle();

      if (ofertaError || !oferta?.id_propiedad) return null;

      // Get propiedad with edificio_modelo
      const { data: propiedad, error: propiedadError } = await supabase
        .from('propiedades')
        .select('id, id_edificio_modelo')
        .eq('id', oferta.id_propiedad)
        .maybeSingle();

      if (propiedadError || !propiedad?.id_edificio_modelo) return null;

      // Get edificio_modelo with edificio
      const { data: edificioModelo, error: edificioModeloError } = await supabase
        .from('edificios_modelos')
        .select('id_edificio')
        .eq('id', propiedad.id_edificio_modelo)
        .maybeSingle();

      if (edificioModeloError || !edificioModelo?.id_edificio) return null;

      // Get edificio with proyecto
      const { data: edificio, error: edificioError } = await supabase
        .from('edificios')
        .select('id, id_proyecto')
        .eq('id', edificioModelo.id_edificio)
        .maybeSingle();

      if (edificioError || !edificio?.id_proyecto) return null;

      return {
        id_cuenta_mantenimiento: cuentaMant.id,
        id_propiedad: propiedad.id,
        id_edificio: edificio.id,
        id_proyecto: edificio.id_proyecto,
      };
    },
    enabled: !!preselectedCuentaMantenimientoId && open,
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

  // Fetch residentes de la cuenta de mantenimiento seleccionada
  const { data: residentes } = useQuery({
    queryKey: ["residentes_cuenta", selectedCuentaMantenimiento?.id],
    queryFn: async () => {
      if (!selectedCuentaMantenimiento?.id) return [];

      const { data, error } = await (supabase as any)
        .from("residentes")
        .select(`
          id_persona,
          id_cuenta_cobranza,
          personas!residentes_id_persona_fkey(
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

  // Combinar compradores y residentes
  // Si un residente es el mismo propietario, solo mostrar el de residente
  const personasQueReservanTemp = [
    ...(compradores || []).map((c: any) => ({
      id_persona: c.id_persona,
      nombre: c.personas?.nombre_legal,
      tipo: 'Propietario'
    })),
    ...(residentes || []).map((r: any) => ({
      id_persona: r.id_persona,
      nombre: r.personas?.nombre_legal,
      tipo: 'Residente'
    }))
  ];

  // Filtrar para que si hay un residente que es también propietario, solo mostrar el residente
  const personasQueReservan = personasQueReservanTemp.filter((persona, index, self) => {
    // Si es propietario, verificar que no exista como residente
    if (persona.tipo === 'Propietario') {
      const existeComoResidente = self.some(p => p.id_persona === persona.id_persona && p.tipo === 'Residente');
      return !existeComoResidente;
    }
    // Si es residente, siempre incluirlo
    return true;
  });

  // Fetch espacios reservables filtrados por edificio
  const edificioIdSelected = form.watch("id_edificio");
  const fechaReserva = form.watch("fecha_reserva");
  const horaReserva = form.watch("hora_reserva");

  const { data: espacios } = useQuery({
    queryKey: ["espacios_reservables", edificioIdSelected],
    queryFn: async () => {
      if (!edificioIdSelected) return [];

      const { data, error } = await (supabase as any)
        .from("espacios_reservables_edificio")
        .select(`
          *,
          edificios(
            id, 
            nombre
          ),
          tipos_espacio_reservables(id, nombre)
        `)
        .eq("id_edificio", parseInt(edificioIdSelected))
        .eq("activo", true);

      if (error) throw error;

      return data as any[];
    },
    enabled: !!edificioIdSelected,
  });

  // Fetch reservas existentes para el horario seleccionado
  const { data: reservasExistentes } = useQuery({
    queryKey: ["reservas_existentes", edificioIdSelected, fechaReserva, horaReserva],
    queryFn: async () => {
      if (!edificioIdSelected || !fechaReserva || !horaReserva) return [];

      const { data, error } = await (supabase as any)
        .from("reservas")
        .select(`
          id,
          id_espacio_reservable_edificio,
          hora_reserva,
          espacios_reservables_edificio(
            duracion_reserva
          )
        `)
        .eq("fecha_reserva", fechaReserva)
        .eq("activo", true)
        .neq("id_estatus_reserva", 3); // Excluir canceladas

      if (error) throw error;

      return data;
    },
    enabled: !!edificioIdSelected && !!fechaReserva && !!horaReserva,
  });

  // Fetch reservas previas de la cuenta de mantenimiento (últimos 30 días)
  const { data: reservasPreviasCuenta } = useQuery({
    queryKey: ["reservas_previas_cuenta", selectedCuentaMantenimiento?.id],
    queryFn: async () => {
      if (!selectedCuentaMantenimiento?.id) return [];

      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - 30);

      const { data, error } = await (supabase as any)
        .from("reservas")
        .select(`
          id,
          fecha_reserva,
          id_espacio_reservable_edificio,
          espacios_reservables_edificio(
            id,
            permitir_reservas_recurrentes,
            id_tipo_espacio_reservable
          ),
          acuerdos_pago!inner(
            id_cuenta_cobranza
          )
        `)
        .eq("acuerdos_pago.id_cuenta_cobranza", selectedCuentaMantenimiento.id)
        .eq("activo", true)
        .gte("fecha_reserva", fechaLimite.toISOString().split('T')[0]);

      if (error) throw error;

      return data;
    },
    enabled: !!selectedCuentaMantenimiento?.id,
  });

  // Función para verificar si un espacio está ocupado
  const verificarEspacioOcupado = (espacioId: number) => {
    if (!reservasExistentes || reservasExistentes.length === 0 || !horaReserva) return false;

    return reservasExistentes.some((reserva: any) => {
      if (reserva.id_espacio_reservable_edificio !== espacioId) return false;

      // Parsear hora de la reserva existente
      const [horaExistenteHr, horaExistenteMin] = reserva.hora_reserva.split(":").map(Number);
      const horaExistenteEnMinutos = horaExistenteHr * 60 + horaExistenteMin;

      // Parsear duración de la reserva existente
      const duracion = reserva.espacios_reservables_edificio?.duracion_reserva || "01:00:00";
      const duracionHoras = parseInt(duracion.split(":")[0]);
      const duracionEnMinutos = duracionHoras * 60;

      // Parsear hora seleccionada
      const [horaNuevaHr, horaNuevaMin] = horaReserva.split(":").map(Number);
      const horaNuevaEnMinutos = horaNuevaHr * 60 + horaNuevaMin;

      // Parsear duración del espacio actual
      const espacio = espacios?.find(e => e.id === espacioId);
      const duracionEspacio = espacio?.duracion_reserva || "01:00:00";
      const duracionEspacioHoras = parseInt(duracionEspacio.split(":")[0]);
      const duracionEspacioEnMinutos = duracionEspacioHoras * 60;

      // Verificar si hay solapamiento
      const finExistente = horaExistenteEnMinutos + duracionEnMinutos;
      const finNueva = horaNuevaEnMinutos + duracionEspacioEnMinutos;

      return (
        (horaNuevaEnMinutos >= horaExistenteEnMinutos && horaNuevaEnMinutos < finExistente) ||
        (finNueva > horaExistenteEnMinutos && finNueva <= finExistente) ||
        (horaNuevaEnMinutos <= horaExistenteEnMinutos && finNueva >= finExistente)
      );
    });
  };

  // Función para verificar si un espacio está permitido para esta cuenta (validar recurrencia)
  const verificarEspacioPermitidoParaCuenta = (espacioId: number) => {
    const espacio = espacios?.find(e => e.id === espacioId);
    
    if (!espacio) return { permitido: true };
    
    // Si permite reservas recurrentes, siempre está disponible
    if (espacio.permitir_reservas_recurrentes === true) {
      return { permitido: true };
    }
    
    // Si no permite recurrentes, verificar si ya fue reservado en los últimos 30 días
    if (!reservasPreviasCuenta || reservasPreviasCuenta.length === 0) {
      return { permitido: true };
    }
    
    // Buscar reservas previas del mismo tipo de espacio
    const tieneReservaPreviaDelMismoTipo = reservasPreviasCuenta.some((reserva: any) => {
      const espacioPrevio = reserva.espacios_reservables_edificio;
      return (
        espacioPrevio?.id_tipo_espacio_reservable === espacio.id_tipo_espacio_reservable &&
        espacioPrevio?.permitir_reservas_recurrentes === false
      );
    });
    
    if (tieneReservaPreviaDelMismoTipo) {
      return { 
        permitido: false, 
        mensaje: "Se ha reservado hace no menos de 30 días" 
      };
    }
    
    return { permitido: true };
  };


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

      // Llamar a la Edge Function para crear la reserva de forma transaccional
      const { data, error } = await supabase.functions.invoke('crear-reserva', {
        body: {
          id_cuenta_mantenimiento: selectedCuentaMantenimiento.id,
          id_espacio_reservable_edificio: values.id_espacio_reservable_edificio,
          id_persona_que_reserva: values.id_comprador,
          fecha_reserva: values.fecha_reserva,
          hora_reserva: values.hora_reserva,
          costo_final: costoFinal,
        },
      });

      if (error) {
        // Extraer el mensaje de error del contexto si está disponible
        const errorMessage = error.context?.error || error.message || 'Error al crear reserva';
        throw new Error(errorMessage);
      }
      if (!data.success) throw new Error(data.error || 'Error al crear reserva');
      
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      
      // Invalidar queries de mantenimiento si hay una cuenta preseleccionada
      if (preselectedCuentaMantenimientoId) {
        queryClient.invalidateQueries({ queryKey: ["cuenta_mantenimiento_detalle", preselectedCuentaMantenimientoId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", preselectedCuentaMantenimientoId] });
        queryClient.invalidateQueries({ queryKey: ["multas_mantenimiento", preselectedCuentaMantenimientoId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", preselectedCuentaMantenimientoId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", preselectedCuentaMantenimientoId] });
      }
      
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
    // Verificar si hay saldo pendiente antes de crear la reserva
    if (saldoPendiente && saldoPendiente > 0.01) {
      toast.error(`No se puede crear la reserva. La cuenta de mantenimiento tiene un saldo pendiente de $${saldoPendiente.toFixed(2)}`);
      return;
    }
    createMutation.mutate(values);
  };

  const handleEspacioChange = (espacioId: string) => {
    const espacio = espacios?.find((e) => e.id.toString() === espacioId);
    setSelectedEspacio(espacio);
    form.setValue("id_espacio_reservable_edificio", espacioId);
  };

  // Query para verificar saldo pendiente de la cuenta de mantenimiento
  const { data: saldoPendiente, isLoading: loadingSaldo } = useQuery({
    queryKey: ["saldo_pendiente_cuenta", selectedCuentaMantenimiento?.id],
    queryFn: async () => {
      if (!selectedCuentaMantenimiento?.id) return 0;

      // Obtener todos los acuerdos_pago de esta cuenta
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from('acuerdos_pago')
        .select('id, monto')
        .eq('id_cuenta_cobranza', selectedCuentaMantenimiento.id)
        .eq('activo', true);

      if (acuerdosError) throw acuerdosError;

      // Calcular total a pagar (incluyendo multas)
      const totalAPagar = acuerdos?.reduce((sum, acuerdo) => sum + (acuerdo.monto || 0), 0) || 0;

      // Obtener multas asociadas a estos acuerdos
      const acuerdoIds = acuerdos?.map(a => a.id) || [];
      let totalMultas = 0;
      
      if (acuerdoIds.length > 0) {
        const { data: multas } = await supabase
          .from('multas')
          .select('monto')
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true)
          .eq('es_pagada', false);
        
        totalMultas = multas?.reduce((sum, multa) => sum + (multa.monto || 0), 0) || 0;
      }

      // Obtener total aplicado (aplicaciones_pago)
      let totalAplicado = 0;
      if (acuerdoIds.length > 0) {
        const { data: aplicaciones, error: aplicacionesError } = await supabase
          .from('aplicaciones_pago')
          .select('monto')
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true);

        if (aplicacionesError) throw aplicacionesError;
        totalAplicado = aplicaciones?.reduce((sum, app) => sum + (app.monto || 0), 0) || 0;
      }

      // Obtener total pagado real (pagos directos a la cuenta)
      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('monto')
        .eq('id_cuenta_cobranza', selectedCuentaMantenimiento.id)
        .eq('activo', true);

      if (pagosError) throw pagosError;
      const totalPagadoReal = pagos?.reduce((sum, pago) => sum + (pago.monto || 0), 0) || 0;

      // Excedente = pagos reales - aplicaciones (dinero no aplicado aún)
      const excedente = totalPagadoReal - totalAplicado;

      // Saldo pendiente bruto = total a pagar + multas - total aplicado
      const saldoPendienteBruto = (totalAPagar + totalMultas) - totalAplicado;

      // Saldo pendiente real = descuenta el excedente (si hay excedente, cubre el pendiente)
      const saldoPendienteReal = Math.max(0, saldoPendienteBruto - excedente);
      
      return saldoPendienteReal;
    },
    enabled: !!selectedCuentaMantenimiento?.id,
  });

  const handlePropiedadChange = (propiedadId: string) => {
    const propiedad = propiedades?.find((p: any) => p.id.toString() === propiedadId);
    if (propiedad) {
      setSelectedCuentaMantenimiento({ id: propiedad.id_cuenta_mantenimiento });
    }
    form.setValue("id_propiedad", propiedadId);
    form.setValue("id_comprador", ""); // Reset comprador selection
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (cuentaMantenimientoData) {
        // Si hay datos preseleccionados, llenar el formulario
        form.reset({
          id_proyecto: cuentaMantenimientoData.id_proyecto.toString(),
          id_edificio: cuentaMantenimientoData.id_edificio.toString(),
          id_propiedad: cuentaMantenimientoData.id_propiedad.toString(),
          id_comprador: "",
          id_espacio_reservable_edificio: "",
          fecha_reserva: preselectedFecha || format(new Date(), "yyyy-MM-dd"),
          hora_reserva: preselectedHora || "09:00",
        });
        setSelectedCuentaMantenimiento({ id: cuentaMantenimientoData.id_cuenta_mantenimiento });
      } else {
        // Si no hay datos preseleccionados, resetear todo
        form.reset({
          id_proyecto: "",
          id_edificio: "",
          id_propiedad: "",
          id_comprador: "",
          id_espacio_reservable_edificio: "",
          fecha_reserva: preselectedFecha || format(new Date(), "yyyy-MM-dd"),
          hora_reserva: preselectedHora || "09:00",
        });
        setSelectedCuentaMantenimiento(null);
      }
      setSelectedEspacio(null);
    }
  }, [open, form, cuentaMantenimientoData, preselectedFecha, preselectedHora]);

  // Auto-select persona if only one exists
  useEffect(() => {
    if (personasQueReservan && personasQueReservan.length === 1) {
      form.setValue("id_comprador", personasQueReservan[0].id_persona.toString());
    }
  }, [personasQueReservan, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Reserva</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            </div>

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
                        setSelectedEspacio(null);
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
                        form.setValue("id_espacio_reservable_edificio", "");
                        setSelectedCuentaMantenimiento(null);
                        setSelectedEspacio(null);
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

            <FormField
              control={form.control}
              name="id_comprador"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persona que reserva</FormLabel>
                  <FormControl>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={!personasQueReservan || personasQueReservan.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar persona" />
                      </SelectTrigger>
                      <SelectContent>
                        {personasQueReservan && personasQueReservan.map((persona: any) => (
                          <SelectItem key={persona.id_persona} value={persona.id_persona.toString()}>
                            {persona.nombre} ({persona.tipo})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <FormLabel>Espacio a reservar</FormLabel>
                  <FormControl>
                    <Select 
                      onValueChange={handleEspacioChange} 
                      value={field.value}
                      disabled={!form.watch("id_edificio") || !fechaReserva || !horaReserva}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar espacio" />
                      </SelectTrigger>
                      <SelectContent>
                        {!fechaReserva || !horaReserva ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Seleccione fecha y hora primero
                          </div>
                        ) : (espacios || []).length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No hay espacios disponibles
                          </div>
                        ) : (
                          (espacios || []).map((espacio: any) => {
                            const ocupado = verificarEspacioOcupado(espacio.id);
                            const validacion = verificarEspacioPermitidoParaCuenta(espacio.id);
                            const noPermitido = !validacion.permitido;
                            const deshabilitado = ocupado || noPermitido;
                            const label = espacio.descripcion || espacio.tipos_espacio_reservables?.nombre || "Sin descripción";
                            
                            return (
                              <TooltipProvider key={espacio.id}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <SelectItem 
                                        value={espacio.id.toString()}
                                        disabled={deshabilitado}
                                      >
                                        {label} {ocupado ? "(ocupado)" : ""} {noPermitido ? `(${validacion.mensaje})` : ""}
                                      </SelectItem>
                                    </div>
                                  </TooltipTrigger>
                                  {noPermitido && (
                                    <TooltipContent>
                                      <p>{validacion.mensaje}</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedEspacio && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm"><strong>Costo por hora:</strong> ${Number(selectedEspacio.costo_por_hr || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                <p className="text-sm"><strong>Duración de reserva:</strong> {selectedEspacio.duracion_reserva || "No definida"}</p>
                <p className="text-sm"><strong>Costo total:</strong> ${(() => {
                  const costoPorHr = Number(selectedEspacio.costo_por_hr || 0);
                  const duracion = selectedEspacio.duracion_reserva || "01:00:00";
                  const horas = parseFloat(duracion.split(":")[0]) + parseFloat(duracion.split(":")[1]) / 60;
                  return (costoPorHr * horas).toLocaleString("es-MX", { minimumFractionDigits: 2 });
                })()}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button 
                        type="submit" 
                        disabled={createMutation.isPending || (saldoPendiente !== undefined && saldoPendiente > 0.01)}
                      >
                        {createMutation.isPending ? "Guardando..." : "Guardar Reserva"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {saldoPendiente !== undefined && saldoPendiente > 0.01 && (
                    <TooltipContent>
                      <p>Hay saldo pendiente, no se pueden agregar reservas</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
