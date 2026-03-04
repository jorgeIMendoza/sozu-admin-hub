import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, User, Search, Mail, Users, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_MAP: Record<number, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  1: { label: "Agendada", variant: "outline" },
  2: { label: "Pendiente", variant: "secondary" },
  3: { label: "Confirmada", variant: "default" },
};

interface ConfigCita {
  id: number;
  nombre: string;
  id_usuario_email: string;
  calendario_email: string;
  correos_enterado: string[];
  correos_enterado_fijos: string[];
  duracion_minutos: number;
  max_invitados: number;
  descripcion_invitacion: string | null;
}

export default function TodasLasCitas() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    registrarVista("/admin/comunicacion/todas-las-citas");
    track({ page: "todas_las_citas", elementId: "page_view", elementType: "page" });
  }, []);

  // Fetch all configurations
  const { data: configs = [] } = useQuery({
    queryKey: ["all-citas-configs"],
    queryFn: async () => {
      const { data } = await (supabase.from("configuracion_citas_usuarios") as any)
        .select("id, nombre, id_usuario_email, calendario_email, correos_enterado, correos_enterado_fijos, duracion_minutos, max_invitados, descripcion_invitacion")
        .eq("activo", true);
      return (data || []) as ConfigCita[];
    },
  });

  // Fetch all citas
  const { data: citas = [], isLoading } = useQuery({
    queryKey: ["all-citas-reservas"],
    queryFn: async () => {
      const { data } = await (supabase.from("reservas_citas") as any)
        .select("*")
        .eq("activo", true)
        .order("fecha", { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  // Map config id to config
  const configMap = useMemo(() => {
    const m = new Map<number, ConfigCita>();
    configs.forEach(c => m.set(c.id, c));
    return m;
  }, [configs]);

  // Owner list (unique id_usuario_email from configs)
  const owners = useMemo(() => {
    const set = new Set<string>();
    configs.forEach(c => set.add(c.id_usuario_email));
    return Array.from(set).sort();
  }, [configs]);

  // Filter
  const filtered = useMemo(() => {
    return citas.filter((c: any) => {
      const config = configMap.get(c.id_configuracion_cita);
      const ownerEmail = config?.id_usuario_email || "";

      const matchOwner = ownerFilter === "all" || ownerEmail === ownerFilter;
      const matchStatus = statusFilter === "all" || String(c.id_estatus_cita) === statusFilter;
      const matchSearch =
        !search ||
        (c.nombre_prospecto || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.email_agente || "").toLowerCase().includes(search.toLowerCase()) ||
        (config?.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
        ownerEmail.toLowerCase().includes(search.toLowerCase());

      return matchOwner && matchStatus && matchSearch;
    });
  }, [citas, search, ownerFilter, statusFilter, configMap]);

  // KPIs
  const counts = useMemo(() => {
    const c = { total: citas.length, agendada: 0, pendiente: 0, confirmada: 0, conInvitados: 0, sinInvitados: 0 };
    citas.forEach((ci: any) => {
      if (ci.id_estatus_cita === 1) c.agendada++;
      else if (ci.id_estatus_cita === 2) c.pendiente++;
      else if (ci.id_estatus_cita === 3) c.confirmada++;
      if (ci.email_agente || ci.nombre_prospecto) c.conInvitados++;
      else c.sinInvitados++;
    });
    return c;
  }, [citas]);

  const hasInvitados = (c: any) => !!(c.email_agente || c.nombre_prospecto);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Todas las Citas</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: "Total", value: counts.total },
          { label: "Agendadas", value: counts.agendada },
          { label: "Pendientes", value: counts.pendiente },
          { label: "Confirmadas", value: counts.confirmada },
          { label: "Con invitados", value: counts.conInvitados },
          { label: "Sin invitados", value: counts.sinInvitados },
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
          <Input placeholder="Buscar por prospecto, agente, config o dueño..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Dueño" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los dueños</SelectItem>
            {owners.map(o => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            const config = configMap.get(c.id_configuracion_cita);
            const withInvitados = hasInvitados(c);

            return (
              <Card
                key={c.id}
                className={`sozu-card transition-all ${!withInvitados ? "opacity-50 border-muted" : ""}`}
              >
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-medium truncate">
                      {config?.nombre || `Config #${c.id_configuracion_cita}`}
                    </CardTitle>
                    {config && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {config.id_usuario_email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!withInvitados && (
                      <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">Sin invitados</Badge>
                    )}
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {/* Prospecto / Agente */}
                  {c.nombre_prospecto && (
                    <div className="flex items-center gap-2 text-foreground">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{c.nombre_prospecto}</span>
                    </div>
                  )}
                  {c.email_agente && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{c.email_agente}</span>
                    </div>
                  )}

                  {/* Date & time */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{c.fecha ? format(new Date(c.fecha), "dd MMM yyyy", { locale: es }) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{c.hora_inicio || "—"} – {c.hora_fin || "—"}</span>
                  </div>

                  {/* Calendar email */}
                  {config?.calendario_email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate text-xs">Cal: {config.calendario_email}</span>
                    </div>
                  )}

                  {/* Enterados fijos */}
                  {config?.correos_enterado_fijos && config.correos_enterado_fijos.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-medium">Enterados siempre:</span>
                        <span className="ml-1">{config.correos_enterado_fijos.join(", ")}</span>
                      </div>
                    </div>
                  )}

                  {/* Enterados (round robin / rest) */}
                  {config?.correos_enterado && config.correos_enterado.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-medium">Enterados:</span>
                        <span className="ml-1">{config.correos_enterado.join(", ")}</span>
                      </div>
                    </div>
                  )}

                  {/* Notas */}
                  {c.notas && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1 line-clamp-2">{c.notas}</p>
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
