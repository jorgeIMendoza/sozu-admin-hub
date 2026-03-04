import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, TrendingUp, DollarSign, ShoppingCart,
  FileText, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#57AE75", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function useInmobAgents(personaId: number | null | undefined) {
  return useQuery({
    queryKey: ["inmob-agents", personaId],
    queryFn: async () => {
      if (!personaId) return { emails: [] as string[], personaIds: [] as number[] };
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona")
        .eq("id_persona_duena_lead", personaId)
        .eq("id_tipo_entidad", 19)
        .eq("activo", true) as any;
      if (!data || data.length === 0) return { emails: [], personaIds: [] };
      const pIds = data.map((d: any) => d.id_persona).filter(Boolean) as number[];
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, id_persona")
        .in("id_persona", pIds)
        .eq("activo", true) as any;
      return {
        emails: (usuarios || []).map((u: any) => u.email) as string[],
        personaIds: pIds,
      };
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });
}

export default function InmobDashboard() {
  const { profile } = useAuth();
  const personaId = profile?.id_persona;
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents, isLoading: agentsLoading } = useInmobAgents(personaId);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/dashboard");
    track({ page: "inmob_dashboard", elementId: "page_view", elementType: "page" });
  }, []);

  // Fetch offers from agents
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-dashboard-ofertas", agents?.emails],
    queryFn: async () => {
      if (!agents?.emails?.length) return [];
      const { data } = await supabase
        .from("ofertas")
        .select("id, email_creador, fecha_generacion, id_estatus_aprobacion, id_propiedad, id_esquema_pago_seleccionado")
        .in("email_creador", agents.emails)
        .eq("activo", true) as any;
      return data || [];
    },
    enabled: !!agents?.emails?.length,
    staleTime: 3 * 60_000,
  });

  // Fetch comisiones
  const { data: comisiones = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ["inmob-dashboard-comisiones", agents?.emails],
    queryFn: async () => {
      if (!agents?.emails?.length) return [];
      const { data } = await supabase
        .from("comisionistas")
        .select("id, email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza")
        .in("email_usuario", agents.emails)
        .eq("activo", true) as any;
      return data || [];
    },
    enabled: !!agents?.emails?.length,
    staleTime: 3 * 60_000,
  });

  // Fetch property availability for sold count
  const propIds = useMemo(() => {
    return [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
  }, [ofertas]);

  const { data: propStatus = new Map() } = useQuery({
    queryKey: ["inmob-dashboard-props", propIds],
    queryFn: async () => {
      if (!propIds.length) return new Map<number, number>();
      const { data } = await supabase
        .from("propiedades")
        .select("id, id_estatus_disponibilidad")
        .in("id", propIds) as any;
      const m = new Map<number, number>();
      (data || []).forEach((p: any) => m.set(p.id, p.id_estatus_disponibilidad));
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  const isLoading = agentsLoading || ofertasLoading || comisionesLoading;

  // KPI calculations
  const totalAgentes = agents?.emails?.length || 0;
  const totalOfertas = ofertas.length;
  const ofertasAprobadas = ofertas.filter((o: any) => o.id_estatus_aprobacion === 2).length;
  const ventasCerradas = ofertas.filter((o: any) => {
    if (!o.id_propiedad) return false;
    return propStatus.get(o.id_propiedad) === 5;
  }).length;
  const comisionesPagadas = comisiones.filter((c: any) => c.pagada).length;
  const comisionesPendientes = comisiones.filter((c: any) => !c.pagada).length;

  // Funnel data
  const funnelData = useMemo(() => [
    { name: "Ofertas", value: totalOfertas },
    { name: "Con Esquema", value: ofertas.filter((o: any) => o.id_esquema_pago_seleccionado).length },
    { name: "Aprobadas", value: ofertasAprobadas },
    { name: "Vendidas", value: ventasCerradas },
  ], [ofertas, totalOfertas, ofertasAprobadas, ventasCerradas]);

  // Offers by agent
  const ofertasPorAgente = useMemo(() => {
    const map = new Map<string, number>();
    ofertas.forEach((o: any) => {
      map.set(o.email_creador, (map.get(o.email_creador) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([email, count]) => ({ name: email.split("@")[0], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [ofertas]);

  // Status distribution for pie
  const statusDist = useMemo(() => {
    const labels: Record<number, string> = { 1: "Pendiente", 2: "Aprobada", 3: "Rechazada", 4: "En revisión", 5: "Firmada" };
    const map = new Map<string, number>();
    ofertas.forEach((o: any) => {
      const label = labels[o.id_estatus_aprobacion] || "Sin estatus";
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [ofertas]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Vista general del rendimiento de tu inmobiliaria</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Agentes Activos" value={totalAgentes} icon={Users} loading={isLoading} />
        <KpiCard title="Total Ofertas" value={totalOfertas} icon={FileText} loading={isLoading} />
        <KpiCard title="Ofertas Aprobadas" value={ofertasAprobadas} icon={CheckCircle2} loading={isLoading} variant="success" />
        <KpiCard title="Ventas Cerradas" value={ventasCerradas} icon={ShoppingCart} loading={isLoading} variant="success" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Comisiones Pagadas" value={comisionesPagadas} icon={DollarSign} loading={isLoading} variant="success" />
        <KpiCard title="Comisiones Pendientes" value={comisionesPendientes} icon={Clock} loading={isLoading} variant="warning" />
        <KpiCard title="Tasa Aprobación" value={totalOfertas ? `${Math.round((ofertasAprobadas / totalOfertas) * 100)}%` : "0%"} icon={TrendingUp} loading={isLoading} />
        <KpiCard title="Tasa Cierre" value={totalOfertas ? `${Math.round((ventasCerradas / totalOfertas) * 100)}%` : "0%"} icon={AlertTriangle} loading={isLoading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Embudo de Conversión</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(145, 35%, 51%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución por Estatus</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusDist.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Offers by Agent */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ofertas por Agente</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ofertasPorAgente}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(145, 35%, 51%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title, value, icon: Icon, loading, variant,
}: {
  title: string;
  value: number | string;
  icon: any;
  loading: boolean;
  variant?: "success" | "warning";
}) {
  return (
    <Card className="sozu-card">
      <CardContent className="p-4">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                variant === "success"
                  ? "bg-green-50 text-green-600"
                  : variant === "warning"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{title}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
