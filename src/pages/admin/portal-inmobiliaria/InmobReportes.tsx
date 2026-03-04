import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText } from "lucide-react";

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function InmobReportes() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();

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
    queryKey: ["inmob-reportes-ofertas", agentEmails],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      const { data } = await (supabase
        .from("ofertas") as any)
        .select("id, email_agente, estatus_aprobacion, precio_final, id_proyecto, fecha_creacion, activo")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .limit(1000);
      return data || [];
    },
    enabled: agentEmails.length > 0,
  });

  // Fetch commissions
  const { data: comisiones = [] } = useQuery({
    queryKey: ["inmob-reportes-comisiones", agentEmails],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      const { data } = await (supabase as any)
        .from("comisiones")
        .select("id, email_agente, monto, estatus_pago, fecha_creacion, activo")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .limit(1000);
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
      const d = c.fecha_creacion?.slice(0, 7); // YYYY-MM
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

  const hasData = ofertas.length > 0 || comisiones.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aún no hay datos suficientes para generar reportes.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Reportes</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 1. Offers per agent */}
        <Card className="sozu-card">
          <CardHeader><CardTitle className="text-base">Ofertas por Agente</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={offersPerAgent} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="ofertas" fill="#2563eb" name="Total" />
                <Bar dataKey="aprobadas" fill="#16a34a" name="Aprobadas" />
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
                <Pie data={offersPerProject} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="monto" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} name="Monto" />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="conversion" fill="#f59e0b" name="Conversión %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
