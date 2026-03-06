import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft, Users, FileText, Home, ShoppingCart, DollarSign, TrendingUp, Mail, Calendar,
} from "lucide-react";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmtCurrency(v);
};

const NAV_PREFIX = "/admin/portal-inmobiliaria";

function isVigente(fechaGeneracion: string): boolean {
  const expira = new Date(fechaGeneracion);
  expira.setDate(expira.getDate() + 5);
  return expira >= new Date();
}

function classifyOffer(o: any): string {
  if (o.estatus_disponibilidad === 5) return "cierre";
  if (o.tiene_contrato_firmado) return "firma_contrato";
  if (o.contrato_draft) return "gen_contrato";
  if (o.cuenta_cobranza_id && o.estatus_disponibilidad === 4) return "apartado";
  const vigente = isVigente(o.fecha_generacion);
  if (!vigente && !o.cuenta_cobranza_id) return "expiradas";
  if (!o.id_esquema_pago_seleccionado) return vigente ? "nuevas" : "expiradas";
  if (o.id_estatus_aprobacion === 1) return vigente ? "pendientes" : "expiradas";
  if (o.id_estatus_aprobacion === 2) return "aprobadas";
  if (o.id_estatus_aprobacion === 3) return vigente ? "rechazadas" : "expiradas";
  if (o.id_estatus_aprobacion === 4) return vigente ? "revision" : "expiradas";
  return "nuevas";
}

export default function InmobAgentProfile() {
  const { email } = useParams<{ email: string }>();
  const navigate = useNavigate();
  const decodedEmail = email ? decodeURIComponent(email) : "";
  const { data: agents = [] } = useInmobAgents();

  const agent = useMemo(() => agents.find(a => (a.email || "").toLowerCase() === decodedEmail.toLowerCase()), [agents, decodedEmail]);

  // ALL ofertas for this agent (no date filter)
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["agent-profile-ofertas", decodedEmail],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await (supabase as any)
          .from("ofertas")
          .select("id, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad, id_producto, id_persona_lead")
          .eq("email_creador", decodedEmail)
          .eq("activo", true)
          .order("fecha_generacion", { ascending: false })
          .range(from, from + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
    enabled: !!decodedEmail,
    staleTime: 3 * 60_000,
  });

  // Properties for status
  const propIds = useMemo(() => [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[], [ofertas]);
  const { data: propMap = new Map() } = useQuery({
    queryKey: ["agent-profile-props", propIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase.from("propiedades").select("id, id_estatus_disponibilidad, precio_lista, numero_propiedad, id_edificio_modelo").in("id", batch) as any;
        (data || []).forEach((p: any) => m.set(p.id, p));
      }
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Cuentas de cobranza for this agent's offers
  const ofertaIds = useMemo(() => ofertas.map((o: any) => o.id), [ofertas]);
  const { data: cuentasMap = new Map() } = useQuery({
    queryKey: ["agent-profile-cuentas", ofertaIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < ofertaIds.length; i += 200) {
        const batch = ofertaIds.slice(i, i + 200);
        const { data } = await (supabase as any).from("cuentas_cobranza").select("id, id_oferta, precio_final, id_propiedad, contrato_draft").in("id_oferta", batch).eq("activo", true);
        (data || []).forEach((c: any) => { if (c.id_oferta) m.set(c.id_oferta, c); });
      }
      return m;
    },
    enabled: ofertaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Check signed contracts
  const cuentaIds = useMemo(() => [...cuentasMap.values()].map((c: any) => c.id), [cuentasMap]);
  const { data: firmadoSet = new Set<number>() } = useQuery({
    queryKey: ["agent-profile-firmados", cuentaIds],
    queryFn: async () => {
      const s = new Set<number>();
      if (!cuentaIds.length) return s;
      for (let i = 0; i < cuentaIds.length; i += 200) {
        const batch = cuentaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("documentos")
          .select("id_cuenta_cobranza")
          .in("id_cuenta_cobranza", batch)
          .eq("id_tipo_documento", 42)
          .eq("activo", true);
        (data || []).forEach((d: any) => s.add(d.id_cuenta_cobranza));
      }
      return s;
    },
    enabled: cuentaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Comisiones: ALL comisionistas entries for this agent email (not limited to their own offers)
  const { data: comisiones = [] } = useQuery({
    queryKey: ["agent-profile-comisiones-all", decodedEmail],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id_cuenta_cobranza, email_usuario, porcentaje_comision, pagada, aprobada")
          .eq("email_usuario", decodedEmail)
          .eq("activo", true)
          .range(from, from + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
    enabled: !!decodedEmail,
    staleTime: 3 * 60_000,
  });

  // Fetch precio_final for all comision cuentas (may include cuentas not from this agent's offers)
  const comisionCuentaIds = useMemo(() => {
    const ids = new Set<number>();
    comisiones.forEach((c: any) => ids.add(c.id_cuenta_cobranza));
    return [...ids];
  }, [comisiones]);

  const { data: comisionCuentasMap = new Map() } = useQuery({
    queryKey: ["agent-profile-comision-cuentas", comisionCuentaIds],
    queryFn: async () => {
      const m = new Map<number, number>();
      for (let i = 0; i < comisionCuentaIds.length; i += 200) {
        const batch = comisionCuentaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("cuentas_cobranza")
          .select("id, precio_final")
          .in("id", batch)
          .eq("activo", true);
        (data || []).forEach((c: any) => m.set(c.id, Number(c.precio_final) || 0));
      }
      return m;
    },
    enabled: comisionCuentaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Prospectos históricos (únicos por persona prospecto)
  const { data: prospectosCount = 0 } = useQuery({
    queryKey: ["agent-profile-prospectos", agent?.personaId],
    queryFn: async () => {
      if (!agent?.personaId) return 0;

      const uniqueProspects = new Set<number>();
      let from = 0;
      while (true) {
        const { data } = await (supabase as any)
          .from("entidades_relacionadas")
          .select("id_persona")
          .eq("id_persona_duena_lead", agent.personaId)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .range(from, from + 999);

        if (!data?.length) break;
        data.forEach((row: any) => {
          const prospectPersonaId = Number(row.id_persona);
          if (prospectPersonaId) uniqueProspects.add(prospectPersonaId);
        });

        if (data.length < 1000) break;
        from += 1000;
      }

      return uniqueProspects.size;
    },
    enabled: !!agent?.personaId,
    staleTime: 3 * 60_000,
  });

  // Citas recientes
  const { data: citasRecientes = [] } = useQuery({
    queryKey: ["agent-profile-citas", agent?.personaId],
    queryFn: async () => {
      if (!agent?.personaId) return [];
      const { data } = await (supabase as any)
        .from("citas")
        .select("id, titulo, fecha_hora, estatus")
        .eq("id_persona_agente", agent.personaId)
        .eq("activo", true)
        .order("fecha_hora", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!agent?.personaId,
    staleTime: 3 * 60_000,
  });

  // Resolve project names for pipeline cards
  const edModeloIds = useMemo(() => [...new Set([...propMap.values()].map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[], [propMap]);
  const { data: propToProject = new Map<number, string>() } = useQuery({
    queryKey: ["agent-profile-prop-projects", edModeloIds],
    queryFn: async () => {
      const m = new Map<number, string>();
      if (!edModeloIds.length) return m;
      const { data: ems } = await (supabase as any).from("edificios_modelos").select("id, id_edificio").in("id", edModeloIds);
      const edIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))];
      if (!edIds.length) return m;
      const { data: eds } = await (supabase as any).from("edificios").select("id, id_proyecto, nombre").in("id", edIds);
      const projIds = [...new Set((eds || []).map((e: any) => e.id_proyecto).filter(Boolean))];
      if (!projIds.length) return m;
      const { data: projs } = await (supabase as any).from("proyectos").select("id, nombre").in("id", projIds);
      const projMap = new Map((projs || []).map((p: any) => [p.id, p.nombre]));
      const edToPj = new Map((eds || []).map((e: any) => [e.id, e.id_proyecto]));
      const emToEd = new Map((ems || []).map((em: any) => [em.id, em.id_edificio]));
      const edNameMap = new Map((eds || []).map((e: any) => [e.id, e.nombre]));
      for (const [propId, prop] of propMap.entries()) {
        const edId = emToEd.get(prop.id_edificio_modelo);
        const pjId = edId ? edToPj.get(edId) : null;
        const name = pjId ? projMap.get(pjId) : null;
        if (name) m.set(propId as number, name as string);
      }
      return m;
    },
    enabled: edModeloIds.length > 0,
    staleTime: 5 * 60_000,
  });

  // Classify all offers
  const classifiedOffers = useMemo(() => {
    return ofertas.map((o: any) => {
      const prop = propMap.get(o.id_propiedad);
      const cuenta = cuentasMap.get(o.id);
      const enriched = {
        ...o,
        estatus_disponibilidad: prop?.id_estatus_disponibilidad,
        cuenta_cobranza_id: cuenta?.id,
        contrato_draft: cuenta?.contrato_draft,
        tiene_contrato_firmado: cuenta ? firmadoSet.has(cuenta.id) : false,
      };
      return { ...enriched, stage: classifyOffer(enriched) };
    });
  }, [ofertas, propMap, cuentasMap, firmadoSet]);

  // KPIs
  // Apartadas: cuentas from this agent's offers where property is apartado(4) or beyond (5)
  const apartadoCount = useMemo(() => {
    const seen = new Set<number>();
    return classifiedOffers.filter((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      if (!cuenta) return false;
      if (seen.has(cuenta.id)) return false;
      seen.add(cuenta.id);
      const s = o.estatus_disponibilidad;
      return s === 4 || s === 5;
    }).length;
  }, [classifiedOffers, cuentasMap]);

  // Ventas cerradas: unique cuentas where property status = 5
  const ventasCerradas = useMemo(() => {
    const seen = new Set<number>();
    return classifiedOffers.filter((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      if (!cuenta) return false;
      if (seen.has(cuenta.id)) return false;
      seen.add(cuenta.id);
      return o.estatus_disponibilidad === 5;
    }).length;
  }, [classifiedOffers, cuentasMap]);

  // Ingreso: sum of precio_final from sold cuentas (unique)
  const ingreso = useMemo(() => {
    const seen = new Set<number>();
    let total = 0;
    classifiedOffers.forEach((o: any) => {
      if (o.estatus_disponibilidad !== 5) return;
      const cuenta = cuentasMap.get(o.id);
      if (!cuenta || seen.has(cuenta.id)) return;
      seen.add(cuenta.id);
      total += Number(cuenta.precio_final) || 0;
    });
    return total;
  }, [classifiedOffers, cuentasMap]);

  // Comisión acumulada: from ALL comisionistas for this agent
  const comisionAcumulada = useMemo(() => {
    return comisiones.reduce((sum: number, c: any) => {
      const precioFinal = comisionCuentasMap.get(c.id_cuenta_cobranza) || 0;
      return sum + (precioFinal * (Number(c.porcentaje_comision) || 0) / 100);
    }, 0);
  }, [comisiones, comisionCuentasMap]);

  const conversionRate = ofertas.length > 0 ? ((ventasCerradas / ofertas.length) * 100).toFixed(1) : "0.0";

  // Pipeline activo: offers in active negotiation stages (not expired, not cierre)
  const ACTIVE_STAGES = new Set(["nuevas", "pendientes", "aprobadas", "rechazadas", "revision", "apartado", "gen_contrato", "firma_contrato"]);
  const pipelineActivo = useMemo(() => {
    return classifiedOffers
      .filter((o: any) => ACTIVE_STAGES.has(o.stage))
      .map((o: any) => {
        const prop = propMap.get(o.id_propiedad);
        const cuenta = cuentasMap.get(o.id);
        const projName = propToProject.get(o.id_propiedad) || "";
        const numProp = prop?.numero_propiedad || "";
        const stageLabel = o.stage === "apartado" ? "Apartado"
          : o.stage === "firma_contrato" ? "Firma"
          : o.stage === "gen_contrato" ? "Contrato"
          : o.stage === "aprobadas" ? "Aprobada"
          : o.stage === "pendientes" ? "Pendiente"
          : o.stage === "nuevas" ? "Nueva"
          : o.stage === "revision" ? "Revisión"
          : o.stage === "rechazadas" ? "Rechazada"
          : o.stage;
        return {
          id: o.id,
          nombre: projName ? `${projName} · ${numProp}` : numProp || `Oferta ${o.id}`,
          stage: stageLabel,
          precio: Number(cuenta?.precio_final || prop?.precio_lista) || 0,
        };
      })
      .slice(0, 15);
  }, [classifiedOffers, propMap, cuentasMap, propToProject]);

  // Comisiones enriched for display
  const comisionesEnriched = useMemo(() => {
    return comisiones.map((c: any) => {
      const precioFinal = comisionCuentasMap.get(c.id_cuenta_cobranza) || 0;
      const monto = precioFinal * (Number(c.porcentaje_comision) || 0) / 100;
      const statusLabel = c.pagada ? "Pagada" : c.aprobada ? "Aprobada" : "Pendiente";
      return {
        id: c.id_cuenta_cobranza,
        nombre: `CC-${String(c.id_cuenta_cobranza).padStart(6, "0")}`,
        monto,
        status: statusLabel,
      };
    }).slice(0, 10);
  }, [comisiones, comisionCuentasMap]);

  const getInitials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const isLoading = ofertasLoading;

  if (!agent && agents.length > 0) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(`${NAV_PREFIX}/agentes`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
        <p className="text-muted-foreground text-center py-12">Agente no encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`${NAV_PREFIX}/agentes`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {agent ? getInitials(agent.nombre) : ".."}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold">{agent?.nombre || "Cargando..."}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{agent?.email}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {agent && (
            <Badge variant={agent.activo ? "default" : "destructive"} className="text-xs">
              {agent.activo ? "Activo" : "Inactivo"}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">↗ {conversionRate}% conv.</span>
        </div>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: Users, label: "PROSPECTOS", value: String(prospectosCount) },
            { icon: FileText, label: "OFERTAS", value: String(ofertas.length) },
            { icon: Home, label: "APARTADOS", value: String(apartadoCount) },
            { icon: ShoppingCart, label: "VENTAS CERRADAS", value: String(ventasCerradas) },
            { icon: DollarSign, label: "INGRESO GENERADO", value: fmtShort(ingreso) },
            { icon: TrendingUp, label: "COMISIÓN ACUMULADA", value: fmtShort(comisionAcumulada) },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline activo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline activo</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {pipelineActivo.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Sin pipeline activo</p>
          ) : (
            <div className="space-y-3">
              {pipelineActivo.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{item.nombre}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <Badge variant="outline" className="text-xs">{item.stage}</Badge>
                    <span className="text-sm font-semibold">{fmtCurrency(item.precio)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comisiones + Citas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Comisiones</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {comisionesEnriched.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Sin comisiones</p>
            ) : (
              <div className="space-y-3">
                {comisionesEnriched.map((c, idx) => (
                  <div key={`${c.id}-${idx}`} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold">{c.nombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtCurrency(c.monto)}</p>
                      <Badge
                        variant={c.status === "Pagada" ? "default" : "outline"}
                        className={`text-[10px] ${c.status === "Pagada" ? "bg-emerald-600" : ""}`}
                      >
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Citas recientes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {citasRecientes.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Sin citas recientes</p>
            ) : (
              <div className="space-y-3">
                {citasRecientes.map((cita: any) => (
                  <div key={cita.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{cita.titulo || "Cita"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(cita.fecha_hora).toLocaleDateString("es-MX")} · {new Date(cita.fecha_hora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{cita.estatus || "Programada"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
