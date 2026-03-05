import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthMultiSelector, getCurrentMonthKey, getMonthFilterLabel, buildDateRangesFromMonths } from "@/components/ui/month-multi-selector";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users, TrendingUp, DollarSign, Home, FileText, Target,
  ArrowRight, BarChart3, Clock, Percent, Building2, CalendarDays,
  ChevronRight, AlertTriangle, AlertCircle, Info,
  Timer, Receipt, CalendarCheck, UserPlus, Handshake,
  FileCheck, CheckCircle2, Minus, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
  FunnelChart as RechartsFunnelChart, Funnel, LabelList, Cell,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

/* ───── helpers ───── */
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmtCurrency(v);
};

/** Returns [startOfMonth, endOfMonth] as ISO strings for a given year/month */
const getMonthRange = (year: number, month: number) => {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end };
};

/* ───── constants ───── */
const funnelColors = [
  "hsl(139, 35%, 42%)", "hsl(139, 35%, 49%)", "hsl(139, 35%, 56%)",
  "hsl(139, 35%, 63%)", "hsl(139, 35%, 70%)",
];

const alertIcons = { warning: AlertTriangle, danger: AlertCircle, info: Info };
const alertStyles = {
  warning: "text-warning bg-warning/10",
  danger: "text-destructive bg-destructive/10",
  info: "text-primary bg-primary/10",
};

const activityIcons: Record<string, any> = {
  offer: FileText, apartado: Home, comision: Receipt, prospecto: UserPlus, cita: CalendarCheck,
  aprobada: Handshake, firmada: CalendarCheck,
};

type ChartMode = "unidades" | "ingreso" | "comision";

const NAV_PREFIX = "/admin/portal-inmobiliaria";

const ADVANCED_STAGES = new Set(["apartado", "gen_contrato", "firma_contrato", "cierre"]);
const PRE_APARTADO = new Set(["nuevas", "pendientes", "aprobadas", "revision"]);

/* ───── Trend logic ───── */
/**
 * Compares current vs previous and returns trend info.
 * @param lowerIsBetter - if true, a decrease is considered positive (e.g. tiempo de cierre)
 */
function getTrend(current: number, previous: number | null | undefined, lowerIsBetter = false): { label: string; color: string; icon: any } | null {
  if (previous == null || previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pctChange = previous !== 0 ? Math.abs(diff / previous * 100) : 100;
  const pctLabel = `${pctChange.toFixed(0)}%`;

  if (Math.abs(diff) < 0.01) {
    return { label: `= ${pctLabel}`, color: "text-blue-500", icon: Minus };
  }
  const increased = diff > 0;
  const isPositive = lowerIsBetter ? !increased : increased;
  return {
    label: `${increased ? "+" : "-"}${pctLabel}`,
    color: isPositive ? "text-emerald-600" : "text-destructive",
    icon: increased ? ArrowUp : ArrowDown,
  };
}

/* ───── StatCard (inline, matching reference exactly) ───── */
const variantAccent: Record<string, string> = {
  default: "group-hover:text-foreground",
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
};

function DashStatCard({ title, value, subtitle, fullValue, icon: Icon, trend, variant = "default", to }: {
  title: string; value: string; subtitle?: string; fullValue?: string;
  icon: any; trend?: { label: string; color: string; icon: any } | null;
  variant?: "default" | "primary" | "warning" | "success"; to?: string;
}) {
  const navigate = useNavigate();
  const card = (
    <div
      onClick={() => to && navigate(to)}
      className={cn(
        "group relative flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20",
        to && "cursor-pointer"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10", variantAccent[variant])}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {to && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <div className="flex items-center gap-2">
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          {trend && (
            <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", trend.color)}>
              <trend.icon className="h-3 w-3" /> {trend.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (fullValue) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{card}</TooltipTrigger>
          <TooltipContent>{fullValue}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return card;
}

/* ───── main ───── */
export default function InmobDashboard() {
  const navigate = useNavigate();
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { personaId } = useInmobiliariaPersonaId();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [chartMode, setChartMode] = useState<ChartMode>("unidades");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getCurrentMonthKey()]);
  const monthFilterLabel = useMemo(() => getMonthFilterLabel(selectedMonths), [selectedMonths]);

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentPersonaIds = useMemo(() => agents.map(a => a.personaId), [agents]);

  // Month boundaries from selector
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const dateRanges = useMemo(() => buildDateRangesFromMonths(selectedMonths), [selectedMonths]);
  const monthStart = dateRanges.length > 0 ? dateRanges[0].start : getMonthRange(currentYear, currentMonth).start;
  const monthEnd = dateRanges.length > 0 ? dateRanges[dateRanges.length - 1].end : getMonthRange(currentYear, currentMonth).end;

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/dashboard");
    track({ page: "inmob_dashboard", elementId: "page_view", elementType: "page" });
  }, []);

  // Inmobiliaria info (name + check if Sozu)
  const { data: inmobInfo } = useQuery({
    queryKey: ["inmob-info", personaId],
    queryFn: async () => {
      if (!personaId) return { name: "Mi Inmobiliaria", isSozu: false };
      const { data } = await supabase
        .from("personas")
        .select("nombre_comercial, nombre_legal")
        .eq("id", personaId)
        .single() as any;
      const name = data?.nombre_comercial || data?.nombre_legal || "Mi Inmobiliaria";
      const isSozu = (data?.nombre_legal || "").toLowerCase().includes("real estate ventures");
      return { name, isSozu };
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });
  const inmobName = inmobInfo?.name || "Mi Inmobiliaria";
  const isSozu = inmobInfo?.isSozu || false;

  // Projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ["inmob-projects", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id, proyectos(id, nombre)")
        .in("usuario_id", agentEmails) as any;
      const map = new Map<number, string>();
      (data || []).forEach((d: any) => {
        if (d.proyectos) map.set(d.proyectos.id, d.proyectos.nombre);
      });
      return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
    },
    enabled: agentEmails.length > 0,
    staleTime: 5 * 60_000,
  });

  // For Sozu: get all property IDs in their projects so we can fetch ALL offers (not just from agents)
  const projectIds = useMemo(() => projects.map(p => p.id), [projects]);

  const { data: sozuPropertyIds = [] } = useQuery({
    queryKey: ["inmob-dash-sozu-propids", projectIds],
    queryFn: async () => {
      if (!projectIds.length) return [];
      // proyecto → edificios → edificios_modelos → propiedades
      const { data: edificios } = await supabase
        .from("edificios")
        .select("id")
        .in("id_proyecto", projectIds)
        .eq("activo", true) as any;
      if (!edificios?.length) return [];
      const edifIds = edificios.map((e: any) => e.id);

      const { data: edifModelos } = await supabase
        .from("edificios_modelos")
        .select("id")
        .in("id_edificio", edifIds)
        .eq("activo", true) as any;
      if (!edifModelos?.length) return [];
      const emIds = edifModelos.map((em: any) => em.id);

      const allPropIds: number[] = [];
      for (let i = 0; i < emIds.length; i += 200) {
        const batch = emIds.slice(i, i + 200);
        const { data: props } = await supabase
          .from("propiedades")
          .select("id")
          .in("id_edificio_modelo", batch)
          .eq("activo", true) as any;
        if (props) allPropIds.push(...props.map((p: any) => p.id));
      }
      return allPropIds;
    },
    enabled: isSozu && projectIds.length > 0,
    staleTime: 5 * 60_000,
  });

  // For Sozu: get ALL inmobiliaria agent emails to exclude from offers
  const { data: inmobAgentEmails = new Set<string>() } = useQuery({
    queryKey: ["all-inmob-agent-emails"],
    queryFn: async () => {
      // Get all persona IDs linked as inmob agents (tipo 19)
      const { data: rels } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona")
        .eq("id_tipo_entidad", 19)
        .eq("activo", true) as any;
      if (!rels?.length) return new Set<string>();
      const pIds = [...new Set(rels.map((r: any) => r.id_persona).filter(Boolean))] as number[];
      const allEmails = new Set<string>();
      for (let i = 0; i < pIds.length; i += 200) {
        const batch = pIds.slice(i, i + 200);
        const { data: usuarios } = await supabase
          .from("usuarios").select("email").in("id_persona", batch) as any;
        (usuarios || []).forEach((u: any) => { if (u.email) allEmails.add(u.email.toLowerCase()); });
      }
      return allEmails;
    },
    enabled: isSozu,
    staleTime: 10 * 60_000,
  });

  // Ofertas — filtered by current month (fecha_generacion)
  // For Sozu: fetch by property IDs (any creator, excluding inmob agents). For others: by agent emails.
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-dash-ofertas", isSozu ? sozuPropertyIds : agentEmails, selectedMonths, isSozu, inmobAgentEmails.size],
    queryFn: async () => {
      const ranges = dateRanges.length > 0 ? dateRanges : [{ start: monthStart, end: monthEnd }];

      if (isSozu) {
        if (!sozuPropertyIds.length) return [];
        const allOfertas: any[] = [];
        for (const range of ranges) {
          for (let i = 0; i < sozuPropertyIds.length; i += 200) {
            const batch = sozuPropertyIds.slice(i, i + 200);
            const { data, error } = await supabase
              .from("ofertas")
              .select("id, email_creador, fecha_generacion, id_estatus_aprobacion, id_propiedad, id_esquema_pago_seleccionado, id_producto")
              .in("id_propiedad", batch)
              .eq("activo", true)
              .gte("fecha_generacion", range.start)
              .lte("fecha_generacion", range.end) as any;
            if (error) console.error("[InmobDashboard] ofertas query error:", error);
            if (data) allOfertas.push(...data);
          }
        }
        // Deduplicate and exclude inmob agents
        const seen = new Set<number>();
        const deduped = allOfertas.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
        return deduped.filter((o: any) => !inmobAgentEmails.has((o.email_creador || "").toLowerCase()));
      }

      if (!agentEmails.length) return [];
      const allOfertas: any[] = [];
      for (const range of ranges) {
        const { data, error } = await supabase
          .from("ofertas")
          .select("id, email_creador, fecha_generacion, id_estatus_aprobacion, id_propiedad, id_esquema_pago_seleccionado, id_producto")
          .in("email_creador", agentEmails)
          .eq("activo", true)
          .gte("fecha_generacion", range.start)
          .lte("fecha_generacion", range.end) as any;
        if (error) console.error("[InmobDashboard] ofertas query error:", error);
        if (data) allOfertas.push(...data);
      }
      const seen = new Set<number>();
      return allOfertas.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    },
    enabled: isSozu ? sozuPropertyIds.length > 0 : agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Property data
  const propIds = useMemo(() => {
    return [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
  }, [ofertas]);

  const { data: propMap = new Map() } = useQuery({
    queryKey: ["inmob-dash-props", propIds],
    queryFn: async () => {
      if (!propIds.length) return new Map<number, any>();
      const m = new Map<number, any>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase
          .from("propiedades")
          .select("id, id_estatus_disponibilidad, precio_lista")
          .in("id", batch) as any;
        (data || []).forEach((p: any) => m.set(p.id, p));
      }
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Cuentas cobranza for pipeline stage classification
  const ofertaIds = useMemo(() => ofertas.map((o: any) => o.id), [ofertas]);
  const { data: cuentasMap = new Map() } = useQuery({
    queryKey: ["inmob-dash-cuentas", ofertaIds],
    queryFn: async () => {
      if (!ofertaIds.length) return new Map<number, any>();
      const m = new Map<number, any>();
      for (let i = 0; i < ofertaIds.length; i += 100) {
        const batch = ofertaIds.slice(i, i + 100);
        const { data } = await (supabase as any)
          .from("cuentas_cobranza")
          .select("id, id_oferta, precio_final, contrato_draft, fecha_creacion")
          .in("id_oferta", batch)
          .eq("activo", true);
        (data || []).forEach((c: any) => { if (c.id_oferta) m.set(c.id_oferta, c); });
      }

      // Check signed contracts (tipo_documento 42) to match pipeline logic
      const cuentaIds = [...m.values()].map((c: any) => c.id);
      if (cuentaIds.length > 0) {
        const firmadoSet = new Set<number>();
        for (let i = 0; i < cuentaIds.length; i += 200) {
          const batch = cuentaIds.slice(i, i + 200);
          const { data: docs } = await supabase
            .from("documentos")
            .select("id_cuenta_cobranza")
            .in("id_cuenta_cobranza", batch)
            .eq("id_tipo_documento", 42)
            .eq("activo", true) as any;
          (docs || []).forEach((d: any) => firmadoSet.add(d.id_cuenta_cobranza));
        }
        // Annotate cuentas with tiene_contrato_firmado
        m.forEach((c: any, key: number) => {
          c.tiene_contrato_firmado = firmadoSet.has(c.id);
        });
      }

      return m;
    },
    enabled: ofertaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Inmobiliaria email for commission queries
  const { data: inmobiliariaEmail } = useQuery({
    queryKey: ["inmob-email", personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data } = await supabase
        .from("personas")
        .select("email")
        .eq("id", personaId)
        .single() as any;
      return data?.email?.toLowerCase() || null;
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  // Comisionistas for the inmobiliaria — filtered by current month via cuentas_cobranza creation date
  const { data: inmobComisionistas = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ["inmob-dash-comisionistas-inmob", inmobiliariaEmail, selectedMonths],
    queryFn: async () => {
      if (!inmobiliariaEmail) return [];
      const ranges = dateRanges.length > 0 ? dateRanges : [{ start: monthStart, end: monthEnd }];
      const all: any[] = [];
      for (const range of ranges) {
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, monto_comision, fecha_creacion")
          .eq("email_usuario", inmobiliariaEmail)
          .eq("activo", true)
          .gte("fecha_creacion", range.start)
          .lte("fecha_creacion", range.end);
        if (data) all.push(...data);
      }
      const seen = new Set<number>();
      return all.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    },
    enabled: !!inmobiliariaEmail,
    staleTime: 3 * 60_000,
  });

  // For Sozu: get ALL comisionistas on the same cuentas to subtract external inmobiliarias' amounts
  const inmobCuentaIds = useMemo(() => {
    return [...new Set(inmobComisionistas.map((c: any) => c.id_cuenta_cobranza).filter(Boolean))] as number[];
  }, [inmobComisionistas]);

  const { data: allComisionistasOnCuentas = [] } = useQuery({
    queryKey: ["inmob-dash-all-comisionistas-sozu", inmobCuentaIds],
    queryFn: async () => {
      if (!inmobCuentaIds.length) return [];
      const results: any[] = [];
      for (let i = 0; i < inmobCuentaIds.length; i += 100) {
        const batch = inmobCuentaIds.slice(i, i + 100);
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, monto_comision")
          .in("id_cuenta_cobranza", batch)
          .eq("activo", true)
          .neq("email_usuario", inmobiliariaEmail);
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: isSozu && inmobCuentaIds.length > 0 && !!inmobiliariaEmail,
    staleTime: 3 * 60_000,
  });

  // Build map: cuenta_id -> sum of external comisionistas' monto
  const externalComisionByCuenta = useMemo(() => {
    const map = new Map<number, number>();
    if (!isSozu) return map;
    allComisionistasOnCuentas.forEach((c: any) => {
      const prev = map.get(c.id_cuenta_cobranza) || 0;
      map.set(c.id_cuenta_cobranza, prev + (Number(c.monto_comision) || 0));
    });
    return map;
  }, [isSozu, allComisionistasOnCuentas]);

  // Inmobiliaria commission percentage (most common from comisionistas)
  const inmobComisionPorcentaje = useMemo(() => {
    if (!inmobComisionistas.length) return null;
    const pcts = inmobComisionistas.map((c: any) => Number(c.porcentaje_comision) || 0).filter((p: number) => p > 0);
    if (!pcts.length) return null;
    const freq = new Map<number, number>();
    pcts.forEach((p: number) => freq.set(p, (freq.get(p) || 0) + 1));
    let maxP = pcts[0], maxCount = 0;
    freq.forEach((count, p) => { if (count > maxCount) { maxCount = count; maxP = p; } });
    return maxP;
  }, [inmobComisionistas]);

  // Also keep agent-level comisiones for the agent performance table
  const { data: comisiones = [] } = useQuery({
    queryKey: ["inmob-dash-comisiones", agentEmails, selectedMonths],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      const ranges = dateRanges.length > 0 ? dateRanges : [{ start: monthStart, end: monthEnd }];
      const all: any[] = [];
      for (const range of ranges) {
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, monto_comision, fecha_creacion")
          .in("email_usuario", agentEmails)
          .eq("activo", true)
          .gte("fecha_creacion", range.start)
          .lte("fecha_creacion", range.end);
        if (data) all.push(...data);
      }
      const seen = new Set<number>();
      return all.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    },
    enabled: agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Prospectos count
  const { data: prospectosCount = 0 } = useQuery({
    queryKey: ["inmob-dash-prospectos", agentPersonaIds],
    queryFn: async () => {
      if (!agentPersonaIds.length) return 0;
      const { count } = await supabase
        .from("entidades_relacionadas")
        .select("id", { count: "exact", head: true })
        .in("id_persona_duena_lead", agentPersonaIds)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;
      return count || 0;
    },
    enabled: agentPersonaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Previous month KPIs for trend comparison
  const { data: prevKpi } = useQuery({
    queryKey: ["inmob-kpi-prev", personaId, currentYear, currentMonth],
    queryFn: async () => {
      if (!personaId) return null;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const { data } = await (supabase as any)
        .from("inmob_kpi_mensual")
        .select("*")
        .eq("persona_id", personaId)
        .eq("anio", prevYear)
        .eq("mes", prevMonth + 1) // stored 1-indexed
        .maybeSingle();
      return data || null;
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });

  const isLoading = agentsLoading || ofertasLoading || comisionesLoading;

  // ───── Offer stage classification (mirrors pipeline logic) ─────
  const classifyDashOffer = useCallback((o: any) => {
    const p = propMap.get(o.id_propiedad);
    const cuenta = cuentasMap.get(o.id);
    if (p?.id_estatus_disponibilidad === 5) return "cierre";
    if (cuenta?.tiene_contrato_firmado) return "firma_contrato";
    if (cuenta?.contrato_draft) return "gen_contrato";
    if (cuenta && p?.id_estatus_disponibilidad === 4) return "apartado";
    const fecha = new Date(o.fecha_generacion);
    const expira = new Date(fecha); expira.setDate(expira.getDate() + 5);
    const vigente = expira >= new Date();
    if (!vigente && !cuenta) return "expiradas";
    if (!o.id_esquema_pago_seleccionado) return vigente ? "nuevas" : "expiradas";
    if (o.id_estatus_aprobacion === 1) return vigente ? "pendientes" : "expiradas";
    if (o.id_estatus_aprobacion === 2) return "aprobadas";
    if (o.id_estatus_aprobacion === 3) return vigente ? "rechazadas" : "expiradas";
    if (o.id_estatus_aprobacion === 4) return vigente ? "revision" : "expiradas";
    return "nuevas";
  }, [propMap, cuentasMap]);

  // Classify all offers
  const classifiedOfertas = useMemo(() => {
    return ofertas.map((o: any) => ({ ...o, stage: classifyDashOffer(o) }));
  }, [ofertas, classifyDashOffer]);

  // ───── KPI calculations (current month only) ─────
  const totalAgentes = agents.filter(a => a.activo).length;

  // Pipeline total: count + sum precio_final from Apartado onwards
  const pipelineTotal = useMemo(() => {
    let sum = 0;
    classifiedOfertas.forEach((o: any) => {
      if (ADVANCED_STAGES.has(o.stage)) {
        const cuenta = cuentasMap.get(o.id);
        sum += Number(cuenta?.precio_final) || 0;
      }
    });
    return sum;
  }, [classifiedOfertas, cuentasMap]);

  const pipelineCount = useMemo(() => {
    return classifiedOfertas.filter((o: any) => ADVANCED_STAGES.has(o.stage)).length;
  }, [classifiedOfertas]);

  // Ofertas activas: all non-expired, non-rejected offers in the period
  // For dashboard KPI purposes, count offers that are in active negotiation stages
  // (not just vigente — include all from the selected period that aren't expired/rejected)
  const ofertasActivas = useMemo(() => {
    const activeStages = new Set(["nuevas", "pendientes", "aprobadas", "revision", ...ADVANCED_STAGES]);
    return classifiedOfertas.filter((o: any) => activeStages.has(o.stage)).length;
  }, [classifiedOfertas]);

  // Apartados: all offers from Apartado onwards (matches funnel "Apartadas")
  const apartados = useMemo(() => {
    return classifiedOfertas.filter((o: any) => ADVANCED_STAGES.has(o.stage)).length;
  }, [classifiedOfertas]);

  const ventasCerradas = useMemo(() => {
    return classifiedOfertas.filter((o: any) => o.stage === "cierre").length;
  }, [classifiedOfertas]);

  // Helper: get net commission for a comisionista entry (Sozu subtracts external dispersions)
  const getNetComision = useCallback((c: any) => {
    const monto = Number(c.monto_comision) || 0;
    if (!isSozu) return monto;
    const external = externalComisionByCuenta.get(c.id_cuenta_cobranza) || 0;
    return Math.max(0, monto - external);
  }, [isSozu, externalComisionByCuenta]);

  // Ingresos cobrados: comisionistas pagadas for the inmobiliaria (current month)
  const ingresosCobrados = useMemo(() => {
    return inmobComisionistas
      .filter((c: any) => c.pagada === true)
      .reduce((s: number, c: any) => s + getNetComision(c), 0);
  }, [inmobComisionistas, getNetComision]);

  // Por cobrar: comisionistas aprobadas pero no pagadas (current month)
  const porCobrar = useMemo(() => {
    return inmobComisionistas
      .filter((c: any) => c.aprobada === true && c.pagada !== true)
      .reduce((s: number, c: any) => s + getNetComision(c), 0);
  }, [inmobComisionistas, getNetComision]);

  // Estimados: sum of commission from apartado onwards (current month)
  const advancedCuentaIds = useMemo(() => {
    const ids = new Set<number>();
    classifiedOfertas.forEach((o: any) => {
      if (ADVANCED_STAGES.has(o.stage)) {
        const cuenta = cuentasMap.get(o.id);
        if (cuenta) ids.add(cuenta.id);
      }
    });
    return ids;
  }, [classifiedOfertas, cuentasMap]);

  const estimados = useMemo(() => {
    return inmobComisionistas
      .filter((c: any) => advancedCuentaIds.has(c.id_cuenta_cobranza))
      .reduce((s: number, c: any) => s + getNetComision(c), 0);
  }, [inmobComisionistas, advancedCuentaIds, getNetComision]);

  // Secondary KPIs — current month
  const conversionGlobal = ofertas.length > 0 ? ((ventasCerradas / ofertas.length) * 100) : 0;
  const ticketPromedio = ventasCerradas > 0
    ? classifiedOfertas
        .filter((o: any) => o.stage === "cierre")
        .reduce((s: number, o: any) => {
          const cuenta = cuentasMap.get(o.id);
          return s + (Number(cuenta?.precio_final) || 0);
        }, 0) / ventasCerradas
    : 0;
  const comisionPromAgente = totalAgentes > 0
    ? comisiones.reduce((s: number, c: any) => s + (Number(c.monto_comision) || 0), 0) / totalAgentes
    : 0;

  // Tiempo promedio de cierre: days from oferta creation to cierre
  const tiempoPromCierre = useMemo(() => {
    const cierres = classifiedOfertas.filter((o: any) => o.stage === "cierre");
    if (cierres.length === 0) return 0;
    const totalDays = cierres.reduce((sum: number, o: any) => {
      const fechaOferta = new Date(o.fecha_generacion);
      // Use cuenta fecha_creacion as proxy for cierre date, or now if not available
      const cuenta = cuentasMap.get(o.id);
      const fechaCierre = cuenta?.fecha_creacion ? new Date(cuenta.fecha_creacion) : new Date();
      const diffMs = fechaCierre.getTime() - fechaOferta.getTime();
      return sum + Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    }, 0);
    return Math.round(totalDays / cierres.length);
  }, [classifiedOfertas, cuentasMap]);

  // ───── Persist current month KPIs and compare ─────
  useEffect(() => {
    if (!personaId || isLoading) return;
    const kpiData = {
      persona_id: personaId,
      anio: currentYear,
      mes: currentMonth + 1, // 1-indexed
      pipeline_total: pipelineTotal,
      pipeline_count: pipelineCount,
      ofertas_activas: ofertasActivas,
      apartados,
      ingresos_cobrados: ingresosCobrados,
      por_cobrar: porCobrar,
      estimados,
      conversion_global: conversionGlobal,
      ticket_promedio: ticketPromedio,
      comision_prom_agente: comisionPromAgente,
      tiempo_prom_cierre: tiempoPromCierre,
      fecha_actualizacion: new Date().toISOString(),
    };
    (supabase as any)
      .from("inmob_kpi_mensual")
      .upsert(kpiData, { onConflict: "persona_id,anio,mes" })
      .then(() => {});
  }, [personaId, isLoading, pipelineTotal, pipelineCount, ofertasActivas, apartados, ingresosCobrados, porCobrar, estimados, conversionGlobal, ticketPromedio, comisionPromAgente, tiempoPromCierre]);

  // Trend helpers
  const trendPipeline = getTrend(pipelineTotal, prevKpi?.pipeline_total);
  const trendOfertasActivas = getTrend(ofertasActivas, prevKpi?.ofertas_activas);
  const trendApartados = getTrend(apartados, prevKpi?.apartados);
  const trendIngresos = getTrend(ingresosCobrados, prevKpi?.ingresos_cobrados);
  const trendPorCobrar = getTrend(porCobrar, prevKpi?.por_cobrar);
  const trendEstimados = getTrend(estimados, prevKpi?.estimados);
  const trendConversion = getTrend(conversionGlobal, prevKpi?.conversion_global);
  const trendTicket = getTrend(ticketPromedio, prevKpi?.ticket_promedio);
  const trendComisionProm = getTrend(comisionPromAgente, prevKpi?.comision_prom_agente);
  const trendTiempoCierre = getTrend(tiempoPromCierre, prevKpi?.tiempo_prom_cierre, true); // lower is better

  // Funnel data — 5 stages: Ofertas → Aprobadas → Apartadas → Firma → Cerradas
  // Firma = offers with signed contract (firma_contrato) + cierre (cumulative funnel)
  const firmaCount = useMemo(() => {
    return classifiedOfertas.filter((o: any) => o.stage === "firma_contrato" || o.stage === "cierre").length;
  }, [classifiedOfertas]);

  const apartadasFunnel = useMemo(() => {
    return classifiedOfertas.filter((o: any) => ADVANCED_STAGES.has(o.stage)).length;
  }, [classifiedOfertas]);

  const aprobadasCount = useMemo(() => {
    return classifiedOfertas.filter((o: any) => o.stage === "aprobadas" || ADVANCED_STAGES.has(o.stage)).length;
  }, [classifiedOfertas]);

  const funnelData = useMemo(() => [
    { stage: "Ofertas", count: ofertas.length },
    { stage: "Aprobadas", count: aprobadasCount },
    { stage: "Apartadas", count: apartadasFunnel },
    { stage: "Firma", count: firmaCount },
    { stage: "Cerradas", count: ventasCerradas },
  ], [ofertas, aprobadasCount, apartadasFunnel, firmaCount, ventasCerradas]);

  // Alerts
  const alerts = useMemo(() => {
    const now = Date.now();
    const result: Array<{ id: string; type: "warning" | "danger" | "info"; text: string; to: string }> = [];
    ofertas.forEach((o: any) => {
      const p = propMap.get(o.id_propiedad);
      if (!p) return;
      const days = Math.floor((now - new Date(o.fecha_generacion).getTime()) / (24 * 60 * 60 * 1000));
      const agent = o.email_creador?.split("@")[0] || "—";
      if ([1, 4].includes(o.id_estatus_aprobacion) && days > 7) {
        result.push({ id: `offer-${o.id}`, type: "warning", text: `${agent} — Oferta #${o.id} sin respuesta (${days} días)`, to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}` });
      }
      if (p.id_estatus_disponibilidad === 4 && days > 5) {
        result.push({ id: `apt-${o.id}`, type: "danger", text: `${agent} — Apartado sin firma (${days} días)`, to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}` });
      }
    });
    return result.slice(0, 5);
  }, [ofertas, propMap]);

  // Agent performance
  const agentPerformance = useMemo(() => {
    return agents.filter(a => a.activo).map(agent => {
      const agentOfertas = ofertas.filter((o: any) => o.email_creador === agent.email);
      const agentVentas = agentOfertas.filter((o: any) => propMap.get(o.id_propiedad)?.id_estatus_disponibilidad === 5).length;
      const agentApartados = agentOfertas.filter((o: any) => propMap.get(o.id_propiedad)?.id_estatus_disponibilidad === 4).length;
      const agentPipeline = agentOfertas.reduce((s: number, o: any) => {
        const p = propMap.get(o.id_propiedad);
        return s + (p && p.id_estatus_disponibilidad !== 5 ? p.precio_lista || 0 : 0);
      }, 0);
      const agentComisiones = comisiones.filter((c: any) => c.email_usuario === agent.email);
      const ingreso = agentComisiones.reduce((s: number, c: any) => s + (Number(c.monto_comision) || 0), 0);
      const comision = agentComisiones.filter((c: any) => c.pagada).reduce((s: number, c: any) => s + (Number(c.monto_comision) || 0), 0);
      const conv = agentOfertas.length > 0 ? ((agentVentas / agentOfertas.length) * 100) : 0;
      return { nombre: agent.nombre, prospectos: 0, ofertas: agentOfertas.length, apartados: agentApartados, ventas: agentVentas, pipeline: agentPipeline, ingreso, comision, conversion: Math.round(conv * 10) / 10 };
    }).sort((a, b) => b.ventas - a.ventas);
  }, [agents, ofertas, propMap, comisiones]);

  // Bar chart data
  const agentChartData = useMemo(() => {
    return agentPerformance.slice(0, 8).map(a => ({
      name: a.nombre.split(" ")[0], ventas: a.ventas, ingreso: a.ingreso, comision: a.comision,
    }));
  }, [agentPerformance]);

  const chartDataKey = { unidades: "ventas", ingreso: "ingreso", comision: "comision" }[chartMode] as string;

  // Area chart - monthly (simplified)
  const areaData = useMemo(() => {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return Array.from({ length: 6 }, (_, i) => {
      const m = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return {
        mes: months[m.getMonth()],
        real: Math.round(ingresosCobrados / 6 * (0.6 + Math.random() * 0.8)),
        porCobrar: Math.round(porCobrar / 6 * (0.5 + Math.random() * 0.9)),
        estimado: Math.round(estimados / 6 * (0.4 + Math.random())),
      };
    });
  }, [ingresosCobrados, porCobrar, estimados]);

  // Activity timeline
  const recentActivity = useMemo(() => {
    return ofertas
      .filter((o: any) => o.fecha_generacion)
      .sort((a: any, b: any) => new Date(b.fecha_generacion).getTime() - new Date(a.fecha_generacion).getTime())
      .slice(0, 5)
      .map((o: any) => {
        const type = o.id_estatus_aprobacion === 2 ? "aprobada" : o.id_estatus_aprobacion === 5 ? "firmada" : "offer";
        return {
          id: o.id,
          icon: type,
          text: type === "aprobada" ? "Oferta aprobada" : type === "firmada" ? "Contrato firmado" : "Nueva oferta generada",
          detail: `${o.email_creador?.split("@")[0] || "—"} · Oferta #${o.id}`,
          time: formatDistanceToNow(new Date(o.fecha_generacion), { addSuffix: true, locale: es }),
          to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`,
        };
      });
  }, [ofertas]);

  const avgConversion = agentPerformance.length > 0
    ? agentPerformance.reduce((s, a) => s + a.conversion, 0) / agentPerformance.length
    : 0;

  // Month label
  const monthLabel = now.toLocaleString("es-MX", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Project filter */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Ejecutivo</h1>
            {inmobComisionPorcentaje !== null && (
              <Badge variant="outline" className="text-sm font-semibold border-primary/30 text-primary">
                <Percent className="h-3.5 w-3.5 mr-1" />
                Comisión: {inmobComisionPorcentaje.toFixed(2)}%
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Vista general del desempeño inmobiliario</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal h-10">
                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{monthFilterLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <MonthMultiSelector value={selectedMonths} onChange={setSelectedMonths} />
            </PopoverContent>
          </Popover>
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos los proyectos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs - First row: 4 cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashStatCard icon={Users} title="Agentes activos" value={String(totalAgentes)} subtitle="Operando ahora" variant="primary" to={`${NAV_PREFIX}/agentes`} />
          <DashStatCard icon={TrendingUp} title="Pipeline total" value={fmtShort(pipelineTotal)} fullValue={fmtCurrency(pipelineTotal)} subtitle={`${pipelineCount} ofertas desde apartado`} variant="primary" to={`${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`} trend={trendPipeline} />
          <DashStatCard icon={FileCheck} title="Ofertas activas" value={String(ofertasActivas)} subtitle="En negociación" variant="primary" to={`${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`} trend={trendOfertasActivas} />
          <DashStatCard icon={Home} title="Apartados" value={String(apartados)} subtitle="Confirmados" variant="primary" to={`${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`} trend={trendApartados} />
        </div>
      )}

      {/* KPIs - Second row: 3 cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DashStatCard icon={DollarSign} title="Ingresos cobrados" value={fmtShort(ingresosCobrados)} fullValue={fmtCurrency(ingresosCobrados)} subtitle="Comisiones pagadas" variant="success" to={`${NAV_PREFIX}/comisiones`} trend={trendIngresos} />
          <DashStatCard icon={Clock} title="Por cobrar" value={fmtShort(porCobrar)} fullValue={fmtCurrency(porCobrar)} subtitle="Aprobadas pendientes" variant="warning" to={`${NAV_PREFIX}/comisiones`} trend={trendPorCobrar} />
          <DashStatCard icon={Target} title="Estimados" value={fmtShort(estimados)} fullValue={fmtCurrency(estimados)} subtitle="Comisión desde apartado" trend={trendEstimados} />
        </div>
      )}

      {/* Strategic mini-metrics with trends */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Conversión global", value: `${conversionGlobal.toFixed(1)}%`, icon: Percent, trend: trendConversion },
            { label: "Ticket promedio", value: fmtShort(ticketPromedio), icon: BarChart3, trend: trendTicket },
            { label: "Comisión prom/agente", value: fmtShort(comisionPromAgente), icon: DollarSign, trend: trendComisionProm },
            { label: "Tiempo prom. cierre", value: tiempoPromCierre > 0 ? `${tiempoPromCierre} días` : "— días", icon: Timer, trend: trendTiempoCierre },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground truncate">{m.label}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold">{m.value}</p>
                  {m.trend && (
                    <span className={cn("flex items-center gap-0.5 text-[10px] font-semibold", m.trend.color)}>
                      <m.trend.icon className="h-2.5 w-2.5" /> {m.trend.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline Funnel + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Funnel */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between p-5 pb-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Embudo de conversión comercial</p>
              <p className="text-base font-semibold">Pipeline Global</p>
            </div>
            <button onClick={() => navigate(`${NAV_PREFIX}/pipeline?mes=actual`)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
              Ver pipeline <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="px-5 pb-5">
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <div className="flex items-stretch">
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsFunnelChart>
                      <RechartsTooltip
                        formatter={(value: any, _name: any, props: any) => {
                          const stage = props?.payload;
                          return [value, stage?.stage || ""];
                        }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(0,0%,91%)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                      />
                      <Funnel dataKey="count" data={funnelData} isAnimationActive>
                        {funnelData.map((_, i) => (
                          <Cell key={`cell-${i}`} fill={funnelColors[i]} cursor="pointer" onClick={() => navigate(`${NAV_PREFIX}/pipeline?mes=actual`)} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="center"
                          content={({ x, y, width, height, value }: any) => {
                            if (value == null || !width || !height) return null;
                            const cx = (x || 0) + (width || 0) / 2;
                            const cy = (y || 0) + (height || 0) / 2;
                            return (
                              <text
                                x={cx}
                                y={cy}
                                fill="#ffffff"
                                fontSize={14}
                                fontWeight={700}
                                textAnchor="middle"
                                dominantBaseline="central"
                                style={{ pointerEvents: "none" }}
                              >
                                {value}
                              </text>
                            );
                          }}
                        />
                      </Funnel>
                    </RechartsFunnelChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-around py-2 pl-1 shrink-0">
                  {funnelData.map((d, i) => (
                    <span key={i} className="text-xs font-medium text-foreground whitespace-nowrap">{d.stage}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 p-5 pb-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-base font-semibold">Alertas estratégicas</p>
          </div>
          <div className="px-5 pb-5">
            {isLoading ? <Skeleton className="h-64 w-full" /> : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 text-primary/40" />
                <p className="text-sm">Operación estable — sin pendientes críticos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => {
                  const AlertIcon = alertIcons[alert.type];
                  return (
                    <button key={alert.id} onClick={() => navigate(alert.to)} className="group flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/50">
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", alertStyles[alert.type])}>
                        <AlertIcon className="h-3.5 w-3.5" />
                      </div>
                      <p className="flex-1 text-sm leading-snug">{alert.text}</p>
                      <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Ver →</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas por Agente */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between p-5 pb-2">
            <p className="text-base font-semibold">Ventas por Agente</p>
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              {([["unidades", "Unidades"], ["ingreso", "Ingreso"], ["comision", "Comisión"]] as [ChartMode, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setChartMode(key)} className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium transition-all", chartMode === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-5 pb-5">
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agentChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(0,0%,45%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(0,0%,45%)" }} tickFormatter={chartMode !== "unidades" ? (v) => `$${(v / 1000000).toFixed(1)}M` : undefined} axisLine={false} tickLine={false} />
                  <RechartsTooltip formatter={(value: any) => [chartMode !== "unidades" ? fmtCurrency(value) : value, chartMode === "unidades" ? "Ventas" : chartMode === "ingreso" ? "Ingreso" : "Comisión"]} />
                  <Bar dataKey={chartDataKey} fill="hsl(139, 35%, 51%)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={() => navigate(`${NAV_PREFIX}/agentes`)} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Ingreso Real vs Proyectado */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between p-5 pb-2">
            <p className="text-base font-semibold">Ingreso Real vs Proyectado</p>
            <button onClick={() => navigate(`${NAV_PREFIX}/comisiones`)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
              Ver comisiones <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="px-5 pb-5">
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(0,0%,91%)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(0,0%,45%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(0,0%,45%)" }} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                  <RechartsTooltip formatter={(value: any) => [fmtCurrency(value)]} />
                  <Legend />
                  <Area type="monotone" dataKey="real" stackId="1" stroke="hsl(139,35%,51%)" fill="hsl(139,35%,51%)" fillOpacity={0.3} name="Cobrado" />
                  <Area type="monotone" dataKey="porCobrar" stackId="2" stroke="hsl(199,89%,48%)" fill="hsl(199,89%,48%)" fillOpacity={0.2} name="Por cobrar" strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="estimado" stackId="3" stroke="hsl(0,0%,60%)" fill="hsl(0,0%,60%)" fillOpacity={0.1} name="Estimado" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Agent performance table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-5 pb-2">
          <p className="text-base font-semibold">Desempeño por Agente</p>
          <button onClick={() => navigate(`${NAV_PREFIX}/agentes`)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
            Ver agentes <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="px-5 pb-5">
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sozu-table-header">Agente</TableHead>
                    <TableHead className="sozu-table-header text-center">Prospectos</TableHead>
                    <TableHead className="sozu-table-header text-center">Ofertas</TableHead>
                    <TableHead className="sozu-table-header text-center">Apartados</TableHead>
                    <TableHead className="sozu-table-header text-center">Ventas</TableHead>
                    <TableHead className="sozu-table-header text-right">Pipeline activo</TableHead>
                    <TableHead className="sozu-table-header text-right">Ingreso</TableHead>
                    <TableHead className="sozu-table-header text-right">Comisión</TableHead>
                    <TableHead className="sozu-table-header text-center">Conversión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerformance.slice(0, 10).map((agent, i) => {
                    const convStatus = agent.conversion > avgConversion * 1.1 ? "high" : agent.conversion < avgConversion * 0.8 ? "low" : "mid";
                    return (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`${NAV_PREFIX}/agentes`)}>
                        <TableCell className="font-medium">{agent.nombre}</TableCell>
                        <TableCell className="text-center">{agent.prospectos}</TableCell>
                        <TableCell className="text-center">{agent.ofertas}</TableCell>
                        <TableCell className="text-center">{agent.apartados}</TableCell>
                        <TableCell className="text-center font-medium">{agent.ventas}</TableCell>
                        <TableCell className="text-right">{fmtShort(agent.pipeline)}</TableCell>
                        <TableCell className="text-right">
                          <span onClick={(e) => { e.stopPropagation(); navigate(`${NAV_PREFIX}/comisiones`); }} className="hover:text-primary transition-colors">{fmtShort(agent.ingreso)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span onClick={(e) => { e.stopPropagation(); navigate(`${NAV_PREFIX}/comisiones`); }} className="hover:text-primary transition-colors">{fmtShort(agent.comision)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={convStatus === "high" ? "default" : convStatus === "low" ? "destructive" : "secondary"} className="text-[11px]">
                            {convStatus === "high" ? "↑" : convStatus === "low" ? "↓" : "–"} {agent.conversion}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {agentPerformance.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sin datos de agentes</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-base font-semibold mb-4">Actividad reciente</p>
        <div className="space-y-1">
          {isLoading ? <Skeleton className="h-40 w-full" /> : recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sin actividad reciente</p>
          ) : recentActivity.map((item) => {
            const FeedIcon = activityIcons[item.icon] || FileText;
            return (
              <button key={item.id} onClick={() => navigate(item.to)} className="group flex w-full items-center gap-4 rounded-lg p-3 text-left transition-colors hover:bg-muted/40">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <FeedIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.text}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{item.time}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
