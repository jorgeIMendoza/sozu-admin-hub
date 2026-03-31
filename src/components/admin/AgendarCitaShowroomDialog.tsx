import { useState, useMemo, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, Plus, Clock, AlertCircle, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { AddProspectoFloatingDialog } from "@/components/admin/AddProspectoFloatingDialog";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Color palette for projects
const PROJECT_COLORS = [
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", badge: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-800", dot: "bg-cyan-500" },
];

interface AgendarCitaShowroomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProspectoAgrupado {
  id_persona: number;
  nombre: string;
  email: string;
  proyectos: { id: number; nombre: string }[];
}

export function AgendarCitaShowroomDialog({ open, onOpenChange }: AgendarCitaShowroomDialogProps) {
  const { profile, user } = useAuth();
  const { impersonatedAgentPersonaId, impersonatedAgentEmail } = useAgentImpersonation();
  const effectivePersonaId = impersonatedAgentPersonaId || profile?.id_persona;
  const effectiveAgentEmail = impersonatedAgentEmail || user?.email || profile?.email;
  const queryClient = useQueryClient();
  const { track } = useCtaTracker();
  const hasTrackedFieldFill = useRef(false);

  const [selectedProspecto, setSelectedProspecto] = useState("");
  const [selectedProyectoId, setSelectedProyectoId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [addProspectoOpen, setAddProspectoOpen] = useState(false);

  // Fetch prospects grouped by persona with all projects
  const { data: prospectosAgrupados = [] } = useQuery({
    queryKey: ["mis-prospectos-showroom", effectivePersonaId],
    queryFn: async (): Promise<ProspectoAgrupado[]> => {
      if (!effectivePersonaId) return [];

      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id, nombre_legal, email
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id, nombre
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", effectivePersonaId);

      if (error) throw error;

      const map = new Map<number, ProspectoAgrupado>();
      (data || []).forEach((er: any) => {
        if (!er.personas) return;
        const pid = er.personas.id;
        if (!map.has(pid)) {
          map.set(pid, {
            id_persona: pid,
            nombre: er.personas.nombre_legal || er.personas.email,
            email: er.personas.email,
            proyectos: [],
          });
        }
        if (er.id_proyecto && er.proyectos) {
          const p = map.get(pid)!;
          if (!p.proyectos.some(x => x.id === er.id_proyecto)) {
            p.proyectos.push({ id: er.id_proyecto, nombre: er.proyectos.nombre });
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    enabled: open && !!effectivePersonaId,
  });

  // Flat options for combobox: show only prospect name
  const prospectoOptions = useMemo(() => {
    return prospectosAgrupados.map(p => ({
      value: p.id_persona.toString(),
      label: p.nombre,
    }));
  }, [prospectosAgrupados]);

  const selectedProspectoData = useMemo(() => {
    return prospectosAgrupados.find(p => p.id_persona.toString() === selectedProspecto);
  }, [prospectosAgrupados, selectedProspecto]);

  // Project color map for the selected prospect
  const projectColorMap = useMemo(() => {
    const map = new Map<number, typeof PROJECT_COLORS[0]>();
    if (selectedProspectoData) {
      selectedProspectoData.proyectos.forEach((p, i) => {
        map.set(p.id, PROJECT_COLORS[i % PROJECT_COLORS.length]);
      });
    }
    return map;
  }, [selectedProspectoData]);

  // Fetch existing appointment for the selected prospect
  const { data: existingCita, isLoading: citaLoading } = useQuery({
    queryKey: ["existing-cita-prospecto", selectedProspecto],
    queryFn: async () => {
      if (!selectedProspecto) return null;
      const { data } = await supabase
        .from("reservas_citas")
        .select("id, fecha, hora_inicio, hora_fin, estatus, notas, id_configuracion_cita, id_proyecto")
        .eq("id_persona_prospecto", parseInt(selectedProspecto))
        .in("id_tipo_cita", [2, 5])
        .eq("activo", true)
        .in("estatus", ["programada"])
        .order("fecha", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!selectedProspecto,
  });

  // Fetch availability configs for ALL projects of the prospect
  const projectIds = selectedProspectoData?.proyectos.map(p => p.id) || [];

  const { data: availabilityData, isLoading: availLoading } = useQuery({
    queryKey: ["showroom-availability-multi", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return { configs: [], horarios: [] };

      const { data: projectLinks } = await supabase
        .from("configuracion_citas_proyectos")
        .select("id_configuracion_cita, id_proyecto")
        .in("id_proyecto", projectIds);

      if (!projectLinks || projectLinks.length === 0) return { configs: [], horarios: [] };

      const configIds = [...new Set(projectLinks.map((p: any) => p.id_configuracion_cita))];
      const configToProject = new Map<number, number>();
      projectLinks.forEach((pl: any) => configToProject.set(pl.id_configuracion_cita, pl.id_proyecto));

      const { data: configs } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id, nombre, duracion_minutos, fecha_fin_recurrencia, id_usuario_email")
        .in("id_tipo_cita", [2, 5])
        .eq("activo", true)
        .in("id", configIds);

      if (!configs || configs.length === 0) return { configs: [], horarios: [] };

      const { data: horarios } = await supabase
        .from("configuracion_citas_horarios")
        .select("id_configuracion_cita, dia_semana, hora")
        .eq("activo", true)
        .in("id_configuracion_cita", configs.map((c: any) => c.id));

      const emails = [...new Set(configs.map((c: any) => c.id_usuario_email))];
      const { data: personas } = await supabase
        .from("personas")
        .select("nombre_legal, email")
        .in("email", emails);

      const personaMap = new Map((personas || []).map((p: any) => [p.email, p.nombre_legal]));
      const enrichedConfigs = configs.map((c: any) => ({
        ...c,
        responsable: personaMap.get(c.id_usuario_email) || c.id_usuario_email,
        proyecto_id: configToProject.get(c.id) || null,
      }));

      return { configs: enrichedConfigs, horarios: horarios || [] };
    },
    enabled: projectIds.length > 0,
  });

  // Fetch existing reservations to exclude booked slots
  const { data: existingReservations = [] } = useQuery({
    queryKey: ["existing-reservations-showroom-multi", projectIds],
    queryFn: async () => {
      if (!availabilityData?.configs?.length) return [];
      const configIds = availabilityData.configs.map((c: any) => c.id);
      const { data } = await supabase
        .from("reservas_citas")
        .select("fecha, hora_inicio, id_configuracion_cita")
        .in("id_tipo_cita", [2, 5])
        .eq("activo", true)
        .in("id_configuracion_cita", configIds);
      return data || [];
    },
    enabled: !!availabilityData?.configs?.length,
  });

  // Generate available dates grouped by project
  const availableDatesByProject = useMemo(() => {
    if (!availabilityData?.configs?.length || !availabilityData?.horarios?.length) return new Map<number, any[]>();

    const today = startOfDay(new Date());
    // Map: projectId -> dateStr -> slots
    const projectDateMap = new Map<number, Map<string, { hour: number; configId: number; responsable: string; nombre: string }[]>>();

    for (const config of availabilityData.configs) {
      const projId = config.proyecto_id;
      if (!projId) continue;

      if (!projectDateMap.has(projId)) projectDateMap.set(projId, new Map());
      const dateMap = projectDateMap.get(projId)!;

      const endDate = config.fecha_fin_recurrencia ? new Date(config.fecha_fin_recurrencia + "T23:59:59") : addDays(today, 60);
      const configHorarios = availabilityData.horarios.filter((h: any) => h.id_configuracion_cita === config.id);

      for (let d = addDays(today, 1); isBefore(d, endDate) && isBefore(d, addDays(today, 61)); d = addDays(d, 1)) {
        const dayOfWeek = d.getDay();
        const matchingHorarios = configHorarios.filter((h: any) => h.dia_semana === dayOfWeek);

        if (matchingHorarios.length > 0) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (!dateMap.has(dateStr)) dateMap.set(dateStr, []);
          for (const h of matchingHorarios) {
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

    // Convert to sorted array per project
    const result = new Map<number, { dateStr: string; label: string; slots: any[] }[]>();
    for (const [projId, dateMap] of projectDateMap) {
      const dates: { dateStr: string; label: string; slots: any[] }[] = [];
      for (const [dateStr, slots] of dateMap.entries()) {
        if (slots.length > 0) {
          dates.push({
            dateStr,
            label: format(new Date(dateStr + "T12:00:00"), "EEE d MMM", { locale: es }),
            slots: slots.sort((a, b) => a.hour - b.hour),
          });
        }
      }
      result.set(projId, dates.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    }
    return result;
  }, [availabilityData, existingReservations]);

  const selectedDateData = useMemo(() => {
    if (!selectedProyectoId) return null;
    const dates = availableDatesByProject.get(selectedProyectoId) || [];
    return dates.find(d => d.dateStr === selectedDate) || null;
  }, [availableDatesByProject, selectedProyectoId, selectedDate]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProspecto || !selectedDate || !selectedHour || !selectedConfigId || !selectedProyectoId) {
        throw new Error("Completa todos los campos obligatorios");
      }

      const hour = parseInt(selectedHour);
      const horaInicio = `${String(hour).padStart(2, "0")}:00`;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("agendar-capacitacion", {
        body: {
          fecha: selectedDate,
          hora_inicio: horaInicio,
          id_persona: parseInt(selectedProspecto),
          agent_email: effectiveAgentEmail,
          config_id: selectedConfigId,
          id_persona_prospecto: parseInt(selectedProspecto),
          id_agente: effectivePersonaId,
          id_proyecto: selectedProyectoId,
          notas: notas || null,
        },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error === "no_disponible" ? fnData.message : fnData.error);
    },
    onSuccess: () => {
      toast.success("Cita al showroom agendada exitosamente");
      queryClient.invalidateQueries({ queryKey: ["existing-reservations-showroom-multi"] });
      queryClient.invalidateQueries({ queryKey: ["existing-cita-prospecto"] });
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
    setSelectedProyectoId(null);
    setSelectedDate("");
    setSelectedHour("");
    setSelectedConfigId(null);
    setNotas("");
    hasTrackedFieldFill.current = false;
    onOpenChange(false);
  };

  const handleSelectProspecto = (v: string) => {
    setSelectedProspecto(v);
    setSelectedProyectoId(null);
    setSelectedDate("");
    setSelectedHour("");
    setSelectedConfigId(null);
  };

  // Auto-select project when prospect has only one
  useEffect(() => {
    if (selectedProspecto && selectedProspectoData && selectedProspectoData.proyectos.length === 1 && !selectedProyectoId) {
      handleSelectProject(selectedProspectoData.proyectos[0].id);
    }
  }, [selectedProspecto, selectedProspectoData]);

  const handleSelectProject = (projId: number) => {
    setSelectedProyectoId(projId);
    setSelectedDate("");
    setSelectedHour("");
    setSelectedConfigId(null);
    trackFieldFill();
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

  // Check if rescheduling for the selected project
  const existingCitaForProject = useMemo(() => {
    if (!existingCita?.length || !selectedProyectoId) return null;
    return existingCita.find((c: any) => c.id_proyecto === selectedProyectoId) || null;
  }, [existingCita, selectedProyectoId]);

  const isRescheduling = !!existingCitaForProject;

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
              {prospectoOptions.length > 10 ? (
                <Combobox
                  value={selectedProspecto}
                  onValueChange={handleSelectProspecto}
                  options={prospectoOptions}
                  placeholder="Seleccionar prospecto..."
                  searchPlaceholder="Buscar prospecto..."
                  emptyText="No tienes prospectos asignados"
                />
              ) : (
                <Select value={selectedProspecto} onValueChange={handleSelectProspecto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar prospecto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prospectoOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No tienes prospectos asignados</div>
                    ) : prospectoOptions.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                type="button"
                onClick={() => setAddProspectoOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear prospecto
              </button>
            </div>

            {/* Existing appointments for all projects */}
            {selectedProspecto && existingCita && existingCita.length > 0 && (
              <div className="space-y-1.5">
                {existingCita.map((cita: any) => {
                  const color = projectColorMap.get(cita.id_proyecto) || PROJECT_COLORS[0];
                  const projName = selectedProspectoData?.proyectos.find(p => p.id === cita.id_proyecto)?.nombre || "";
                  return (
                    <div key={cita.id} className={cn("rounded-lg px-3 py-2 space-y-0.5 border", color.bg, color.border)}>
                      <div className={cn("flex items-center gap-1.5 text-xs font-medium", color.text)}>
                        <CalendarCheck className="h-3.5 w-3.5" />
                        Cita existente{projName ? ` — ${projName}` : ""}
                      </div>
                      <p className={cn("text-[11px]", color.text)}>
                        {format(new Date(cita.fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })} a las {cita.hora_inicio?.slice(0, 5)}
                        {cita.notas && <span className="block mt-0.5 opacity-80">Notas: {cita.notas}</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Project selector (dropdown) */}
            {selectedProspecto && selectedProspectoData && selectedProspectoData.proyectos.length > 0 && (
              <div className="space-y-2">
                <Label>Desarrollo para la cita <span className="text-destructive">*</span></Label>
                {selectedProspectoData.proyectos.length === 1 ? (
                  (() => {
                    const p = selectedProspectoData.proyectos[0];
                    const color = projectColorMap.get(p.id) || PROJECT_COLORS[0];
                    return (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-muted/30 text-sm">
                        <span className={cn("h-2 w-2 rounded-full", color.dot)} />
                        {p.nombre}
                      </div>
                    );
                  })()
                ) : (
                  <Select
                    value={selectedProyectoId?.toString() || ""}
                    onValueChange={(v) => handleSelectProject(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona desarrollo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProspectoData.proyectos.map(p => {
                        const color = projectColorMap.get(p.id) || PROJECT_COLORS[0];
                        return (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            <span className="flex items-center gap-1.5">
                              <span className={cn("h-2 w-2 rounded-full inline-block", color.dot)} />
                              {p.nombre}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Date chips - only after project selected */}
            {selectedProyectoId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Selecciona una fecha
                </Label>
                {availLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (() => {
                  const dates = availableDatesByProject.get(selectedProyectoId) || [];
                  if (dates.length === 0) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <p className="text-sm text-amber-800 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          No hay fechas disponibles para este desarrollo.
                        </p>
                        <p className="text-xs text-amber-700 mt-1">Contacta a tu Asesor Sozu para más información.</p>
                      </div>
                    );
                  }
                  const availableDateSet = new Set(dates.map(d => d.dateStr));
                  const availableDateObjects = dates.map(d => new Date(d.dateStr + "T12:00:00"));
                  const minDate = availableDateObjects.reduce((a, b) => a < b ? a : b);
                  const maxDate = availableDateObjects.reduce((a, b) => a > b ? a : b);

                  return (
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={selectedDate ? new Date(selectedDate + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          if (date) handleSelectDate(format(date, "yyyy-MM-dd"));
                        }}
                        disabled={(date) => {
                          const dateStr = format(date, "yyyy-MM-dd");
                          return !availableDateSet.has(dateStr);
                        }}
                        fromDate={minDate}
                        toDate={maxDate}
                        className="rounded-md border"
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Existing cita banner for selected project */}
            {existingCitaForProject && (
              <p className="text-[10px] text-muted-foreground">Selecciona nueva fecha y horario para reagendar esta cita.</p>
            )}

            {/* Time slots */}
            {selectedDateData && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  Horarios disponibles — {format(new Date(selectedDate + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
                </Label>
                <div className="space-y-3">
                  {(() => {
                    const grouped = new Map<number, typeof selectedDateData.slots>();
                    for (const slot of selectedDateData.slots) {
                      if (!grouped.has(slot.configId)) grouped.set(slot.configId, []);
                      grouped.get(slot.configId)!.push(slot);
                    }
                    const projColor = projectColorMap.get(selectedProyectoId!) || PROJECT_COLORS[0];
                    return Array.from(grouped.entries()).map(([configId, slots]) => (
                      <div key={configId} className={cn("border rounded-lg p-3 space-y-2", projColor.border, projColor.bg)}>
                        <div>
                          <p className={cn("text-sm font-semibold", projColor.text)}>{slots[0].nombre}</p>
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
                disabled={createMutation.isPending || !selectedProspecto || !selectedProyectoId || !selectedDate || !selectedHour || !selectedConfigId}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Agendando...</> : isRescheduling ? "Reagendar Cita" : "Agendar Cita"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
