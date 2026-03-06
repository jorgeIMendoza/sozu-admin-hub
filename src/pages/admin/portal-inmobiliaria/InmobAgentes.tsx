import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, TrendingUp, FileText, ShoppingCart, MoreHorizontal, Eye, Pencil, Power, KeyRound } from "lucide-react";
import { toast } from "sonner";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

const NAV_PREFIX = "/admin/portal-inmobiliaria";

export default function InmobAgentes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [search, setSearch] = useState(searchParams.get("q") || "");

  // Edit dialog state
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/agentes");
    track({ page: "inmob_agentes", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map((a) => a.email), [agents]);

  // Fetch ofertas per agent
  const { data: ofertasByAgent = new Map(), isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-agentes-ofertas", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return new Map<string, { total: number; vendidas: number }>();
      const { data } = await supabase
        .from("ofertas")
        .select("id, email_creador, id_estatus_aprobacion, id_propiedad")
        .in("email_creador", agentEmails)
        .eq("activo", true) as any;

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

      const map = new Map<string, { total: number; vendidas: number }>();
      (data || []).forEach((o: any) => {
        const cur = map.get(o.email_creador) || { total: 0, vendidas: 0 };
        cur.total++;
        if (o.id_propiedad && soldSet.has(o.id_propiedad)) cur.vendidas++;
        map.set(o.email_creador, cur);
      });
      return map;
    },
    enabled: agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Fetch ingreso per agent (sum precio_final from sold cuentas_cobranza)
  const { data: ingresoByAgent = new Map(), isLoading: ingresoLoading } = useQuery({
    queryKey: ["inmob-agentes-ingreso", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return new Map<string, number>();
      // Get ofertas for agents
      const { data: ofertas } = await supabase
        .from("ofertas")
        .select("id, email_creador, id_propiedad")
        .in("email_creador", agentEmails)
        .eq("activo", true) as any;
      if (!ofertas?.length) return new Map<string, number>();

      // Get sold properties
      const propIds = [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const soldSet = new Set<number>();
      if (propIds.length > 0) {
        const { data: props } = await supabase
          .from("propiedades")
          .select("id")
          .in("id", propIds)
          .eq("id_estatus_disponibilidad", 5) as any;
        (props || []).forEach((p: any) => soldSet.add(p.id));
      }

      // Filter to sold offers only
      const soldOfertas = ofertas.filter((o: any) => o.id_propiedad && soldSet.has(o.id_propiedad));
      const soldOfertaIds = soldOfertas.map((o: any) => o.id);
      if (!soldOfertaIds.length) return new Map<string, number>();

      // Get cuentas_cobranza
      const cuentaMap = new Map<number, number>(); // oferta_id → precio_final
      for (let i = 0; i < soldOfertaIds.length; i += 200) {
        const batch = soldOfertaIds.slice(i, i + 200);
        const { data: cuentas } = await (supabase as any)
          .from("cuentas_cobranza")
          .select("id_oferta, precio_final")
          .in("id_oferta", batch)
          .eq("activo", true);
        (cuentas || []).forEach((c: any) => cuentaMap.set(c.id_oferta, Number(c.precio_final) || 0));
      }

      const map = new Map<string, number>();
      soldOfertas.forEach((o: any) => {
        const precio = cuentaMap.get(o.id) || 0;
        map.set(o.email_creador, (map.get(o.email_creador) || 0) + precio);
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
      const personaIds = agents.map((a) => a.personaId);
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona_duena_lead")
        .in("id_persona_duena_lead", personaIds)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;

      const map = new Map<string, number>();
      (data || []).forEach((d: any) => {
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

  const isLoading = agentsLoading || ofertasLoading || prospectosLoading || ingresoLoading;

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

  // Edit agent handlers
  const openEditDialog = (agent: any) => {
    setEditAgent(agent);
    setEditName(agent.nombre);
    setEditEmail(agent.email);
    setEditPhone(agent.telefono);
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    setSaving(true);
    try {
      // Update persona
      const { error: personaError } = await supabase
        .from("personas")
        .update({ nombre_legal: editName, telefono: editPhone })
        .eq("id", editAgent.personaId) as any;
      if (personaError) throw personaError;

      // Update usuario name
      const { error: userError } = await supabase
        .from("usuarios")
        .update({ nombre: editName })
        .eq("email", editAgent.email) as any;
      if (userError) throw userError;

      // Update email if changed
      if (editEmail !== editAgent.email) {
        const { error: emailError } = await supabase
          .from("usuarios")
          .update({ email: editEmail })
          .eq("email", editAgent.email) as any;
        if (emailError) throw emailError;
      }

      toast.success("Agente actualizado correctamente");
      setEditAgent(null);
      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message || "Intenta de nuevo"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (agent: any) => {
    const newStatus = !agent.activo;
    const { error } = await supabase
      .from("usuarios")
      .update({ activo: newStatus })
      .eq("email", agent.email) as any;
    if (error) {
      toast.error("Error al cambiar estatus");
    } else {
      toast.success(newStatus ? "Agente activado" : "Agente desactivado");
      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
    }
  };

  const handleResetPassword = async (agent: any) => {
    try {
      const { error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: agent.email },
      });
      if (error) throw error;
      toast.success("Se envió un correo de restablecimiento de contraseña");
    } catch {
      toast.error("Error al resetear contraseña");
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  };

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
                  <TableHead className="text-center">Prospectos</TableHead>
                  <TableHead className="text-center">Ofertas</TableHead>
                  <TableHead className="text-center">Ventas</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-center">Conversión</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {search ? "Sin resultados" : "No hay agentes vinculados a tu inmobiliaria"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAgents.map((agent) => {
                    const stats = ofertasByAgent.get(agent.email) || { total: 0, vendidas: 0 };
                    const prospectos = prospectosByAgent.get(agent.email) || 0;
                    const ingreso = ingresoByAgent.get(agent.email) || 0;
                    const conversion = stats.total > 0 ? Math.round((stats.vendidas / stats.total) * 100) : 0;
                    return (
                      <TableRow key={agent.email}>
                        {/* Agent column with avatar, name, email, phone */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                {getInitials(agent.nombre)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{agent.nombre}</p>
                                {!agent.activo && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inactivo</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                              <PhoneDisplay telefono={agent.telefono} clavePaisTelefono={agent.clavePaisTelefono} className="text-xs" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{prospectos}</TableCell>
                        <TableCell className="text-center">{stats.total}</TableCell>
                        <TableCell className="text-center font-semibold">{stats.vendidas}</TableCell>
                        <TableCell className="text-right font-medium">{fmtCurrency(ingreso)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={conversion > 30 ? "default" : "secondary"} className="text-xs">
                            {conversion}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`${NAV_PREFIX}/agentes/${encodeURIComponent(agent.email)}`)}>
                                <Eye className="h-4 w-4 mr-2" /> Ver perfil 360°
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(agent)}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar información
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleToggleActive(agent)}>
                                <Power className="h-4 w-4 mr-2" /> {agent.activo ? "Desactivar" : "Activar"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetPassword(agent)}>
                                <KeyRound className="h-4 w-4 mr-2" /> Resetear contraseña
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Edit Agent Dialog */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar agente</DialogTitle>
            <DialogDescription>Modifica los datos del agente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAgent(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
