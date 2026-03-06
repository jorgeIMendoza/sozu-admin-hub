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
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
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

export default function InmobAgentProfile() {
  const { email } = useParams<{ email: string }>();
  const navigate = useNavigate();
  const decodedEmail = email ? decodeURIComponent(email) : "";
  const { data: agents = [] } = useInmobAgents();

  const agent = useMemo(() => agents.find(a => a.email === decodedEmail), [agents, decodedEmail]);

  // Ofertas for this agent
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["agent-profile-ofertas", decodedEmail],
    queryFn: async () => {
      const { data } = await supabase
        .from("ofertas")
        .select("id, fecha_generacion, id_estatus_aprobacion, id_propiedad, id_producto")
        .eq("email_creador", decodedEmail)
        .eq("activo", true)
        .order("fecha_generacion", { ascending: false }) as any;
      return data || [];
    },
    enabled: !!decodedEmail,
    staleTime: 3 * 60_000,
  });

  // Properties for sold status
  const propIds = useMemo(() => [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[], [ofertas]);
  const { data: propMap = new Map() } = useQuery({
    queryKey: ["agent-profile-props", propIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase.from("propiedades").select("id, id_estatus_disponibilidad, precio_lista, numero_propiedad, edificios_modelos(id, edificios(nombre))").in("id", batch) as any;
        (data || []).forEach((p: any) => m.set(p.id, p));
      }
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Cuentas for ingreso
  const ofertaIds = useMemo(() => ofertas.map((o: any) => o.id), [ofertas]);
  const { data: cuentasMap = new Map() } = useQuery({
    queryKey: ["agent-profile-cuentas", ofertaIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < ofertaIds.length; i += 200) {
        const batch = ofertaIds.slice(i, i + 200);
        const { data } = await (supabase as any).from("cuentas_cobranza").select("id, id_oferta, precio_final, id_propiedad").in("id_oferta", batch).eq("activo", true);
        (data || []).forEach((c: any) => { if (c.id_oferta) m.set(c.id_oferta, c); });
      }
      return m;
    },
    enabled: ofertaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Comisiones for this agent
  const cuentaIds = useMemo(() => [...cuentasMap.values()].map((c: any) => c.id), [cuentasMap]);
  const { data: comisiones = [] } = useQuery({
    queryKey: ["agent-profile-comisiones", decodedEmail, cuentaIds],
    queryFn: async () => {
      if (!cuentaIds.length) return [];
      const all: any[] = [];
      for (let i = 0; i < cuentaIds.length; i += 200) {
        const batch = cuentaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("id_cuenta_cobranza, email_usuario, porcentaje_comision, pagada, aprobada")
          .in("id_cuenta_cobranza", batch)
          .eq("email_usuario", decodedEmail)
          .eq("activo", true);
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: cuentaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Prospectos count
  const { data: prospectosCount = 0 } = useQuery({
    queryKey: ["agent-profile-prospectos", agent?.personaId],
    queryFn: async () => {
      if (!agent?.personaId) return 0;
      const { count } = await supabase
        .from("entidades_relacionadas")
        .select("id", { count: "exact", head: true })
        .eq("id_persona_duena_lead", agent.personaId)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true) as any;
      return count || 0;
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

  // Proyectos for property names
  const { data: proyectosMap = new Map() } = useQuery({
    queryKey: ["agent-profile-proyectos", propIds],
    queryFn: async () => {
      const m = new Map<number, string>();
      const edifIds = [...new Set([...propMap.values()].map(p => p.edificios_modelos?.edificios?.nombre).filter(Boolean))];
      return m; // We use prop data directly
    },
    enabled: false,
  });

  // KPI computations
  const soldOfferIds = useMemo(() => ofertas.filter((o: any) => propMap.get(o.id_propiedad)?.id_estatus_disponibilidad === 5).map((o: any) => o.id), [ofertas, propMap]);
  const apartadoCount = useMemo(() => ofertas.filter((o: any) => {
    const s = propMap.get(o.id_propiedad)?.id_estatus_disponibilidad;
    return s === 4 || s === 5;
  }).length, [ofertas, propMap]);
  const ventasCerradas = soldOfferIds.length;
  const ingreso = useMemo(() => soldOfferIds.reduce((s, id) => s + (Number(cuentasMap.get(id)?.precio_final) || 0), 0), [soldOfferIds, cuentasMap]);
  const comisionAcumulada = useMemo(() => {
    return comisiones.reduce((s: number, c: any) => {
      const cuenta = [...cuentasMap.values()].find((cc: any) => cc.id === c.id_cuenta_cobranza);
      return s + ((Number(cuenta?.precio_final) || 0) * (Number(c.porcentaje_comision) || 0) / 100);
    }, 0);
  }, [comisiones, cuentasMap]);

  // Conversion rate
  const conversionRate = ofertas.length > 0 ? ((ventasCerradas / ofertas.length) * 100).toFixed(1) : "0.0";

  // Pipeline activo: ofertas con cuenta en estatus 4 (apartado) que aún no son vendidas
  const pipelineActivo = useMemo(() => {
    return ofertas
      .filter((o: any) => {
        const p = propMap.get(o.id_propiedad);
        const cuenta = cuentasMap.get(o.id);
        if (!cuenta || !p) return false;
        return p.id_estatus_disponibilidad === 4 || p.id_estatus_disponibilidad === 5;
      })
      .map((o: any) => {
        const p = propMap.get(o.id_propiedad);
        const cuenta = cuentasMap.get(o.id);
        const edificioNombre = p?.edificios_modelos?.edificios?.nombre || "";
        const numProp = p?.numero_propiedad || "";
        const isSold = p?.id_estatus_disponibilidad === 5;
        const stageLabel = isSold ? "Cierre de Venta" :
          o.id_estatus_aprobacion === 2 ? "Aprobación desarrollador" : "Apartado";
        return {
          id: o.id,
          nombre: `${edificioNombre}${numProp ? ` · ${numProp}` : ""}`.trim() || `Oferta ${o.id}`,
          proyecto: edificioNombre || "—",
          stage: stageLabel,
          precio: Number(cuenta?.precio_final) || 0,
        };
      })
      .slice(0, 10);
  }, [ofertas, propMap, cuentasMap]);

  // Comisiones enriched
  const comisionesEnriched = useMemo(() => {
    return comisiones.map((c: any) => {
      const cuenta = [...cuentasMap.values()].find((cc: any) => cc.id === c.id_cuenta_cobranza);
      const ofertaId = cuenta ? [...cuentasMap.entries()].find(([_, v]) => v.id === c.id_cuenta_cobranza)?.[0] : null;
      const oferta = ofertaId ? ofertas.find((o: any) => o.id === ofertaId) : null;
      const prop = oferta ? propMap.get(oferta.id_propiedad) : null;
      const edificioNombre = prop?.edificios_modelos?.edificios?.nombre || "";
      const numProp = prop?.numero_propiedad || "";
      const monto = (Number(cuenta?.precio_final) || 0) * (Number(c.porcentaje_comision) || 0) / 100;
      const statusLabel = c.pagada ? "Pagada" : c.aprobada ? "Aprobada" : "Pendiente";
      return {
        id: c.id_cuenta_cobranza,
        nombre: `${edificioNombre}${numProp ? ` · ${numProp}` : ""}`.trim() || "—",
        monto,
        status: statusLabel,
      };
    }).slice(0, 10);
  }, [comisiones, cuentasMap, ofertas, propMap]);

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
                    <p className="text-xs text-muted-foreground">{item.proyecto}</p>
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
        {/* Comisiones */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Comisiones</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {comisionesEnriched.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Sin comisiones</p>
            ) : (
              <div className="space-y-3">
                {comisionesEnriched.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2">
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

        {/* Citas recientes */}
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
