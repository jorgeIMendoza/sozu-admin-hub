import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TRAINING_TYPE_ID = 1;

export interface AgentTrainingAppointment {
  id: number;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  google_calendar_event_id: string | null;
  estatus: string | null;
  id_estatus_cita: number | null;
  id_persona: number | null;
  id_agente: number | null;
  id_configuracion_cita: number | null;
  id_tipo_cita: number | null;
  activo: boolean;
  fecha_creacion: string | null;
  display_name: string;
  config_name: string | null;
  status_name: string | null;
}

export function getTrainingAppointmentStatus(appointment: Pick<AgentTrainingAppointment, "fecha" | "estatus" | "id_estatus_cita" | "status_name">) {
  if (appointment.id_estatus_cita === 3 || appointment.estatus === "asistio") {
    return { label: "Confirmada", tone: "success" as const };
  }

  // If the date has passed and it's still just "programada", show as unconfirmed
  const today = new Date().toISOString().split("T")[0];
  const isPast = appointment.fecha < today;

  if (appointment.id_estatus_cita === 2) {
    return { label: "Pend. confirmación", tone: "warning" as const };
  }

  if (appointment.id_estatus_cita === 1 || appointment.estatus === "programada") {
    if (isPast) {
      return { label: "Sin confirmar", tone: "neutral" as const };
    }
    return { label: "Agendada", tone: "info" as const };
  }

  if (appointment.estatus === "no_asistio") {
    return { label: "No asistió", tone: "danger" as const };
  }

  if (appointment.estatus === "cancelada") {
    return { label: "Cancelada", tone: "neutral" as const };
  }

  return {
    label: appointment.status_name || appointment.estatus || "Sin estatus",
    tone: "neutral" as const,
  };
}

export function useAgentTrainingAppointments(personaId: number | null | undefined) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["agent-training-appointments", personaId],
    queryFn: async () => {
      if (!personaId) return [];

      const { data: reservas, error } = await (supabase as any)
        .from("reservas_citas")
        .select(
          "id, fecha, hora_inicio, hora_fin, google_calendar_event_id, estatus, id_estatus_cita, id_persona, id_agente, id_configuracion_cita, id_tipo_cita, activo, fecha_creacion, tipos_cita(nombre), estatus_cita(nombre)",
        )
        .eq("activo", true)
        .or(`id_persona.eq.${personaId},id_agente.eq.${personaId}`)
        .order("fecha_creacion", { ascending: false });

      if (error) throw error;
      if (!reservas?.length) return [];

      const configIds = [...new Set(reservas.map((reserva: any) => reserva.id_configuracion_cita).filter(Boolean))] as number[];
      const configMap = new Map<number, { nombre: string | null; id_tipo_cita: number | null }>();

      if (configIds.length > 0) {
        const { data: configs, error: configError } = await (supabase as any)
          .from("configuracion_citas_usuarios")
          .select("id, nombre, id_tipo_cita")
          .in("id", configIds);

        if (configError) throw configError;

        (configs || []).forEach((config: any) => {
          configMap.set(config.id, {
            nombre: config.nombre ?? null,
            id_tipo_cita: config.id_tipo_cita ?? null,
          });
        });
      }

      return (reservas || [])
        .filter((reserva: any) => {
          const config = reserva.id_configuracion_cita ? configMap.get(reserva.id_configuracion_cita) : undefined;
          return reserva.id_tipo_cita === TRAINING_TYPE_ID || config?.id_tipo_cita === TRAINING_TYPE_ID;
        })
        .map((reserva: any) => {
          const config = reserva.id_configuracion_cita ? configMap.get(reserva.id_configuracion_cita) : undefined;
          const hasTrainingConfig = config?.id_tipo_cita === TRAINING_TYPE_ID;

          return {
            ...reserva,
            display_name: (hasTrainingConfig ? config?.nombre : null) || reserva.tipos_cita?.nombre || "Capacitación",
            config_name: hasTrainingConfig ? config?.nombre ?? null : null,
            status_name: reserva.estatus_cita?.nombre || null,
          } satisfies AgentTrainingAppointment;
        });
    },
    enabled: !!personaId,
    staleTime: 0,
  });

  return {
    appointments: data as AgentTrainingAppointment[],
    isLoading,
  };
}