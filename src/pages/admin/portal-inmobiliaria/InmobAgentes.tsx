import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, TrendingUp, FileText, ShoppingCart } from "lucide-react";

export default function InmobAgentes() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [search, setSearch] = useState("");

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/agentes");
    track({ page: "inmob_agentes", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map((a) => a.email), [agents]);

  // Fetch ofertas per agent
  const { data: ofertasByAgent = new Map(), isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-agentes-ofertas", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return new Map<string, { total: number; aprobadas: number; vendidas: number }>();
      const { data } = await supabase
        .from("ofertas")
        .select("id, email_creador, id_estatus_aprobacion, id_propiedad")
        .in("email_creador", agentEmails)
        .eq("activo", true) as any;

      // Get property sold status
      const propIds = [...new Set((data || []).map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const soldSet = new Set<number>();
      if (propIds.length > 0) {
        const { data: props } = await supabase
          .from("propiedades")
          .select("id, id_estatus_disponibilidad")
          .in("id", propIds)
          .eq("id_estatus_disponibilidad", 5) as any;
        (props || []).forEach((p: any) => soldSet.add(p.id));
      }

      const map = new Map<string, { total: number; aprobadas: number; vendidas: number }>();
      (data || []).forEach((o: any) => {
        const cur = map.get(o.email_creador) || { total: 0, aprobadas: 0, vendidas: 0 };
        cur.total++;
        if (o.id_estatus_aprobacion === 2) cur.aprobadas++;
        if (o.id_propiedad && soldSet.has(o.id_propiedad)) cur.vendidas++;
        map.set(o.email_creador, cur);
      });
      return map;
    },
    enabled: agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Fetch prospectos per agent
  const { data: prospectosByAgent = new Map(), isLoading: prospectosLoading } = useQuery({
    queryKey: ["inmob-agentes-prospectos", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return new Map<string, number>();
      // Get agent persona IDs
      const personaIds = agents.map((a) => a.personaId);
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona_duena_lead")
        .in("id_persona_duena_lead", personaIds)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;

      const map = new Map<string, number>();
      (data || []).forEach((d: any) => {
        // Map persona back to email
        const agent = agents.find((a) => a.personaId === d.id_persona_duena_lead);
        if (agent) {
          map.set(agent.email, (map.get(agent.email) || 0) + 1);
        }
      });
      return map;
    },
    enabled: agentEmails.length > 0 && agents.length > 0,
    staleTime: 3 * 60_000,
  });

  const isLoading = agentsLoading || ofertasLoading || prospectosLoading;

  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    );
  }, [agents, search]);

  // Summary KPIs
  const totalAgentes = agents.length;
  const totalOfertas = Array.from(ofertasByAgent.values()).reduce((s, v) => s + v.total, 0);
  const totalVendidas = Array.from(ofertasByAgent.values()).reduce((s, v) => s + v.vendidas, 0);
  const totalProspectos = Array.from(prospectosByAgent.values()).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agentes</h1>
        <p className="text-sm text-muted-foreground">Gestión y rendimiento de los agentes de tu inmobiliaria</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi icon={Users} label="Agentes" value={totalAgentes} loading={isLoading} />
        <MiniKpi icon={FileText} label="Ofertas Totales" value={totalOfertas} loading={isLoading} />
        <MiniKpi icon={ShoppingCart} label="Ventas Cerradas" value={totalVendidas} loading={isLoading} />
        <MiniKpi icon={TrendingUp} label="Prospectos" value={totalProspectos} loading={isLoading} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar agente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="sozu-table-header">
                  <TableHead>Agente</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-center">Prospectos</TableHead>
                  <TableHead className="text-center">Ofertas</TableHead>
                  <TableHead className="text-center">Aprobadas</TableHead>
                  <TableHead className="text-center">Ventas</TableHead>
                  <TableHead className="text-center">Conversión</TableHead>
                  <TableHead className="text-center">Estatus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {search ? "Sin resultados" : "No hay agentes vinculados a tu inmobiliaria"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAgents.map((agent) => {
                    const stats = ofertasByAgent.get(agent.email) || { total: 0, aprobadas: 0, vendidas: 0 };
                    const prospectos = prospectosByAgent.get(agent.email) || 0;
                    const conversion = stats.total > 0 ? Math.round((stats.vendidas / stats.total) * 100) : 0;
                    return (
                      <TableRow key={agent.email}>
                        <TableCell className="font-medium">{agent.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{agent.email}</TableCell>
                        <TableCell className="text-sm">{agent.telefono || "—"}</TableCell>
                        <TableCell className="text-center">{prospectos}</TableCell>
                        <TableCell className="text-center">{stats.total}</TableCell>
                        <TableCell className="text-center">{stats.aprobadas}</TableCell>
                        <TableCell className="text-center font-semibold">{stats.vendidas}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={conversion > 30 ? "default" : "secondary"} className="text-xs">
                            {conversion}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={agent.activo ? "default" : "destructive"} className="text-xs">
                            {agent.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, loading }: { icon: any; label: string; value: number; loading: boolean }) {
  return (
    <Card className="sozu-card">
      <CardContent className="p-4 flex items-center gap-3">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
