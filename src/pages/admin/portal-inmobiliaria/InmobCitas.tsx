import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, MapPin, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  1: { label: "Agendada", variant: "outline" },
  2: { label: "Pendiente", variant: "secondary" },
  3: { label: "Confirmada", variant: "default" },
};

export default function InmobCitas() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/citas");
    track({ page: "inmob_citas", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  const { data: citas = [], isLoading } = useQuery({
    queryKey: ["inmob-citas", agentEmails],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      const { data } = await (supabase
        .from("reservas_citas") as any)
        .select("*")
        .in("email_agente", agentEmails)
        .eq("activo", true)
        .order("fecha", { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: agentEmails.length > 0,
  });

  const filtered = useMemo(() => {
    return citas.filter((c: any) => {
      const matchSearch = !search || 
        (agentMap.get(c.email_agente) || c.email_agente || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.nombre_prospecto || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || String(c.id_estatus_cita) === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [citas, search, statusFilter, agentMap]);

  const counts = useMemo(() => {
    const c = { total: citas.length, agendada: 0, pendiente: 0, confirmada: 0 };
    citas.forEach((ci: any) => {
      if (ci.id_estatus_cita === 1) c.agendada++;
      else if (ci.id_estatus_cita === 2) c.pendiente++;
      else if (ci.id_estatus_cita === 3) c.confirmada++;
    });
    return c;
  }, [citas]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Citas</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: counts.total },
          { label: "Agendadas", value: counts.agendada },
          { label: "Pendientes", value: counts.pendiente },
          { label: "Confirmadas", value: counts.confirmada },
        ].map(k => (
          <Card key={k.label} className="sozu-stat-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{k.value}</p>
              <p className="text-sm text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por agente o prospecto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estatus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="1">Agendada</SelectItem>
            <SelectItem value="2">Pendiente</SelectItem>
            <SelectItem value="3">Confirmada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando citas...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No se encontraron citas.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c: any) => {
            const st = STATUS_MAP[c.id_estatus_cita] || { label: "Desconocido", variant: "outline" as const };
            return (
              <Card key={c.id} className="sozu-card">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    {c.nombre_prospecto || "Sin prospecto"}
                  </CardTitle>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{c.fecha ? format(new Date(c.fecha), "dd MMM yyyy", { locale: es }) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{c.hora_inicio || "—"} – {c.hora_fin || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span className="truncate">{agentMap.get(c.email_agente) || c.email_agente || "—"}</span>
                  </div>
                  {c.notas && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 mt-0.5" />
                      <span className="truncate">{c.notas}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
