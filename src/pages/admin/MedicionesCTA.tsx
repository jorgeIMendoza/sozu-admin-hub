import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BarChart3, MousePointer, TrendingUp } from "lucide-react";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const COLORS = [
  "hsl(158, 64%, 38%)", "hsl(210, 80%, 55%)", "hsl(43, 96%, 56%)",
  "hsl(271, 81%, 56%)", "hsl(0, 84%, 60%)", "hsl(24, 95%, 53%)",
];

const MedicionesCTA = () => {
  const [filterPage, setFilterPage] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("7d");

  const fromDate = useMemo(() => {
    const d = new Date();
    if (timeRange === "24h") d.setHours(d.getHours() - 24);
    else if (timeRange === "7d") d.setDate(d.getDate() - 7);
    else if (timeRange === "30d") d.setDate(d.getDate() - 30);
    else d.setDate(d.getDate() - 90);
    return d.toISOString();
  }, [timeRange]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["cta-events", filterPage, fromDate],
    queryFn: async () => {
      let q = supabase
        .from("cta_events")
        .select("*")
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (filterPage !== "all") q = q.eq("page", filterPage);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Unique pages
  const pages = useMemo(() => [...new Set(events.map((e: any) => e.page))].sort(), [events]);

  // Aggregate by element_id
  const elementCounts = useMemo(() => {
    const map = new Map<string, { count: number; label: string; page: string }>();
    events.forEach((e: any) => {
      const key = `${e.page}::${e.element_id}`;
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { count: 1, label: e.element_label || e.element_id, page: e.page });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [events]);

  // Unique users
  const uniqueUsers = useMemo(() => new Set(events.map((e: any) => e.user_email)).size, [events]);

  // Chart data (top 15 CTAs)
  const chartData = elementCounts.slice(0, 15).map((e) => ({ name: e.label.length > 20 ? e.label.slice(0, 20) + "…" : e.label, clicks: e.count }));

  // Heatmap-like: group by page + element, show intensity
  const maxCount = elementCounts[0]?.count || 1;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mediciones de CTA</h1>
        <p className="text-sm text-muted-foreground">Análisis de clicks e interacciones por página</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="90d">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPage} onValueChange={setFilterPage}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Todas las páginas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las páginas</SelectItem>
            {pages.map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center"><MousePointer className="h-6 w-6 text-primary" /></div>
            <div><p className="text-2xl font-bold text-foreground">{events.length}</p><p className="text-xs text-muted-foreground">Total clicks</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center"><BarChart3 className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-2xl font-bold text-foreground">{elementCounts.length}</p><p className="text-xs text-muted-foreground">CTAs únicos</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center"><TrendingUp className="h-6 w-6 text-emerald-500" /></div>
            <div><p className="text-2xl font-bold text-foreground">{uniqueUsers}</p><p className="text-xs text-muted-foreground">Usuarios únicos</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top CTAs por clicks</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="clicks" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Heatmap-style table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Mapa de Calor de Interacciones</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {elementCounts.map((item, i) => {
              const intensity = item.count / maxCount;
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: `hsla(158, 64%, 38%, ${Math.max(0.05, intensity * 0.4)})` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.page}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold shrink-0">{item.count} clicks</Badge>
                </div>
              );
            })}
          </div>
          {elementCounts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay datos de CTA en el rango seleccionado</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default MedicionesCTA;
