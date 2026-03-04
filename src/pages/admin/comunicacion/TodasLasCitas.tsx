import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, User, Mail, Users, Eye, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Clock, Calendar as CalendarIcon } from "lucide-react";
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
  calendario_email: string | null;
  correos_enterado: string[] | null;
  correos_enterado_fijos: string[] | null;
  duracion_minutos: number;
  max_invitados: number;
  descripcion_invitacion: string | null;
}

interface Horario {
  id: number;
  id_configuracion_cita: number | null;
  id_usuario_email: string;
  dia_semana: number;
  hora: number;
  activo: boolean;
}

interface CitaRaw {
  id: number;
  id_configuracion_cita: number | null;
  id_estatus_cita: number | null;
  estatus: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  id_persona_prospecto: number | null;
  id_agente: number | null;
  notas: string | null;
  google_calendar_event_id: string | null;
  activo: boolean;
  // Joined
  prospecto?: { nombre: string; apellido_paterno: string; email: string } | null;
  agente?: { nombre: string; apellido_paterno: string; email: string } | null;
}

interface Cita extends CitaRaw {
  nombre_prospecto: string | null;
  email_agente: string | null;
}

// A unified slot that can be empty or have a cita
interface CalendarSlot {
  type: "empty" | "cita";
  config?: ConfigCita;
  cita?: Cita;
  hora: number;
  configId: number;
}

type CalendarStatus = "verified" | "missing" | "pending" | "unknown";

function parseTime(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
}

// ─── Slot Card (renders inside the calendar grid) ───

function SlotCard({ slot, calendarStatus, onClick }: { slot: CalendarSlot; calendarStatus: CalendarStatus; onClick: () => void }) {
  if (slot.type === "empty") {
    return (
      <div
        onClick={onClick}
        className="absolute inset-x-0.5 rounded border border-dashed border-border/50 px-1.5 py-0.5 text-[10px] leading-tight cursor-pointer transition-colors hover:bg-muted/30 bg-muted/10 text-muted-foreground"
      >
        <div className="flex items-center gap-1 truncate">
          <Clock className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{slot.config?.nombre || "Disponible"}</span>
        </div>
        <div className="text-[9px] truncate opacity-70">{slot.config?.id_usuario_email}</div>
      </div>
    );
  }

  const cita = slot.cita!;
  const st = STATUS_MAP[cita.id_estatus_cita] || { label: "?", variant: "outline" as const };
  const hasInvitados = !!(cita.email_agente || cita.nombre_prospecto);
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute inset-x-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer transition-colors z-10 hover:ring-1 hover:ring-primary/40",
        isCancelledCalendar
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : hasInvitados
            ? "bg-primary/10 border-primary/30 text-foreground"
            : "bg-accent/40 border-accent text-accent-foreground"
      )}
    >
      <div className="flex items-center gap-1 font-medium truncate">
        {isCancelledCalendar && <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />}
        {calendarStatus === "verified" && <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0 text-emerald-500" />}
        {calendarStatus === "pending" && <Loader2 className="h-2.5 w-2.5 flex-shrink-0 animate-spin" />}
        <Badge variant={isCancelledCalendar ? "destructive" : st.variant} className="text-[8px] px-1 py-0 h-3.5 leading-none">
          {isCancelledCalendar ? "No en Cal" : st.label}
        </Badge>
        <span className="truncate">{slot.config?.nombre || "Cita"}</span>
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

// ─── Detail Dialog ───

function SlotDetailDialog({ slot, calendarStatus, open, onClose }: {
  slot: CalendarSlot | null;
  calendarStatus: CalendarStatus;
  open: boolean;
  onClose: () => void;
}) {
  if (!slot) return null;
  const config = slot.config;
  const cita = slot.cita;
  const st = cita ? (STATUS_MAP[cita.id_estatus_cita] || { label: "?", variant: "outline" as const }) : null;
  const isCancelledCalendar = cita && (cita.estatus === "cancelada_calendar" || calendarStatus === "missing");

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isCancelledCalendar && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {config?.nombre || "Slot"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Status */}
          {cita && st && (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground font-medium min-w-[100px]">Estatus</span>
              <Badge variant={isCancelledCalendar ? "destructive" : st.variant}>
                {isCancelledCalendar ? "No existe en Calendar" : st.label}
              </Badge>
            </div>
          )}
          {!cita && (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground font-medium min-w-[100px]">Estatus</span>
              <Badge variant="outline">Sin agendar</Badge>
            </div>
          )}

          {/* Date & Time */}
          {cita && (
            <>
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground font-medium min-w-[80px]">Fecha</span>
                <span>{cita.fecha ? format(new Date(cita.fecha + "T12:00:00"), "EEEE d 'de' MMMM yyyy", { locale: es }) : "—"}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground font-medium min-w-[80px]">Horario</span>
                <span>{cita.hora_inicio} – {cita.hora_fin}</span>
              </div>
            </>
          )}

          {/* Dueño */}
          {config && (
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Dueño</span>
              <span>{config.id_usuario_email}</span>
            </div>
          )}

          {/* Calendar email */}
          {config?.calendario_email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Calendar</span>
              <span className="truncate">{config.calendario_email}</span>
            </div>
          )}

          {/* Descripción de la config */}
          {config?.descripcion_invitacion && (
            <div className="flex items-start gap-3">
              <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Descripción</span>
              <span className="text-foreground">{config.descripcion_invitacion}</span>
            </div>
          )}

          {/* Prospecto */}
          {cita?.nombre_prospecto && (
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Prospecto</span>
              <span className="font-medium">{cita.nombre_prospecto}</span>
            </div>
          )}

          {/* Agent */}
          {cita?.email_agente && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Agente</span>
              <span>{cita.email_agente}</span>
            </div>
          )}

          {/* Enterados siempre */}
          {config?.correos_enterado_fijos && config.correos_enterado_fijos.length > 0 && (
            <div className="flex items-start gap-3">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Siempre CC</span>
              <div className="flex flex-wrap gap-1">
                {config.correos_enterado_fijos.map(e => (
                  <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Enterados */}
          {config?.correos_enterado && config.correos_enterado.length > 0 && (
            <div className="flex items-start gap-3">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground font-medium min-w-[80px]">Enterados</span>
              <div className="flex flex-wrap gap-1">
                {config.correos_enterado.map(e => (
                  <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Duracion & max invitados */}
          {config && (
            <div className="flex items-center gap-6 text-muted-foreground text-xs pt-2 border-t">
              <span>Duración: {config.duracion_minutos} min</span>
              <span>Máx invitados: {config.max_invitados}</span>
            </div>
          )}

          {/* Notes */}
          {cita?.notas && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Notas</span>
              <p className="mt-1">{cita.notas}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

export default function TodasLasCitas() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [calendarStatuses, setCalendarStatuses] = useState<Map<number, CalendarStatus>>(new Map());
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);

  useEffect(() => {
    registrarVista("/admin/comunicacion/todas-las-citas");
    track({ page: "todas_las_citas", elementId: "page_view", elementType: "page" });
  }, []);

  // ─── Queries ───

  const { data: configs = [] } = useQuery({
    queryKey: ["all-citas-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id, nombre, id_usuario_email, calendario_email, correos_enterado, correos_enterado_fijos, duracion_minutos, max_invitados, descripcion_invitacion")
        .eq("activo", true);
      if (error) { console.error("Error fetching configs:", error); return []; }
      return (data || []) as ConfigCita[];
    },
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ["all-citas-horarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracion_citas_horarios")
        .select("id, id_configuracion_cita, id_usuario_email, dia_semana, hora, activo")
        .eq("activo", true);
      if (error) { console.error("Error fetching horarios:", error); return []; }
      return (data || []) as Horario[];
    },
  });

  const weekEnd = addDays(weekStart, 6);
  const { data: citas = [], isLoading } = useQuery({
    queryKey: ["all-citas-reservas-week", weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas_citas")
        .select("id, id_configuracion_cita, id_estatus_cita, estatus, fecha, hora_inicio, hora_fin, id_persona_prospecto, id_agente, notas, google_calendar_event_id, activo, prospecto:personas!reservas_citas_id_persona_prospecto_fkey(nombre, apellido_paterno, email), agente:personas!reservas_citas_id_agente_fkey(nombre, apellido_paterno, email)")
        .eq("activo", true)
        .gte("fecha", format(weekStart, "yyyy-MM-dd"))
        .lte("fecha", format(weekEnd, "yyyy-MM-dd"))
        .order("hora_inicio", { ascending: true });
      if (error) { console.error("Error fetching citas:", error); return []; }
      return ((data || []) as unknown as CitaRaw[]).map(r => ({
        ...r,
        id_configuracion_cita: r.id_configuracion_cita || 0,
        id_estatus_cita: r.id_estatus_cita || 0,
        nombre_prospecto: r.prospecto ? `${r.prospecto.nombre} ${r.prospecto.apellido_paterno}` : null,
        email_agente: r.agente?.email || null,
      })) as Cita[];
    },
  });

  // ─── Derived data ───

  const configMap = useMemo(() => {
    const m = new Map<number, ConfigCita>();
    configs.forEach(c => m.set(c.id, c));
    return m;
  }, [configs]);

  const owners = useMemo(() => {
    const set = new Set<string>();
    configs.forEach(c => { if (c.id_usuario_email) set.add(c.id_usuario_email); });
    return Array.from(set).sort();
  }, [configs]);

  // Compute time range from horarios
  const { minHour, maxHour } = useMemo(() => {
    let min = 9, max = 20;
    const relevantHorarios = ownerFilter === "all" ? horarios : horarios.filter(h => {
      const cfg = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : null;
      return cfg?.id_usuario_email === ownerFilter || h.id_usuario_email === ownerFilter;
    });
    if (relevantHorarios.length > 0) {
      const horas = relevantHorarios.map(h => h.hora);
      min = Math.min(...horas);
      max = Math.max(...horas) + 1; // +1 because hora is start of slot
    }
    return { minHour: min, maxHour: max };
  }, [horarios, ownerFilter, configMap]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = minHour; i < maxHour; i++) h.push(i);
    return h;
  }, [minHour, maxHour]);

  // Mon-Sat (no Sunday)
  const days = useMemo(() => {
    const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return allDays.filter(d => getDay(d) !== 0);
  }, [weekStart]);

  const filteredCitas = useMemo(() => {
    return citas.filter((c) => {
      if (ownerFilter === "all") return true;
      const config = configMap.get(c.id_configuracion_cita);
      return config?.id_usuario_email === ownerFilter;
    });
  }, [citas, ownerFilter, configMap]);

  // Group citas by day+hour for quick lookup
  const citasIndex = useMemo(() => {
    const map = new Map<string, Cita[]>(); // key: "yyyy-MM-dd_HH"
    filteredCitas.forEach(c => {
      const startHour = Math.floor(parseTime(c.hora_inicio));
      const key = `${c.fecha}_${startHour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [filteredCitas]);

  // Filtered horarios by owner
  const filteredHorarios = useMemo(() => {
    if (ownerFilter === "all") return horarios;
    return horarios.filter(h => {
      const cfg = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : null;
      return cfg?.id_usuario_email === ownerFilter || h.id_usuario_email === ownerFilter;
    });
  }, [horarios, ownerFilter, configMap]);

  // Build empty slots per day
  const emptySlotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>(); // key: "yyyy-MM-dd_HH"
    days.forEach(day => {
      const dayOfWeek = getDay(day); // 0=Sun..6=Sat
      const dayHorarios = filteredHorarios.filter(h => h.dia_semana === dayOfWeek);
      const dayKey = format(day, "yyyy-MM-dd");

      dayHorarios.forEach(h => {
        const key = `${dayKey}_${h.hora}`;
        const existingCitas = citasIndex.get(key) || [];
        // Only show empty slot if no cita exists for this config at this hour
        const hasCitaForConfig = existingCitas.some(c => c.id_configuracion_cita === h.id_configuracion_cita);
        if (!hasCitaForConfig) {
          const config = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : undefined;
          const slot: CalendarSlot = {
            type: "empty",
            config,
            hora: h.hora,
            configId: h.id_configuracion_cita || 0,
          };
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(slot);
        }
      });
    });
    return map;
  }, [days, filteredHorarios, citasIndex, configMap]);

  // ─── Batch verify ───

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
      setCalendarStatuses(prev => {
        const next = new Map(prev);
        data.results.forEach(r => next.set(r.reserva_id, r.exists ? "verified" : "missing"));
        return next;
      });
      const missing = data.results.filter(r => !r.exists).length;
      if (missing > 0) toast.warning(`${missing} cita(s) ya no existen en Google Calendar`);
      else toast.success("Todas las citas verificadas en Calendar");
    },
    onError: (err: any) => toast.error("Error verificando: " + (err.message || "desconocido")),
  });

  const handleVerifyAll = useCallback(() => {
    const ids = filteredCitas.filter(c => c.google_calendar_event_id && c.estatus !== "cancelada_calendar").map(c => c.id);
    if (ids.length === 0) { toast.info("No hay citas con evento de Calendar para verificar"); return; }
    verifyMutation.mutate(ids);
  }, [filteredCitas, verifyMutation]);

  const now = new Date();
  const slotHeight = 64;
  const numDays = days.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Todas las Citas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleVerifyAll} disabled={verifyMutation.isPending} className="gap-1.5">
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
          <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoy</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-dashed border-border/50 bg-muted/10" /> Disponible</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/40 border border-accent" /> Agendada sin invitados</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10 border border-primary/30" /> Agendada con invitados</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/10 border border-destructive/30" /> No en Calendar</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Verificada</span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando citas...</p>
      ) : (
        <div className="border rounded-lg overflow-auto bg-card">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `60px repeat(${numDays}, 1fr)` }}>
            {/* Header */}
            <div className="border-b border-r bg-muted/30 p-2" />
            {days.map(day => {
              const past = isBefore(day, now) && !isToday(day);
              const today = isToday(day);
              return (
                <div key={day.toISOString()} className={cn("border-b border-r p-2 text-center text-xs font-medium", today && "bg-primary/5", past && "bg-muted/40 text-muted-foreground")}>
                  <div className="uppercase">{format(day, "EEE", { locale: es })}</div>
                  <div className={cn("text-lg font-bold", today && "text-primary")}>{format(day, "d")}</div>
                </div>
              );
            })}

            {/* Time grid */}
            {hours.map(hour => (
              <div key={`row-${hour}`} className="contents">
                <div className="border-r border-b text-[10px] text-muted-foreground pr-1 text-right pt-0.5" style={{ height: slotHeight }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
                {days.map(day => {
                  const dayKey = format(day, "yyyy-MM-dd");
                  const past = isBefore(day, now) && !isToday(day);
                  const today = isToday(day);
                  const key = `${dayKey}_${hour}`;

                  // Citas in this slot
                  const slotCitas = (citasIndex.get(key) || []).map(cita => ({
                    type: "cita" as const,
                    cita,
                    config: configMap.get(cita.id_configuracion_cita),
                    hora: parseTime(cita.hora_inicio),
                    configId: cita.id_configuracion_cita,
                  }));

                  // Empty slots
                  const emptySlots = emptySlotsByDay.get(key) || [];

                  // Also include citas that START in a different hour but overlap this one
                  const overlapCitas = filteredCitas.filter(c => {
                    const start = parseTime(c.hora_inicio);
                    const end = parseTime(c.hora_fin);
                    const startHour = Math.floor(start);
                    return startHour !== hour && start < hour + 1 && end > hour;
                  });

                  return (
                    <div
                      key={`${hour}-${dayKey}`}
                      className={cn("border-r border-b relative", past && "bg-muted/20", today && "bg-primary/[0.02]")}
                      style={{ height: slotHeight }}
                    >
                      {/* Half-hour line */}
                      <div className="absolute left-0 right-0 border-b border-dashed border-border/40" style={{ top: slotHeight / 2 }} />

                      {/* Empty slots */}
                      {emptySlots.map((slot, idx) => {
                        const duration = slot.config?.duracion_minutos || 60;
                        const cardHeight = (duration / 60) * slotHeight;
                        return (
                          <div key={`empty-${idx}`} className="absolute inset-x-0" style={{ top: 0, height: cardHeight, zIndex: 5 }}>
                            <SlotCard slot={slot} calendarStatus="unknown" onClick={() => setSelectedSlot(slot)} />
                          </div>
                        );
                      })}

                      {/* Citas */}
                      {slotCitas.map(slot => {
                        const start = slot.hora;
                        const end = parseTime(slot.cita!.hora_fin);
                        const topOffset = (start - hour) * slotHeight;
                        const cardHeight = (end - start) * slotHeight;
                        const status = calendarStatuses.get(slot.cita!.id) || (slot.cita!.estatus === "cancelada_calendar" ? "missing" : "unknown");

                        return (
                          <div key={slot.cita!.id} className="absolute inset-x-0" style={{ top: topOffset, height: cardHeight, zIndex: 10 }}>
                            <SlotCard slot={slot} calendarStatus={status} onClick={() => setSelectedSlot(slot)} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <SlotDetailDialog
        slot={selectedSlot}
        calendarStatus={selectedSlot?.cita ? (calendarStatuses.get(selectedSlot.cita.id) || (selectedSlot.cita.estatus === "cancelada_calendar" ? "missing" : "unknown")) : "unknown"}
        open={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
      />
    </div>
  );
}
