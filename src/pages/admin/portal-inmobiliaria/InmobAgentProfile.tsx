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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Users, FileText, Home, ShoppingCart, DollarSign, TrendingUp,
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
  const propIds = useMemo(() => [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))], [ofertas]);
  const { data: propMap = new Map() } = useQuery({
    queryKey: ["agent-profile-props", propIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase.from("propiedades").select("id, id_estatus_disponibilidad, precio_lista").in("id", batch) as any;
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
        const { data } = await (supabase as any).from("cuentas_cobranza").select("id, id_oferta, precio_final").in("id_oferta", batch).eq("activo", true);
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
          .select("id, id_cuenta_cobranza, porcentaje_comision, pagada, aprobada")
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${NAV_PREFIX}/agentes`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
              {agent ? getInitials(agent.nombre) : ".."}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{agent?.nombre || "Cargando..."}</h1>
              {agent && (
                <Badge variant={agent.activo ? "default" : "destructive"} className="text-xs">
                  {agent.activo ? "Activo" : "Inactivo"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{agent?.email}</p>
            {agent && <PhoneDisplay telefono={agent.telefono} clavePaisTelefono={agent.clavePaisTelefono} className="text-sm" />}
          </div>
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
            { icon: Users, label: "Prospectos", value: String(prospectosCount) },
            { icon: FileText, label: "Ofertas", value: String(ofertas.length) },
            { icon: Home, label: "Apartados", value: String(apartadoCount) },
            { icon: ShoppingCart, label: "Ventas Cerradas", value: String(ventasCerradas) },
            { icon: DollarSign, label: "Ingreso", value: fmtShort(ingreso) },
            { icon: TrendingUp, label: "Comisión Acumulada", value: fmtShort(comisionAcumulada) },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-xl font-bold">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent offers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ofertas recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="sozu-table-header">
                <TableHead>ID</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Precio Final</TableHead>
                <TableHead className="text-center">Estatus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ofertas.slice(0, 20).map((o: any) => {
                const cuenta = cuentasMap.get(o.id);
                const prop = propMap.get(o.id_propiedad);
                const label = `${o.id_producto ? "OP" : "O"}-${String(o.id).padStart(6, "0")}`;
                const estatus = prop?.id_estatus_disponibilidad === 5 ? "Vendida" :
                  prop?.id_estatus_disponibilidad === 4 ? "Apartada" :
                  o.id_estatus_aprobacion === 2 ? "Aprobada" :
                  o.id_estatus_aprobacion === 3 ? "Rechazada" : "Pendiente";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">{label}</TableCell>
                    <TableCell className="text-sm">{new Date(o.fecha_generacion).toLocaleDateString("es-MX")}</TableCell>
                    <TableCell className="text-sm">{o.id_producto ? "Producto" : "Propiedad"}</TableCell>
                    <TableCell className="text-right text-sm">{cuenta ? fmtCurrency(Number(cuenta.precio_final) || 0) : "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={estatus === "Vendida" ? "default" : estatus === "Rechazada" ? "destructive" : "secondary"} className="text-xs">
                        {estatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {ofertas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin ofertas</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
