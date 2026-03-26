import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
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
  agendados?: number;
  maxInvitados?: number;
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
function SlotCard({ slot, calendarStatus, onClick }: { slot: CalendarSlot; calendarStatus: CalendarStatus; onClick: () => void }) {
  if (slot.type === "empty" || slot.type === "group") {
    const isGroup = (slot.maxInvitados || 0) > 1;
    const agendados = slot.agendados || 0;
    const hasBookings = isGroup && agendados > 0;
    const isFull = isGroup && agendados >= (slot.maxInvitados || 0);
    const occupancyPercent = isGroup ? Math.round((agendados / (slot.maxInvitados || 1)) * 100) : 0;

    return (
      <div
        onClick={onClick}
        className={cn(
          "absolute inset-x-1 inset-y-0.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight cursor-pointer transition-all group overflow-hidden",
          isFull
            ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700 hover:shadow-md"
            : hasBookings
              ? "bg-blue-50 border-blue-300 dark:bg-blue-950/30 dark:border-blue-700 hover:shadow-md"
              : "border-dashed border-muted-foreground/25 bg-muted/10 hover:border-primary/40 hover:bg-primary/5"
        )}
      >
        <div className="flex items-center gap-1.5 truncate">
          {hasBookings ? (
            <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", isFull ? "bg-green-500" : "bg-blue-500")} />
          ) : (
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />
          )}
          <span className={cn("truncate font-semibold", hasBookings ? "text-foreground" : "text-muted-foreground")}>
            {slot.config?.nombre || "Disponible"}
          </span>
        </div>

        {isGroup ? (
          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className={cn("font-medium", isFull ? "text-green-700 dark:text-green-400" : hasBookings ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground")}>
                {agendados}/{slot.maxInvitados}
              </span>
              {isFull && <span className="text-green-600 dark:text-green-400 font-semibold">Completa</span>}
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", isFull ? "bg-green-500" : "bg-blue-500")}
                style={{ width: `${occupancyPercent}%` }}
              />
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
  const st = STATUS_MAP[cita.id_estatus_cita ?? 0] || { label: "?", variant: "outline" as const, color: "" };
  const hasInvitados = !!(cita.email_invitado || cita.nombre_invitado);
  const isCancelledCalendar = cita.estatus === "cancelada_calendar" || calendarStatus === "missing";

  // Status-based colors
  const statusColors = isCancelledCalendar
    ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700 hover:shadow-md"
    : cita.id_estatus_cita === 3
      ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700 hover:shadow-md"
      : cita.id_estatus_cita === 2
        ? "bg-yellow-50 border-yellow-300 dark:bg-yellow-950/30 dark:border-yellow-700 hover:shadow-md"
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
      {/* Status icon + name */}
      <div className="flex items-center gap-1.5 font-semibold truncate text-foreground">
        {isCancelledCalendar ? (
          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
        ) : calendarStatus === "verified" ? (
          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-600" />
        ) : calendarStatus === "pending" ? (
          <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0",
            cita.id_estatus_cita === 1 ? "bg-blue-500" :
            cita.id_estatus_cita === 2 ? "bg-yellow-500" :
            cita.id_estatus_cita === 3 ? "bg-green-500" : "bg-muted-foreground"
          )} />
        )}
        <span className="truncate">{slot.config?.nombre || "Cita"}</span>
      </div>

      {/* Invitado with mini avatar */}
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

// ─── Stacked Slot Card (for multiple items) ───
function StackedSlotCard({ items, onSelectSlot }: {
  items: { slot: CalendarSlot; status: CalendarStatus }[];
  onSelectSlot: (slot: CalendarSlot) => void;
}) {
  const citaItems = items.filter(i => i.slot.type === "cita");
  const otherItems = items.filter(i => i.slot.type !== "cita");
  const totalCitas = citaItems.length;

  if (items.length <= 1) return null; // shouldn't happen, handled elsewhere

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="absolute inset-x-1 inset-y-0.5 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-2.5 py-1.5 cursor-pointer transition-all hover:shadow-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="font-semibold text-[11px] text-foreground truncate">
                {totalCitas > 0 ? `${totalCitas} cita${totalCitas > 1 ? "s" : ""}` : items[0].slot.config?.nombre || "Slots"}
              </span>
            </div>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0">
              {items.length}
            </Badge>
          </div>

          {/* Preview chips (first 2 citas) */}
          <div className="mt-1 space-y-0.5">
            {citaItems.slice(0, 2).map((item, i) => (
              <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
                <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/15 text-primary text-[7px] font-bold flex-shrink-0">
                  {getInitials(item.slot.cita?.nombre_invitado || null)}
                </div>
                <span className="truncate">{item.slot.cita?.nombre_invitado || item.slot.cita?.email_invitado || "Invitado"}</span>
              </div>
            ))}
            {totalCitas > 2 && (
              <div className="text-[9px] text-blue-600 dark:text-blue-400 font-medium">+{totalCitas - 2} más</div>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b bg-muted/20">
          <p className="text-sm font-semibold text-foreground">{items.length} elementos en este slot</p>
          <p className="text-xs text-muted-foreground mt-0.5">Click en cada uno para ver detalle</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
          {items.map((item, i) => {
            const slot = item.slot;
            const isCita = slot.type === "cita";
            const cita = slot.cita;
            const statusInfo = cita ? STATUS_MAP[cita.id_estatus_cita ?? 0] : null;

            return (
              <div
                key={i}
                onClick={() => onSelectSlot(slot)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 cursor-pointer transition-colors",
                  isCita
                    ? "bg-blue-50/50 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800 dark:hover:bg-blue-950/40"
                    : "bg-muted/30 border border-border hover:bg-muted/60"
                )}
              >
                {/* Avatar / indicator */}
                {isCita && cita ? (
                  <div className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0",
                    cita.id_estatus_cita === 3
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : cita.id_estatus_cita === 2
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                  )}>
                    {getInitials(cita.nombre_invitado)}
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex-shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {isCita ? (cita?.nombre_invitado || cita?.email_invitado || "Invitado") : (slot.config?.nombre || "Disponible")}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {isCita && cita ? `${cita.hora_inicio} – ${cita.hora_fin}` : slot.config?.id_usuario_email || ""}
                  </p>
                </div>

                {/* Status badge */}
                {isCita && statusInfo && (
                  <Badge
                    variant="outline"
                    className={cn("text-[9px] px-1.5 py-0 h-4 flex-shrink-0",
                      cita?.id_estatus_cita === 3 ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" :
                      cita?.id_estatus_cita === 2 ? "border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-400" :
                      "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400"
                    )}
                  >
                    {statusInfo.label}
                  </Badge>
                )}
                {!isCita && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 flex-shrink-0 text-muted-foreground">
                    Libre
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
            ? "bg-red-50 dark:bg-red-950/20"
            : cita
              ? cita.id_estatus_cita === 3
                ? "bg-green-50 dark:bg-green-950/20"
                : cita.id_estatus_cita === 2
                  ? "bg-yellow-50 dark:bg-yellow-950/20"
                  : "bg-blue-50 dark:bg-blue-950/20"
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
            ) : (slot.agendados ?? 0) > 0 ? (
              <Badge variant="secondary" className="text-xs">{slot.agendados} agendado{(slot.agendados ?? 0) > 1 ? "s" : ""}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Sin agendar</Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-1">
          {config && (
            <DetailRow icon={User} label="Dueño">
              {config.id_usuario_email}
            </DetailRow>
          )}

          {config?.calendario_email && (
            <DetailRow icon={CalendarIcon} label="Calendar">
              {config.calendario_email}
            </DetailRow>
          )}

          {config?.descripcion_invitacion && (
            <DetailRow icon={FileText} label="Descripción">
              {config.descripcion_invitacion}
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
                <Progress value={((slot.agendados ?? 0) / config.max_invitados) * 100} className="h-2" />
              </div>
            </DetailRow>
          )}

          {/* Group attendees list */}
          {slot.type === "group" && slot.citas && slot.citas.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Asistentes agendados</p>
              <div className="space-y-1.5 mt-1">
                {slot.citas.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2">
                    <div className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0",
                      c.id_estatus_cita === 3
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : c.id_estatus_cita === 2
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
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
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] flex-shrink-0",
                        c.id_estatus_cita === 3 ? "border-green-300 text-green-700" :
                        c.id_estatus_cita === 2 ? "border-yellow-300 text-yellow-700" :
                        "border-blue-300 text-blue-700"
                      )}
                    >
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
                  </div>
                </DetailRow>
              )}

              {cita.nombre_prospecto && cita.nombre_prospecto !== cita.nombre_invitado && (
                <DetailRow icon={Users} label="Prospecto">
                  <span className="font-medium">{cita.nombre_prospecto}</span>
                </DetailRow>
              )}

              {cita.email_agente && cita.email_agente !== cita.email_invitado && (
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
  const slotHeight = 80;
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
          <span className="w-3 h-3 rounded border border-dashed border-muted-foreground/25 bg-muted/10" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          Agendada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          Pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Confirmada
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          No en Calendar
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
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
                        today && "bg-blue-50/20 dark:bg-blue-950/10"
                      )}
                      style={{ height: slotHeight }}
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

                        // If multiple items in one slot, use StackedSlotCard
                        if (totalItems > 1) {
                          return (
                            <div className="absolute inset-0" style={{ zIndex: 10 }}>
                              <StackedSlotCard
                                items={allItems.map(item => ({ slot: item.slot, status: item.status }))}
                                onSelectSlot={(slot) => setSelectedSlot(slot)}
                              />
                            </div>
                          );
                        }

                        // Single item — render normally
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
                            <SlotCard slot={item.slot} calendarStatus={item.status} onClick={() => setSelectedSlot(item.slot)} />
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
    </div>
  );
}
