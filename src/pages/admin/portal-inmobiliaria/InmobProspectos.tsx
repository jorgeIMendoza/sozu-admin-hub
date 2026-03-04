import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, UserSearch } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Prospecto {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  proyecto_nombre: string;
  agente_nombre: string;
  estatus: string;
  fecha_creacion: string;
}

export default function InmobProspectos() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [search, setSearch] = useState("");

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/prospectos");
    track({ page: "inmob_prospectos", elementId: "page_view", elementType: "page" });
  }, []);

  const agentPersonaIds = useMemo(() => agents.map((a) => a.personaId), [agents]);
  const agentNameMap = useMemo(() => {
    const m = new Map<number, string>();
    agents.forEach((a) => m.set(a.personaId, a.nombre));
    return m;
  }, [agents]);

  // Fetch prospectos linked to agents (tipo 7, id_persona_duena_lead = agent persona id)
  const { data: prospectos = [], isLoading: prospectosLoading } = useQuery({
    queryKey: ["inmob-prospectos", agentPersonaIds],
    queryFn: async () => {
      if (!agentPersonaIds.length) return [];

      // Get entidades_relacionadas type 7 (Prospecto) owned by these agents
      const { data: rels } = await supabase
        .from("entidades_relacionadas")
        .select("id, id_persona, id_persona_duena_lead, id_proyecto, id_estatus_persona")
        .in("id_persona_duena_lead", agentPersonaIds)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;

      if (!rels || rels.length === 0) return [];

      const personaIds = [...new Set(rels.map((r: any) => r.id_persona).filter(Boolean))] as number[];
      const proyectoIds = [...new Set(rels.map((r: any) => r.id_proyecto).filter(Boolean))] as number[];
      const estatusIds = [...new Set(rels.map((r: any) => r.id_estatus_persona).filter(Boolean))] as number[];

      const [personasRes, proyectosRes, estatusRes] = await Promise.all([
        personaIds.length > 0
          ? (supabase.from("personas").select("id, nombre_legal, nombre_comercial, email, telefono, fecha_creacion").in("id", personaIds) as any)
          : { data: [] },
        proyectoIds.length > 0
          ? supabase.from("proyectos").select("id, nombre").in("id", proyectoIds)
          : { data: [] },
        estatusIds.length > 0
          ? (supabase.from("estatus_persona").select("id, nombre").in("id", estatusIds) as any)
          : { data: [] },
      ]);

      const personaMap = new Map<number, any>();
      (personasRes.data || []).forEach((p: any) => personaMap.set(p.id, p));

      const proyectoMap = new Map<number, string>();
      (proyectosRes.data || []).forEach((p: any) => proyectoMap.set(p.id, p.nombre));

      const estatusMap = new Map<number, string>();
      (estatusRes.data || []).forEach((e: any) => estatusMap.set(e.id, e.nombre));

      return rels.map((r: any) => {
        const p = personaMap.get(r.id_persona);
        return {
          id: r.id_persona,
          nombre: p?.nombre_legal || p?.nombre_comercial || "Sin nombre",
          email: p?.email || "",
          telefono: p?.telefono || "",
          proyecto_nombre: r.id_proyecto ? proyectoMap.get(r.id_proyecto) || "" : "",
          agente_nombre: agentNameMap.get(r.id_persona_duena_lead) || "",
          estatus: r.id_estatus_persona ? estatusMap.get(r.id_estatus_persona) || "—" : "—",
          fecha_creacion: p?.fecha_creacion || "",
        } as Prospecto;
      });
    },
    enabled: agentPersonaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  const isLoading = agentsLoading || prospectosLoading;

  const filtered = useMemo(() => {
    if (!search) return prospectos;
    const q = search.toLowerCase();
    return prospectos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.proyecto_nombre.toLowerCase().includes(q) ||
        p.agente_nombre.toLowerCase().includes(q)
    );
  }, [prospectos, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prospectos</h1>
        <p className="text-sm text-muted-foreground">
          Prospectos gestionados por los agentes de tu inmobiliaria ({prospectos.length} total)
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar prospecto, agente, proyecto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="sozu-table-header">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {search ? "Sin resultados" : "No hay prospectos registrados"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p, idx) => (
                    <TableRow key={`${p.id}-${idx}`}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                      <TableCell className="text-sm">{p.telefono || "—"}</TableCell>
                      <TableCell className="text-sm">{p.proyecto_nombre || "—"}</TableCell>
                      <TableCell className="text-sm">{p.agente_nombre}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{p.estatus}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.fecha_creacion
                          ? format(new Date(p.fecha_creacion), "dd MMM yyyy", { locale: es })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
