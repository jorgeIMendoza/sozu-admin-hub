import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft, ChevronRight, User, Mail, Users, Eye, AlertTriangle,
  CheckCircle2, Loader2, RefreshCw, Clock, Calendar as CalendarIcon,
  FileText, MapPin, Info
} from "lucide-react";
import { format, startOfWeek, addDays, isBefore, isToday, addWeeks, subWeeks, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  1: { label: "Agendada", variant: "outline", color: "text-primary" },
  2: { label: "Pendiente", variant: "secondary", color: "text-warning" },
  3: { label: "Confirmada", variant: "default", color: "text-success" },
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
  fecha_fin_recurrencia: string | null;
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
  prospecto?: { nombre: string; apellido_paterno: string; email: string } | null;
  agente?: { nombre: string; apellido_paterno: string; email: string } | null;
}

interface Cita extends CitaRaw {
  nombre_prospecto: string | null;
  email_agente: string | null;
}

interface CalendarSlot {
  type: "empty" | "cita" | "group";
  config?: ConfigCita;
  cita?: Cita;
  citas?: Cita[];
  hora: number;
  configId: number;
  agendados?: number;
  maxInvitados?: number;
}

type CalendarStatus = "verified" | "missing" | "pending" | "unknown";

function parseTime(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
}

// ─── Detail Row ───
function DetailRow({ icon: Icon, label, children, className }: {
  icon: any; label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

// ─── Slot Card ───
function SlotCard({ slot, calendarStatus, onClick }: { slot: CalendarSlot; calendarStatus: CalendarStatus; onClick: () => void }) {
  if (slot.type === "empty" || slot.type === "group") {
    const isGroup = (slot.maxInvitados || 0) > 1;
    const agendados = slot.agendados || 0;
    const hasBookings = isGroup && agendados > 0;
    const isFull = isGroup && agendados >= (slot.maxInvitados || 0);
    return (
      <div
        onClick={onClick}
        className={cn(
          "absolute inset-x-1 inset-y-0.5 rounded-md border px-2 py-1 text-[10px] leading-tight cursor-pointer transition-all group",
          hasBookings
            ? "bg-primary/15 border-primary/50 hover:bg-primary/20 hover:shadow-sm"
            : "border-dashed border-muted-foreground/20 bg-muted/5 hover:border-primary/40 hover:bg-primary/5"
        )}
      >
        <div className="flex items-center gap-1.5 truncate">
          {hasBookings ? (
            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
          )}
          <span className={cn("truncate font-medium", hasBookings ? "text-foreground" : "text-muted-foreground")}>{slot.config?.nombre || "Disponible"}</span>
        </div>
        <div className="text-[9px] truncate mt-0.5">
          {isGroup
            ? <span className={hasBookings ? "text-primary font-semibold" : "opacity-60"}>{agendados}/{slot.maxInvitados} agendados{isFull ? " · Completa" : ""}</span>
            : <span className="opacity-60">{slot.config?.id_usuario_email}</span>}
        </div>
      </div>
    );
  }

  const cita = slot.cita!;
  const st = STATUS_MAP[cita.id_estatus_cita ?? 0] || { label: "?", variant: "outline" as const, color: "" };
  const hasInvitados = !!(cita.email_agente || cita.nombre_prospecto);
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute inset-x-1 inset-y-0.5 rounded-md border px-2 py-1 text-[10px] leading-tight overflow-hidden cursor-pointer transition-all group",
        isCancelledCalendar
          ? "bg-destructive/8 border-destructive/25 hover:bg-destructive/15"
          : hasInvitados
            ? "bg-primary/8 border-primary/25 hover:bg-primary/15 hover:shadow-sm"
            : "bg-secondary/50 border-secondary hover:bg-secondary/80"
      )}
    >
      {/* Status dot + name */}
      <div className="flex items-center gap-1.5 font-medium truncate text-foreground">
        {isCancelledCalendar ? (
          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
        ) : calendarStatus === "verified" ? (
          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-success" />
        ) : calendarStatus === "pending" ? (
          <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0",
            cita.id_estatus_cita === 1 ? "bg-primary" :
            cita.id_estatus_cita === 2 ? "bg-warning" :
            cita.id_estatus_cita === 3 ? "bg-success" : "bg-muted-foreground"
          )} />
        )}
        <span className="truncate">{slot.config?.nombre || "Cita"}</span>
      </div>

      {/* Invitado */}
      {cita.nombre_prospecto && (
        <div className="truncate flex items-center gap-1 mt-0.5 text-muted-foreground">
          <User className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{cita.nombre_prospecto}</span>
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
  const st = cita ? (STATUS_MAP[cita.id_estatus_cita ?? 0] || { label: "?", variant: "outline" as const, color: "" }) : null;
  const isCancelledCalendar = cita && (cita.estatus === "cancelada_calendar" || calendarStatus === "missing");

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header with gradient */}
        <div className={cn(
          "px-6 pt-6 pb-4",
          isCancelledCalendar
            ? "bg-destructive/5"
            : cita
              ? "bg-primary/5"
              : "bg-muted/30"
        )}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              {isCancelledCalendar && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {config?.nombre || "Espacio disponible"}
            </DialogTitle>
          </DialogHeader>

          {/* Status badge */}
          <div className="mt-3">
            {cita && st ? (
              <Badge
                variant={isCancelledCalendar ? "destructive" : st.variant}
                className="text-xs"
              >
                {isCancelledCalendar ? "No existe en Calendar" : st.label}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Sin agendar</Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-1">
          {/* Owner */}
          {config && (
            <DetailRow icon={User} label="Dueño">
              {config.id_usuario_email}
            </DetailRow>
          )}

          {/* Calendar email */}
          {config?.calendario_email && (
            <DetailRow icon={CalendarIcon} label="Calendar">
              {config.calendario_email}
            </DetailRow>
          )}

          {/* Description */}
          {config?.descripcion_invitacion && (
            <DetailRow icon={FileText} label="Descripción">
              {config.descripcion_invitacion}
            </DetailRow>
          )}

          {/* Date & Time (only for booked citas) */}
          {cita && (
            <>
              <Separator className="my-2" />
              <DetailRow icon={CalendarIcon} label="Fecha">
                {cita.fecha ? format(new Date(cita.fecha + "T12:00:00"), "EEEE d 'de' MMMM yyyy", { locale: es }) : "—"}
              </DetailRow>
              <DetailRow icon={Clock} label="Horario">
                {cita.hora_inicio} – {cita.hora_fin}
              </DetailRow>
            </>
          )}

          {config && (config.max_invitados || 1) > 1 && (
            <DetailRow icon={Users} label="Capacidad">
              {slot.agendados ?? 0}/{config.max_invitados} agendados
            </DetailRow>
          )}

          {/* Group attendees list */}
          {slot.type === "group" && slot.citas && slot.citas.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Asistentes agendados</p>
              <div className="space-y-1.5 mt-1">
                {slot.citas.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/15 px-3 py-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {c.nombre_prospecto && (
                        <p className="text-sm font-medium text-foreground truncate">{c.nombre_prospecto}</p>
                      )}
                      {c.email_agente && (
                        <p className="text-[11px] text-muted-foreground truncate">{c.email_agente}</p>
                      )}
                      {!c.nombre_prospecto && !c.email_agente && (
                        <p className="text-sm text-muted-foreground italic">Invitado #{c.id}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">
                      {STATUS_MAP[c.id_estatus_cita ?? 0]?.label || "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}

          {config && (
            <DetailRow icon={Clock} label="Duración">
              {config.duracion_minutos} minutos
            </DetailRow>
          )}

          {/* Invitados section */}
          {cita && (cita.nombre_prospecto || cita.email_agente) && (
            <>
              <Separator className="my-2" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Invitados</p>

              {cita.nombre_prospecto && (
                <DetailRow icon={Users} label="Prospecto">
                  <span className="font-medium">{cita.nombre_prospecto}</span>
                </DetailRow>
              )}

              {cita.email_agente && (
                <DetailRow icon={Mail} label="Agente">
                  {cita.email_agente}
                </DetailRow>
              )}
            </>
          )}

          {/* CC & Enterados */}
          {config && ((config.correos_enterado_fijos?.length ?? 0) > 0 || (config.correos_enterado?.length ?? 0) > 0) && (
            <>
              <Separator className="my-2" />
              {config.correos_enterado_fijos && config.correos_enterado_fijos.length > 0 && (
                <DetailRow icon={Eye} label="Siempre CC">
                  <div className="flex flex-wrap gap-1.5">
                    {config.correos_enterado_fijos.map(e => (
                      <Badge key={e} variant="secondary" className="text-[11px] font-normal">{e}</Badge>
                    ))}
                  </div>
                </DetailRow>
              )}
              {config.correos_enterado && config.correos_enterado.length > 0 && (
                <DetailRow icon={Eye} label="Enterados">
                  <div className="flex flex-wrap gap-1.5">
                    {config.correos_enterado.map(e => (
                      <Badge key={e} variant="outline" className="text-[11px] font-normal">{e}</Badge>
                    ))}
                  </div>
                </DetailRow>
              )}
            </>
          )}

          {/* Notes */}
          {cita?.notas && (
            <>
              <Separator className="my-2" />
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notas</p>
                <p className="text-sm text-foreground">{cita.notas}</p>
              </div>
            </>
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
        .select("id, nombre, id_usuario_email, calendario_email, correos_enterado, correos_enterado_fijos, duracion_minutos, max_invitados, descripcion_invitacion, fecha_fin_recurrencia")
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
        .select("id, id_configuracion_cita, id_estatus_cita, estatus, fecha, hora_inicio, hora_fin, id_persona_prospecto, id_agente, notas, google_calendar_event_id, activo")
        .eq("activo", true)
        .gte("fecha", format(weekStart, "yyyy-MM-dd"))
        .lte("fecha", format(weekEnd, "yyyy-MM-dd"))
        .order("hora_inicio", { ascending: true });
      if (error) { console.error("Error fetching citas:", error); return []; }

      const rawCitas = ((data || []) as unknown as CitaRaw[]).map(r => ({
        ...r,
        id_configuracion_cita: r.id_configuracion_cita || 0,
        id_estatus_cita: r.id_estatus_cita || 0,
      }));

      const personaIds = Array.from(new Set(rawCitas.flatMap((r) => [r.id_persona_prospecto, r.id_agente]).filter((id): id is number => !!id)));

      let personasMap = new Map<number, { nombre_legal: string | null; email: string | null }>();

      if (personaIds.length > 0) {
        const { data: personas, error: personasError } = await supabase
          .from("personas")
          .select("id, nombre_legal, email")
          .in("id", personaIds);

        if (personasError) {
          console.warn("Error fetching personas for citas:", personasError);
        } else {
          personasMap = new Map((personas || []).map((persona) => [persona.id, persona]));
        }
      }

      return rawCitas.map((r) => {
        const prospecto = r.id_persona_prospecto ? personasMap.get(r.id_persona_prospecto) : null;
        const agente = r.id_agente ? personasMap.get(r.id_agente) : null;

        return {
          ...r,
          nombre_prospecto: prospecto
            ? prospecto.nombre_legal || prospecto.email || null
            : null,
          email_agente: agente?.email || null,
        };
      }) as Cita[];
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

  const { minHour, maxHour } = useMemo(() => {
    let min = 9, max = 20;
    const relevantHorarios = ownerFilter === "all" ? horarios : horarios.filter(h => {
      const cfg = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : null;
      return cfg?.id_usuario_email === ownerFilter || h.id_usuario_email === ownerFilter;
    });
    if (relevantHorarios.length > 0) {
      const horas = relevantHorarios.map(h => h.hora);
      min = Math.min(...horas);
      max = Math.max(...horas) + 1;
    }
    return { minHour: min, maxHour: max };
  }, [horarios, ownerFilter, configMap]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = minHour; i < maxHour; i++) h.push(i);
    return h;
  }, [minHour, maxHour]);

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

  const citasIndex = useMemo(() => {
    const map = new Map<string, Cita[]>();
    filteredCitas.forEach(c => {
      const startHour = Math.floor(parseTime(c.hora_inicio));
      const key = `${c.fecha}_${startHour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [filteredCitas]);

  const ocupacionSlots = useMemo(() => {
    const map = new Map<string, Cita[]>();

    filteredCitas.forEach((cita) => {
      const slotHour = Math.floor(parseTime(cita.hora_inicio));
      const key = `${cita.fecha}_${cita.id_configuracion_cita}_${slotHour}`;

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cita);
    });

    return map;
  }, [filteredCitas]);

  const filteredHorarios = useMemo(() => {
    if (ownerFilter === "all") return horarios;
    return horarios.filter(h => {
      const cfg = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : null;
      return cfg?.id_usuario_email === ownerFilter || h.id_usuario_email === ownerFilter;
    });
  }, [horarios, ownerFilter, configMap]);

  const singleEmptySlotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    days.forEach(day => {
      const dayOfWeek = getDay(day);
      const dayHorarios = filteredHorarios.filter(h => h.dia_semana === dayOfWeek);
      const dayKey = format(day, "yyyy-MM-dd");

      dayHorarios.forEach(h => {
        const config = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : undefined;
        
        // Skip if config has a fecha_fin_recurrencia and this day is past it
        if (config?.fecha_fin_recurrencia) {
          const endDate = new Date(config.fecha_fin_recurrencia + "T23:59:59");
          if (day > endDate) return;
        }

        const key = `${dayKey}_${h.hora}`;
        const maxInv = config?.max_invitados || 1;

        if (maxInv > 1) return;

        const citasForConfig = ocupacionSlots.get(`${dayKey}_${h.id_configuracion_cita || 0}_${h.hora}`) || [];

        if (citasForConfig.length === 0) {
          const slot: CalendarSlot = { type: "empty", config, hora: h.hora, configId: h.id_configuracion_cita || 0 };
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(slot);
        }
      });
    });
    return map;
  }, [days, filteredHorarios, ocupacionSlots, configMap]);

  const groupSlotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();

    days.forEach((day) => {
      const dayOfWeek = getDay(day);
      const dayHorarios = filteredHorarios.filter((h) => h.dia_semana === dayOfWeek);
      const dayKey = format(day, "yyyy-MM-dd");

      dayHorarios.forEach((h) => {
        const config = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : undefined;

        if (config?.fecha_fin_recurrencia) {
          const endDate = new Date(config.fecha_fin_recurrencia + "T23:59:59");
          if (day > endDate) return;
        }

        const maxInv = config?.max_invitados || 1;
        if (maxInv <= 1) return;

        const key = `${dayKey}_${h.hora}`;
        const citasForConfig = ocupacionSlots.get(`${dayKey}_${h.id_configuracion_cita || 0}_${h.hora}`) || [];

        const slot: CalendarSlot = {
          type: "group",
          config,
          hora: h.hora,
          configId: h.id_configuracion_cita || 0,
          agendados: citasForConfig.length,
          maxInvitados: maxInv,
          citas: citasForConfig,
        };

        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(slot);
      });
    });

    return map;
  }, [days, filteredHorarios, ocupacionSlots, configMap]);

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
        body: { action: "verify-events-batch", reserva_ids: reservaIds, calendar_owner_email: "jorge.mendoza@sozu.com", tipo_cita_id: 1 },
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
  const slotHeight = 72;
  const numDays = days.length;

  // Stats
  const totalAgendadas = filteredCitas.length;
  const totalDisponibles = Array.from(singleEmptySlotsByDay.values()).reduce((acc, slots) => acc + slots.length, 0)
    + Array.from(groupSlotsByDay.values()).reduce((acc, slots) => acc + slots.filter((slot) => (slot.agendados || 0) < (slot.maxInvitados || 0)).length, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Todas las Citas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalAgendadas} agendada{totalAgendadas !== 1 ? "s" : ""} · {totalDisponibles} disponible{totalDisponibles !== 1 ? "s" : ""}
          </p>
        </div>
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
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-card border rounded-lg px-4 py-2.5">
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="text-xs">
            Hoy
          </Button>
          <span className="text-sm font-semibold text-foreground">
            {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-dashed border-muted-foreground/25 bg-muted/5" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          Agendada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-warning" />
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-success" />
          Confirmada
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          No en Calendar
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-success" />
          Verificada
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Cargando citas...</span>
        </div>
      ) : (
        <div className="border rounded-xl overflow-auto bg-card shadow-sm">
          <div className="grid min-w-[800px]" style={{ gridTemplateColumns: `64px repeat(${numDays}, 1fr)` }}>
            {/* Day headers */}
            <div className="border-b border-r bg-muted/20 p-2" />
            {days.map(day => {
              const past = isBefore(day, now) && !isToday(day);
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-b border-r py-3 px-2 text-center transition-colors",
                    today && "bg-primary/5",
                    past && "bg-muted/30"
                  )}
                >
                  <div className={cn(
                    "text-[11px] font-medium uppercase tracking-wider",
                    today ? "text-primary" : "text-muted-foreground"
                  )}>
                    {format(day, "EEE", { locale: es })}
                  </div>
                  <div className={cn(
                    "text-xl font-bold mt-0.5",
                    today ? "text-primary" : past ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}

            {/* Time grid */}
            {hours.map(hour => (
              <div key={`row-${hour}`} className="contents">
                <div
                  className="border-r border-b text-[11px] text-muted-foreground pr-2 text-right pt-1 font-medium"
                  style={{ height: slotHeight }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
                {days.map(day => {
                  const dayKey = format(day, "yyyy-MM-dd");
                  const past = isBefore(day, now) && !isToday(day);
                  const today = isToday(day);
                  const key = `${dayKey}_${hour}`;

                  const slotCitas = (citasIndex.get(key) || []).map(cita => ({
                    type: "cita" as const,
                    cita,
                    config: configMap.get(cita.id_configuracion_cita),
                    hora: parseTime(cita.hora_inicio),
                    configId: cita.id_configuracion_cita,
                  }));

                  const groupSlots = groupSlotsByDay.get(key) || [];
                  const emptySlots = singleEmptySlotsByDay.get(key) || [];

                  return (
                    <div
                      key={`${hour}-${dayKey}`}
                      className={cn(
                        "border-r border-b relative",
                        past && "bg-muted/10",
                        today && "bg-primary/[0.02]"
                      )}
                      style={{ height: slotHeight }}
                    >
                      {/* Half-hour guide */}
                      <div className="absolute left-0 right-0 border-b border-dashed border-border/20" style={{ top: slotHeight / 2 }} />

                      {/* Render all items side by side when multiple */}
                      {(() => {
                        const groupConfigIds = new Set<number>();
                        groupSlots.forEach(slot => {
                          groupConfigIds.add(slot.configId);
                        });

                        const allItems: { slot: CalendarSlot; top: number; height: number; status: CalendarStatus }[] = [];

                        groupSlots.forEach((slot) => {
                          const duration = slot.config?.duracion_minutos || 60;
                          const cardHeight = (duration / 60) * slotHeight;
                          allItems.push({ slot, top: 0, height: cardHeight, status: "unknown" });
                        });

                        emptySlots.forEach((slot) => {
                          const duration = slot.config?.duracion_minutos || 60;
                          const cardHeight = (duration / 60) * slotHeight;
                          allItems.push({ slot, top: 0, height: cardHeight, status: "unknown" });
                        });

                        slotCitas.forEach(slot => {
                          if (groupConfigIds.has(slot.configId)) return;
                          const start = slot.hora;
                          const end = parseTime(slot.cita!.hora_fin);
                          const topOffset = (start - hour) * slotHeight;
                          const cardHeight = (end - start) * slotHeight;
                          const status = calendarStatuses.get(slot.cita!.id) || (slot.cita!.estatus === "cancelada_calendar" ? "missing" : "unknown");
                          allItems.push({ slot, top: topOffset, height: cardHeight, status });
                        });

                        const totalItems = allItems.length;

                        return allItems.map((item, idx) => {
                          const widthPercent = totalItems > 1 ? (100 / totalItems) : 100;
                          const leftPercent = totalItems > 1 ? (idx * widthPercent) : 0;

                          return (
                            <div
                              key={`item-${idx}`}
                              className="absolute"
                              style={{
                                top: item.top,
                                height: item.height,
                                left: `calc(${leftPercent}% + ${idx > 0 ? 1 : 0}px)`,
                                width: `calc(${widthPercent}% - ${totalItems > 1 ? 1 : 0}px)`,
                                zIndex: item.slot.type === "cita" ? 10 : 5,
                              }}
                            >
                              <SlotCard slot={item.slot} calendarStatus={item.status} onClick={() => setSelectedSlot(item.slot)} />
                            </div>
                          );
                        });
                      })()}
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
