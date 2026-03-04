import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, User, Mail, Users, Eye, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock, Calendar, FileText } from "lucide-react";
import { format, startOfWeek, addDays, isBefore, isToday, addWeeks, subWeeks, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  1: { label: "Agendada", variant: "outline" },
  2: { label: "Pendiente", variant: "secondary" },
  3: { label: "Confirmada", variant: "default" },
};

interface ConfigCita {
  id: number;
  nombre: string;
  id_usuario_email: string;
  calendario_email: string;
  correos_enterado: string[];
  correos_enterado_fijos: string[];
  duracion_minutos: number;
  max_invitados: number;
  descripcion_invitacion: string | null;
  hora_inicio: number;
  hora_fin: number;
}

interface Cita {
  id: number;
  id_configuracion_cita: number;
  id_estatus_cita: number;
  estatus: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  nombre_prospecto: string | null;
  email_agente: string | null;
  notas: string | null;
  google_calendar_event_id: string | null;
  activo: boolean;
}

type CalendarStatus = "verified" | "missing" | "pending" | "unknown";

function parseTime(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
}

function CalendarStatusIcon({ status }: { status: CalendarStatus }) {
  if (status === "verified") return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "missing") return <AlertTriangle className="h-3 w-3 text-destructive" />;
  if (status === "pending") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  return null;
}

function CitaCard({ cita, config, calendarStatus, onClick }: { cita: Cita; config?: ConfigCita; calendarStatus: CalendarStatus; onClick: () => void }) {
  const st = STATUS_MAP[cita.id_estatus_cita] || { label: "?", variant: "outline" as const };
  const hasInvitados = !!(cita.email_agente || cita.nombre_prospecto);
  const isPast = isBefore(new Date(cita.fecha + "T23:59:59"), new Date()) && !isToday(new Date(cita.fecha));
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute inset-x-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer transition-colors z-10 hover:ring-1 hover:ring-primary/40",
        isCancelledCalendar
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : isPast
            ? "bg-muted/60 border-muted text-muted-foreground"
            : hasInvitados
              ? "bg-primary/10 border-primary/30 text-foreground"
              : "bg-muted/40 border-border text-muted-foreground opacity-60"
      )}
    >
      <div className="flex items-center gap-1 font-medium truncate">
        <span className="flex-shrink-0"><CalendarStatusIcon status={isCancelledCalendar ? "missing" : calendarStatus} /></span>
        <Badge variant={isCancelledCalendar ? "destructive" : st.variant} className="text-[8px] px-1 py-0 h-3.5 leading-none">
          {isCancelledCalendar ? "No en Calendar" : st.label}
        </Badge>
        <span className="truncate">{config?.nombre || `Config #${cita.id_configuracion_cita}`}</span>
      </div>
      {cita.nombre_prospecto && (
        <div className="truncate flex items-center gap-0.5 mt-0.5">
          <Users className="h-2.5 w-2.5 flex-shrink-0" />
          {cita.nombre_prospecto}
        </div>
      )}
      {cita.email_agente && (
        <div className="truncate flex items-center gap-0.5">
          <Mail className="h-2.5 w-2.5 flex-shrink-0" />
          {cita.email_agente}
        </div>
      )}
    </div>
  );
}

function CitaDetailDialog({ cita, config, calendarStatus, open, onClose }: {
  cita: Cita | null;
  config?: ConfigCita;
  calendarStatus: CalendarStatus;
  open: boolean;
  onClose: () => void;
}) {
  if (!cita) return null;
  const st = STATUS_MAP[cita.id_estatus_cita] || { label: "?", variant: "outline" as const };
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarStatusIcon status={isCancelledCalendar ? "missing" : calendarStatus} />
            {config?.nombre || `Config #${cita.id_configuracion_cita}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium w-28">Estatus:</span>
            <Badge variant={isCancelledCalendar ? "destructive" : st.variant}>
              {isCancelledCalendar ? "No en Calendar" : st.label}
            </Badge>
          </div>

          {/* Date & time */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground font-medium w-24">Fecha:</span>
            <span>{cita.fecha ? format(new Date(cita.fecha + "T12:00:00"), "EEEE d MMMM yyyy", { locale: es }) : "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground font-medium w-24">Horario:</span>
            <span>{cita.hora_inicio} – {cita.hora_fin}</span>
          </div>

          {/* Owner */}
          {config && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium w-24">Dueño:</span>
              <span>{config.id_usuario_email}</span>
            </div>
          )}

          {/* Calendar email */}
          {config?.calendario_email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium w-24">Calendar:</span>
              <span className="truncate">{config.calendario_email}</span>
            </div>
          )}

          {/* Prospecto */}
          {cita.nombre_prospecto && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium w-24">Prospecto:</span>
              <span>{cita.nombre_prospecto}</span>
            </div>
          )}

          {/* Agent */}
          {cita.email_agente && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium w-24">Agente:</span>
              <span>{cita.email_agente}</span>
            </div>
          )}

          {/* Enterados siempre */}
          {config?.correos_enterado_fijos && config.correos_enterado_fijos.length > 0 && (
            <div className="flex items-start gap-2">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground font-medium w-24 flex-shrink-0">Siempre CC:</span>
              <span>{config.correos_enterado_fijos.join(", ")}</span>
            </div>
          )}

          {/* Enterados */}
          {config?.correos_enterado && config.correos_enterado.length > 0 && (
            <div className="flex items-start gap-2">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground font-medium w-24 flex-shrink-0">Enterados:</span>
              <span>{config.correos_enterado.join(", ")}</span>
            </div>
          )}

          {/* Google Event ID */}
          {cita.google_calendar_event_id && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium w-24">Event ID:</span>
              <span className="text-xs text-muted-foreground truncate">{cita.google_calendar_event_id}</span>
            </div>
          )}

          {/* Notes */}
          {cita.notas && (
            <div className="bg-muted/50 rounded p-3 text-sm">
              <span className="font-medium text-muted-foreground">Notas:</span>
              <p className="mt-1">{cita.notas}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TodasLasCitas() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [calendarStatuses, setCalendarStatuses] = useState<Map<number, CalendarStatus>>(new Map());
  const [selectedCita, setSelectedCita] = useState<Cita | null>(null);

  useEffect(() => {
    registrarVista("/admin/comunicacion/todas-las-citas");
    track({ page: "todas_las_citas", elementId: "page_view", elementType: "page" });
  }, []);

  const { data: configs = [] } = useQuery({
    queryKey: ["all-citas-configs"],
    queryFn: async () => {
      const { data } = await (supabase.from("configuracion_citas_usuarios") as any)
        .select("id, nombre, id_usuario_email, calendario_email, correos_enterado, correos_enterado_fijos, duracion_minutos, max_invitados, descripcion_invitacion, hora_inicio, hora_fin")
        .eq("activo", true);
      return (data || []) as ConfigCita[];
    },
  });

  const weekEnd = addDays(weekStart, 6);
  const { data: citas = [], isLoading } = useQuery({
    queryKey: ["all-citas-reservas-week", weekStart.toISOString()],
    queryFn: async () => {
      const { data } = await (supabase.from("reservas_citas") as any)
        .select("*")
        .eq("activo", true)
        .gte("fecha", format(weekStart, "yyyy-MM-dd"))
        .lte("fecha", format(weekEnd, "yyyy-MM-dd"))
        .order("hora_inicio", { ascending: true });
      return (data || []) as Cita[];
    },
  });

  const configMap = useMemo(() => {
    const m = new Map<number, ConfigCita>();
    configs.forEach(c => m.set(c.id, c));
    return m;
  }, [configs]);

  const owners = useMemo(() => {
    const set = new Set<string>();
    configs.forEach(c => set.add(c.id_usuario_email));
    return Array.from(set).sort();
  }, [configs]);

  const { minHour, maxHour } = useMemo(() => {
    let min = 9, max = 20;
    if (configs.length > 0) {
      const starts = configs.map(c => c.hora_inicio ?? 9).filter(Boolean);
      const ends = configs.map(c => c.hora_fin ?? 20).filter(Boolean);
      if (starts.length) min = Math.min(...starts);
      if (ends.length) max = Math.max(...ends);
    }
    return { minHour: min, maxHour: max };
  }, [configs]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = minHour; i < maxHour; i++) h.push(i);
    return h;
  }, [minHour, maxHour]);

  // Mon-Sat only (6 days, skip Sunday)
  const days = useMemo(() => {
    const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return allDays.filter(d => getDay(d) !== 0); // 0 = Sunday
  }, [weekStart]);

  const filteredCitas = useMemo(() => {
    return citas.filter((c) => {
      if (ownerFilter === "all") return true;
      const config = configMap.get(c.id_configuracion_cita);
      return config?.id_usuario_email === ownerFilter;
    });
  }, [citas, ownerFilter, configMap]);

  const citasByDay = useMemo(() => {
    const map = new Map<string, Cita[]>();
    filteredCitas.forEach(c => {
      const key = c.fecha;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [filteredCitas]);

  // Batch verify mutation
  const verifyMutation = useMutation({
    mutationFn: async (reservaIds: number[]) => {
      if (reservaIds.length === 0) return { results: [] };

      const pendingMap = new Map<number, CalendarStatus>();
      reservaIds.forEach(id => pendingMap.set(id, "pending"));
      setCalendarStatuses(prev => {
        const next = new Map(prev);
        pendingMap.forEach((v, k) => next.set(k, v));
        return next;
      });

      const { data, error } = await supabase.functions.invoke("agendar-capacitacion", {
        body: {
          action: "verify-events-batch",
          reserva_ids: reservaIds,
          calendar_owner_email: "jorge.mendoza@sozu.com",
          tipo_cita_id: 1,
        },
      });

      if (error) throw error;
      return data as { results: { reserva_id: number; exists: boolean; cancelled: boolean }[] };
    },
    onSuccess: (data) => {
      const newMap = new Map<number, CalendarStatus>();
      data.results.forEach(r => {
        newMap.set(r.reserva_id, r.exists ? "verified" : "missing");
      });
      setCalendarStatuses(prev => {
        const next = new Map(prev);
        newMap.forEach((v, k) => next.set(k, v));
        return next;
      });
      const missing = data.results.filter(r => !r.exists).length;
      if (missing > 0) {
        toast.warning(`${missing} cita(s) ya no existen en Google Calendar`);
      } else {
        toast.success("Todas las citas verificadas en Calendar");
      }
    },
    onError: (err: any) => {
      toast.error("Error verificando citas: " + (err.message || "desconocido"));
    },
  });

  const handleVerifyAll = useCallback(() => {
    const ids = filteredCitas
      .filter(c => c.google_calendar_event_id && c.estatus !== "cancelada_calendar")
      .map(c => c.id);
    if (ids.length === 0) {
      toast.info("No hay citas con evento de Calendar para verificar");
      return;
    }
    verifyMutation.mutate(ids);
  }, [filteredCitas, verifyMutation]);

  const now = new Date();
  const slotHeight = 64;
  const numDays = days.length; // 6 (no Sunday)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Todas las Citas</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerifyAll}
            disabled={verifyMutation.isPending}
            className="gap-1.5"
          >
            {verifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Verificar Calendar
          </Button>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Dueño" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los dueños</SelectItem>
              {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10 border border-primary/30" /> Con invitados</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted/40 border border-border opacity-60" /> Sin invitados</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted/60 border border-muted" /> Pasada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/10 border border-destructive/30" /> No en Calendar</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Verificada</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" /> Eliminada de Calendar</span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando citas...</p>
      ) : (
        <div className="border rounded-lg overflow-auto bg-card">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `60px repeat(${numDays}, 1fr)` }}>
            {/* Header row */}
            <div className="border-b border-r bg-muted/30 p-2" />
            {days.map(day => {
              const past = isBefore(day, now) && !isToday(day);
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-b border-r p-2 text-center text-xs font-medium",
                    today && "bg-primary/5",
                    past && "bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div className="uppercase">{format(day, "EEE", { locale: es })}</div>
                  <div className={cn("text-lg font-bold", today && "text-primary")}>{format(day, "d")}</div>
                </div>
              );
            })}

            {/* Time grid */}
            {hours.map(hour => (
              <>
                <div key={`label-${hour}`} className="border-r border-b text-[10px] text-muted-foreground pr-1 text-right pt-0.5" style={{ height: slotHeight }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
                {days.map(day => {
                  const dayKey = format(day, "yyyy-MM-dd");
                  const past = isBefore(day, now) && !isToday(day);
                  const today = isToday(day);
                  const dayCitas = citasByDay.get(dayKey) || [];
                  const slotCitas = dayCitas.filter(c => {
                    const start = parseTime(c.hora_inicio);
                    const end = parseTime(c.hora_fin);
                    return start < hour + 1 && end > hour;
                  });

                  return (
                    <div
                      key={`${hour}-${dayKey}`}
                      className={cn(
                        "border-r border-b relative",
                        past && "bg-muted/20",
                        today && "bg-primary/[0.02]"
                      )}
                      style={{ height: slotHeight }}
                    >
                      <div className="absolute left-0 right-0 border-b border-dashed border-border/40" style={{ top: slotHeight / 2 }} />

                      {slotCitas.map(cita => {
                        const start = parseTime(cita.hora_inicio);
                        if (start < hour || start >= hour + 1) return null;

                        const end = parseTime(cita.hora_fin);
                        const topOffset = (start - hour) * slotHeight;
                        const totalDuration = end - start;
                        const cardHeight = totalDuration * slotHeight;
                        const status = calendarStatuses.get(cita.id) || (cita.estatus === "cancelada_calendar" ? "missing" : "unknown");

                        return (
                          <div key={cita.id} className="absolute inset-x-0" style={{ top: topOffset, height: cardHeight, zIndex: 10 }}>
                            <CitaCard
                              cita={cita}
                              config={configMap.get(cita.id_configuracion_cita)}
                              calendarStatus={status}
                              onClick={() => setSelectedCita(cita)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <CitaDetailDialog
        cita={selectedCita}
        config={selectedCita ? configMap.get(selectedCita.id_configuracion_cita) : undefined}
        calendarStatus={selectedCita ? (calendarStatuses.get(selectedCita.id) || (selectedCita.estatus === "cancelada_calendar" ? "missing" : "unknown")) : "unknown"}
        open={!!selectedCita}
        onClose={() => setSelectedCita(null)}
      />
    </div>
  );
}
