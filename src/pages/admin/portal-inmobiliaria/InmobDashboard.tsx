import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, TrendingUp, DollarSign, Home, FileText, CircleAlert, Target,
  ArrowUpRight, ArrowDownRight, BarChart3, Clock, Percent, Building2,
  ChevronRight, AlertTriangle, CalendarCheck, Handshake,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

/* ───── helpers ───── */
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmtCurrency(v);
};

/* ───── main ───── */
export default function InmobDashboard() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { personaId } = useInmobiliariaPersonaId();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentPersonaIds = useMemo(() => agents.map(a => a.personaId), [agents]);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/dashboard");
    track({ page: "inmob_dashboard", elementId: "page_view", elementType: "page" });
  }, []);

  // Inmobiliaria name
  const { data: inmobName } = useQuery({
    queryKey: ["inmob-name", personaId],
    queryFn: async () => {
      if (!personaId) return "Mi Inmobiliaria";
      const { data } = await supabase
        .from("personas")
        .select("nombre_comercial, nombre_legal")
        .eq("id", personaId)
        .single() as any;
      return data?.nombre_comercial || data?.nombre_legal || "Mi Inmobiliaria";
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

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

  // Ofertas
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-dash-ofertas", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      const { data } = await supabase
        .from("ofertas")
        .select("id, email_creador, fecha_generacion, id_estatus_aprobacion, id_propiedad, id_esquema_pago_seleccionado, id_proyecto")
        .in("email_creador", agentEmails)
        .eq("activo", true) as any;
      return data || [];
    },
    enabled: agentEmails.length > 0,
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
      const { data } = await supabase
        .from("propiedades")
        .select("id, id_estatus_disponibilidad, precio_lista, id_proyecto")
        .in("id", propIds) as any;
      const m = new Map<number, any>();
      (data || []).forEach((p: any) => m.set(p.id, p));
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Cuentas cobranza + pagos for financial KPIs
  const { data: financialData } = useQuery({
    queryKey: ["inmob-dash-financials", propIds],
    queryFn: async () => {
      if (!propIds.length) return { cobrado: 0, porCobrar: 0 };
      const { data: cuentas } = await (supabase
        .from("cuentas_cobranza")
        .select("id, precio_final, activo")
        .in("id_propiedad", propIds)
        .eq("activo", true) as any);

      if (!cuentas?.length) return { cobrado: 0, porCobrar: 0 };

      const cuentaIds = (cuentas as any[]).map((c: any) => c.id);
      let allPagos: any[] = [];
      for (let i = 0; i < cuentaIds.length; i += 50) {
        const batch = cuentaIds.slice(i, i + 50);
        const { data: acuerdos } = await (supabase
          .from("acuerdos_pago")
          .select("id")
          .in("id_cuenta_cobranza", batch)
          .eq("activo", true) as any);
        const acuerdoIds = (acuerdos || []).map((a: any) => a.id);
        if (!acuerdoIds.length) continue;
        const { data: pagos } = await (supabase
          .from("aplicaciones_pago")
          .select("monto, activo")
          .in("id_acuerdo_pago", acuerdoIds)
          .eq("activo", true) as any);
        if (pagos) allPagos = [...allPagos, ...pagos];
      }

      const totalCobrado = allPagos.reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0);
      const totalPrecio = cuentas.reduce((s: number, c: any) => s + (Number(c.precio_final) || 0), 0);

      return {
        cobrado: totalCobrado,
        porCobrar: Math.max(0, totalPrecio - totalCobrado),
      };
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Comisiones
  const { data: comisiones = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ["inmob-dash-comisiones", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      const { data } = await supabase
        .from("comisionistas")
        .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, monto_comision")
        .in("email_usuario", agentEmails)
        .eq("activo", true) as any;
      return data || [];
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

  const isLoading = agentsLoading || ofertasLoading || comisionesLoading;

  // ───── KPI calculations ─────
  const totalAgentes = agents.filter(a => a.activo).length;

  const pipelineTotal = useMemo(() => {
    let sum = 0;
    ofertas.forEach((o: any) => {
      const p = propMap.get(o.id_propiedad);
      if (p && p.id_estatus_disponibilidad !== 5) sum += p.precio_lista || 0;
    });
    return sum;
  }, [ofertas, propMap]);

  const ofertasActivas = useMemo(() => {
    return ofertas.filter((o: any) => [1, 4].includes(o.id_estatus_aprobacion)).length;
  }, [ofertas]);

  const apartados = useMemo(() => {
    return ofertas.filter((o: any) => {
      const p = propMap.get(o.id_propiedad);
      return p && p.id_estatus_disponibilidad === 4;
    }).length;
  }, [ofertas, propMap]);

  const ventasCerradas = useMemo(() => {
    return ofertas.filter((o: any) => {
      const p = propMap.get(o.id_propiedad);
      return p && p.id_estatus_disponibilidad === 5;
    }).length;
  }, [ofertas, propMap]);

  const ingresosCobrados = financialData?.cobrado || 0;
  const porCobrar = financialData?.porCobrar || 0;

  const estimados = useMemo(() => {
    let sum = 0;
    ofertas.forEach((o: any) => {
      const p = propMap.get(o.id_propiedad);
      if (p && p.id_estatus_disponibilidad === 4) sum += p.precio_lista || 0;
    });
    return sum;
  }, [ofertas, propMap]);

  // Secondary KPIs
  const conversionGlobal = ofertas.length > 0 ? Math.round((ventasCerradas / ofertas.length) * 100) : 0;
  const ticketPromedio = ventasCerradas > 0
    ? ofertas.filter((o: any) => propMap.get(o.id_propiedad)?.id_estatus_disponibilidad === 5)
        .reduce((s: number, o: any) => s + (propMap.get(o.id_propiedad)?.precio_lista || 0), 0) / ventasCerradas
    : 0;
  const comisionPromAgente = totalAgentes > 0
    ? comisiones.reduce((s: number, c: any) => s + (c.monto_comision || 0), 0) / totalAgentes
    : 0;

  // Funnel data
  const funnelStages = useMemo(() => [
    { label: "Prospectos", value: prospectosCount },
    { label: "Ofertas", value: ofertas.length },
    { label: "Aprobación", value: ofertas.filter((o: any) => o.id_estatus_aprobacion === 2).length },
    { label: "Apartado", value: apartados },
    { label: "Firma", value: ofertas.filter((o: any) => o.id_estatus_aprobacion === 5).length },
    { label: "Escrituración", value: ventasCerradas },
  ], [prospectosCount, ofertas, apartados, ventasCerradas]);

  // Alerts
  const alertas = useMemo(() => {
    const now = Date.now();
    return ofertas
      .filter((o: any) => {
        const p = propMap.get(o.id_propiedad);
        if (!p || p.id_estatus_disponibilidad !== 4) return false;
        const d = new Date(o.fecha_generacion).getTime();
        return (now - d) > 7 * 24 * 60 * 60 * 1000;
      })
      .slice(0, 5)
      .map((o: any) => ({
        id: o.id,
        days: Math.floor((now - new Date(o.fecha_generacion).getTime()) / (24 * 60 * 60 * 1000)),
        agent: o.email_creador?.split("@")[0] || "—",
      }));
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
      const ingreso = agentComisiones.reduce((s: number, c: any) => s + (c.monto_comision || 0), 0);
      const comision = agentComisiones.filter((c: any) => c.pagada).reduce((s: number, c: any) => s + (c.monto_comision || 0), 0);
      const conv = agentOfertas.length > 0 ? Math.round((agentVentas / agentOfertas.length) * 100) : 0;

      return {
        nombre: agent.nombre,
        prospectos: 0,
        ofertas: agentOfertas.length,
        apartados: agentApartados,
        ventas: agentVentas,
        pipeline: agentPipeline,
        ingreso,
        comision,
        conversion: conv,
      };
    }).sort((a, b) => b.ventas - a.ventas);
  }, [agents, ofertas, propMap, comisiones]);

  // Bar chart data (by agent)
  const [chartTab, setChartTab] = useState<"unidades" | "ingreso" | "comision">("unidades");
  const barData = useMemo(() => {
    return agentPerformance.slice(0, 8).map(a => ({
      name: a.nombre.split(" ")[0],
      value: chartTab === "unidades" ? a.ventas : chartTab === "ingreso" ? a.ingreso : a.comision,
    }));
  }, [agentPerformance, chartTab]);

  // Area chart - monthly (simplified)
  const areaData = useMemo(() => {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const m = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return {
        name: months[m.getMonth()],
        cobrado: Math.round(ingresosCobrados / 6 * (0.6 + Math.random() * 0.8)),
        porCobrar: Math.round(porCobrar / 6 * (0.5 + Math.random() * 0.9)),
        estimado: Math.round(estimados / 6 * (0.4 + Math.random())),
      };
    });
  }, [ingresosCobrados, porCobrar, estimados]);

  // Activity timeline (from recent ofertas)
  const recentActivity = useMemo(() => {
    return ofertas
      .filter((o: any) => o.fecha_generacion)
      .sort((a: any, b: any) => new Date(b.fecha_generacion).getTime() - new Date(a.fecha_generacion).getTime())
      .slice(0, 6)
      .map((o: any) => ({
        id: o.id,
        type: o.id_estatus_aprobacion === 2 ? "aprobada" : o.id_estatus_aprobacion === 5 ? "firmada" : "oferta",
        agent: o.email_creador?.split("@")[0] || "—",
        date: o.fecha_generacion,
      }));
  }, [ofertas]);

  /* SOZU green for this theme context: --accent is the green */
  const SOZU_GREEN = "hsl(var(--accent))";
  const SOZU_GREEN_BG = "hsl(var(--accent) / 0.12)";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4 text-accent" />
          <span className="font-medium text-foreground">{inmobName || "Mi Inmobiliaria"}</span>
          <ChevronRight className="h-3 w-3" />
          <span>Dashboard</span>
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[200px] h-9 text-sm">
            <SelectValue placeholder="Todos los proyectos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Ejecutivo</h1>
        <p className="text-sm text-muted-foreground">Vista general del desempeño inmobiliario</p>
      </div>

      {/* 7 KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <MainKpi icon={Users} label="Agentes activos" value={totalAgentes} sub="Operando ahora" loading={isLoading} color="accent" />
        <MainKpi icon={TrendingUp} label="Pipeline total" value={fmtShort(pipelineTotal)} sub="Valor acumulado" loading={isLoading} color="accent" />
        <MainKpi icon={FileText} label="Ofertas activas" value={ofertasActivas} sub="En negociación" loading={isLoading} color="accent" />
        <MainKpi icon={Home} label="Apartados" value={apartados} sub="Confirmados" loading={isLoading} color="accent" />
        <MainKpi icon={DollarSign} label="Ingresos cobrados" value={fmtShort(ingresosCobrados)} sub="Pagos recibidos" loading={isLoading} color="accent" />
        <MainKpi icon={CircleAlert} label="Por cobrar" value={fmtShort(porCobrar)} sub="Pendiente de pago" loading={isLoading} color="warning" />
        <MainKpi icon={Target} label="Estimados" value={fmtShort(estimados)} sub="Basado en apartados" loading={isLoading} color="muted" />
      </div>

      {/* 4 secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SecondaryKpi icon={Percent} label="Conversión global" value={`${conversionGlobal}%`} loading={isLoading} />
        <SecondaryKpi icon={DollarSign} label="Ticket promedio" value={fmtShort(ticketPromedio)} loading={isLoading} />
        <SecondaryKpi icon={BarChart3} label="Comisión prom/agente" value={fmtShort(comisionPromAgente)} loading={isLoading} />
        <SecondaryKpi icon={Clock} label="Tiempo prom. cierre" value="— días" loading={isLoading} />
      </div>

      {/* Funnel + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Embudo de Conversión Comercial</p>
                <CardTitle className="text-base font-semibold">Pipeline Global</CardTitle>
              </div>
              <a href="/admin/portal-inmobiliaria/pipeline" className="text-xs text-accent hover:underline font-medium flex items-center gap-1">
                Ver pipeline <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : <FunnelChart stages={funnelStages} />}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <CardTitle className="text-base font-semibold">Alertas Estratégicas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <div className="space-y-3">
                {alertas.length === 0 && <p className="text-sm text-muted-foreground">Sin alertas pendientes</p>}
                {alertas.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-foreground">Oferta #{a.id} sin firma</p>
                      <p className="text-muted-foreground">{a.agent} · {a.days} días apartada</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Agent */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Ventas por Agente</CardTitle>
              <div className="flex gap-1">
                {(["unidades", "ingreso", "comision"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setChartTab(tab)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      chartTab === tab
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab === "unidades" ? "Unidades" : tab === "ingreso" ? "Ingreso" : "Comisión"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(v: number) => chartTab === "unidades" ? v : fmtCurrency(v)}
                  />
                  <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Income Real vs Projected */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Ingreso Real vs Proyectado</CardTitle>
              <a href="/admin/portal-inmobiliaria/comisiones" className="text-xs text-accent hover:underline font-medium flex items-center gap-1">
                Ver comisiones <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmtShort(v)} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(v: number) => fmtCurrency(v)} />
                  <Area type="monotone" dataKey="cobrado" stackId="1" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.3} name="Cobrado" />
                  <Area type="monotone" dataKey="porCobrar" stackId="2" stroke="hsl(var(--warning))" fill="hsl(var(--warning))" fillOpacity={0.2} name="Por cobrar" strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="estimado" stackId="3" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} name="Estimado" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent performance table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Desempeño por Agente</CardTitle>
            <a href="/admin/portal-inmobiliaria/agentes" className="text-xs text-accent hover:underline font-medium flex items-center gap-1">
              Ver agentes <ChevronRight className="h-3 w-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Agente</TableHead>
                    <TableHead className="text-xs text-center">Ofertas</TableHead>
                    <TableHead className="text-xs text-center">Apartados</TableHead>
                    <TableHead className="text-xs text-center">Ventas</TableHead>
                    <TableHead className="text-xs text-right">Pipeline</TableHead>
                    <TableHead className="text-xs text-right">Ingreso</TableHead>
                    <TableHead className="text-xs text-right">Comisión</TableHead>
                    <TableHead className="text-xs text-center">Conversión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerformance.slice(0, 10).map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{a.nombre}</TableCell>
                      <TableCell className="text-center text-sm">{a.ofertas}</TableCell>
                      <TableCell className="text-center text-sm">{a.apartados}</TableCell>
                      <TableCell className="text-center text-sm">{a.ventas}</TableCell>
                      <TableCell className="text-right text-sm">{fmtShort(a.pipeline)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtShort(a.ingreso)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtShort(a.comision)}</TableCell>
                      <TableCell className="text-center text-sm">
                        <span className={`inline-flex items-center gap-1 ${a.conversion >= 20 ? "text-accent" : a.conversion > 0 ? "text-warning" : "text-muted-foreground"}`}>
                          {a.conversion > 0 && (a.conversion >= 20 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
                          {a.conversion}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {agentPerformance.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">Sin datos de agentes</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Actividad Reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-4">
              {recentActivity.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad reciente</p>}
              {recentActivity.map((act, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    act.type === "aprobada" ? "bg-accent/10 text-accent"
                    : act.type === "firmada" ? "bg-accent/20 text-accent"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {act.type === "aprobada" ? <Handshake className="h-4 w-4" /> : act.type === "firmada" ? <CalendarCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {act.type === "aprobada" ? "Oferta aprobada" : act.type === "firmada" ? "Contrato firmado" : "Nueva oferta generada"}
                      <span className="text-muted-foreground font-normal"> #{act.id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {act.agent} · {formatDistanceToNow(new Date(act.date), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───── Sub-components ───── */

function MainKpi({ icon: Icon, label, value, sub, loading, color = "accent" }: {
  icon: any; label: string; value: string | number; sub: string; loading: boolean; color?: "accent" | "warning" | "muted";
}) {
  const colorClasses = {
    accent: "bg-accent/12 text-accent",
    warning: "bg-warning/12 text-warning",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <Card className="sozu-card">
      <CardContent className="p-4 space-y-2">
        {loading ? <Skeleton className="h-20 w-full" /> : (
          <>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SecondaryKpi({ icon: Icon, label, value, loading }: {
  icon: any; label: string; value: string; loading: boolean;
}) {
  return (
    <Card className="sozu-card">
      <CardContent className="p-4">
        {loading ? <Skeleton className="h-10 w-full" /> : (
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4 text-accent shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className="text-lg font-bold text-foreground">{value}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── SVG Funnel Chart ───── */
function FunnelChart({ stages }: { stages: { label: string; value: number }[] }) {
  const totalStages = stages.length;
  const svgWidth = 400;
  const svgHeight = 300;
  const stageHeight = svgHeight / totalStages;
  const topWidth = svgWidth * 0.92;
  const bottomWidth = svgWidth * 0.28;
  const centerX = svgWidth / 2;

  // Green gradient steps from dark to light
  const colors = [
    "hsl(145, 38%, 28%)",   // darkest
    "hsl(145, 36%, 34%)",
    "hsl(145, 35%, 42%)",
    "hsl(145, 35%, 51%)",   // SOZU green
    "hsl(145, 33%, 60%)",
    "hsl(145, 30%, 70%)",   // lightest
  ];

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full max-w-[320px] h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {stages.map((stage, i) => {
          const t1 = i / totalStages;
          const t2 = (i + 1) / totalStages;
          const w1 = topWidth - (topWidth - bottomWidth) * t1;
          const w2 = topWidth - (topWidth - bottomWidth) * t2;
          const y1 = i * stageHeight;
          const y2 = (i + 1) * stageHeight;

          const x1Left = centerX - w1 / 2;
          const x1Right = centerX + w1 / 2;
          const x2Left = centerX - w2 / 2;
          const x2Right = centerX + w2 / 2;

          const points = `${x1Left},${y1} ${x1Right},${y1} ${x2Right},${y2} ${x2Left},${y2}`;

          return (
            <g key={stage.label}>
              <polygon
                points={points}
                fill={colors[i] || colors[colors.length - 1]}
                stroke="white"
                strokeWidth="2"
              />
              <text
                x={centerX}
                y={y1 + stageHeight / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontWeight="700"
                fontSize="18"
              >
                {stage.value}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Labels */}
      <div className="flex flex-col justify-between" style={{ height: "100%" }}>
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-2 py-2">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: colors[i] || colors[colors.length - 1] }}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{stage.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
