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
  const agentEmailSetLower = useMemo(() => new Set(agentEmails.map((e) => e.toLowerCase())), [agentEmails]);
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

  // Emails de usuarios de la inmobiliaria actual (base para mapear comisiones propias)
  const { data: inmobUserEmails = [] } = useQuery({
    queryKey: ["inmob-user-emails", personaId],
    queryFn: async () => {
      if (!personaId) return [] as string[];
      const { data } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId)
        .eq("activo", true) as any;
      return (data || [])
        .map((u: any) => (u.email || "").trim())
        .filter(Boolean);
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });
  const inmobUserEmailSet = useMemo(() => new Set(inmobUserEmails.map((e) => e.toLowerCase())), [inmobUserEmails]);


  // Projects for filter (from inmobiliaria main user access)
  const { data: projects = [] } = useQuery({
    queryKey: ["inmob-projects", personaId, inmobUserEmails.join(",")],
    queryFn: async () => {
      if (!inmobUserEmails.length) return [];

      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id, proyectos(id, nombre)")
        .in("usuario_id", inmobUserEmails)
        .eq("activo", true) as any;

      const map = new Map<number, string>();
      (data || []).forEach((d: any) => {
        if (d.proyectos) map.set(d.proyectos.id, d.proyectos.nombre);
      });

      return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
    },
    enabled: !!personaId,
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

  // For Sozu: get emails of ALL external agents (not owned by this inmobiliaria) to exclude.
  // This includes agents from other inmobiliarias AND independent agents (id_persona_duena_lead IS NULL).
  const { data: inmobAgentEmails = new Set<string>() } = useQuery({
    queryKey: ["all-inmob-agent-emails-external-v3", personaId],
    queryFn: async () => {
      if (!personaId) return new Set<string>();

      // 1. Get ALL tipo 19 agent relations
      const { data: allRels } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona, id_persona_duena_lead")
        .eq("id_tipo_entidad", 19)
        .eq("activo", true) as any;
      if (!allRels?.length) return new Set<string>();

      // 2. Separate: agents owned by this inmobiliaria vs everyone else (other owners + NULL owners)
      const externalAgentPIds: number[] = [];
      const externalOwnerPIds: number[] = [];
      allRels.forEach((r: any) => {
        if (r.id_persona_duena_lead === personaId) return; // skip our own agents
        if (r.id_persona) externalAgentPIds.push(r.id_persona);
        if (r.id_persona_duena_lead) externalOwnerPIds.push(r.id_persona_duena_lead);
      });

      const allPIds = [...new Set([...externalAgentPIds, ...externalOwnerPIds])];
      if (!allPIds.length) return new Set<string>();

      const allEmails = new Set<string>();
      for (let i = 0; i < allPIds.length; i += 200) {
        const batch = allPIds.slice(i, i + 200);
        const { data: usuarios } = await supabase
          .from("usuarios").select("email").in("id_persona", batch) as any;
        (usuarios || []).forEach((u: any) => { if (u.email) allEmails.add(u.email.toLowerCase()); });
      }
      return allEmails;
    },
    enabled: isSozu && !!personaId,
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
          .select("id, id_oferta, precio_final, porcentaje_comision_venta, iva_incluido, contrato_draft, fecha_creacion")
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

  const cuentaCobranzaIds = useMemo(() => {
    const ids = new Set<number>();
    cuentasMap.forEach((c: any) => {
      if (c?.id) ids.add(c.id);
    });
    return [...ids];
  }, [cuentasMap]);

  // ───── Comisionistas for current filtered offers (by cuentas), independent of email source ─────
  const { data: comisiones = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ["inmob-dash-comisiones-by-cuenta", cuentaCobranzaIds],
    queryFn: async () => {
      if (!cuentaCobranzaIds.length) return [];

      const all: any[] = [];
      for (let i = 0; i < cuentaCobranzaIds.length; i += 200) {
        const batch = cuentaCobranzaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, fecha_creacion")
          .in("id_cuenta_cobranza", batch)
          .eq("activo", true);
        if (data) all.push(...data);
      }

      const seen = new Set<number>();
      const deduped = all.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      const precioMap = new Map<number, number>();
      for (let i = 0; i < cuentaCobranzaIds.length; i += 200) {
        const batch = cuentaCobranzaIds.slice(i, i + 200);
        const { data: cuentas } = await supabase
          .from("cuentas_cobranza")
          .select("id, precio_final")
          .in("id", batch) as any;
        (cuentas || []).forEach((cc: any) => precioMap.set(cc.id, Number(cc.precio_final) || 0));
      }

      deduped.forEach((c) => {
        const precioFinal = precioMap.get(c.id_cuenta_cobranza) || 0;
        c.monto_comision = (Number(c.porcentaje_comision) || 0) / 100 * precioFinal;
      });

      return deduped;
    },
    enabled: cuentaCobranzaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Inmobiliaria commission percentage (most common from comisionistas)
  const inmobComisionPorcentaje = useMemo(() => {
    if (!comisiones.length) return null;
    const pcts = comisiones.map((c: any) => Number(c.porcentaje_comision) || 0).filter((p: number) => p > 0);
    if (!pcts.length) return null;
    const freq = new Map<number, number>();
    pcts.forEach((p: number) => freq.set(p, (freq.get(p) || 0) + 1));
    let maxP = pcts[0], maxCount = 0;
    freq.forEach((count, p) => { if (count > maxCount) { maxCount = count; maxP = p; } });
    return maxP;
  }, [comisiones]);

  // Prospectos per agent (date-filtered for dashboard)
  const { data: prospectosByAgent = new Map<number, number>() } = useQuery({
    queryKey: ["inmob-dash-prospectos-by-agent", agentPersonaIds, monthStart, monthEnd],
    queryFn: async () => {
      if (!agentPersonaIds.length) return new Map<number, number>();
      const all: any[] = [];
      for (let i = 0; i < agentPersonaIds.length; i += 200) {
        const batch = agentPersonaIds.slice(i, i + 200);
        const { data } = await supabase
          .from("entidades_relacionadas")
          .select("id_persona_duena_lead")
          .in("id_persona_duena_lead", batch)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .gte("fecha_creacion", monthStart)
          .lte("fecha_creacion", monthEnd) as any;
        if (data) all.push(...data);
      }
      const map = new Map<number, number>();
      all.forEach((r: any) => {
        map.set(r.id_persona_duena_lead, (map.get(r.id_persona_duena_lead) || 0) + 1);
      });
      return map;
    },
    enabled: agentPersonaIds.length > 0,
    staleTime: 3 * 60_000,
  });
  const prospectosCount = useMemo(() => {
    let total = 0;
    prospectosByAgent.forEach(v => total += v);
    return total;
  }, [prospectosByAgent]);

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

  // ───── Dedup cierre (same logic as pipeline) ─────
  // Pipeline deduplicates cierre by property/product key and requires cuenta_cobranza_id
  const dedupedAdvancedOfertas = useMemo(() => {
    const advanced = classifiedOfertas.filter((o: any) => ADVANCED_STAGES.has(o.stage));
    const cierre = advanced.filter((o: any) => o.stage === "cierre");
    const nonCierre = advanced.filter((o: any) => o.stage !== "cierre");
    
    // Dedup cierre: require cuenta, dedup by property/product key
    const seen = new Set<string>();
    const dedupedCierre = cierre
      .filter((o: any) => cuentasMap.has(o.id)) // must have cuenta_cobranza
      .filter((o: any) => {
        const key = o.id_producto
          ? `prod-${o.id_producto}-${o.id_propiedad || "none"}`
          : `prop-${o.id_propiedad}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    
    return [...nonCierre, ...dedupedCierre];
  }, [classifiedOfertas, cuentasMap]);

  // ───── KPI calculations (current month only) ─────
  const totalAgentes = agents.filter(a => a.activo).length;

  // Pipeline total: count + sum precio_final from Apartado onwards (deduped)
  const pipelineTotal = useMemo(() => {
    let sum = 0;
    dedupedAdvancedOfertas.forEach((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      sum += Number(cuenta?.precio_final) || 0;
    });
    return sum;
  }, [dedupedAdvancedOfertas, cuentasMap]);

  const pipelineCount = useMemo(() => {
    return dedupedAdvancedOfertas.length;
  }, [dedupedAdvancedOfertas]);

  // Ofertas activas: pre-apartado offers only (nuevas, pendientes, aprobadas, revision)
  // Advanced offers (apartado+) are already counted in "Apartados" and "Pipeline total"
  const ofertasActivas = useMemo(() => {
    const activeStages = new Set(["nuevas", "pendientes", "aprobadas", "revision"]);
    return classifiedOfertas.filter((o: any) => activeStages.has(o.stage)).length;
  }, [classifiedOfertas]);

  // Apartados: all offers from Apartado onwards (deduped, matches pipeline)
  const apartados = useMemo(() => {
    return dedupedAdvancedOfertas.length;
  }, [dedupedAdvancedOfertas]);

  const ventasCerradas = useMemo(() => {
    return dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre").length;
  }, [dedupedAdvancedOfertas]);

  // Helper: get commission monto (already computed in query)
  const getComisionMonto = useCallback((c: any) => {
    return Number(c.monto_comision) || 0;
  }, []);

  // Ingresos cobrados: comisionistas pagadas (current month)
  const ingresosCobrados = useMemo(() => {
    return comisiones
      .filter((c: any) => c.pagada === true)
      .reduce((s: number, c: any) => s + getComisionMonto(c), 0);
  }, [comisiones, getComisionMonto]);

  // Por cobrar: comisionistas aprobadas pero no pagadas (current month)
  const porCobrar = useMemo(() => {
    return comisiones
      .filter((c: any) => c.aprobada === true && c.pagada !== true)
      .reduce((s: number, c: any) => s + getComisionMonto(c), 0);
  }, [comisiones, getComisionMonto]);

  // Estimados: sum of commission from apartado onwards (current month)
  const advancedCuentaIds = useMemo(() => {
    const ids = new Set<number>();
    dedupedAdvancedOfertas.forEach((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      if (cuenta) ids.add(cuenta.id);
    });
    return ids;
  }, [dedupedAdvancedOfertas, cuentasMap]);

  const estimados = useMemo(() => {
    return comisiones
      .filter((c: any) => advancedCuentaIds.has(c.id_cuenta_cobranza))
      .reduce((s: number, c: any) => s + getComisionMonto(c), 0);
  }, [comisiones, advancedCuentaIds, getComisionMonto]);

  // Secondary KPIs — current month
  const conversionGlobal = ofertas.length > 0 ? ((ventasCerradas / ofertas.length) * 100) : 0;
  const { ticketPromedio, ticketPropiedades, ticketProductos } = useMemo(() => {
    const cierres = dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre");
    const props = cierres.filter((o: any) => !o.id_producto);
    const prods = cierres.filter((o: any) => !!o.id_producto);
    const avg = (arr: any[]) => {
      if (arr.length === 0) return 0;
      return arr.reduce((s: number, o: any) => s + (Number(cuentasMap.get(o.id)?.precio_final) || 0), 0) / arr.length;
    };
    return { ticketPromedio: avg(cierres), ticketPropiedades: avg(props), ticketProductos: avg(prods) };
  }, [dedupedAdvancedOfertas, cuentasMap]);
  // comisionPromAgente is computed later after allComisiones is available
  const comisionPromAgenteBase = totalAgentes > 0
    ? comisiones.reduce((s: number, c: any) => s + (Number(c.monto_comision) || 0), 0) / totalAgentes
    : 0;

  // Tiempo promedio de cierre: days from oferta creation to cierre
  const tiempoPromCierre = useMemo(() => {
    const cierres = dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre");
    if (cierres.length === 0) return 0;
    const totalDays = cierres.reduce((sum: number, o: any) => {
      const fechaOferta = new Date(o.fecha_generacion);
      const cuenta = cuentasMap.get(o.id);
      const fechaCierre = cuenta?.fecha_creacion ? new Date(cuenta.fecha_creacion) : new Date();
      const diffMs = fechaCierre.getTime() - fechaOferta.getTime();
      return sum + Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    }, 0);
    return Math.round(totalDays / cierres.length);
  }, [dedupedAdvancedOfertas, cuentasMap]);

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
      comision_prom_agente: comisionPromAgenteBase,
      tiempo_prom_cierre: tiempoPromCierre,
      fecha_actualizacion: new Date().toISOString(),
    };
    (supabase as any)
      .from("inmob_kpi_mensual")
      .upsert(kpiData, { onConflict: "persona_id,anio,mes" })
      .then(() => {});
  }, [personaId, isLoading, pipelineTotal, pipelineCount, ofertasActivas, apartados, ingresosCobrados, porCobrar, estimados, conversionGlobal, ticketPromedio, comisionPromAgenteBase, tiempoPromCierre]);

  // Trend helpers
  const trendPipeline = getTrend(pipelineTotal, prevKpi?.pipeline_total);
  const trendOfertasActivas = getTrend(ofertasActivas, prevKpi?.ofertas_activas);
  const trendApartados = getTrend(apartados, prevKpi?.apartados);
  const trendIngresos = getTrend(ingresosCobrados, prevKpi?.ingresos_cobrados);
  const trendPorCobrar = getTrend(porCobrar, prevKpi?.por_cobrar);
  const trendEstimados = getTrend(estimados, prevKpi?.estimados);
  const trendConversion = getTrend(conversionGlobal, prevKpi?.conversion_global);
  const trendTicket = getTrend(ticketPromedio, prevKpi?.ticket_promedio);
  const trendComisionProm = getTrend(comisionPromAgenteBase, prevKpi?.comision_prom_agente);
  const trendTiempoCierre = getTrend(tiempoPromCierre, prevKpi?.tiempo_prom_cierre, true); // lower is better

  // Funnel data — 5 stages: Ofertas → Aprobadas → Apartadas → Firma → Cerradas
  // Uses deduped advanced offers for consistency with KPIs and pipeline
  const firmaCount = useMemo(() => {
    return dedupedAdvancedOfertas.filter((o: any) => o.stage === "firma_contrato" || o.stage === "cierre").length;
  }, [dedupedAdvancedOfertas]);

  const apartadasFunnel = useMemo(() => {
    return dedupedAdvancedOfertas.length;
  }, [dedupedAdvancedOfertas]);

  const aprobadasCount = useMemo(() => {
    const preAprobadas = classifiedOfertas.filter((o: any) => o.stage === "aprobadas").length;
    return preAprobadas + dedupedAdvancedOfertas.length;
  }, [classifiedOfertas, dedupedAdvancedOfertas]);

  const funnelData = useMemo(() => [
    { stage: "Ofertas", count: ofertas.length },
    { stage: "Aprobadas", count: aprobadasCount },
    { stage: "Apartadas", count: apartadasFunnel },
    { stage: "Firma", count: firmaCount },
    { stage: "Cerradas", count: ventasCerradas },
  ], [ofertas, aprobadasCount, apartadasFunnel, firmaCount, ventasCerradas]);

  // Alerts — use O-/OP- nomenclature
  const alerts = useMemo(() => {
    const nowMs = Date.now();
    const result: Array<{ id: string; type: "warning" | "danger" | "info"; text: string; to: string }> = [];
    ofertas.forEach((o: any) => {
      const p = propMap.get(o.id_propiedad);
      if (!p) return;
      const days = Math.floor((nowMs - new Date(o.fecha_generacion).getTime()) / (24 * 60 * 60 * 1000));
      const agent = o.email_creador?.split("@")[0] || "—";
      const ofertaLabel = `${o.id_producto ? "OP" : "O"}-${String(o.id).padStart(6, "0")}`;
      if ([1, 4].includes(o.id_estatus_aprobacion) && days > 7) {
        result.push({ id: `offer-${o.id}`, type: "warning", text: `${agent} — ${ofertaLabel} sin respuesta (${days} días)`, to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}` });
      }
      if (p.id_estatus_disponibilidad === 4 && days > 5) {
        result.push({ id: `apt-${o.id}`, type: "danger", text: `${agent} — ${ofertaLabel} apartado sin firma (${days} días)`, to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}` });
      }
    });
    return result.slice(0, 5);
  }, [ofertas, propMap]);

  // Resolve names and roles for non-agent internal users who created offers
  const { data: internalUserData = { names: new Map<string, string>(), agentRoleEmails: new Set<string>() } } = useQuery({
    queryKey: ["inmob-dash-internal-names", classifiedOfertas.map(o => o.email_creador).join(","), agentEmails.join(",")],
    queryFn: async () => {
      const unknownEmails = [...new Set(classifiedOfertas
        .map((o: any) => o.email_creador)
        .filter((e: string) => e && !agentEmailSetLower.has(e.toLowerCase())))];
      if (!unknownEmails.length) return { names: new Map<string, string>(), agentRoleEmails: new Set<string>() };

      const m = new Map<string, string>();
      const agentRoles = new Set<string>();
      for (let i = 0; i < unknownEmails.length; i += 200) {
        const batch = unknownEmails.slice(i, i + 200);
        const { data: usuarios } = await supabase
          .from("usuarios")
          .select("email, id_persona, nombre, rol_id")
          .in("email", batch) as any;

        if (!usuarios?.length) continue;

        const pIds = [...new Set(usuarios.map((u: any) => u.id_persona).filter(Boolean))] as number[];
        const pMap = new Map<number, string>();

        if (pIds.length) {
          const { data: personas } = await supabase
            .from("personas")
            .select("id, nombre_legal, nombre_comercial")
            .in("id", pIds) as any;
          (personas || []).forEach((p: any) => pMap.set(p.id, p.nombre_legal || p.nombre_comercial || ""));
        }

        usuarios.forEach((u: any) => {
          const personaName = u.id_persona ? pMap.get(u.id_persona) : "";
          m.set(u.email, personaName || u.nombre || u.email.split("@")[0]);
          // Roles 3 (Agente Inmobiliario) and 9 (Agente Interno) are agents, not internal users
          if (u.rol_id === 3 || u.rol_id === 9) {
            agentRoles.add(u.email.toLowerCase());
          }
        });
      }

      return { names: m, agentRoleEmails: agentRoles };
    },
    enabled: classifiedOfertas.length > 0 && agentEmails.length > 0,
    staleTime: 5 * 60_000,
  });

  const internalUserNames = internalUserData.names;

  const internalEmails = useMemo(() => {
    return [...new Set(classifiedOfertas
      .map((o: any) => o.email_creador)
      .filter((e: string) => e && !agentEmailSetLower.has(e.toLowerCase()) && !internalUserData.agentRoleEmails.has(e.toLowerCase())))];
  }, [classifiedOfertas, agentEmailSetLower, internalUserData.agentRoleEmails]);

  const allComisiones = comisiones;

  const comisionByCuentaId = useMemo(() => {
    const map = new Map<number, number>();

    if (isSozu) {
      // Sozu: comisión sale del % configurado en la cuenta (con/sin IVA según bandera)
      cuentasMap.forEach((cuenta: any) => {
        const cuentaId = Number(cuenta?.id);
        if (!cuentaId) return;
        const base = (Number(cuenta?.precio_final) || 0) * (Number(cuenta?.porcentaje_comision_venta) || 0) / 100;
        const monto = (cuenta?.iva_incluido ? base * 1.16 : base);
        map.set(cuentaId, monto);
      });
      return map;
    }

    // Otras inmobiliarias: usar SOLO comisionistas de la inmobiliaria actual
    allComisiones.forEach((c: any) => {
      const cuentaId = Number(c.id_cuenta_cobranza);
      if (!cuentaId) return;
      const email = (c.email_usuario || "").toLowerCase();
      if (!inmobUserEmailSet.has(email)) return;
      map.set(cuentaId, (map.get(cuentaId) || 0) + (Number(c.monto_comision) || 0));
    });

    return map;
  }, [allComisiones, cuentasMap, isSozu, inmobUserEmailSet]);

  // Recompute comisionPromAgente with commission-to-inmobiliaria source of truth
  const comisionPromAgente = totalAgentes > 0
    ? Array.from(comisionByCuentaId.values()).reduce((s: number, v: number) => s + v, 0) / totalAgentes
    : 0;

  // Agent performance — includes both agents AND internal non-agent users
  const agentPerformance = useMemo(() => {
    const buildPerf = (email: string, nombre: string, isInternal: boolean) => {
      const emailLower = (email || "").toLowerCase();
      const userOfertas = classifiedOfertas.filter((o: any) => (o.email_creador || "").toLowerCase() === emailLower);
      const userCierres = dedupedAdvancedOfertas.filter((o: any) => (o.email_creador || "").toLowerCase() === emailLower && o.stage === "cierre");
      const userApartadosCount = dedupedAdvancedOfertas.filter((o: any) => (o.email_creador || "").toLowerCase() === emailLower && ADVANCED_STAGES.has(o.stage) && o.stage !== "cierre").length;
      const userPipeline = dedupedAdvancedOfertas
        .filter((o: any) => (o.email_creador || "").toLowerCase() === emailLower)
        .reduce((s: number, o: any) => {
          const cuenta = cuentasMap.get(o.id);
          return s + (Number(cuenta?.precio_final) || 0);
        }, 0);

      // Comisión por agente = suma de la comisión de inmobiliaria por cuenta ligada a sus ofertas
      const userCuentaIds = new Set<number>();
      userOfertas.forEach((o: any) => {
        const cuenta = cuentasMap.get(o.id);
        if (cuenta?.id) userCuentaIds.add(Number(cuenta.id));
      });
      const comision = Array.from(userCuentaIds).reduce((s, cuentaId) => s + (comisionByCuentaId.get(cuentaId) || 0), 0);

      const ingreso = userCierres.reduce((s: number, o: any) => { const cuenta = cuentasMap.get(o.id); return s + (Number(cuenta?.precio_final) || 0); }, 0);
      const conv = userOfertas.length > 0 ? ((userCierres.length / userOfertas.length) * 100) : 0;
      return {
        email,
        nombre,
        isInternal,
        prospectos: 0,
        ofertas: userOfertas.length,
        apartados: userApartadosCount,
        ventas: userCierres.length,
        pipeline: userPipeline,
        ingreso,
        comision,
        conversion: Math.round(conv * 10) / 10,
      };
    };

    const agentRows = agents.filter(a => a.activo).map(agent => buildPerf(agent.email, agent.nombre, false));

    // Add internal non-agent users who have offers
    const internalRows = internalEmails
      .filter(email => classifiedOfertas.some((o: any) => (o.email_creador || "").toLowerCase() === email.toLowerCase()))
      .map(email => {
        const name = internalUserNames.get(email) || email.split("@")[0];
        return buildPerf(email, name, true);
      });

    return [...agentRows, ...internalRows]
      .filter(r => r.ofertas > 0 || r.ventas > 0)
      .sort((a, b) => b.ventas - a.ventas);
  }, [agents, classifiedOfertas, dedupedAdvancedOfertas, cuentasMap, comisionByCuentaId, internalEmails, internalUserNames]);

  // Bar chart data
  const agentChartData = useMemo(() => {
    return agentPerformance.slice(0, 8).map(a => ({
      name: a.nombre.split(" ")[0],
      ventas: a.ventas,
      ingreso: a.ingreso,
      comision: a.comision,
      isInternal: a.isInternal,
      searchValue: a.email || a.nombre,
    }));
  }, [agentPerformance]);

  const chartDataKey = { unidades: "ventas", ingreso: "ingreso", comision: "comision" }[chartMode] as string;

  // ───── Area chart: always 6 months, independent of filter ─────
  const sixMonthWindow = useMemo(() => {
    const LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        start: d,
        end,
        label: `${LABELS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`,
      };
    });
  }, []);

  const { data: areaChartRaw } = useQuery({
    queryKey: ["inmob-dash-area-6m", isSozu ? sozuPropertyIds.length : agentEmails.join(","), isSozu, inmobAgentEmails.size],
    queryFn: async () => {
      let allCuentaIds: number[] = [];
      const cuentaInfoMap = new Map<number, { precio_final: number; porcentaje_comision_venta: number; id_propiedad: number; fecha_creacion?: string }>();

      if (isSozu) {
        if (!sozuPropertyIds.length) return null;
        const ofIds: number[] = [];
        for (let i = 0; i < sozuPropertyIds.length; i += 200) {
          const batch = sozuPropertyIds.slice(i, i + 200);
          const { data } = await supabase.from("ofertas").select("id, email_creador").in("id_propiedad", batch).eq("activo", true) as any;
          (data || []).filter((o: any) => !inmobAgentEmails.has((o.email_creador || "").toLowerCase())).forEach((o: any) => ofIds.push(o.id));
        }
        for (let i = 0; i < ofIds.length; i += 200) {
          const batch = ofIds.slice(i, i + 200);
          const { data } = await (supabase as any).from("cuentas_cobranza").select("id, precio_final, porcentaje_comision_venta, id_propiedad, fecha_creacion").in("id_oferta", batch).eq("activo", true);
          (data || []).forEach((c: any) => { allCuentaIds.push(c.id); cuentaInfoMap.set(c.id, { precio_final: Number(c.precio_final) || 0, porcentaje_comision_venta: Number(c.porcentaje_comision_venta) || 0, id_propiedad: c.id_propiedad, fecha_creacion: c.fecha_creacion }); });
        }
      } else {
        if (!agentEmails.length) return null;
        const { data: ofs } = await supabase.from("ofertas").select("id").in("email_creador", agentEmails).eq("activo", true) as any;
        const ofIds = (ofs || []).map((o: any) => o.id);
        for (let i = 0; i < ofIds.length; i += 200) {
          const batch = ofIds.slice(i, i + 200);
          const { data } = await (supabase as any).from("cuentas_cobranza").select("id, precio_final, porcentaje_comision_venta, id_propiedad, fecha_creacion").in("id_oferta", batch).eq("activo", true);
          (data || []).forEach((c: any) => { allCuentaIds.push(c.id); cuentaInfoMap.set(c.id, { precio_final: Number(c.precio_final) || 0, porcentaje_comision_venta: Number(c.porcentaje_comision_venta) || 0, id_propiedad: c.id_propiedad, fecha_creacion: c.fecha_creacion }); });
        }
      }
      if (!allCuentaIds.length) return null;

      const comisionistas: any[] = [];
      for (let i = 0; i < allCuentaIds.length; i += 200) {
        const batch = allCuentaIds.slice(i, i + 200);
        const { data } = await (supabase as any).from("comisionistas").select("id_cuenta_cobranza, email_usuario, porcentaje_comision, pagada, fecha_actualizacion").in("id_cuenta_cobranza", batch).eq("activo", true);
        if (data) comisionistas.push(...data);
      }

      const acuerdos: any[] = [];
      for (let i = 0; i < allCuentaIds.length; i += 200) {
        const batch = allCuentaIds.slice(i, i + 200);
        const { data } = await supabase.from("acuerdos_pago").select("id_cuenta_cobranza, fecha_pago, orden").in("id_cuenta_cobranza", batch).eq("activo", true).order("orden", { ascending: true }) as any;
        if (data) acuerdos.push(...data);
      }
      const engancheMap = new Map<number, string>();
      acuerdos.forEach((a: any) => { if (!engancheMap.has(a.id_cuenta_cobranza)) engancheMap.set(a.id_cuenta_cobranza, a.fecha_pago); });

      const propIds = [...new Set([...cuentaInfoMap.values()].map(c => c.id_propiedad).filter(Boolean))];
      const propStatusMap = new Map<number, number>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase.from("propiedades").select("id, id_estatus_disponibilidad").in("id", batch) as any;
        (data || []).forEach((p: any) => propStatusMap.set(p.id, p.id_estatus_disponibilidad));
      }

      return { comisionistas, engancheMap, cuentaInfoMap, propStatusMap };
    },
    enabled: isSozu ? sozuPropertyIds.length > 0 : agentEmails.length > 0,
    staleTime: 5 * 60_000,
  });

  const areaData = useMemo(() => {
    if (!areaChartRaw) return sixMonthWindow.map(m => ({ mes: m.label, real: 0, porCobrar: 0, estimado: 0 }));
    const { comisionistas, engancheMap, cuentaInfoMap, propStatusMap } = areaChartRaw;

    return sixMonthWindow.map(({ label, start, end }) => {
      // Cobrado: comisionistas pagadas, fecha_actualizacion in this month
      const real = comisionistas
        .filter((c: any) => c.pagada && c.fecha_actualizacion)
        .filter((c: any) => { const d = new Date(c.fecha_actualizacion); return d >= start && d <= end; })
        .reduce((s: number, c: any) => {
          const ci = cuentaInfoMap.get(c.id_cuenta_cobranza);
          return s + ((ci?.precio_final || 0) * (Number(c.porcentaje_comision) || 0) / 100);
        }, 0);

      // Por cobrar: comisionistas no pagadas cuya cuenta tiene enganche en este mes
      // OR comisionistas no pagadas sin enganche pero con fecha_creacion de la cuenta en este mes
      const porCobrarMes = comisionistas
        .filter((c: any) => !c.pagada)
        .filter((c: any) => {
          const eng = engancheMap.get(c.id_cuenta_cobranza);
          if (eng) {
            const d = new Date(eng);
            return d >= start && d <= end;
          }
          // Fallback: use cuenta creation date from cuentaInfoMap fecha_creacion
          const ci = cuentaInfoMap.get(c.id_cuenta_cobranza);
          if (ci && (ci as any).fecha_creacion) {
            const d = new Date((ci as any).fecha_creacion);
            return d >= start && d <= end;
          }
          return false;
        })
        .reduce((s: number, c: any) => {
          const ci = cuentaInfoMap.get(c.id_cuenta_cobranza);
          return s + ((ci?.precio_final || 0) * (Number(c.porcentaje_comision) || 0) / 100);
        }, 0);

      // Estimado: cuentas en apartado (prop status 4), enganche in this month
      // OR cuenta with fecha_creacion in this month if no enganche
      let estimadoMes = 0;
      cuentaInfoMap.forEach((ci, cuentaId) => {
        if (propStatusMap.get(ci.id_propiedad) !== 4) return;
        const eng = engancheMap.get(cuentaId);
        let dateInRange = false;
        if (eng) {
          const d = new Date(eng);
          dateInRange = d >= start && d <= end;
        } else if ((ci as any).fecha_creacion) {
          const d = new Date((ci as any).fecha_creacion);
          dateInRange = d >= start && d <= end;
        }
        if (!dateInRange) return;
        const pct = ci.porcentaje_comision_venta > 0 ? ci.porcentaje_comision_venta : 5;
        estimadoMes += ci.precio_final * pct / 100;
      });

      return { mes: label, real, porCobrar: porCobrarMes, estimado: estimadoMes };
    });
  }, [areaChartRaw, sixMonthWindow]);

  // Activity timeline — use O-/OP- nomenclature
  const recentActivity = useMemo(() => {
    return ofertas
      .filter((o: any) => o.fecha_generacion)
      .sort((a: any, b: any) => new Date(b.fecha_generacion).getTime() - new Date(a.fecha_generacion).getTime())
      .slice(0, 5)
      .map((o: any) => {
        const type = o.id_estatus_aprobacion === 2 ? "aprobada" : o.id_estatus_aprobacion === 5 ? "firmada" : "offer";
        const ofertaLabel = `${o.id_producto ? "OP" : "O"}-${String(o.id).padStart(6, "0")}`;
        return {
          id: o.id,
          icon: type,
          text: type === "aprobada" ? "Oferta aprobada" : type === "firmada" ? "Contrato firmado" : "Nueva oferta generada",
          detail: `${o.email_creador?.split("@")[0] || "—"} · ${ofertaLabel}`,
          time: formatDistanceToNow(new Date(o.fecha_generacion), { addSuffix: true, locale: es }),
          to: `${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`,
        };
      });
  }, [ofertas]);

  const avgConversion = conversionGlobal;

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Conversión global", value: `${conversionGlobal.toFixed(1)}%`, icon: Percent, trend: trendConversion },
            { label: "Ticket prom. Prop.", value: fmtShort(ticketPropiedades), icon: Home, trend: trendTicket },
            { label: "Ticket prom. Prod.", value: fmtShort(ticketProductos), icon: BarChart3, trend: null },
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
            <button onClick={() => navigate(`${NAV_PREFIX}/pipeline?meses=${encodeURIComponent(selectedMonths.join(","))}`)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
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
              {([["unidades", "Unidades"], ["ingreso", "Ingreso"], ["comision", "Comisión Inmobiliaria"]] as [ChartMode, string][]).map(([key, label]) => (
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
                  <Bar dataKey={chartDataKey} fill="hsl(139, 35%, 51%)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(_data: any, index: number) => { const agent = agentChartData[index]; if (agent?.searchValue) navigate(`${NAV_PREFIX}/agentes?q=${encodeURIComponent(agent.searchValue)}`); }} />
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
                    <TableHead className="sozu-table-header text-right">Comisión Inmobiliaria</TableHead>
                    <TableHead className="sozu-table-header text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help border-b border-dotted border-muted-foreground/50">Conversión</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          <p className="font-semibold mb-1">Conversión = (Ventas / Ofertas) × 100</p>
                          <p><span className="inline-block w-2 h-2 rounded-full bg-primary mr-1" />Verde: superior al promedio</p>
                          <p><span className="inline-block w-2 h-2 rounded-full bg-destructive mr-1" />Rojo: inferior al promedio</p>
                          <p><span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1" />Gris: en el promedio</p>
                          <p className="mt-1 text-muted-foreground">Promedio actual: {conversionGlobal.toFixed(1)}%</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerformance.slice(0, 10).map((agent, i) => {
                    const convStatus = agent.conversion > avgConversion * 1.1 ? "high" : agent.conversion < avgConversion * 0.8 ? "low" : "mid";
                    return (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`${NAV_PREFIX}/agentes?q=${encodeURIComponent(agent.email || agent.nombre)}`)}>
                        <TableCell className="font-medium">
                          {agent.nombre}
                          {agent.isInternal && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-2 py-0 border-warning/30 text-warning bg-warning/10 rounded-full font-medium">
                              Usuario Interno
                            </Badge>
                          )}
                        </TableCell>
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
                            {agent.conversion}%
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
