import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MonthMultiSelector, getMonthFilterLabel, buildDateRangesFromMonths } from "@/components/ui/month-multi-selector";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FileText, CalendarDays, Percent, Home, BarChart3, DollarSign, Timer } from "lucide-react";

const COLORS = ["#239E6C", "#3B82F6", "#F97316", "#A855F7", "#14B8A6", "#EC4899", "#06B6D4", "#84CC16"];

const ADVANCED_STAGES = new Set(["apartado", "gen_contrato", "firma_contrato", "cierre"]);

export default function InmobReportes() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();
  const { personaId } = useInmobiliariaPersonaId();
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  const monthFilterLabel = useMemo(() => getMonthFilterLabel(selectedMonths), [selectedMonths]);
  const dateRanges = useMemo(() => buildDateRangesFromMonths(selectedMonths), [selectedMonths]);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/reportes");
    track({ page: "inmob_reportes", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  // Detect if Sozu
  const { data: isSozu = false } = useQuery({
    queryKey: ["inmob-reportes-is-sozu", personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await supabase.from("personas").select("nombre_legal").eq("id", personaId).single() as any;
      return (data?.nombre_legal || "").toLowerCase().includes("real estate ventures");
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  // Fetch offers
  const { data: ofertas = [] } = useQuery({
    queryKey: ["inmob-reportes-ofertas", agentEmails, dateRanges],
    queryFn: async () => {
      if (agentEmails.length === 0) return [];
      const isAllMonths = dateRanges.length === 0;
      const ranges = isAllMonths ? [null] : dateRanges;
      const all: any[] = [];
      for (const range of ranges) {
        let q = (supabase as any)
          .from("ofertas")
          .select("id, email_creador, id_estatus_aprobacion, id_propiedad, id_producto, id_esquema_pago_seleccionado, fecha_generacion")
          .in("email_creador", agentEmails)
          .eq("activo", true);
        if (range) {
          q = q.gte("fecha_generacion", range.start).lte("fecha_generacion", range.end);
        }
        const { data } = await q;
        if (data) all.push(...data);
      }
      const seen = new Set<number>();
      return all.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    },
    enabled: agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Fetch propiedades for estatus_disponibilidad (needed for stage classification)
  const propIds = useMemo(() => [...new Set(ofertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[], [ofertas]);
  const { data: propMap = new Map<number, any>() } = useQuery({
    queryKey: ["inmob-reportes-props", propIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data } = await supabase.from("propiedades").select("id, id_estatus_disponibilidad, id_edificio_modelo").in("id", batch) as any;
        (data || []).forEach((p: any) => m.set(p.id, p));
      }
      return m;
    },
    enabled: propIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Fetch cuentas_cobranza by oferta ID (same as dashboard)
  const ofertaIds = useMemo(() => ofertas.map((o: any) => o.id), [ofertas]);
  const { data: cuentasMap = new Map<number, any>() } = useQuery({
    queryKey: ["inmob-reportes-cuentas", ofertaIds],
    queryFn: async () => {
      const m = new Map<number, any>();
      for (let i = 0; i < ofertaIds.length; i += 100) {
        const batch = ofertaIds.slice(i, i + 100);
        const { data } = await (supabase as any)
          .from("cuentas_cobranza")
          .select("id, id_oferta, precio_final, porcentaje_comision_venta, iva_incluido, contrato_draft, fecha_creacion")
          .in("id_oferta", batch)
          .eq("activo", true);
        (data || []).forEach((c: any) => { if (c.id_oferta) m.set(c.id_oferta, c); });
      }
      // Check signed contracts (tipo_documento 42)
      const cuentaIds = [...m.values()].map((c: any) => c.id);
      if (cuentaIds.length > 0) {
        const firmadoSet = new Set<number>();
        for (let i = 0; i < cuentaIds.length; i += 200) {
          const batch = cuentaIds.slice(i, i + 200);
          const { data: docs } = await supabase
            .from("documentos")
            .select("id_cuenta_cobranza")
            .in("id_cuenta_cobranza", batch)
            .eq("id_tipo_documento", 42)
            .eq("activo", true) as any;
          (docs || []).forEach((d: any) => firmadoSet.add(d.id_cuenta_cobranza));
        }
        m.forEach((c: any) => {
          c.tiene_contrato_firmado = firmadoSet.has(c.id);
        });
      }
      return m;
    },
    enabled: ofertaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Comisionistas by cuenta
  const cuentaCobranzaIds = useMemo(() => {
    const ids = new Set<number>();
    cuentasMap.forEach((c: any) => { if (c?.id) ids.add(c.id); });
    return [...ids];
  }, [cuentasMap]);

  const { data: comisiones = [] } = useQuery({
    queryKey: ["inmob-reportes-comisiones", cuentaCobranzaIds],
    queryFn: async () => {
      if (!cuentaCobranzaIds.length) return [];
      const all: any[] = [];
      for (let i = 0; i < cuentaCobranzaIds.length; i += 200) {
        const batch = cuentaCobranzaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("email_usuario, porcentaje_comision, aprobada, pagada, id_cuenta_cobranza, fecha_creacion")
          .in("id_cuenta_cobranza", batch)
          .eq("activo", true);
        if (data) all.push(...data);
      }
      // Dedupe by composite key
      const seen = new Set<string>();
      const deduped = all.filter((c) => {
        const key = `${c.id_cuenta_cobranza}-${(c.email_usuario || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Compute monto_comision same as dashboard
      deduped.forEach((c) => {
        const cuenta = [...cuentasMap.values()].find((cc: any) => cc.id === c.id_cuenta_cobranza);
        const precioFinal = cuenta ? Number(cuenta.precio_final) || 0 : 0;
        c.monto_comision = (Number(c.porcentaje_comision) || 0) / 100 * precioFinal;
      });
      return deduped;
    },
    enabled: cuentaCobranzaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Stage classification (same logic as dashboard)
  const classifyOffer = useCallback((o: any) => {
    const p = propMap.get(o.id_propiedad);
    const cuenta = cuentasMap.get(o.id);
    if (p?.id_estatus_disponibilidad === 5) return "cierre";
    if (cuenta?.tiene_contrato_firmado) return "firma_contrato";
    if (cuenta?.contrato_draft) return "gen_contrato";
    if (cuenta && p?.id_estatus_disponibilidad === 4) return "apartado";
    const fecha = new Date(o.fecha_generacion);
    const expira = new Date(fecha); expira.setDate(expira.getDate() + 5);
    const vigente = expira >= new Date();
    if (!vigente && !cuenta) return "expiradas";
    if (!o.id_esquema_pago_seleccionado) return vigente ? "nuevas" : "expiradas";
    if (o.id_estatus_aprobacion === 1) return vigente ? "pendientes" : "expiradas";
    if (o.id_estatus_aprobacion === 2) return "aprobadas";
    if (o.id_estatus_aprobacion === 3) return vigente ? "rechazadas" : "expiradas";
    if (o.id_estatus_aprobacion === 4) return vigente ? "revision" : "expiradas";
    return "nuevas";
  }, [propMap, cuentasMap]);

  const classifiedOfertas = useMemo(() => ofertas.map((o: any) => ({ ...o, stage: classifyOffer(o) })), [ofertas, classifyOffer]);

  // Dedup advanced stages (same as dashboard)
  const dedupedAdvancedOfertas = useMemo(() => {
    const advanced = classifiedOfertas.filter((o: any) => ADVANCED_STAGES.has(o.stage));
    const cierre = advanced.filter((o: any) => o.stage === "cierre");
    const nonCierre = advanced.filter((o: any) => o.stage !== "cierre");
    const seen = new Set<string>();
    const dedupedCierre = cierre
      .filter((o: any) => cuentasMap.has(o.id))
      .filter((o: any) => {
        const key = o.id_producto ? `prod-${o.id_producto}-${o.id_propiedad || "none"}` : `prop-${o.id_propiedad}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return [...nonCierre, ...dedupedCierre];
  }, [classifiedOfertas, cuentasMap]);

  const ventasCerradas = useMemo(() => dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre").length, [dedupedAdvancedOfertas]);

  // ───── Strategic KPIs (same formulas as dashboard) ─────
  const conversionGlobal = ofertas.length > 0 ? ((ventasCerradas / ofertas.length) * 100) : 0;

  const { ticketPropiedades, ticketProductos } = useMemo(() => {
    const cierres = dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre");
    const props = cierres.filter((o: any) => !o.id_producto);
    const prods = cierres.filter((o: any) => !!o.id_producto);
    const avg = (arr: any[]) => {
      if (arr.length === 0) return 0;
      return arr.reduce((s: number, o: any) => s + (Number(cuentasMap.get(o.id)?.precio_final) || 0), 0) / arr.length;
    };
    return { ticketPropiedades: avg(props), ticketProductos: avg(prods) };
  }, [dedupedAdvancedOfertas, cuentasMap]);

  const agentEmailSetLower = useMemo(() => new Set(agentEmails.map(e => e.toLowerCase())), [agentEmails]);

  const agentsWithSales = useMemo(() => {
    const sellers = new Set<string>();
    dedupedAdvancedOfertas.forEach((o: any) => {
      if (o.stage === "cierre") {
        const email = (o.email_creador || "").toLowerCase();
        if (agentEmailSetLower.has(email)) sellers.add(email);
      }
    });
    return sellers.size;
  }, [dedupedAdvancedOfertas, agentEmailSetLower]);

  const comisionPromAgente = useMemo(() => {
    if (agentsWithSales === 0) return 0;
    const advancedCuentaIds = new Set<number>();
    dedupedAdvancedOfertas.forEach((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      if (cuenta) advancedCuentaIds.add(cuenta.id);
    });
    const total = comisiones
      .filter((c: any) => advancedCuentaIds.has(c.id_cuenta_cobranza))
      .reduce((s: number, c: any) => s + (Number(c.monto_comision) || 0), 0);
    return total / agentsWithSales;
  }, [agentsWithSales, dedupedAdvancedOfertas, cuentasMap, comisiones]);

  const tiempoPromCierre = useMemo(() => {
    const cierres = dedupedAdvancedOfertas.filter((o: any) => o.stage === "cierre");
    if (cierres.length === 0) return 0;
    const totalDays = cierres.reduce((sum: number, o: any) => {
      const fechaOferta = new Date(o.fecha_generacion);
      const cuenta = cuentasMap.get(o.id);
      const fechaCierre = cuenta?.fecha_creacion ? new Date(cuenta.fecha_creacion) : new Date();
      const diffMs = fechaCierre.getTime() - fechaOferta.getTime();
      return sum + Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    }, 0);
    return Math.round(totalDays / cierres.length);
  }, [dedupedAdvancedOfertas, cuentasMap]);

  // Property → project mapping for project chart
  const { data: propToProject = new Map<number, { id: number; nombre: string }>() } = useQuery({
    queryKey: ["inmob-reportes-prop-proj", propIds],
    queryFn: async () => {
      if (!propIds.length) return new Map();
      const m = new Map<number, { id: number; nombre: string }>();
      const props = [...propMap.values()];
      const emIds = [...new Set(props.map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
      if (!emIds.length) return m;
      const { data: ems } = await supabase.from("edificios_modelos").select("id, id_edificio").in("id", emIds) as any;
      if (!ems?.length) return m;
      const edIds = [...new Set(ems.map((e: any) => e.id_edificio).filter(Boolean))] as number[];
      if (!edIds.length) return m;
      const { data: eds } = await supabase.from("edificios").select("id, id_proyecto").in("id", edIds) as any;
      if (!eds?.length) return m;
      const pjIds = [...new Set(eds.map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
      const { data: pjs } = await supabase.from("proyectos").select("id, nombre").in("id", pjIds) as any;
      const pjMap = new Map<number, string>((pjs || []).map((p: any) => [p.id, p.nombre]));
      const edToP = new Map<number, number>(eds.map((e: any) => [e.id, e.id_proyecto]));
      const emToE = new Map<number, number>(ems.map((em: any) => [em.id, em.id_edificio]));
      props.forEach((p: any) => {
        const eId = emToE.get(p.id_edificio_modelo);
        const pjId = eId ? edToP.get(eId) : null;
        if (pjId) m.set(p.id, { id: pjId, nombre: pjMap.get(pjId) || `Proyecto ${pjId}` });
      });
      return m;
    },
    enabled: propIds.length > 0 && propMap.size > 0,
    staleTime: 5 * 60_000,
  });

  // 1. Offers per agent
  const offersPerAgent = useMemo(() => {
    const m = new Map<string, { name: string; ofertas: number; aprobadas: number }>();
    ofertas.forEach((o: any) => {
      const email = o.email_creador;
      if (!m.has(email)) m.set(email, { name: agentMap.get(email) || email, ofertas: 0, aprobadas: 0 });
      const r = m.get(email)!;
      r.ofertas++;
      if (o.id_estatus_aprobacion === 2) r.aprobadas++;
    });
    return Array.from(m.values()).sort((a, b) => b.ofertas - a.ofertas).slice(0, 10);
  }, [ofertas, agentMap]);

  // 2. Offers per project
  const offersPerProject = useMemo(() => {
    const m = new Map<number, { name: string; value: number }>();
    ofertas.forEach((o: any) => {
      const proj = propToProject.get(o.id_propiedad);
      if (!proj) return;
      if (!m.has(proj.id)) m.set(proj.id, { name: proj.nombre, value: 0 });
      m.get(proj.id)!.value++;
    });
    return Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [ofertas, propToProject]);

  // 3. Commissions monthly trend
  const commissionTrend = useMemo(() => {
    const m = new Map<string, number>();
    comisiones.forEach((c: any) => {
      const d = c.fecha_creacion?.slice(0, 7);
      if (!d) return;
      m.set(d, (m.get(d) || 0) + (Number(c.monto_comision) || 0));
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mes, monto]) => ({ mes, monto: Math.round(monto) }));
  }, [comisiones]);

  // 4. Conversion per agent
  const conversionData = useMemo(() => {
    const m = new Map<string, { name: string; total: number; aprobadas: number }>();
    ofertas.forEach((o: any) => {
      const email = o.email_creador;
      if (!m.has(email)) m.set(email, { name: agentMap.get(email) || email, total: 0, aprobadas: 0 });
      const r = m.get(email)!;
      r.total++;
      if (o.id_estatus_aprobacion === 2) r.aprobadas++;
    });
    return Array.from(m.values())
      .filter(r => r.total > 0)
      .map(r => ({ name: r.name, conversion: Math.round((r.aprobadas / r.total) * 100) }))
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 10);
  }, [ofertas, agentMap]);

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  const fmtShort = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return fmt(n);
  };

  const hasData = ofertas.length > 0 || comisiones.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {monthFilterLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <MonthMultiSelector value={selectedMonths} onChange={setSelectedMonths} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Strategic mini-metrics — always visible */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Conversión global", value: `${conversionGlobal.toFixed(1)}%`, icon: Percent },
          { label: "Ticket prom. Prop.", value: fmtShort(ticketPropiedades), icon: Home },
          { label: "Ticket prom. Prod.", value: fmtShort(ticketProductos), icon: BarChart3 },
          { label: "Comisión prom/agente", value: fmtShort(comisionPromAgente), icon: DollarSign },
          { label: "Tiempo prom. cierre", value: tiempoPromCierre > 0 ? `${tiempoPromCierre} días` : "— días", icon: Timer },
        ].map((m) => (
          <div key={m.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground truncate">{m.label}</p>
              <p className="text-sm font-bold">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aún no hay datos suficientes para generar reportes.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Offers per agent */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Ofertas por Agente</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={offersPerAgent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Legend />
                  <Bar dataKey="ofertas" fill="#3B82F6" name="Total" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="aprobadas" fill="#239E6C" name="Aprobadas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 2. Offers per project */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Ofertas por Proyecto</CardTitle></CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={offersPerProject} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                    {offersPerProject.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 3. Commission trend */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">Comisiones Mensuales</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={commissionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Line type="monotone" dataKey="monto" stroke="#239E6C" strokeWidth={2} dot={{ fill: "#239E6C", r: 4, strokeWidth: 2, stroke: "white" }} activeDot={{ r: 6 }} name="Monto" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 4. Conversion per agent */}
          <Card className="sozu-card">
            <CardHeader><CardTitle className="text-base">% Conversión por Agente</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={conversionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B7280" }} angle={-30} textAnchor="end" height={80} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }} />
                  <Bar dataKey="conversion" fill="#3B82F6" name="Conversión %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
