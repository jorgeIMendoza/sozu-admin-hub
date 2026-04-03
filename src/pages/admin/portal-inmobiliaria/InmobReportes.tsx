import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MonthMultiSelector, getCurrentMonthKey, getMonthFilterLabel, buildDateRangesFromMonths } from "@/components/ui/month-multi-selector";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText, CalendarDays, Percent, Home, BarChart3, DollarSign, Timer } from "lucide-react";

const COLORS = ["#239E6C", "#3B82F6", "#F97316", "#A855F7", "#14B8A6", "#EC4899", "#06B6D4", "#84CC16"];

export default function InmobReportes() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  const monthFilterLabel = useMemo(() => getMonthFilterLabel(selectedMonths), [selectedMonths]);
  const dateRanges = useMemo(() => buildDateRangesFromMonths(selectedMonths), [selectedMonths]);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/reportes");
    track({ page: "inmob_reportes", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  // Fetch offers
  const { data: ofertas = [] } = useQuery({
    queryKey: ["inmob-reportes-ofertas", agentEmails, dateRanges],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      let query = (supabase.from("ofertas") as any)
        .select("id, email_agente, estatus_aprobacion, precio_final, id_proyecto, fecha_creacion, activo")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .limit(1000);

      if (dateRanges.length > 0) {
        const orClauses = dateRanges.map(r => `and(fecha_creacion.gte.${r.start},fecha_creacion.lte.${r.end})`).join(",");
        query = query.or(orClauses);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: agentEmails.length > 0,
  });

  // Fetch commissions
  const { data: comisiones = [] } = useQuery({
    queryKey: ["inmob-reportes-comisiones", agentEmails, dateRanges],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      let query = (supabase as any)
        .from("comisiones")
        .select("id, email_agente, monto, estatus_pago, fecha_creacion, activo")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .limit(1000);

      if (dateRanges.length > 0) {
        const orClauses = dateRanges.map(r => `and(fecha_creacion.gte.${r.start},fecha_creacion.lte.${r.end})`).join(",");
        query = query.or(orClauses);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: agentEmails.length > 0,
  });

  // Fetch project names
  const projectIds = useMemo(() => [...new Set(ofertas.map((o: any) => o.id_proyecto).filter(Boolean))] as number[], [ofertas]);
  const { data: proyectos = [] } = useQuery({
    queryKey: ["inmob-reportes-proyectos", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data } = await supabase.from("proyectos").select("id, nombre").in("id", projectIds) as any;
      return data || [];
    },
    enabled: projectIds.length > 0,
  });
  const projMap = useMemo(() => {
    const m = new Map<number, string>();
    proyectos.forEach((p: any) => m.set(p.id, p.nombre));
    return m;
  }, [proyectos]);

  // 1. Offers per agent
  const offersPerAgent = useMemo(() => {
    const m = new Map<string, { name: string; ofertas: number; aprobadas: number }>();
    ofertas.forEach((o: any) => {
      const email = o.email_agente;
      if (!m.has(email)) m.set(email, { name: agentMap.get(email) || email, ofertas: 0, aprobadas: 0 });
      const r = m.get(email)!;
      r.ofertas++;
      if (o.estatus_aprobacion === "aprobada") r.aprobadas++;
    });
    return Array.from(m.values()).sort((a, b) => b.ofertas - a.ofertas).slice(0, 10);
  }, [ofertas, agentMap]);

  // 2. Offers per project
  const offersPerProject = useMemo(() => {
    const m = new Map<number, { name: string; value: number }>();
    ofertas.forEach((o: any) => {
      const pid = o.id_proyecto;
      if (!pid) return;
      if (!m.has(pid)) m.set(pid, { name: projMap.get(pid) || `Proyecto ${pid}`, value: 0 });
      m.get(pid)!.value++;
    });
    return Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [ofertas, projMap]);

  // 3. Commissions monthly trend
  const commissionTrend = useMemo(() => {
    const m = new Map<string, number>();
    comisiones.forEach((c: any) => {
      const d = c.fecha_creacion?.slice(0, 7);
      if (!d) return;
      m.set(d, (m.get(d) || 0) + (Number(c.monto) || 0));
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mes, monto]) => ({ mes, monto: Math.round(monto) }));
  }, [comisiones]);

  // 4. Conversion per agent
  const conversionData = useMemo(() => {
    const m = new Map<string, { name: string; total: number; aprobadas: number }>();
    ofertas.forEach((o: any) => {
      const email = o.email_agente;
      if (!m.has(email)) m.set(email, { name: agentMap.get(email) || email, total: 0, aprobadas: 0 });
      const r = m.get(email)!;
      r.total++;
      if (o.estatus_aprobacion === "aprobada") r.aprobadas++;
    });
    return Array.from(m.values())
      .filter(r => r.total > 0)
      .map(r => ({ name: r.name, conversion: Math.round((r.aprobadas / r.total) * 100) }))
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 10);
  }, [ofertas, agentMap]);

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  const fmtShort = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return fmt(n);
  };

  // Strategic KPIs
  const aprobadas = ofertas.filter((o: any) => o.estatus_aprobacion === "aprobada");
  const conversionGlobal = ofertas.length > 0 ? ((aprobadas.length / ofertas.length) * 100) : 0;

  const ticketPropiedades = useMemo(() => {
    const props = aprobadas.filter((o: any) => !o.id_producto_servicio);
    if (props.length === 0) return 0;
    return props.reduce((s: number, o: any) => s + (Number(o.precio_final) || 0), 0) / props.length;
  }, [aprobadas]);

  const ticketProductos = useMemo(() => {
    const prods = aprobadas.filter((o: any) => !!o.id_producto_servicio);
    if (prods.length === 0) return 0;
    return prods.reduce((s: number, o: any) => s + (Number(o.precio_final) || 0), 0) / prods.length;
  }, [aprobadas]);

  const comisionPromAgente = useMemo(() => {
    const agentsWithSales = new Set(aprobadas.map((o: any) => o.email_agente));
    if (agentsWithSales.size === 0) return 0;
    const totalComision = comisiones.reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);
    return totalComision / agentsWithSales.size;
  }, [aprobadas, comisiones]);

  const tiempoPromCierre = useMemo(() => {
    if (aprobadas.length === 0) return 0;
    const totalDays = aprobadas.reduce((sum: number, o: any) => {
      const created = new Date(o.fecha_creacion);
      const diffMs = Date.now() - created.getTime();
      return sum + Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    }, 0);
    return Math.round(totalDays / aprobadas.length);
  }, [aprobadas]);

  const hasData = ofertas.length > 0 || comisiones.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {monthFilterLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <MonthMultiSelector value={selectedMonths} onChange={setSelectedMonths} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Strategic mini-metrics */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Conversión global", value: `${conversionGlobal.toFixed(1)}%`, icon: Percent },
            { label: "Ticket prom. Prop.", value: fmtShort(ticketPropiedades), icon: Home },
            { label: "Ticket prom. Prod.", value: fmtShort(ticketProductos), icon: BarChart3 },
            { label: "Comisión prom/agente", value: fmtShort(comisionPromAgente), icon: DollarSign },
            { label: "Tiempo prom. cierre", value: tiempoPromCierre > 0 ? `${tiempoPromCierre} días` : "— días", icon: Timer },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground truncate">{m.label}</p>
                <p className="text-sm font-bold">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasData ? (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aún no hay datos suficientes para generar reportes.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Offers per agent */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Ofertas por Agente</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={offersPerAgent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Legend />
                  <Bar dataKey="ofertas" fill="#3B82F6" name="Total" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="aprobadas" fill="#239E6C" name="Aprobadas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 2. Offers per project */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Ofertas por Proyecto</CardTitle></CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={offersPerProject} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                    {offersPerProject.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 3. Commission trend */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Comisiones Mensuales</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={commissionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Line type="monotone" dataKey="monto" stroke="#239E6C" strokeWidth={2} dot={{ fill: "#239E6C", r: 4, strokeWidth: 2, stroke: "white" }} activeDot={{ r: 6 }} name="Monto" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 4. Conversion per agent */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">% Conversión por Agente</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={conversionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B7280" }} angle={-30} textAnchor="end" height={80} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Bar dataKey="conversion" fill="#3B82F6" name="Conversión %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
