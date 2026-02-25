import { useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, Plus, Clock, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays, isBefore, startOfDay, parse } from "date-fns";
import { es } from "date-fns/locale";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { AddProspectoFloatingDialog } from "@/components/admin/AddProspectoFloatingDialog";
import { cn } from "@/lib/utils";

interface AgendarCitaShowroomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgendarCitaShowroomDialog({ open, onOpenChange }: AgendarCitaShowroomDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { track } = useCtaTracker();
  const hasTrackedFieldFill = useRef(false);

  const [selectedProspecto, setSelectedProspecto] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [addProspectoOpen, setAddProspectoOpen] = useState(false);

  // Fetch prospects assigned to this agent
  const { data: prospectos = [] } = useQuery({
    queryKey: ["mis-prospectos-showroom", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return [];

      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal,
            email
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id,
            nombre
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", profile.id_persona);

      if (error) throw error;
      return (data || [])
        .filter((er: any) => er.personas && er.id_proyecto)
        .map((er: any) => ({
          id: er.personas.id,
          nombre: er.personas.nombre_legal,
          email: er.personas.email,
          proyecto_id: er.id_proyecto,
          proyecto_nombre: er.proyectos?.nombre || "Sin proyecto",
        }));
    },
    enabled: open && !!profile?.id_persona,
  });

  const selectedProspectoData = useMemo(() => {
    return prospectos.find((p) => p.id.toString() === selectedProspecto);
  }, [prospectos, selectedProspecto]);

  const proyectoId = selectedProspectoData?.proyecto_id;

  // Fetch availability configs for Visita Showroom (tipo_cita=2) matching the prospect's project
  const { data: availabilityData, isLoading: availLoading } = useQuery({
    queryKey: ["showroom-availability", proyectoId],
    queryFn: async () => {
      if (!proyectoId) return { configs: [], horarios: [] };

      // Get configs linked to this project
      const { data: projectLinks } = await supabase
        .from("configuracion_citas_proyectos")
        .select("id_configuracion_cita")
        .eq("id_proyecto", proyectoId);

      if (!projectLinks || projectLinks.length === 0) return { configs: [], horarios: [] };

      const configIds = projectLinks.map((p: any) => p.id_configuracion_cita);

      // Get active configs for Visita Showroom
      const { data: configs } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id, nombre, duracion_minutos, fecha_fin_recurrencia, id_usuario_email")
        .eq("id_tipo_cita", 2)
        .eq("activo", true)
        .in("id", configIds);

      if (!configs || configs.length === 0) return { configs: [], horarios: [] };

      // Get horarios for these configs
      const { data: horarios } = await supabase
        .from("configuracion_citas_horarios")
        .select("id_configuracion_cita, dia_semana, hora")
        .eq("activo", true)
        .in("id_configuracion_cita", configs.map((c: any) => c.id));

      // Get person name for the config owner
      const emails = [...new Set(configs.map((c: any) => c.id_usuario_email))];
      const { data: personas } = await supabase
        .from("personas")
        .select("nombre_legal, email")
        .in("email", emails);

      const personaMap = new Map((personas || []).map((p: any) => [p.email, p.nombre_legal]));
      const enrichedConfigs = configs.map((c: any) => ({
        ...c,
        responsable: personaMap.get(c.id_usuario_email) || c.id_usuario_email,
      }));

      return { configs: enrichedConfigs, horarios: horarios || [] };
    },
    enabled: !!proyectoId,
  });

  // Fetch existing reservations to exclude booked slots
  const { data: existingReservations = [] } = useQuery({
    queryKey: ["existing-reservations-showroom", proyectoId],
    queryFn: async () => {
      if (!proyectoId || !availabilityData?.configs?.length) return [];
      const configIds = availabilityData.configs.map((c: any) => c.id);
      const { data } = await supabase
        .from("reservas_citas")
        .select("fecha, hora_inicio, id_configuracion_cita")
        .eq("id_tipo_cita", 2)
        .eq("activo", true)
        .in("id_configuracion_cita", configIds);
      return data || [];
    },
    enabled: !!proyectoId && !!availabilityData?.configs?.length,
  });

  // Generate available dates from configs and horarios
  const availableDates = useMemo(() => {
    if (!availabilityData?.configs?.length || !availabilityData?.horarios?.length) return [];

    const today = startOfDay(new Date());
    const dates: { dateStr: string; label: string; slots: { hour: number; configId: number; responsable: string; nombre: string }[] }[] = [];
    const dateMap = new Map<string, { hour: number; configId: number; responsable: string; nombre: string }[]>();

    for (const config of availabilityData.configs) {
      const endDate = config.fecha_fin_recurrencia ? new Date(config.fecha_fin_recurrencia + "T23:59:59") : addDays(today, 60);
      const configHorarios = availabilityData.horarios.filter((h: any) => h.id_configuracion_cita === config.id);

      // Generate dates for next 60 days or until fecha_fin_recurrencia
      for (let d = addDays(today, 1); isBefore(d, endDate) && isBefore(d, addDays(today, 61)); d = addDays(d, 1)) {
        const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...
        const matchingHorarios = configHorarios.filter((h: any) => h.dia_semana === dayOfWeek);

        if (matchingHorarios.length > 0) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (!dateMap.has(dateStr)) dateMap.set(dateStr, []);
          for (const h of matchingHorarios) {
            // Check if already booked
            const isBooked = existingReservations.some(
              (r: any) => r.fecha === dateStr && r.hora_inicio === `${String(h.hora).padStart(2, "0")}:00:00` && r.id_configuracion_cita === config.id
            );
            if (!isBooked) {
              dateMap.get(dateStr)!.push({
                hour: h.hora,
                configId: config.id,
                responsable: config.responsable,
                nombre: config.nombre,
              });
            }
          }
        }
      }
    }

    // Convert map to sorted array, filtering out dates with no available slots
    for (const [dateStr, slots] of dateMap.entries()) {
      if (slots.length > 0) {
        dates.push({
          dateStr,
          label: format(new Date(dateStr + "T12:00:00"), "EEE d MMM", { locale: es }),
          slots: slots.sort((a, b) => a.hour - b.hour),
        });
      }
    }

    return dates.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [availabilityData, existingReservations]);

  const selectedDateData = useMemo(() => {
    return availableDates.find((d) => d.dateStr === selectedDate);
  }, [availableDates, selectedDate]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProspecto || !selectedDate || !selectedHour || !selectedProspectoData || !selectedConfigId) {
        throw new Error("Completa todos los campos obligatorios");
      }

      const hour = parseInt(selectedHour);
      const horaInicio = `${String(hour).padStart(2, "0")}:00`;
      const config = availabilityData?.configs?.find((c: any) => c.id === selectedConfigId);
      const duracion = config?.duracion_minutos || 60;
      const endHour = hour + Math.floor(duracion / 60);
      const endMin = duracion % 60;
      const horaFin = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

      const { error } = await supabase
        .from("reservas_citas")
        .insert([{
          id_tipo_cita: 2,
          id_configuracion_cita: selectedConfigId,
          id_persona_prospecto: parseInt(selectedProspecto),
          id_proyecto: selectedProspectoData.proyecto_id,
          id_agente: profile?.id_persona,
          fecha: selectedDate,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          notas: notas || null,
          estatus: "programada",
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cita al showroom agendada exitosamente");
      queryClient.invalidateQueries({ queryKey: ["existing-reservations-showroom"] });
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const trackFieldFill = () => {
    if (!hasTrackedFieldFill.current) {
      hasTrackedFieldFill.current = true;
      track({ page: "modal_cita", elementId: "modal_cita_campo_llenado" });
    }
  };

  const handleClose = () => {
    setSelectedProspecto("");
    setSelectedDate("");
    setSelectedHour("");
    setSelectedConfigId(null);
    setNotas("");
    hasTrackedFieldFill.current = false;
    onOpenChange(false);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedHour("");
    setSelectedConfigId(null);
    trackFieldFill();
  };

  const handleSelectSlot = (hour: number, configId: number) => {
    setSelectedHour(String(hour));
    setSelectedConfigId(configId);
    trackFieldFill();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Agendar Cita al Showroom
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Prospecto */}
            <div className="space-y-2">
              <Label>Prospecto <span className="text-destructive">*</span></Label>
              {prospectos.length > 10 ? (
                <Combobox
                  value={selectedProspecto}
                  onValueChange={(v) => { setSelectedProspecto(v); setSelectedDate(""); setSelectedHour(""); setSelectedConfigId(null); }}
                  options={prospectos.map((p) => ({
                    value: p.id.toString(),
                    label: `${p.nombre} — ${p.proyecto_nombre}`,
                  }))}
                  placeholder="Seleccionar prospecto..."
                  searchPlaceholder="Buscar prospecto..."
                  emptyText="No tienes prospectos asignados"
                />
              ) : (
                <Select value={selectedProspecto} onValueChange={(v) => { setSelectedProspecto(v); setSelectedDate(""); setSelectedHour(""); setSelectedConfigId(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar prospecto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prospectos.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No tienes prospectos asignados</div>
                    ) : prospectos.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} — {p.proyecto_nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Crear prospecto link */}
              <button
                type="button"
                onClick={() => setAddProspectoOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear prospecto
              </button>
            </div>

            {/* Show project info */}
            {selectedProspectoData && (
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">Proyecto de interés: </span>
                <span className="font-medium">{selectedProspectoData.proyecto_nombre}</span>
              </div>
            )}

            {/* Date chips */}
            {selectedProspecto && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Fechas disponibles
                </Label>
                {availLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No hay fechas disponibles para este proyecto.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableDates.map((d) => (
                      <button
                        key={d.dateStr}
                        type="button"
                        onClick={() => handleSelectDate(d.dateStr)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                          selectedDate === d.dateStr
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Time slots */}
            {selectedDateData && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Horarios disponibles — {format(new Date(selectedDate + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </Label>
                <div className="space-y-3">
                  {/* Group slots by config */}
                  {(() => {
                    const grouped = new Map<number, typeof selectedDateData.slots>();
                    for (const slot of selectedDateData.slots) {
                      if (!grouped.has(slot.configId)) grouped.set(slot.configId, []);
                      grouped.get(slot.configId)!.push(slot);
                    }
                    return Array.from(grouped.entries()).map(([configId, slots]) => (
                      <div key={configId} className="border rounded-lg p-3 space-y-2">
                        <div>
                          <p className="text-sm font-semibold">{slots[0].nombre}</p>
                          <p className="text-xs text-muted-foreground">Responsable: {slots[0].responsable}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {slots.map((slot) => (
                            <button
                              key={`${configId}-${slot.hour}`}
                              type="button"
                              onClick={() => handleSelectSlot(slot.hour, configId)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                                selectedHour === String(slot.hour) && selectedConfigId === configId
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-background text-foreground border-border hover:bg-muted"
                              )}
                            >
                              {String(slot.hour).padStart(2, "0")}:00
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Agregar notas..."
                value={notas}
                onChange={(e) => { setNotas(e.target.value); trackFieldFill(); }}
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={() => { track({ page: "modal_cita", elementId: "modal_cita_guardar" }); createMutation.mutate(); }}
                disabled={createMutation.isPending || !selectedProspecto || !selectedDate || !selectedHour || !selectedConfigId}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Agendando...</> : "Agendar Cita"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested dialog for creating a new prospect */}
      <AddProspectoFloatingDialog
        open={addProspectoOpen}
        onOpenChange={(v) => {
          setAddProspectoOpen(v);
          if (!v) {
            queryClient.invalidateQueries({ queryKey: ["mis-prospectos-showroom"] });
          }
        }}
      />
    </>
  );
}