import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft, ChevronRight, User, Mail, Users, Eye, AlertTriangle,
  CheckCircle2, Loader2, RefreshCw, Clock, Calendar as CalendarIcon,
  FileText, MapPin, Info, GripVertical, ArrowRight
} from "lucide-react";
import { format, startOfWeek, addDays, isBefore, isToday, addWeeks, subWeeks, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  1: { label: "Agendada", variant: "outline", color: "text-primary" },
  2: { label: "Agendada", variant: "outline", color: "text-primary" },
  3: { label: "Confirmada", variant: "default", color: "text-green-600" },
  4: { label: "NO asistirá", variant: "destructive", color: "text-red-600" },
};

const RSVP_TO_ESTATUS: Record<string, number> = {
  accepted: 3,
  declined: 4,
  tentative: 2,
  needsAction: 1,
};

type SlotVisualStatus = "no_asistira" | "movida" | "confirmada" | "agendada" | "disponible";

function getEstatusFromRsvp(responseStatus?: string | null): number | null {
  if (!responseStatus) return null;
  return RSVP_TO_ESTATUS[responseStatus] ?? null;
}

function getEffectiveCitaEstatus(cita: Pick<Cita, "id_estatus_cita"> | null | undefined, responseStatus?: string | null): number {
  return getEstatusFromRsvp(responseStatus) ?? cita?.id_estatus_cita ?? 0;
}

function getCitaVisualStatus(cita: Cita, responseStatus?: string | null, isOverride?: boolean): SlotVisualStatus {
  const effectiveEstatus = getEffectiveCitaEstatus(cita, responseStatus);
  if (effectiveEstatus === 4) return "no_asistira";
  if (isOverride) return "movida";
  if (effectiveEstatus === 3) return "confirmada";

  const hasInvitado = !!(cita.email_invitado || cita.nombre_invitado);
  return hasInvitado ? "agendada" : "disponible";
}

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

interface HorarioOverride {
  id: number;
  id_configuracion_cita: number;
  id_horario: number;
  fecha_original: string;
  hora_original: number;
  fecha_nueva: string;
  hora_nueva: number;
  movido_por: string | null;
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
  id_persona: number | null;
  id_persona_prospecto: number | null;
  id_agente: number | null;
  notas: string | null;
  google_calendar_event_id: string | null;
  activo: boolean;
  prospecto?: { nombre: string; apellido_paterno: string; email: string } | null;
  agente?: { nombre: string; apellido_paterno: string; email: string } | null;
}

interface Cita extends CitaRaw {
  nombre_invitado: string | null;
  email_invitado: string | null;
  nombre_prospecto: string | null;
  email_prospecto: string | null;
  nombre_agente: string | null;
  email_agente: string | null;
}

interface CalendarSlot {
  type: "empty" | "cita" | "group";
  config?: ConfigCita;
  cita?: Cita;
  citas?: Cita[];
  hora: number;
  configId: number;
  horarioId?: number;
  agendados?: number;
  maxInvitados?: number;
  isOverride?: boolean;
  overrideFrom?: { fecha: string; hora: number };
}

interface DragData {
  slot: CalendarSlot;
  sourceDayKey: string;
  sourceHour: number;
}

type CalendarStatus = "verified" | "missing" | "pending" | "unknown";

function parseTime(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
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

// ─── Slot Card (Redesigned) ───
function SlotCard({ slot, calendarStatus, onClick, onDragStart, rsvpStatuses }: {
  slot: CalendarSlot; calendarStatus: CalendarStatus; onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  rsvpStatuses?: Map<number, string>;
}) {
  if (slot.type === "empty" || slot.type === "group") {
    const isGroup = (slot.maxInvitados || 0) > 1;
    const agendados = slot.agendados || 0;
    const hasBookings = isGroup && agendados > 0;
    const isFull = isGroup && agendados >= (slot.maxInvitados || 0);
    const occupancyPercent = isGroup ? Math.round((agendados / (slot.maxInvitados || 1)) * 100) : 0;
    const groupStatus = slot.type === "group" ? getSlotItemStatus({ slot, status: calendarStatus }, rsvpStatuses) : "disponible";
    const groupStyle = SLOT_STATUS_STYLES[groupStatus];

    return (
      <div
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        className={cn(
          "absolute inset-x-1 inset-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight cursor-grab active:cursor-grabbing transition-all group overflow-hidden",
          slot.isOverride && "ring-2 ring-orange-400 ring-offset-1",
            hasBookings
              ? cn(groupStyle.bg, groupStyle.border, "hover:shadow-md")
              : "border-dashed border-muted-foreground/25 bg-muted/10 hover:border-primary/40 hover:bg-primary/5"
        )}
      >
        <div className="flex items-center gap-1.5 truncate">
          <GripVertical className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          {hasBookings ? (
            <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", groupStyle.dot)} />
          ) : (
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />
          )}
          <span className={cn("truncate font-semibold", hasBookings ? "text-foreground" : "text-muted-foreground")}>
            {slot.config?.nombre || "Disponible"}
          </span>
          {slot.isOverride && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-orange-300 text-orange-600 flex-shrink-0">
              Movida
            </Badge>
          )}
        </div>

        {isGroup ? (
          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className={cn("font-medium", hasBookings ? groupStyle.text : "text-muted-foreground")}>
                {agendados}/{slot.maxInvitados}
              </span>
              {isFull && <span className="text-green-600 dark:text-green-400 font-semibold">Completa</span>}
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              {slot.citas && slot.citas.length > 0 ? (
                <div className="flex h-full" style={{ width: `${occupancyPercent}%` }}>
                  {slot.citas.map((c, i) => {
                    const effectiveEstatus = getEffectiveCitaEstatus(c, rsvpStatuses?.get(c.id));
                    const statusColor = effectiveEstatus === 3 ? "bg-green-500"
                      : effectiveEstatus === 4 ? "bg-red-500"
                      : "bg-blue-500";
                    return <div key={i} className={cn("h-full", statusColor)} style={{ width: `${100 / slot.citas!.length}%` }} />;
                  })}
                </div>
              ) : (
                <div
                  className={cn("h-full rounded-full transition-all", isFull ? "bg-green-500" : "bg-blue-500")}
                  style={{ width: `${occupancyPercent}%` }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="text-[10px] truncate mt-0.5 text-muted-foreground">
            {slot.config?.id_usuario_email}
          </div>
        )}
      </div>
    );
  }

  // ─ Cita individual card ─
  const cita = slot.cita!;
  const hasInvitados = !!(cita.email_invitado || cita.nombre_invitado);
  const effectiveEstatus = getEffectiveCitaEstatus(cita, rsvpStatuses?.get(cita.id));
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  const statusColors = isCancelledCalendar
    ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700 hover:shadow-md"
    : effectiveEstatus === 4
      ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700 hover:shadow-md"
    : effectiveEstatus === 3
      ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700 hover:shadow-md"
      : hasInvitados
        ? "bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-700 hover:shadow-md"
        : "bg-secondary/50 border-secondary hover:bg-secondary/80";

  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute inset-x-1 inset-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight overflow-hidden cursor-pointer transition-all group",
        statusColors
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold truncate text-foreground">
        {isCancelledCalendar ? (
          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
        ) : (
          <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0",
            effectiveEstatus === 4 ? "bg-red-500" :
            effectiveEstatus === 3 ? "bg-green-500" :
            hasInvitados ? "bg-blue-500" : "bg-muted-foreground"
          )} />
        )}
        <span className="truncate">{slot.config?.nombre || "Cita"}</span>
      </div>

      {cita.nombre_invitado && (
        <div className="truncate flex items-center gap-1.5 mt-1 text-muted-foreground">
          <div className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary text-[8px] font-bold flex-shrink-0">
            {getInitials(cita.nombre_invitado)}
          </div>
          <span className="truncate text-[10px]">{cita.nombre_invitado}</span>
        </div>
      )}
    </div>
  );
}

// ─── Stacked Slot Card ───
function getSlotItemStatus(item: { slot: CalendarSlot; status: CalendarStatus }, rsvpStatuses?: Map<number, string>): SlotVisualStatus {
  const slot = item.slot;
  // Individual cita
  if (slot.type === "cita" && slot.cita) {
    return getCitaVisualStatus(slot.cita, rsvpStatuses?.get(slot.cita.id), slot.isOverride);
  }
  // Group or empty slot
  if (slot.isOverride) return "movida";
  if (slot.type === "group" && slot.citas && slot.citas.length > 0) {
    // Check dominant status of booked citas
    if (slot.citas.some(c => getEffectiveCitaEstatus(c, rsvpStatuses?.get(c.id)) === 4)) return "no_asistira";
    if (slot.citas.some(c => getEffectiveCitaEstatus(c, rsvpStatuses?.get(c.id)) === 3)) return "confirmada";
    return "agendada";
  }
  return "disponible";
}

const SLOT_STATUS_STYLES: Record<SlotVisualStatus, { border: string; bg: string; dot: string; text: string }> = {
  no_asistira: { border: "border-red-300 dark:border-red-700", bg: "bg-red-50 dark:bg-red-950/30", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
  movida: { border: "border-orange-300 dark:border-orange-700", bg: "bg-orange-50 dark:bg-orange-950/30", dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-400" },
  confirmada: { border: "border-green-300 dark:border-green-700", bg: "bg-green-50 dark:bg-green-950/30", dot: "bg-green-500", text: "text-green-700 dark:text-green-400" },
  agendada: { border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50 dark:bg-blue-950/30", dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-400" },
  disponible: { border: "border-muted-foreground/25", bg: "bg-muted/10", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

const STATUS_HIERARCHY = ["no_asistira", "movida", "confirmada", "agendada", "disponible"] as const;

function getDominantStatus(items: { slot: CalendarSlot; status: CalendarStatus }[], rsvpStatuses?: Map<number, string>): SlotVisualStatus {
  const counts: Partial<Record<SlotVisualStatus, number>> = {};
  items.forEach(item => {
    const s = getSlotItemStatus(item, rsvpStatuses);
    counts[s] = (counts[s] || 0) + 1;
  });
  const populatedCounts = Object.values(counts);
  if (populatedCounts.length === 0) return "disponible";
  const maxCount = Math.max(...populatedCounts);
  const tied = (Object.keys(counts) as SlotVisualStatus[]).filter(k => counts[k] === maxCount);
  if (tied.length === 1) return tied[0];
  for (const h of STATUS_HIERARCHY) {
    if (tied.includes(h)) return h;
  }
  return "disponible";
}

function StackedSlotCard({ items, onSelectSlot, rsvpStatuses }: {
  items: { slot: CalendarSlot; status: CalendarStatus }[];
  onSelectSlot: (slot: CalendarSlot) => void;
  rsvpStatuses?: Map<number, string>;
}) {
  if (items.length <= 1) return null;

  const dominant = getDominantStatus(items, rsvpStatuses);
  const style = SLOT_STATUS_STYLES[dominant];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={cn("absolute inset-x-1 inset-y-0.5 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all hover:shadow-md overflow-hidden", style.border, style.bg)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", style.dot)} />
              <span className="font-semibold text-[11px] text-foreground truncate">
                {items.length} cita{items.length > 1 ? "s" : ""}
              </span>
            </div>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">
              {items.length}
            </Badge>
          </div>

          <div className="mt-1 space-y-0.5">
            {items.slice(0, 2).map((item, i) => {
              const itemStatus = getSlotItemStatus(item, rsvpStatuses);
              const itemStyle = SLOT_STATUS_STYLES[itemStatus];
              return (
                <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
                  <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", itemStyle.dot)} />
                  <span className="truncate font-medium">{item.slot.config?.nombre || (item.slot.type === "cita" ? "Cita" : "Disponible")}</span>
                </div>
              );
            })}
            {items.length > 2 && (
              <div className={cn("text-[9px] font-medium", style.text)}>+{items.length - 2} más</div>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b bg-muted/20">
          <p className="text-sm font-semibold text-foreground">{items.length} citas en este slot</p>
          <p className="text-xs text-muted-foreground mt-0.5">Click en cada uno para ver detalle</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
          {items.map((item, i) => {
            const slot = item.slot;
            const isCita = slot.type === "cita";
            const cita = slot.cita;
            const effectiveEstatus = cita ? getEffectiveCitaEstatus(cita, rsvpStatuses?.get(cita.id)) : 0;
            const statusInfo = cita ? (STATUS_MAP[effectiveEstatus] || { label: "?", variant: "outline" as const, color: "" }) : null;
            const itemStatus = getSlotItemStatus(item, rsvpStatuses);
            const itemStyle = SLOT_STATUS_STYLES[itemStatus];

            return (
              <div
                key={i}
                onClick={() => onSelectSlot(slot)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 cursor-pointer transition-colors border",
                  itemStatus === "no_asistira" ? "bg-red-50/50 border-red-200 hover:bg-red-100 dark:bg-red-950/20 dark:border-red-800" :
                  itemStatus === "movida" ? "bg-orange-50/50 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/20 dark:border-orange-800" :
                  itemStatus === "confirmada" ? "bg-green-50/50 border-green-200 hover:bg-green-100 dark:bg-green-950/20 dark:border-green-800" :
                  itemStatus === "agendada" ? "bg-blue-50/50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800" :
                  "bg-muted/30 border-border hover:bg-muted/60"
                )}
              >
                {isCita && cita ? (
                  <div className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0",
                    itemStatus === "no_asistira"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      : itemStatus === "confirmada"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : itemStatus === "agendada"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : itemStatus === "movida"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                        : "bg-muted text-muted-foreground"
                  )}>
                    {getInitials(cita.nombre_invitado)}
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex-shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {slot.config?.nombre || (isCita ? "Cita" : "Disponible")}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {isCita && cita ? (cita.nombre_invitado || cita.email_invitado || slot.config?.id_usuario_email || "") : (slot.config?.id_usuario_email || "")}
                  </p>
                </div>

                {isCita && statusInfo && (
                  <Badge
                    variant="outline"
                    className={cn("text-[9px] px-1.5 py-0 h-4 flex-shrink-0",
                      itemStatus === "confirmada" ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" :
                      itemStatus === "agendada" ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" :
                      itemStatus === "no_asistira" ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400" :
                      itemStatus === "movida" ? "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400" :
                      ""
                    )}
                  >
                    {itemStatus === "movida" ? "Movida" : statusInfo.label}
                  </Badge>
                )}
                {!isCita && (() => {
                  const isGroup = slot.type === "group" && (slot.maxInvitados || 0) > 1;
                  const agendados = slot.agendados || 0;
                  const maxInv = slot.maxInvitados || 0;
                  if (isGroup && agendados > 0) {
                    const itemStyle = SLOT_STATUS_STYLES[itemStatus];
                    return (
                      <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 flex-shrink-0", itemStyle.border, itemStyle.text)}>
                        {agendados}/{maxInv}
                      </Badge>
                    );
                  }
                  return (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0 text-muted-foreground">
                      {isGroup ? `0/${maxInv}` : "Disponible"}
                    </Badge>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── RSVP helpers ───
const RSVP_MAP: Record<string, { label: string; borderClass: string; textClass: string; bgClass: string; avatarClass: string }> = {
  accepted: {
    label: "Asistirá",
    borderClass: "border-green-300 dark:border-green-700",
    textClass: "text-green-700 dark:text-green-400",
    bgClass: "bg-green-50 dark:bg-green-950/20",
    avatarClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  },
  declined: {
    label: "NO asistirá",
    borderClass: "border-red-300 dark:border-red-700",
    textClass: "text-red-700 dark:text-red-400",
    bgClass: "bg-red-50 dark:bg-red-950/20",
    avatarClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  tentative: {
    label: "Agendada",
    borderClass: "border-blue-300 dark:border-blue-700",
    textClass: "text-blue-700 dark:text-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-950/20",
    avatarClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
  needsAction: {
    label: "Agendada",
    borderClass: "border-blue-300 dark:border-blue-700",
    textClass: "text-blue-700 dark:text-blue-400",
    bgClass: "bg-blue-50 dark:bg-blue-950/20",
    avatarClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
};

function getRsvpStyle(status: string) {
  return RSVP_MAP[status] || RSVP_MAP.needsAction;
}

// ─── RSVP Progress Bar ───
function RsvpProgressBar({ citas, maxInvitados, rsvpMap, rsvpLoading }: {
  citas: Cita[];
  maxInvitados: number;
  rsvpMap: Record<string, string>;
  rsvpLoading: boolean;
}) {
  if (rsvpLoading || citas.length === 0) {
    return <Progress value={(citas.length / maxInvitados) * 100} className="h-2" />;
  }

  const counts: Record<string, number> = { accepted: 0, declined: 0, tentative: 0, needsAction: 0 };
  citas.forEach(c => {
    const status = rsvpMap[`${c.id}`] || "needsAction";
    counts[status] = (counts[status] || 0) + 1;
  });

  const colorMap: Record<string, string> = {
    accepted: "bg-green-500",
    declined: "bg-red-500",
    tentative: "bg-blue-500",
    needsAction: "bg-blue-500",
  };

  const total = maxInvitados;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="flex h-full" style={{ width: `${(citas.length / total) * 100}%` }}>
        {["accepted", "needsAction", "tentative", "declined"].map(status => {
          if (!counts[status]) return null;
          const pct = (counts[status] / citas.length) * 100;
          return (
            <div
              key={status}
              className={cn("h-full transition-all", colorMap[status])}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SlotDetailDialog({ slot, calendarStatus, open, onClose }: {
  slot: CalendarSlot | null;
  calendarStatus: CalendarStatus;
  open: boolean;
  onClose: () => void;
}) {
  const [rsvpMap, setRsvpMap] = useState<Record<string, string>>({});
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const queryClient = useQueryClient();

  // Collect all google_calendar_event_ids and emails for this slot
  const eventIds = useMemo(() => {
    if (!slot) return [];
    const ids: Array<{ eventId: string; email: string; citaId: number }> = [];
    if (slot.type === "cita" && slot.cita?.google_calendar_event_id && slot.cita?.email_invitado) {
      ids.push({ eventId: slot.cita.google_calendar_event_id, email: slot.cita.email_invitado, citaId: slot.cita.id });
    }
    if (slot.type === "group" && slot.citas) {
      slot.citas.forEach(c => {
        if (c.google_calendar_event_id && c.email_invitado) {
          ids.push({ eventId: c.google_calendar_event_id, email: c.email_invitado, citaId: c.id });
        }
      });
    }
    return ids;
  }, [slot]);

  useEffect(() => {
    if (!open || eventIds.length === 0 || !slot?.config?.calendario_email) {
      setRsvpMap({});
      return;
    }

    const uniqueEventIds = [...new Set(eventIds.map(e => e.eventId))];
    setRsvpLoading(true);

    supabase.functions.invoke("consultar-estatus-calendar", {
      body: { event_ids: uniqueEventIds, calendario_email: slot.config.calendario_email },
    }).then(async ({ data, error }) => {
      if (error || !data?.events) {
        console.warn("Error fetching RSVP statuses:", error);
        setRsvpLoading(false);
        return;
      }

      const newMap: Record<string, string> = {};
      const dbUpdates: Array<{ id: number; newEstatus: number }> = [];
      console.log("[RSVP] Raw response events:", JSON.stringify(data.events));
      for (const entry of eventIds) {
        const eventData = data.events[entry.eventId];
        if (eventData?.attendees) {
          const attendee = eventData.attendees.find(
            (a: any) => a.email.toLowerCase() === entry.email.toLowerCase()
          );
          if (attendee) {
            newMap[`${entry.citaId}`] = attendee.responseStatus;
            // Sync id_estatus_cita if it differs
            const newEstatus = RSVP_TO_ESTATUS[attendee.responseStatus] ?? 1;
            const currentCita = slot?.type === "cita" ? slot.cita : slot?.citas?.find(c => c.id === entry.citaId);
            if (currentCita && newEstatus !== currentCita.id_estatus_cita) {
              dbUpdates.push({ id: entry.citaId, newEstatus });
            }
          }
        }
      }
      setRsvpMap(newMap);
      setRsvpLoading(false);

      // Persist status changes to DB and refresh calendar
      if (dbUpdates.length > 0) {
        console.log("[RSVP Detail Sync] Updating estatus:", dbUpdates);
        await Promise.all(dbUpdates.map(u =>
          supabase.from("reservas_citas").update({ id_estatus_cita: u.newEstatus }).eq("id", u.id)
        ));
        queryClient.invalidateQueries({ queryKey: ["all-citas-reservas-week"] });
      }
    }).catch(() => setRsvpLoading(false));
  }, [open, eventIds, slot?.config?.calendario_email]);

  if (!slot) return null;
  const config = slot.config;
  const cita = slot.cita;

  // Helper to get RSVP status for a cita
  const getCitaRsvp = (c: Cita) => {
    const rsvp = rsvpMap[`${c.id}`];
    return rsvp || null;
  };

  const effectiveEstatus = cita ? getEffectiveCitaEstatus(cita, getCitaRsvp(cita)) : null;
  const st = effectiveEstatus !== null
    ? (STATUS_MAP[effectiveEstatus] || { label: "?", variant: "outline" as const, color: "" })
    : null;
  const isCancelledCalendar = cita && (cita.estatus === "cancelada_calendar" || calendarStatus === "missing");

  const getRsvpBadge = (c: Cita) => {
    const rsvp = getCitaRsvp(c);
    if (rsvpLoading) {
      return (
        <Badge variant="outline" className="text-[10px] flex-shrink-0 border-muted text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      );
    }
    const style = getRsvpStyle(rsvp || "needsAction");
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] flex-shrink-0", style.borderClass, style.textClass, style.bgClass)}
      >
        {style.label}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className={cn(
          "px-6 pt-6 pb-4",
          isCancelledCalendar || effectiveEstatus === 4
            ? "bg-red-50 dark:bg-red-950/20"
            : cita
              ? effectiveEstatus === 3
                ? "bg-green-50 dark:bg-green-950/20"
                : "bg-blue-50 dark:bg-blue-950/20"
              : "bg-muted/30"
        )}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              {isCancelledCalendar && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {config?.nombre || "Espacio disponible"}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {cita && st ? (
              <Badge variant={isCancelledCalendar ? "destructive" : st.variant} className="text-xs">
                {isCancelledCalendar ? "No existe en Calendar" : st.label}
              </Badge>
            ) : (slot.agendados ?? 0) > 0 ? (
              <Badge variant="secondary" className="text-xs">{slot.agendados} agendado{(slot.agendados ?? 0) > 1 ? "s" : ""}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Sin agendar</Badge>
            )}
            {slot.isOverride && (
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                <ArrowRight className="h-3 w-3 mr-1" />
                Movida manualmente
              </Badge>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-1">

          {slot.isOverride && slot.overrideFrom && (
            <DetailRow icon={ArrowRight} label="Movida desde">
              <span className="text-orange-600 font-medium">
                {slot.overrideFrom.fecha} a las {String(slot.overrideFrom.hora).padStart(2, "0")}:00
              </span>
            </DetailRow>
          )}

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
              <div className="space-y-1.5">
                <span>{slot.agendados ?? 0}/{config.max_invitados} agendados</span>
                <RsvpProgressBar
                  citas={slot.type === "group" ? (slot.citas || []) : (cita ? [cita] : [])}
                  maxInvitados={config.max_invitados}
                  rsvpMap={rsvpMap}
                  rsvpLoading={rsvpLoading}
                />
              </div>
            </DetailRow>
          )}

          {slot.type === "group" && slot.citas && slot.citas.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Asistentes agendados</p>
              <div className="space-y-1.5 mt-1">
                {slot.citas.map((c) => {
                  const rsvp = getCitaRsvp(c);
                  const style = getRsvpStyle(rsvp || "needsAction");
                  return (
                    <div key={c.id} className={cn("flex items-center gap-2 rounded-md border px-3 py-2", style.bgClass, style.borderClass)}>
                      <div className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0",
                        style.avatarClass
                      )}>
                        {getInitials(c.nombre_invitado || c.email_invitado)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {(c.nombre_invitado || c.email_invitado) ? (
                          <>
                            <p className="text-sm font-medium text-foreground truncate">{c.nombre_invitado || c.email_invitado}</p>
                            {c.email_invitado && c.nombre_invitado && (
                              <p className="text-[11px] text-muted-foreground truncate">{c.email_invitado}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Invitado #{c.id}</p>
                        )}
                      </div>
                      {getRsvpBadge(c)}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {config && (
            <DetailRow icon={Clock} label="Duración">
              {config.duracion_minutos} minutos
            </DetailRow>
          )}

          {cita && (cita.nombre_invitado || cita.email_invitado || cita.nombre_prospecto || cita.email_prospecto || cita.nombre_agente || cita.email_agente) && (
            <>
              <Separator className="my-2" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Invitados</p>

              {(cita.nombre_invitado || cita.email_invitado) && (
                <DetailRow icon={Users} label="Invitado">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex-shrink-0">
                      {getInitials(cita.nombre_invitado)}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-medium">{cita.nombre_invitado || cita.email_invitado}</p>
                      {cita.email_invitado && cita.nombre_invitado && (
                        <p className="text-xs text-muted-foreground">{cita.email_invitado}</p>
                      )}
                    </div>
                    {cita.google_calendar_event_id && getRsvpBadge(cita)}
                  </div>
                </DetailRow>
              )}

              {cita.nombre_prospecto && cita.nombre_prospecto !== cita.nombre_invitado && (
                <DetailRow icon={Users} label="Prospecto">
                  <span className="font-medium">{cita.nombre_prospecto}</span>
                </DetailRow>
              )}

              {(cita.nombre_agente || cita.email_agente) && cita.email_agente !== cita.email_invitado && (
                <DetailRow icon={Mail} label="Agente">
                  <div className="space-y-0.5">
                    {cita.nombre_agente && <p className="font-medium">{cita.nombre_agente}</p>}
                    {cita.email_agente && <p className="text-xs text-muted-foreground">{cita.email_agente}</p>}
                  </div>
                </DetailRow>
              )}
            </>
          )}

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

// ─── Reschedule Confirmation Dialog ───
function RescheduleDialog({ open, onClose, onConfirm, dragData, targetDay, targetHour, isPending }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  dragData: DragData | null;
  targetDay: string;
  targetHour: number;
  isPending: boolean;
}) {
  if (!dragData) return null;
  const slot = dragData.slot;
  const hasBookings = slot.type === "group" ? (slot.agendados || 0) > 0 : slot.type === "cita";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Reagendar slot
          </DialogTitle>
          <DialogDescription>
            {hasBookings
              ? "Este slot tiene reservas agendadas. Se actualizarán las reservas y se notificará a los invitados vía Google Calendar."
              : "¿Mover este slot a la nueva fecha y hora?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex-1 rounded-md bg-muted/50 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Desde</p>
              <p className="font-semibold">{dragData.sourceDayKey}</p>
              <p className="text-muted-foreground">{String(dragData.sourceHour).padStart(2, "0")}:00</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 rounded-md bg-primary/10 p-3 text-center border border-primary/20">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Hacia</p>
              <p className="font-semibold">{targetDay}</p>
              <p className="text-muted-foreground">{String(targetHour).padStart(2, "0")}:00</p>
            </div>
          </div>

          <div className="rounded-md bg-muted/30 p-3 text-sm">
            <p className="font-medium">{slot.config?.nombre || "Slot"}</p>
            {hasBookings && (
              <p className="text-xs text-muted-foreground mt-1">
                {slot.type === "group" ? `${slot.agendados} reserva(s) serán reagendadas` : "1 reserva será reagendada"}
              </p>
            )}
          </div>

          {hasBookings && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Los invitados serán notificados del cambio de horario a través de Google Calendar.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Moviendo...</> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───

export default function TodasLasCitas() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [calendarStatuses, setCalendarStatuses] = useState<Map<number, CalendarStatus>>(new Map());
  const [rsvpStatuses, setRsvpStatuses] = useState<Map<number, string>>(new Map());
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);

  // Drag & drop state
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<{ dayKey: string; hour: number } | null>(null);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{ dayKey: string; hour: number } | null>(null);

  useEffect(() => {
    registrarVista("/admin/comunicacion/todas-las-citas");
    track({ page: "todas_las_citas", elementId: "page_view", elementType: "page" });
  }, []);

  // ─── Realtime subscription for auto-refresh ───
  useEffect(() => {
    const channel = supabase
      .channel("todas-citas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas_citas" }, () => {
        queryClient.invalidateQueries({ queryKey: ["all-citas-reservas-week"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracion_citas_usuarios" }, () => {
        queryClient.invalidateQueries({ queryKey: ["all-citas-configs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "citas_horarios_overrides" }, () => {
        queryClient.invalidateQueries({ queryKey: ["citas-overrides"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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

  // Fetch overrides for the visible week range (+ some margin)
  const weekEnd = addDays(weekStart, 6);
  const { data: overrides = [] } = useQuery({
    queryKey: ["citas-overrides", weekStart.toISOString()],
    queryFn: async () => {
      // Fetch overrides that have fecha_nueva or fecha_original within the visible week
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("citas_horarios_overrides")
        .select("*")
        .eq("activo", true)
        .or(`fecha_nueva.gte.${startStr},fecha_original.gte.${startStr}`)
        .or(`fecha_nueva.lte.${endStr},fecha_original.lte.${endStr}`);
      if (error) { console.error("Error fetching overrides:", error); return []; }
      return (data || []) as HorarioOverride[];
    },
  });

  const { data: citas = [], isLoading } = useQuery({
    queryKey: ["all-citas-reservas-week", weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas_citas")
        .select("id, id_configuracion_cita, id_estatus_cita, estatus, fecha, hora_inicio, hora_fin, id_persona, id_persona_prospecto, id_agente, notas, google_calendar_event_id, activo")
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

      const personaIds = Array.from(new Set(rawCitas.flatMap((r) => [r.id_persona, r.id_persona_prospecto, r.id_agente]).filter((id): id is number => !!id)));

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
        const invitado = r.id_persona ? personasMap.get(r.id_persona) : null;
        const prospecto = r.id_persona_prospecto ? personasMap.get(r.id_persona_prospecto) : null;
        const agente = r.id_agente ? personasMap.get(r.id_agente) : null;

        return {
          ...r,
          nombre_invitado: prospecto?.nombre_legal || invitado?.nombre_legal || agente?.nombre_legal || null,
          email_invitado: prospecto?.email || invitado?.email || agente?.email || null,
          nombre_prospecto: prospecto?.nombre_legal || null,
          email_prospecto: prospecto?.email || null,
          nombre_agente: agente?.nombre_legal || null,
          email_agente: agente?.email || null,
        };
      }) as Cita[];
    },
  });

  // ─── RSVP Sync: update id_estatus_cita from Google Calendar on load ───
  useEffect(() => {
    if (citas.length === 0 || configs.length === 0) {
      setRsvpStatuses(new Map());
      return;
    }

    // Build list of citas that have a google_calendar_event_id
    const citasWithEvent = citas.filter(c => c.google_calendar_event_id && c.email_invitado);
    if (citasWithEvent.length === 0) {
      setRsvpStatuses(new Map());
      return;
    }

    // Group by calendario_email
    const byCalendar = new Map<string, typeof citasWithEvent>();
    citasWithEvent.forEach(c => {
      const cfg = configs.find(cfg => cfg.id === c.id_configuracion_cita);
      const calEmail = cfg?.calendario_email;
      if (!calEmail) return;
      if (!byCalendar.has(calEmail)) byCalendar.set(calEmail, []);
      byCalendar.get(calEmail)!.push(c);
    });

    const syncAll = async () => {
      let cancelled = false;
      const nextRsvpStatuses = new Map<number, string>();
      let anyUpdated = false;
      for (const [calendarioEmail, citasGroup] of byCalendar) {
        const eventIds = [...new Set(citasGroup.map(c => c.google_calendar_event_id!))];
        try {
          const { data, error } = await supabase.functions.invoke("consultar-estatus-calendar", {
            body: { event_ids: eventIds, calendario_email: calendarioEmail },
          });
          if (error || !data?.events) {
            console.warn("[RSVP Sync] Error:", error);
            continue;
          }

          const updates: Array<{ id: number; newEstatus: number }> = [];
          for (const c of citasGroup) {
            const eventData = data.events[c.google_calendar_event_id!];
            if (!eventData?.attendees) continue;
            const attendee = eventData.attendees.find(
              (a: any) => a.email.toLowerCase() === c.email_invitado!.toLowerCase()
            );
            if (!attendee) continue;
            nextRsvpStatuses.set(c.id, attendee.responseStatus);
            const newEstatus = RSVP_TO_ESTATUS[attendee.responseStatus] ?? 1;
            if (newEstatus !== c.id_estatus_cita) {
              updates.push({ id: c.id, newEstatus });
            }
          }

          if (updates.length > 0) {
            console.log("[RSVP Sync] Updating estatus:", updates);
            const results = await Promise.all(updates.map(u =>
              supabase.from("reservas_citas").update({ id_estatus_cita: u.newEstatus }).eq("id", u.id)
            ));
            const failedUpdates = results.filter(result => result.error);
            if (failedUpdates.length > 0) {
              console.error("[RSVP Sync] Error updating estatus:", failedUpdates.map(result => result.error));
            } else {
              anyUpdated = true;
            }
          }
        } catch (err) {
          console.error("[RSVP Sync] Error:", err);
        }
      }
      if (cancelled) return;
      setRsvpStatuses(nextRsvpStatuses);
      if (anyUpdated) {
        queryClient.invalidateQueries({ queryKey: ["all-citas-reservas-week"] });
      }
      return () => {
        cancelled = true;
      };
    };
    let isCancelled = false;

    const runSync = async () => {
      const nextRsvpStatuses = new Map<number, string>();
      let anyUpdated = false;

      for (const [calendarioEmail, citasGroup] of byCalendar) {
        const eventIds = [...new Set(citasGroup.map(c => c.google_calendar_event_id!))];
        try {
          const { data, error } = await supabase.functions.invoke("consultar-estatus-calendar", {
            body: { event_ids: eventIds, calendario_email: calendarioEmail },
          });
          if (error || !data?.events) {
            console.warn("[RSVP Sync] Error:", error);
            continue;
          }

          const updates: Array<{ id: number; newEstatus: number }> = [];
          for (const c of citasGroup) {
            const eventData = data.events[c.google_calendar_event_id!];
            if (!eventData?.attendees) continue;
            const attendee = eventData.attendees.find(
              (a: any) => a.email.toLowerCase() === c.email_invitado!.toLowerCase()
            );
            if (!attendee) continue;

            nextRsvpStatuses.set(c.id, attendee.responseStatus);
            const newEstatus = RSVP_TO_ESTATUS[attendee.responseStatus] ?? 1;
            if (newEstatus !== c.id_estatus_cita) {
              updates.push({ id: c.id, newEstatus });
            }
          }

          if (updates.length > 0) {
            console.log("[RSVP Sync] Updating estatus:", updates);
            const results = await Promise.all(updates.map(u =>
              supabase.from("reservas_citas").update({ id_estatus_cita: u.newEstatus }).eq("id", u.id)
            ));
            const failedUpdates = results.filter(result => result.error);
            if (failedUpdates.length > 0) {
              console.error("[RSVP Sync] Error updating estatus:", failedUpdates.map(result => result.error));
            } else {
              anyUpdated = true;
            }
          }
        } catch (err) {
          console.error("[RSVP Sync] Error:", err);
        }
      }

      if (isCancelled) return;
      setRsvpStatuses(nextRsvpStatuses);

      if (anyUpdated) {
        queryClient.invalidateQueries({ queryKey: ["all-citas-reservas-week"] });
      }
    };

    runSync();

    return () => {
      isCancelled = true;
    };
  }, [citas, configs, queryClient]);


  const rescheduleMutation = useMutation({
    mutationFn: async (params: {
      id_horario: number;
      id_configuracion_cita: number;
      fecha_original: string;
      hora_original: number;
      fecha_nueva: string;
      hora_nueva: number;
    }) => {
      const { data, error } = await supabase.functions.invoke("reagendar-slot", {
        body: { ...params, movido_por: "admin" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Slot reagendado exitosamente");
      if (data?.calendar_errors?.length > 0) {
        data.calendar_errors.forEach((err: string) => toast.warning(err));
      }
      queryClient.invalidateQueries({ queryKey: ["all-citas-reservas-week"] });
      queryClient.invalidateQueries({ queryKey: ["citas-overrides"] });
      setRescheduleDialogOpen(false);
      setPendingDrop(null);
      setDragData(null);
    },
    onError: (err: any) => {
      toast.error(`Error al reagendar: ${err.message}`);
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
      // Exclude citas whose config no longer exists (obsolete/test)
      if (!c.id_configuracion_cita || !configMap.has(c.id_configuracion_cita)) return false;
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
    // Filter out horarios whose config no longer exists (obsolete/test configs)
    const withActiveConfig = horarios.filter(h => {
      if (!h.id_configuracion_cita) return false;
      return configMap.has(h.id_configuracion_cita);
    });
    if (ownerFilter === "all") return withActiveConfig;
    return withActiveConfig.filter(h => {
      const cfg = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : null;
      return cfg?.id_usuario_email === ownerFilter || h.id_usuario_email === ownerFilter;
    });
  }, [horarios, ownerFilter, configMap]);

  // Build override index: key = "fecha_original_horarioId" -> override
  const overridesByOriginal = useMemo(() => {
    const map = new Map<string, HorarioOverride>();
    overrides.forEach(o => {
      map.set(`${o.fecha_original}_${o.id_horario}`, o);
    });
    return map;
  }, [overrides]);

  // Build override index: key = "fecha_nueva_hora_nueva_configId" -> override
  const overridesByNew = useMemo(() => {
    const map = new Map<string, HorarioOverride>();
    overrides.forEach(o => {
      map.set(`${o.fecha_nueva}_${o.hora_nueva}_${o.id_configuracion_cita}`, o);
    });
    return map;
  }, [overrides]);

  const singleEmptySlotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    days.forEach(day => {
      const dayOfWeek = getDay(day);
      const dayHorarios = filteredHorarios.filter(h => h.dia_semana === dayOfWeek);
      const dayKey = format(day, "yyyy-MM-dd");

      dayHorarios.forEach(h => {
        const config = h.id_configuracion_cita ? configMap.get(h.id_configuracion_cita) : undefined;

        if (config?.fecha_fin_recurrencia) {
          const endDate = new Date(config.fecha_fin_recurrencia + "T23:59:59");
          if (day > endDate) return;
        }

        const maxInv = config?.max_invitados || 1;
        if (maxInv > 1) return;

        // Check if this slot was moved away
        const overrideKey = `${dayKey}_${h.id}`;
        const override = overridesByOriginal.get(overrideKey);
        if (override) return; // This slot was moved elsewhere, don't show here

        const key = `${dayKey}_${h.hora}`;
        const citasForConfig = ocupacionSlots.get(`${dayKey}_${h.id_configuracion_cita || 0}_${h.hora}`) || [];

        if (citasForConfig.length === 0) {
          const slot: CalendarSlot = { type: "empty", config, hora: h.hora, configId: h.id_configuracion_cita || 0, horarioId: h.id };
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(slot);
        }
      });

      // Add overrides that land on this day (slots moved TO here)
      overrides.forEach(o => {
        if (o.fecha_nueva !== dayKey) return;
        if (!o.activo) return;
        const config = configMap.get(o.id_configuracion_cita);
        if (!config) return;
        if (ownerFilter !== "all" && config.id_usuario_email !== ownerFilter) return;
        const maxInv = config.max_invitados || 1;
        if (maxInv > 1) return;

        const key = `${dayKey}_${o.hora_nueva}`;
        const citasForConfig = ocupacionSlots.get(`${dayKey}_${o.id_configuracion_cita}_${o.hora_nueva}`) || [];
        
        if (citasForConfig.length === 0) {
          const slot: CalendarSlot = {
            type: "empty", config, hora: o.hora_nueva, configId: o.id_configuracion_cita,
            horarioId: o.id_horario, isOverride: true,
            overrideFrom: { fecha: o.fecha_original, hora: o.hora_original },
          };
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(slot);
        }
      });
    });
    return map;
  }, [days, filteredHorarios, ocupacionSlots, configMap, overridesByOriginal, overrides, ownerFilter]);

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

        // Check if moved away
        const overrideKey = `${dayKey}_${h.id}`;
        if (overridesByOriginal.has(overrideKey)) return;

        const key = `${dayKey}_${h.hora}`;
        const citasForConfig = ocupacionSlots.get(`${dayKey}_${h.id_configuracion_cita || 0}_${h.hora}`) || [];

        const slot: CalendarSlot = {
          type: "group", config, hora: h.hora, configId: h.id_configuracion_cita || 0,
          horarioId: h.id, agendados: citasForConfig.length, maxInvitados: maxInv, citas: citasForConfig,
        };

        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(slot);
      });

      // Add group overrides landing here
      overrides.forEach(o => {
        if (o.fecha_nueva !== dayKey || !o.activo) return;
        const config = configMap.get(o.id_configuracion_cita);
        if (!config) return;
        if (ownerFilter !== "all" && config.id_usuario_email !== ownerFilter) return;
        const maxInv = config.max_invitados || 1;
        if (maxInv <= 1) return;

        const key = `${dayKey}_${o.hora_nueva}`;
        const citasForConfig = ocupacionSlots.get(`${dayKey}_${o.id_configuracion_cita}_${o.hora_nueva}`) || [];

        const slot: CalendarSlot = {
          type: "group", config, hora: o.hora_nueva, configId: o.id_configuracion_cita,
          horarioId: o.id_horario, agendados: citasForConfig.length, maxInvitados: maxInv,
          citas: citasForConfig, isOverride: true,
          overrideFrom: { fecha: o.fecha_original, hora: o.hora_original },
        };

        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(slot);
      });
    });

    return map;
  }, [days, filteredHorarios, ocupacionSlots, configMap, overridesByOriginal, overrides, ownerFilter]);

  // ─── Drag & Drop handlers ───

  const handleDragStart = useCallback((e: React.DragEvent, slot: CalendarSlot, dayKey: string, hour: number) => {
    // Only allow dragging empty/group slots (not individual cita cards)
    if (slot.type === "cita") {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "slot");
    setDragData({ slot, sourceDayKey: dayKey, sourceHour: hour });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string, hour: number) => {
    if (!dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ dayKey, hour });
  }, [dragData]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dayKey: string, hour: number) => {
    e.preventDefault();
    if (!dragData) return;

    // Don't drop on same spot
    if (dayKey === dragData.sourceDayKey && hour === dragData.sourceHour) {
      setDragData(null);
      setDropTarget(null);
      return;
    }

    setPendingDrop({ dayKey, hour });
    setRescheduleDialogOpen(true);
    setDropTarget(null);
  }, [dragData]);

  const handleDragEnd = useCallback(() => {
    setDropTarget(null);
    if (!rescheduleDialogOpen) {
      setDragData(null);
    }
  }, [rescheduleDialogOpen]);

  const confirmReschedule = useCallback(() => {
    if (!dragData || !pendingDrop) return;

    const slot = dragData.slot;
    if (!slot.horarioId || !slot.configId) {
      toast.error("No se puede mover este slot");
      return;
    }

    // If the slot was already moved (isOverride), use the ORIGINAL position, not the current one
    const fechaOriginal = slot.isOverride && slot.overrideFrom ? slot.overrideFrom.fecha : dragData.sourceDayKey;
    const horaOriginal = slot.isOverride && slot.overrideFrom ? slot.overrideFrom.hora : dragData.sourceHour;

    rescheduleMutation.mutate({
      id_horario: slot.horarioId,
      id_configuracion_cita: slot.configId,
      fecha_original: fechaOriginal,
      hora_original: horaOriginal,
      fecha_nueva: pendingDrop.dayKey,
      hora_nueva: pendingDrop.hour,
    });
  }, [dragData, pendingDrop, rescheduleMutation]);

  const now = new Date();
  const slotHeight = 80;
  const numDays = days.length;

  // Stats – only count citas that actually have a guest booked
  const totalAgendadas = filteredCitas.filter(c => !!(c.email_invitado || c.nombre_invitado)).length;
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
          <span className="w-3 h-3 rounded border border-dashed border-muted-foreground/25 bg-muted/10" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          Agendada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Confirmada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          NO asistirá
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded ring-2 ring-orange-400 bg-orange-50" />
          Movida manualmente
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
                    today && "bg-blue-50/50 dark:bg-blue-950/20",
                    past && "bg-muted/30"
                  )}
                >
                  <div className={cn(
                    "text-[11px] font-medium uppercase tracking-wider",
                    today ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                  )}>
                    {format(day, "EEE", { locale: es })}
                  </div>
                  <div className={cn(
                    "text-xl font-bold mt-0.5",
                    today ? "text-blue-600 dark:text-blue-400" : past ? "text-muted-foreground" : "text-foreground"
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

                  const isDropZone = dropTarget?.dayKey === dayKey && dropTarget?.hour === hour;

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
                        "border-r border-b relative transition-colors",
                        past && "bg-muted/10",
                        today && "bg-blue-50/20 dark:bg-blue-950/10",
                        isDropZone && "bg-primary/10 ring-2 ring-inset ring-primary/30"
                      )}
                      style={{ height: slotHeight }}
                      onDragOver={(e) => handleDragOver(e, dayKey, hour)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dayKey, hour)}
                    >
                      {/* Half-hour guide */}
                      <div className="absolute left-0 right-0 border-b border-dashed border-border/20" style={{ top: slotHeight / 2 }} />

                      {/* Render items */}
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

                        if (totalItems > 1) {
                          return (
                            <div className="absolute inset-0" style={{ zIndex: 10 }}>
                              <StackedSlotCard
                                items={allItems.map(item => ({ slot: item.slot, status: item.status }))}
                                onSelectSlot={(slot) => setSelectedSlot(slot)}
                                rsvpStatuses={rsvpStatuses}
                              />
                            </div>
                          );
                        }

                        return allItems.map((item, idx) => (
                          <div
                            key={`item-${idx}`}
                            className="absolute"
                            style={{
                              top: item.top,
                              height: item.height,
                              left: 0,
                              width: "100%",
                              zIndex: item.slot.type === "cita" ? 10 : 5,
                            }}
                          >
                            <SlotCard
                              slot={item.slot}
                              calendarStatus={item.status}
                              onClick={() => setSelectedSlot(item.slot)}
                              onDragStart={(e) => handleDragStart(e, item.slot, dayKey, hour)}
                              rsvpStatuses={rsvpStatuses}
                            />
                          </div>
                        ));
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

      {/* Reschedule Confirmation Dialog */}
      <RescheduleDialog
        open={rescheduleDialogOpen}
        onClose={() => { setRescheduleDialogOpen(false); setPendingDrop(null); setDragData(null); }}
        onConfirm={confirmReschedule}
        dragData={dragData}
        targetDay={pendingDrop?.dayKey || ""}
        targetHour={pendingDrop?.hour || 0}
        isPending={rescheduleMutation.isPending}
      />
    </div>
  );
}
