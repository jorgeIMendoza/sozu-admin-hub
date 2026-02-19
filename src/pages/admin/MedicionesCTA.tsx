import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BarChart3, MousePointer, TrendingUp, Eye } from "lucide-react";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend } from "recharts";

const COLORS = [
  "hsl(158, 64%, 38%)", "hsl(210, 80%, 55%)", "hsl(43, 96%, 56%)",
  "hsl(271, 81%, 56%)", "hsl(0, 84%, 60%)", "hsl(24, 95%, 53%)",
  "hsl(190, 70%, 50%)", "hsl(330, 70%, 50%)",
];

const PAGE_LABELS: Record<string, string> = {
  inventario: "Inventario",
  desarrollos: "Desarrollos",
  detalle_desarrollo: "Detalle Desarrollo",
  modal_prospecto: "Modal Prospecto",
  modal_cita: "Modal Cita",
  modal_perfil: "Modal Perfil",
};

const MedicionesCTA = () => {
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
    queryKey: ["cta-events-dashboard", fromDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cta_events")
        .select("*")
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  // Helper: count events by element_id for a given page
  const countByElement = (page: string, elementId: string) =>
    events.filter((e: any) => e.page === page && e.element_id === elementId).length;

  // Helper: count events by page
  const countByPage = (page: string) => events.filter((e: any) => e.page === page).length;

  // Page views
  const pageViews = useMemo(() => ({
    inventario: countByElement("inventario", "page_view"),
    desarrollos: countByElement("desarrollos", "page_view"),
    detalle_desarrollo: countByElement("detalle_desarrollo", "page_view"),
  }), [events]);

  // Unique users
  const uniqueUsers = useMemo(() => new Set(events.map((e: any) => e.user_email)).size, [events]);

  // Unique CTAs
  const uniqueCTAs = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e: any) => set.add(`${e.page}::${e.element_id}`));
    return set.size;
  }, [events]);

  // Filter usage across all pages
  const filterUsage = useMemo(() => {
    const filters: Record<string, number> = {};
    events.filter((e: any) => e.element_id === "btn_busqueda").forEach((e: any) => {
      const filtro = (e.metadata as any)?.filtro || "desconocido";
      filters[filtro] = (filters[filtro] || 0) + 1;
    });
    return Object.entries(filters).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [events]);

  // Sort usage
  const sortUsage = useMemo(() => {
    const sorts: Record<string, number> = {};
    events.filter((e: any) => e.element_id === "btn_ordenamiento").forEach((e: any) => {
      const orden = (e.metadata as any)?.orden || "none";
      const label = orden === "asc" ? "Menor precio" : orden === "desc" ? "Mayor precio" : "Sin orden";
      sorts[label] = (sorts[label] || 0) + 1;
    });
    return Object.entries(sorts).map(([name, value]) => ({ name, value }));
  }, [events]);

  // Share platform usage
  const sharePlatforms = useMemo(() => {
    const platforms: Record<string, number> = {};
    events.filter((e: any) => e.element_id === "btn_compartir_plataforma").forEach((e: any) => {
      const p = (e.metadata as any)?.plataforma || "desconocido";
      platforms[p] = (platforms[p] || 0) + 1;
    });
    return Object.entries(platforms).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [events]);

  // Modal conversion data
  const modalData = useMemo(() => {
    const prospecto_abierto = countByElement("inventario", "btn_agregar_prospecto") + countByElement("desarrollos", "btn_agregar_prospecto") + countByElement("detalle_desarrollo", "btn_agregar_prospecto");
    const prospecto_llenado = countByElement("modal_prospecto", "modal_prospecto_campo_llenado");
    const prospecto_guardado = countByElement("modal_prospecto", "modal_prospecto_guardar");
    const cita_abierta = countByElement("inventario", "btn_agendar_cita") + countByElement("desarrollos", "btn_agendar_cita") + countByElement("detalle_desarrollo", "btn_agendar_cita");
    const cita_llenada = countByElement("modal_cita", "modal_cita_campo_llenado");
    const cita_guardada = countByElement("modal_cita", "modal_cita_guardar");
    return [
      { modal: "Nuevo Prospecto", abierto: prospecto_abierto, llenado: prospecto_llenado, guardado: prospecto_guardado, tasa: prospecto_abierto > 0 ? ((prospecto_guardado / prospecto_abierto) * 100).toFixed(1) + "%" : "—" },
      { modal: "Agendar Cita", abierto: cita_abierta, llenado: cita_llenada, guardado: cita_guardada, tasa: cita_abierta > 0 ? ((cita_guardada / cita_abierta) * 100).toFixed(1) + "%" : "—" },
    ];
  }, [events]);

  // Profile phases data
  const profilePhases = useMemo(() => {
    const phases = ["basic", "address", "fiscal", "documents", "bank-accounts", "training"];
    const labels: Record<string, string> = { basic: "Info. Básica", address: "Dirección", fiscal: "Fiscal", documents: "Documentos", "bank-accounts": "Cuentas Bancarias", training: "Capacitación" };
    return phases.map(fase => {
      const abierto = events.filter((e: any) => e.page === "modal_perfil" && e.element_id === "perfil_fase_abrir" && (e.metadata as any)?.fase === fase).length;
      const modificado = events.filter((e: any) => e.page === "modal_perfil" && e.element_id === "perfil_fase_campo_modificado" && (e.metadata as any)?.fase === fase).length;
      const guardado = events.filter((e: any) => e.page === "modal_perfil" && e.element_id === "perfil_fase_guardar" && (e.metadata as any)?.fase === fase).length;
      return { fase: labels[fase], abierto, modificado, guardado, tasa: abierto > 0 ? ((guardado / abierto) * 100).toFixed(1) + "%" : "—" };
    });
  }, [events]);

  // Page-specific CTA bar chart data
  const getPageCTAs = (page: string) => {
    const map = new Map<string, number>();
    events.filter((e: any) => e.page === page && e.element_id !== "page_view").forEach((e: any) => {
      const key = e.element_label || e.element_id;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, clicks]) => ({ name: name.length > 25 ? name.slice(0, 22) + "…" : name, clicks })).sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  };

  // Heatmap data
  // Normalize page values: map URL paths to short labels
  const normalizePage = (page: string) => {
    if (/\/admin\/inmobiliarias\/inventario/i.test(page)) return "inventario";
    return page;
  };

  const elementCounts = useMemo(() => {
    const map = new Map<string, { count: number; label: string; page: string }>();
    events.forEach((e: any) => {
      // Skip legacy redundant event
      if (e.element_id === "generate_offer") return;
      const rawLabel = e.element_label || e.element_id;
      // Aggregate all "Depto XXXX" clicks into a single "Detalle Depto." label
      const label = /^Depto\s+\d+/i.test(rawLabel) ? "Detalle Depto." : rawLabel;
      const page = normalizePage(e.page);
      const key = `${page}::${label}`;
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { count: 1, label, page });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [events]);

  const maxCount = elementCounts[0]?.count || 1;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mediciones de CTA</h1>
        <p className="text-sm text-muted-foreground">Análisis detallado de interacciones por página y modal</p>
      </div>

      {/* Time filter */}
      <Select value={timeRange} onValueChange={setTimeRange}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="24h">Últimas 24h</SelectItem>
          <SelectItem value="7d">Últimos 7 días</SelectItem>
          <SelectItem value="30d">Últimos 30 días</SelectItem>
          <SelectItem value="90d">Últimos 90 días</SelectItem>
        </SelectContent>
      </Select>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center"><MousePointer className="h-6 w-6 text-primary" /></div>
            <div><p className="text-2xl font-bold text-foreground">{events.length}</p><p className="text-xs text-muted-foreground">Total clicks</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center"><BarChart3 className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-2xl font-bold text-foreground">{uniqueCTAs}</p><p className="text-xs text-muted-foreground">CTAs únicos</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center"><TrendingUp className="h-6 w-6 text-emerald-500" /></div>
            <div><p className="text-2xl font-bold text-foreground">{uniqueUsers}</p><p className="text-xs text-muted-foreground">Usuarios únicos</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center"><Eye className="h-6 w-6 text-amber-500" /></div>
            <div><p className="text-2xl font-bold text-foreground">{pageViews.inventario + pageViews.desarrollos + pageViews.detalle_desarrollo}</p><p className="text-xs text-muted-foreground">Visitas a páginas</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Page views breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Visitas por Página</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {([["inventario", "Inventario"], ["desarrollos", "Desarrollos"], ["detalle_desarrollo", "Detalle"]] as const).map(([key, label]) => (
              <div key={key} className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{pageViews[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs by page */}
      <Tabs defaultValue="inventario" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          <TabsTrigger value="desarrollos">Desarrollos</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>

        {/* Inventario Tab */}
        <TabsContent value="inventario" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">CTAs principales</CardTitle></CardHeader>
              <CardContent>
                {getPageCTAs("inventario").length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={getPageCTAs("inventario")} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="clicks" radius={[0, 6, 6, 0]}>
                        {getPageCTAs("inventario").map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Ordenamiento usado</CardTitle></CardHeader>
              <CardContent>
                {sortUsage.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={sortUsage} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {sortUsage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Filtros utilizados</CardTitle></CardHeader>
            <CardContent>
              {filterUsage.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filterUsage.map(f => (
                    <div key={f.name} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-foreground capitalize">{f.name}</span>
                      <Badge variant="secondary" className="text-xs">{f.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Desarrollos Tab */}
        <TabsContent value="desarrollos" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">CTAs principales</CardTitle></CardHeader>
              <CardContent>
                {getPageCTAs("desarrollos").length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={getPageCTAs("desarrollos")} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="clicks" radius={[0, 6, 6, 0]}>
                        {getPageCTAs("desarrollos").map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Compartir por plataforma</CardTitle></CardHeader>
              <CardContent>
                {sharePlatforms.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={sharePlatforms} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {sharePlatforms.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-foreground">{countByElement("desarrollos", "btn_descargar_brochure")}</p>
                <p className="text-xs text-muted-foreground">Descargas de brochure</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-foreground">{countByElement("desarrollos", "carousel_swipe")}</p>
                <p className="text-xs text-muted-foreground">Swipe carrusel (sesiones)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-foreground">{countByElement("desarrollos", "btn_compartir")}</p>
                <p className="text-xs text-muted-foreground">Veces compartido</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Detalle Tab */}
        <TabsContent value="detalle" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">CTAs principales</CardTitle></CardHeader>
            <CardContent>
              {getPageCTAs("detalle_desarrollo").length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={getPageCTAs("detalle_desarrollo")} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="clicks" radius={[0, 6, 6, 0]}>
                      {getPageCTAs("detalle_desarrollo").map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-foreground">{countByElement("detalle_desarrollo", "carousel_swipe")}</p>
                <p className="text-xs text-muted-foreground">Swipe carrusel</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-foreground">{countByElement("detalle_desarrollo", "map_interaction")}</p>
                <p className="text-xs text-muted-foreground">Interacciones con mapa</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals Section */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Conversión de Modales</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Modal</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Abierto</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Campos llenados</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Guardado</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Tasa conversión</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map(row => (
                  <tr key={row.modal} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium text-foreground">{row.modal}</td>
                    <td className="py-2 px-3 text-center">{row.abierto}</td>
                    <td className="py-2 px-3 text-center">{row.llenado}</td>
                    <td className="py-2 px-3 text-center">{row.guardado}</td>
                    <td className="py-2 px-3 text-center"><Badge variant="outline" className="text-xs">{row.tasa}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Profile phases */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Perfil de Usuario — Desglose por Fase</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Fase</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Abierto</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Modificado</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Guardado</th>
                  <th className="text-center py-2 px-3 font-medium text-muted-foreground">Tasa</th>
                </tr>
              </thead>
              <tbody>
                {profilePhases.map(row => (
                  <tr key={row.fase} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium text-foreground">{row.fase}</td>
                    <td className="py-2 px-3 text-center">{row.abierto}</td>
                    <td className="py-2 px-3 text-center">{row.modificado}</td>
                    <td className="py-2 px-3 text-center">{row.guardado}</td>
                    <td className="py-2 px-3 text-center"><Badge variant="outline" className="text-xs">{row.tasa}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Mapa de Calor de Interacciones</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {elementCounts.slice(0, 30).map((item, i) => {
              const intensity = item.count / maxCount;
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: `hsla(158, 64%, 38%, ${Math.max(0.05, intensity * 0.4)})` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{PAGE_LABELS[item.page] || item.page}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold shrink-0">{item.count}</Badge>
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
