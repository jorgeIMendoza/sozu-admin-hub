import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, TrendingUp, FileText, ShoppingCart, MoreHorizontal, Eye, Pencil, Power, KeyRound, FolderOpen } from "lucide-react";
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
  const { profile } = useAuth();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const { personaId } = useInmobiliariaPersonaId();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState<"activos" | "desactivados">("activos");
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const currentUserEmail = (profile?.email || "").toLowerCase();

  const { data: isSozu = false } = useQuery({
    queryKey: ["inmob-agentes-is-sozu", personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await supabase
        .from("personas")
        .select("nombre_legal")
        .eq("id", personaId)
        .maybeSingle() as any;
      const nombreLegal = (data?.nombre_legal || "").toLowerCase();
      return nombreLegal.includes("real estate ventures");
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  // Edit dialog state
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Project access dialog state
  const [projectAccessAgent, setProjectAccessAgent] = useState<any | null>(null);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/agentes");
    track({ page: "inmob_agentes", elementId: "page_view", elementType: "page" });
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearch(q);
  }, [searchParams]);

  const { data: sozuExtraUsers = [] } = useQuery({
    queryKey: ["inmob-agentes-sozu-extra-users", personaId, agents.map(a => a.email).join(",")],
    queryFn: async () => {
      if (!personaId || !isSozu) return [];

      const baseAgentEmailSet = new Set(agents.map(a => a.email.toLowerCase()));

      const { data: inmobUsers } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId)
        .eq("activo", true) as any;

      const inmobEmails = (inmobUsers || []).map((u: any) => u.email).filter(Boolean);
      if (!inmobEmails.length) return [];

      const { data: paRows } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id")
        .in("usuario_id", inmobEmails)
        .eq("activo", true) as any;

      const projectIds = [...new Set((paRows || []).map((r: any) => r.proyecto_id).filter(Boolean))] as number[];
      if (!projectIds.length) return [];

      const { data: edificios } = await supabase
        .from("edificios")
        .select("id")
        .in("id_proyecto", projectIds)
        .eq("activo", true) as any;

      const edificioIds = (edificios || []).map((e: any) => e.id);
      if (!edificioIds.length) return [];

      const { data: edifModelos } = await supabase
        .from("edificios_modelos")
        .select("id")
        .in("id_edificio", edificioIds)
        .eq("activo", true) as any;

      const emIds = (edifModelos || []).map((m: any) => m.id);
      if (!emIds.length) return [];

      const propIds: number[] = [];
      for (let i = 0; i < emIds.length; i += 200) {
        const batch = emIds.slice(i, i + 200);
        const { data: props } = await supabase
          .from("propiedades")
          .select("id")
          .in("id_edificio_modelo", batch)
          .eq("activo", true) as any;
        if (props?.length) propIds.push(...props.map((p: any) => p.id));
      }

      if (!propIds.length) return [];

      const creatorEmails = new Set<string>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data: offers } = await supabase
          .from("ofertas")
          .select("email_creador")
          .in("id_propiedad", batch)
          .eq("activo", true) as any;

        (offers || []).forEach((o: any) => {
          const email = (o.email_creador || "").toLowerCase();
          if (email) creatorEmails.add(email);
        });
      }

      const unknownEmails = [...creatorEmails].filter((e) => !baseAgentEmailSet.has(e));
      if (!unknownEmails.length) return [];

      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, id_persona, activo, rol_id")
        .in("email", unknownEmails) as any;

      if (!usuarios?.length) return [];

      const personaIds = [...new Set(usuarios.map((u: any) => u.id_persona).filter(Boolean))] as number[];
      const personaMap = new Map<number, any>();
      if (personaIds.length) {
        const [{ data: personas }, { data: rels }] = await Promise.all([
          supabase
            .from("personas")
            .select("id, nombre_legal, nombre_comercial, telefono, clave_pais_telefono")
            .in("id", personaIds) as any,
          supabase
            .from("entidades_relacionadas")
            .select("id_persona, id_persona_duena_lead")
            .in("id_persona", personaIds)
            .eq("id_tipo_entidad", 19)
            .eq("activo", true) as any,
        ]);
        (personas || []).forEach((p: any) => personaMap.set(p.id, p));

        const ownerByPersona = new Map<number, number | null>();
        (rels || []).forEach((r: any) => ownerByPersona.set(r.id_persona, r.id_persona_duena_lead ?? null));

        return usuarios
          .filter((u: any) => {
            // Keep Sozu staff/non-agent users, but exclude external agents from other inmobiliarias.
            if (u.rol_id === 3) {
              const ownerId = ownerByPersona.get(u.id_persona);
              return ownerId === personaId;
            }
            // Exclude agent interno (role 9) from this extra bucket.
            return u.rol_id !== 9;
          })
          .map((u: any) => {
            const p = personaMap.get(u.id_persona);
            return {
              email: u.email,
              personaId: u.id_persona,
              nombre: p?.nombre_legal || p?.nombre_comercial || u.email,
              telefono: p?.telefono || "",
              clavePaisTelefono: p?.clave_pais_telefono || "",
              activo: u.activo ?? true,
              roleId: u.rol_id,
              isInternal: u.rol_id !== 3 && u.rol_id !== 9,
            };
          });
      }

      return [];
    },
    enabled: !!personaId && isSozu,
    staleTime: 5 * 60_000,
  });

  const filteredBaseAgents = useMemo(() => agents, [agents]);

  const allAgents = useMemo(() => {
    const byEmail = new Map<string, any>();
    filteredBaseAgents.forEach((a) => byEmail.set(a.email.toLowerCase(), a));
    sozuExtraUsers.forEach((u: any) => {
      const key = (u.email || "").toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, u);
    });
    return [...byEmail.values()].filter((a: any) => (a.email || "").toLowerCase() !== currentUserEmail);
  }, [filteredBaseAgents, sozuExtraUsers, currentUserEmail]);

  const agentEmails = useMemo(() => allAgents.map((a) => a.email), [allAgents]);

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
      const { data: ofertas } = await supabase
        .from("ofertas")
        .select("id, email_creador, id_propiedad")
        .in("email_creador", agentEmails)
        .eq("activo", true) as any;
      if (!ofertas?.length) return new Map<string, number>();

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

      const soldOfertas = ofertas.filter((o: any) => o.id_propiedad && soldSet.has(o.id_propiedad));
      const soldOfertaIds = soldOfertas.map((o: any) => o.id);
      if (!soldOfertaIds.length) return new Map<string, number>();

      const cuentaMap = new Map<number, number>();
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
      if (!allAgents.length) return new Map<string, number>();
      const personaIds = allAgents.map((a) => a.personaId).filter(Boolean);
      if (!personaIds.length) return new Map<string, number>();

      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona_duena_lead")
        .in("id_persona_duena_lead", personaIds)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;

      const map = new Map<string, number>();
      (data || []).forEach((d: any) => {
        const agent = allAgents.find((a) => a.personaId === d.id_persona_duena_lead);
        if (agent) {
          map.set(agent.email, (map.get(agent.email) || 0) + 1);
        }
      });
      return map;
    },
    enabled: agentEmails.length > 0 && allAgents.length > 0,
    staleTime: 3 * 60_000,
  });

  const isLoading = agentsLoading || ofertasLoading || prospectosLoading || ingresoLoading;

  // Separate active vs inactive
  const activeAgents = useMemo(() => allAgents.filter(a => a.activo), [allAgents]);
  const inactiveAgents = useMemo(() => allAgents.filter(a => !a.activo), [allAgents]);

  const filteredActiveAgents = useMemo(() => {
    if (!search) return activeAgents;
    const q = search.toLowerCase();
    return activeAgents.filter((a) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [activeAgents, search]);

  const filteredInactiveAgents = useMemo(() => {
    if (!search) return inactiveAgents;
    const q = search.toLowerCase();
    return inactiveAgents.filter((a) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [inactiveAgents, search]);

  const filteredAgents = activeTab === "activos" ? filteredActiveAgents : filteredInactiveAgents;

  // Summary KPIs (all agents)
  const totalAgentes = activeAgents.length;
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
      const { error: personaError } = await supabase
        .from("personas")
        .update({ nombre_legal: editName, telefono: editPhone })
        .eq("id", editAgent.personaId) as any;
      if (personaError) throw personaError;

      const { error: userError } = await supabase
        .from("usuarios")
        .update({ nombre: editName })
        .eq("email", editAgent.email) as any;
      if (userError) throw userError;

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

  const resolveAgentEmails = async (agent: any): Promise<string[]> => {
    const normalizedEmail = (agent.email || "").trim().toLowerCase();
    const emails = new Set<string>();

    if (normalizedEmail) {
      const { data: byEmail } = await supabase
        .from("usuarios")
        .select("email")
        .ilike("email", normalizedEmail) as any;
      (byEmail || []).forEach((u: any) => {
        if (u.email) emails.add(String(u.email).toLowerCase());
      });
    }

    if (emails.size === 0 && agent.personaId) {
      const { data: byPersona } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", agent.personaId) as any;
      (byPersona || []).forEach((u: any) => {
        if (u.email) emails.add(String(u.email).toLowerCase());
      });
    }

    return [...emails];
  };

  const handleDeactivate = async (agent: any) => {
    try {
      const emails = await resolveAgentEmails(agent);
      if (!emails.length) throw new Error("No se encontró el usuario");

      const { data, error } = await supabase
        .from("usuarios")
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .in("email", emails)
        .select("email, activo") as any;

      if (error) throw error;
      if (!data?.length) throw new Error("No se encontró el usuario");

      toast.success("Agente desactivado. Ya no tendrá acceso al sistema.");
      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-agentes-sozu-extra-users"] });
    } catch (err: any) {
      toast.error("Error al desactivar agente: " + (err.message || "Intenta de nuevo"));
    }
  };

  const handleReactivate = async (agent: any) => {
    try {
      const emails = await resolveAgentEmails(agent);
      if (!emails.length) throw new Error("No se encontró el usuario");

      const { data, error } = await supabase
        .from("usuarios")
        .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
        .in("email", emails)
        .select("email, activo") as any;

      if (error) throw error;
      if (!data?.length) throw new Error("No se encontró el usuario");

      try {
        const { data: resetData, error: resetError } = await supabase.functions.invoke("reset-user-password", {
          body: { email: emails[0] },
        });
        if (resetError) throw resetError;
        if (resetData?.error) {
          toast.success("Agente reactivado.");
          toast.warning("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
        } else {
          toast.success("Agente reactivado. Contraseña reseteada a Temporal123!");
        }
      } catch {
        toast.success("Agente reactivado.");
        toast.warning("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
      }

      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-agentes-sozu-extra-users"] });
    } catch (err: any) {
      toast.error("Error al reactivar agente: " + (err.message || "Intenta de nuevo"));
    }
  };

  const handleResetPassword = async (agent: any) => {
    setResetTarget(agent);
  };

  const confirmResetPassword = async () => {
    if (!resetTarget) return;
    try {
      const emails = await resolveAgentEmails(resetTarget);
      if (!emails.length) throw new Error("No se encontró el usuario");

      const { data: resetData, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: emails[0] },
      });
      if (error) throw error;
      if (resetData?.error) {
        toast.error("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
      } else {
        toast.success("Contraseña reseteada a Temporal123!");
      }
    } catch {
      toast.error("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
    } finally {
      setResetTarget(null);
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  };

  // ─── Inmobiliaria projects (for agent project access) ───
  const { data: inmobProjects = [] } = useQuery({
    queryKey: ["inmob-config-proyectos-list", personaId],
    queryFn: async () => {
      if (!personaId) return [];
      // Get inmobiliaria's own user email
      const { data: inmobUser } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId) as any;
      if (!inmobUser?.length) return [];
      const inmobEmail = inmobUser[0].email;
      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id, proyectos(id, nombre)")
        .eq("usuario_id", inmobEmail) as any;
      return (data || []).map((d: any) => ({
        id: d.proyectos?.id,
        nombre: d.proyectos?.nombre || `Proyecto ${d.proyecto_id}`,
      })).filter((p: any) => p.id);
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agentes</h1>
        <p className="text-sm text-muted-foreground">Gestión y rendimiento de los agentes de tu inmobiliaria</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi icon={Users} label="Agentes Activos" value={totalAgentes} loading={isLoading} />
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="activos" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Activos <Badge variant="secondary" className="ml-1 text-[10px]">{filteredActiveAgents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="desactivados" className="gap-1.5">
            <Power className="h-3.5 w-3.5" /> Desactivados <Badge variant="secondary" className="ml-1 text-[10px]">{filteredInactiveAgents.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activos">
          <AgentTable
            agents={filteredAgents}
            isLoading={isLoading}
            search={search}
            ofertasByAgent={ofertasByAgent}
            prospectosByAgent={prospectosByAgent}
            ingresoByAgent={ingresoByAgent}
            getInitials={getInitials}
            onEdit={openEditDialog}
            onDeactivate={handleDeactivate}
            onResetPassword={handleResetPassword}
            onProjectAccess={setProjectAccessAgent}
            navigate={navigate}
            isActiveTab
          />
        </TabsContent>

        <TabsContent value="desactivados">
          <AgentTable
            agents={filteredAgents}
            isLoading={isLoading}
            search={search}
            ofertasByAgent={ofertasByAgent}
            prospectosByAgent={prospectosByAgent}
            ingresoByAgent={ingresoByAgent}
            getInitials={getInitials}
            onReactivate={handleReactivate}
            onEdit={openEditDialog}
            onResetPassword={handleResetPassword}
            onProjectAccess={setProjectAccessAgent}
            navigate={navigate}
            isActiveTab={false}
          />
        </TabsContent>
      </Tabs>

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

      {/* Project Access Dialog */}
      <AgentProjectAccessDialog
        agent={projectAccessAgent}
        inmobProjects={inmobProjects}
        onClose={() => setProjectAccessAgent(null)}
      />

      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Resetear contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmas resetear la contraseña de <strong>{resetTarget?.email}</strong>? La nueva contraseña será <strong>Temporal123!</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetPassword}>Confirmar reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───── Agent Table ───── */
function AgentTable({
  agents, isLoading, search, ofertasByAgent, prospectosByAgent, ingresoByAgent,
  getInitials, onEdit, onDeactivate, onReactivate, onResetPassword, onProjectAccess,
  navigate, isActiveTab,
}: {
  agents: any[]; isLoading: boolean; search: string;
  ofertasByAgent: Map<string, any>; prospectosByAgent: Map<string, number>; ingresoByAgent: Map<string, number>;
  getInitials: (name: string) => string;
  onEdit: (a: any) => void; onDeactivate?: (a: any) => void; onReactivate?: (a: any) => void;
  onResetPassword: (a: any) => void; onProjectAccess: (a: any) => void;
  navigate: any; isActiveTab: boolean;
}) {
  return (
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
              {agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {search ? "Sin resultados" : isActiveTab ? "No hay agentes activos" : "No hay agentes desactivados"}
                  </TableCell>
                </TableRow>
              ) : (
                agents.map((agent) => {
                  const stats = ofertasByAgent.get(agent.email) || { total: 0, vendidas: 0 };
                  const prospectos = prospectosByAgent.get(agent.email) || 0;
                  const ingreso = ingresoByAgent.get(agent.email) || 0;
                  const conversion = stats.total > 0 ? Math.round((stats.vendidas / stats.total) * 100) : 0;
                  return (
                    <TableRow key={agent.email}>
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
                              {agent.isInternal && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400">
                                  Usuario interno
                                </Badge>
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
                            <DropdownMenuItem onClick={() => onEdit(agent)}>
                              <Pencil className="h-4 w-4 mr-2" /> Editar información
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onProjectAccess(agent)}>
                              <FolderOpen className="h-4 w-4 mr-2" /> Acceso a proyectos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isActiveTab && onDeactivate && (
                              <DropdownMenuItem onClick={() => onDeactivate(agent)} className="text-destructive">
                                <Power className="h-4 w-4 mr-2" /> Desactivar
                              </DropdownMenuItem>
                            )}
                            {!isActiveTab && onReactivate && (
                              <DropdownMenuItem onClick={() => onReactivate(agent)} className="text-emerald-600">
                                <Power className="h-4 w-4 mr-2" /> Reactivar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onResetPassword(agent)}>
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
  );
}

/* ───── Agent Project Access Dialog ───── */
function AgentProjectAccessDialog({ agent, inmobProjects, onClose }: {
  agent: any | null; inmobProjects: { id: number; nombre: string }[]; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [agentProjects, setAgentProjects] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch agent's current project access
  const { data: currentAccess, isLoading } = useQuery({
    queryKey: ["agent-project-access", agent?.email],
    queryFn: async () => {
      if (!agent?.email) return [];
      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id")
        .eq("usuario_id", agent.email) as any;
      return (data || []).map((d: any) => d.proyecto_id as number);
    },
    enabled: !!agent?.email,
  });

  useEffect(() => {
    if (currentAccess) {
      setAgentProjects(new Set(currentAccess));
    }
  }, [currentAccess]);

  const handleToggle = async (projectId: number, enabled: boolean) => {
    setLoading(true);
    try {
      if (enabled) {
        // Add access
        const { error } = await supabase
          .from("proyectos_acceso")
          .insert({ usuario_id: agent.email, proyecto_id: projectId }) as any;
        if (error && !error.message?.includes("duplicate")) throw error;
        setAgentProjects(prev => new Set([...prev, projectId]));
        toast.success("Acceso al proyecto habilitado");
      } else {
        // Remove access
        const { error } = await supabase
          .from("proyectos_acceso")
          .delete()
          .eq("usuario_id", agent.email)
          .eq("proyecto_id", projectId) as any;
        if (error) throw error;
        setAgentProjects(prev => { const next = new Set(prev); next.delete(projectId); return next; });
        toast.success("Acceso al proyecto removido");
      }
      queryClient.invalidateQueries({ queryKey: ["agent-project-access", agent.email] });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Intenta de nuevo"));
    } finally {
      setLoading(false);
    }
  };

  if (!agent) return null;

  return (
    <Dialog open={!!agent} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acceso a Proyectos</DialogTitle>
          <DialogDescription>{agent.nombre} ({agent.email})</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-primary">El acceso a proyectos se hereda del usuario principal</p>
          <p className="text-muted-foreground mt-1">
            Los Agentes Inmobiliarios heredan automáticamente el acceso a proyectos de su Inmobiliaria padre.
            Si se requiere, también se puede administrar independientemente a un usuario para que pueda tener
            acceso a todos los proyectos de su inmobiliaria o quitar alguno desde el portal de la inmobiliaria.
          </p>
        </div>
        <div className="space-y-2 mt-2">
          <p className="text-sm font-medium">Proyectos disponibles:</p>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4">Cargando...</p>
          ) : inmobProjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No hay proyectos asignados a tu inmobiliaria</p>
          ) : (
            inmobProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{p.nombre}</span>
                </div>
                <Switch
                  checked={agentProjects.has(p.id)}
                  onCheckedChange={(checked) => handleToggle(p.id, checked)}
                  disabled={loading}
                />
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
