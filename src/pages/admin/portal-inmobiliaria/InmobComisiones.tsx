import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Search } from "lucide-react";

export default function InmobComisiones() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();
  const [search, setSearch] = useState("");

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/comisiones");
    track({ page: "inmob_comisiones", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  const { data: comisiones = [], isLoading } = useQuery({
    queryKey: ["inmob-comisiones", agentEmails],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      const { data } = await supabase
        .from("comisiones")
        .select("id, email_agente, monto, estatus_pago, id_cuenta_cobranza, fecha_creacion, activo")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .order("fecha_creacion", { ascending: false })
        .limit(500) as any;
      return data || [];
    },
    enabled: agentEmails.length > 0,
  });

  const kpis = useMemo(() => {
    let total = 0, pagadas = 0, pendientes = 0, montoPagado = 0, montoPendiente = 0;
    comisiones.forEach((c: any) => {
      total++;
      const monto = Number(c.monto) || 0;
      if (c.estatus_pago === "pagado") { pagadas++; montoPagado += monto; }
      else { pendientes++; montoPendiente += monto; }
    });
    return { total, pagadas, pendientes, montoPagado, montoPendiente };
  }, [comisiones]);

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

  // Group by agent
  const agentRows = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; pagado: number; pendiente: number; count: number }>();
    comisiones.forEach((c: any) => {
      const email = c.email_agente;
      if (!map.has(email)) map.set(email, { nombre: agentMap.get(email) || email, total: 0, pagado: 0, pendiente: 0, count: 0 });
      const row = map.get(email)!;
      const monto = Number(c.monto) || 0;
      row.total += monto;
      row.count++;
      if (c.estatus_pago === "pagado") row.pagado += monto;
      else row.pendiente += monto;
    });
    return Array.from(map.values())
      .filter(r => !search || r.nombre.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [comisiones, agentMap, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Comisiones</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Comisiones", value: kpis.total.toString() },
          { label: "Pagadas", value: kpis.pagadas.toString() },
          { label: "Monto Pagado", value: fmt(kpis.montoPagado) },
          { label: "Monto Pendiente", value: fmt(kpis.montoPendiente) },
        ].map(k => (
          <Card key={k.label} className="sozu-stat-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{k.value}</p>
              <p className="text-sm text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar agente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando comisiones...</p>
      ) : agentRows.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No se encontraron comisiones.</p>
        </CardContent></Card>
      ) : (
        <Card className="sozu-card">
          <CardHeader><CardTitle className="text-base">Desglose por Agente</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sozu-table-header">
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Comisiones</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentRows.map(r => (
                    <TableRow key={r.nombre}>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(r.pagado)}</TableCell>
                      <TableCell className="text-right text-amber-600">{fmt(r.pendiente)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
