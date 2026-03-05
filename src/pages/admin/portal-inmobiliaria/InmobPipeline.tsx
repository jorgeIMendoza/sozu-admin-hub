import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { ChevronLeft, ChevronRight, User, Building2, Calendar, DollarSign, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface PipelineCard {
  id: number;
  email_creador: string;
  fecha_generacion: string;
  id_esquema_pago_seleccionado: number | null;
  id_estatus_aprobacion: number | null;
  id_propiedad: number | null;
  id_producto: number | null;
  id_persona_lead: number | null;
  lead_nombre?: string;
  propiedad_nombre?: string;
  proyecto_nombre?: string;
  proyecto_id?: number;
  agente_nombre?: string;
  precio?: number | null;
  estatus_disponibilidad?: number;
  cuenta_cobranza_id?: number;
  contrato_draft?: string | null;
  tiene_contrato_firmado?: boolean;
  stage?: string;
}

const STAGES = [
  { key: "expiradas", label: "Expiradas", color: "bg-muted text-muted-foreground" },
  { key: "nuevas", label: "Nuevas Ofertas", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { key: "pendientes", label: "Pendientes de Aprobación", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { key: "aprobadas", label: "Aprobadas", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { key: "rechazadas", label: "Rechazadas", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { key: "revision", label: "En Revisión", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { key: "apartado", label: "Apartado", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { key: "gen_contrato", label: "Generación de Contrato", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { key: "firma_contrato", label: "Firma de Contrato", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { key: "cierre", label: "Cierre de Venta", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
];

const RECENT_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
})();

function isVigente(fechaGeneracion: string): boolean {
  const fecha = new Date(fechaGeneracion);
  const expira = new Date(fecha);
  expira.setDate(expira.getDate() + 5);
  return expira >= new Date();
}

function classifyOffer(o: PipelineCard): string {
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

async function enrichOfertas(data: any[], agentNameMap: Map<string, string>) {
  if (!data.length) return [];

  const propIds = [...new Set(data.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
  const leadIds = [...new Set(data.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];
  const productoIds = [...new Set(data.map((o: any) => o.id_producto).filter(Boolean))] as number[];
  const ofertaIds = data.map((o: any) => o.id);

  const [propRes, leadRes, cuentaRes, productosRes] = await Promise.all([
    propIds.length > 0
      ? (supabase.from("propiedades").select("id, numero_propiedad, precio_lista, id_estatus_disponibilidad, id_edificio_modelo").in("id", propIds) as any)
      : { data: [] },
    leadIds.length > 0
      ? (supabase.from("personas").select("id, nombre_legal, nombre_comercial").in("id", leadIds) as any)
      : { data: [] },
    ofertaIds.length > 0
      ? (supabase.from("cuentas_cobranza").select("id, id_oferta, contrato_draft").in("id_oferta", ofertaIds).eq("activo", true) as any)
      : { data: [] },
    productoIds.length > 0
      ? (supabase.from("productos_servicios").select("id, nombre, precio_lista, id_proyecto").in("id", productoIds) as any)
      : { data: [] },
  ]);

  const propMap = new Map<number, any>();
  (propRes.data || []).forEach((p: any) => propMap.set(p.id, p));

  const leadMap = new Map<number, string>();
  (leadRes.data || []).forEach((l: any) => leadMap.set(l.id, l.nombre_legal || l.nombre_comercial || "Sin nombre"));

  const productoMap = new Map<number, any>();
  (productosRes.data || []).forEach((p: any) => productoMap.set(p.id, p));

  const cuentaMap = new Map<number, any>();
  (cuentaRes.data || []).forEach((c: any) => { if (c.id_oferta) cuentaMap.set(c.id_oferta, c); });

  // Check signed contracts
  const cuentaIds = (cuentaRes.data || []).map((c: any) => c.id);
  const firmadoSet = new Set<number>();
  if (cuentaIds.length > 0) {
    const { data: docs } = await supabase
      .from("documentos")
      .select("id_cuenta_cobranza")
      .in("id_cuenta_cobranza", cuentaIds)
      .eq("id_tipo_documento", 42)
      .eq("activo", true) as any;
    (docs || []).forEach((d: any) => firmadoSet.add(d.id_cuenta_cobranza));
  }

  // Resolve projects from propiedades
  const emIds = [...new Set((propRes.data || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
  const proyectoByProp = new Map<number, { id: number; nombre: string }>();
  if (emIds.length > 0) {
    const { data: ems } = await supabase.from("edificios_modelos").select("id, id_edificio").in("id", emIds) as any;
    const edIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))] as number[];
    if (edIds.length > 0) {
      const { data: eds } = await supabase.from("edificios").select("id, id_proyecto").in("id", edIds) as any;
      const projIds = [...new Set((eds || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
      if (projIds.length > 0) {
        const { data: projs } = await supabase.from("proyectos").select("id, nombre").in("id", projIds);
        const projMap = new Map<number, { id: number; nombre: string }>();
        (projs || []).forEach((p: any) => projMap.set(p.id, { id: p.id, nombre: p.nombre }));
        const edToPj = new Map<number, number>();
        (eds || []).forEach((e: any) => edToPj.set(e.id, e.id_proyecto));
        const emToPj = new Map<number, number>();
        (ems || []).forEach((em: any) => { const pj = edToPj.get(em.id_edificio); if (pj) emToPj.set(em.id, pj); });
        (propRes.data || []).forEach((p: any) => {
          const pjId = emToPj.get(p.id_edificio_modelo);
          if (pjId) {
            const proj = projMap.get(pjId);
            if (proj) proyectoByProp.set(p.id, proj);
          }
        });
      }
    }
  }

  // Resolve projects from productos
  const productoProjIds = [...new Set((productosRes.data || []).map((p: any) => p.id_proyecto).filter(Boolean))] as number[];
  const productoProyMap = new Map<number, { id: number; nombre: string }>();
  if (productoProjIds.length > 0) {
    const { data: projs } = await supabase.from("proyectos").select("id, nombre").in("id", productoProjIds);
    (projs || []).forEach((p: any) => productoProyMap.set(p.id, { id: p.id, nombre: p.nombre }));
  }

  return data.map((o: any) => {
    const prop = o.id_propiedad ? propMap.get(o.id_propiedad) : null;
    const producto = o.id_producto ? productoMap.get(o.id_producto) : null;
    const cuenta = cuentaMap.get(o.id);
    const isProducto = !!o.id_producto;

    const projInfo = isProducto
      ? (producto?.id_proyecto ? productoProyMap.get(producto.id_proyecto) : null)
      : (o.id_propiedad ? proyectoByProp.get(o.id_propiedad) : null);

    const card: PipelineCard = {
      ...o,
      lead_nombre: o.id_persona_lead ? leadMap.get(o.id_persona_lead) : undefined,
      propiedad_nombre: prop?.numero_propiedad || (producto?.nombre) || undefined,
      proyecto_nombre: projInfo?.nombre || undefined,
      proyecto_id: projInfo?.id || undefined,
      agente_nombre: agentNameMap.get(o.email_creador),
      precio: isProducto ? (producto?.precio_lista || null) : (prop?.precio_lista || null),
      estatus_disponibilidad: prop?.id_estatus_disponibilidad,
      cuenta_cobranza_id: cuenta?.id,
      contrato_draft: cuenta?.contrato_draft,
      tiene_contrato_firmado: cuenta ? firmadoSet.has(cuenta.id) : false,
    };
    card.stage = classifyOffer(card);
    return card;
  });
}

export default function InmobPipeline() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(["expiradas"]));
  const [manuallyToggled, setManuallyToggled] = useState<Set<string>>(new Set());

  // Filters
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([]);
  const [selectedProyectos, setSelectedProyectos] = useState<string[]>([]);
  const [selectedTipoOferta, setSelectedTipoOferta] = useState<string>("all");

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/pipeline");
    track({ page: "inmob_pipeline", elementId: "page_view", elementType: "page" });
  }, []);

  const agentEmails = useMemo(() => agents.map((a) => a.email), [agents]);
  const agentNameMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  // Two-query approach: recent offers + advanced offers (no date limit)
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-pipeline-ofertas", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];

      const recentQuery = supabase
        .from("ofertas")
        .select("id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad, id_producto, id_persona_lead")
        .in("email_creador", agentEmails)
        .eq("activo", true)
        .gte("fecha_generacion", RECENT_DATE)
        .order("fecha_generacion", { ascending: false });

      const advancedQuery = supabase
        .from("ofertas")
        .select("id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad, id_producto, id_persona_lead")
        .in("email_creador", agentEmails)
        .eq("activo", true)
        .lt("fecha_generacion", RECENT_DATE)
        .order("fecha_generacion", { ascending: false });

      const [recentRes, advancedRes] = await Promise.all([
        recentQuery as any,
        advancedQuery as any,
      ]);

      const recentData = recentRes.data || [];
      const olderData = advancedRes.data || [];

      let advancedFiltered: any[] = [];
      if (olderData.length > 0) {
        const olderIds = olderData.map((o: any) => o.id);
        const { data: cuentas } = await supabase
          .from("cuentas_cobranza")
          .select("id_oferta")
          .in("id_oferta", olderIds)
          .eq("activo", true) as any;
        const ofertaIdsWithCuenta = new Set((cuentas || []).map((c: any) => c.id_oferta));
        advancedFiltered = olderData.filter((o: any) => ofertaIdsWithCuenta.has(o.id));
      }

      const allData = [...recentData, ...advancedFiltered];
      const seenIds = new Set<number>();
      const deduped = allData.filter((o: any) => {
        if (seenIds.has(o.id)) return false;
        seenIds.add(o.id);
        return true;
      });

      return enrichOfertas(deduped, agentNameMap);
    },
    enabled: agentEmails.length > 0,
    staleTime: 2 * 60_000,
  });

  // Derive available projects from offers
  const availableProyectos = useMemo(() => {
    const m = new Map<number, string>();
    ofertas.forEach((o) => {
      if (o.proyecto_id && o.proyecto_nombre) m.set(o.proyecto_id, o.proyecto_nombre);
    });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [ofertas]);

  // Filter offers
  const filteredOfertas = useMemo(() => {
    let result = ofertas;
    if (selectedAgentes.length > 0) {
      result = result.filter((o) => selectedAgentes.includes(o.email_creador));
    }
    if (selectedProyectos.length > 0) {
      const projIds = selectedProyectos.map(Number);
      result = result.filter((o) => o.proyecto_id && projIds.includes(o.proyecto_id));
    }
    if (selectedTipoOferta === "propiedad") {
      result = result.filter((o) => !o.id_producto);
    } else if (selectedTipoOferta === "producto") {
      result = result.filter((o) => !!o.id_producto);
    }
    return result;
  }, [ofertas, selectedAgentes, selectedProyectos, selectedTipoOferta]);

  // Group by stage with cierre deduplication
  const stageMap = useMemo(() => {
    const m = new Map<string, PipelineCard[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    filteredOfertas.forEach((o) => {
      if (o.stage) {
        const arr = m.get(o.stage);
        if (arr) arr.push(o);
      }
    });

    const cierre = m.get("cierre") || [];
    if (cierre.length > 0) {
      const seen = new Set<string>();
      m.set("cierre", cierre
        .filter(o => !!o.cuenta_cobranza_id)
        .filter(o => {
          const key = o.id_producto
            ? `prod-${o.id_producto}-${o.id_propiedad || "none"}`
            : `prop-${o.id_propiedad}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
    }

    return m;
  }, [filteredOfertas]);

  // Auto-collapse empty stages
  useEffect(() => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      STAGES.forEach((stage) => {
        if (manuallyToggled.has(stage.key)) return;
        const count = stageMap.get(stage.key)?.length || 0;
        if (count === 0) next.add(stage.key);
        else if (stage.key !== "expiradas") next.delete(stage.key);
      });
      return next;
    });
  }, [stageMap, manuallyToggled]);

  const toggleCollapse = (key: string) => {
    setManuallyToggled((prev) => new Set(prev).add(key));
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isLoading = agentsLoading || ofertasLoading;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

  // Filter helpers
  const agenteOptions = agents.map((a) => a.nombre || a.email);
  const agenteNameToEmail = new Map<string, string>();
  agents.forEach((a) => agenteNameToEmail.set(a.nombre || a.email, a.email));
  const selectedAgenteNames = selectedAgentes.map((email) => agents.find((a) => a.email === email)?.nombre || email);

  const proyectoOptions = availableProyectos.map((p) => p.nombre);
  const proyNameToId = new Map<string, string>();
  availableProyectos.forEach((p) => proyNameToId.set(p.nombre, String(p.id)));
  const selectedProyNames = selectedProyectos.map((id) => availableProyectos.find((p) => String(p.id) === id)?.nombre || id);

  const hasActiveFilters = selectedAgentes.length > 0 || selectedProyectos.length > 0 || selectedTipoOferta !== "all";

  const clearAllFilters = () => {
    setSelectedAgentes([]);
    setSelectedProyectos([]);
    setSelectedTipoOferta("all");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Vista general de ofertas de tus agentes</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {agents.length > 0 && (
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Agentes</label>
                <MultiSelectFilter
                  options={agenteOptions}
                  values={selectedAgenteNames}
                  onValuesChange={(names) => {
                    const emails = names.map((n) => agenteNameToEmail.get(n) || n);
                    setSelectedAgentes(emails);
                  }}
                  placeholder="Todos los agentes"
                />
              </div>
            )}

            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Proyectos</label>
              {availableProyectos.length <= 1 ? (
                <Select value={availableProyectos[0] ? String(availableProyectos[0].id) : ""} disabled>
                  <SelectTrigger><SelectValue placeholder={availableProyectos[0]?.nombre || "Sin proyectos"} /></SelectTrigger>
                  <SelectContent>{availableProyectos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <MultiSelectFilter
                  options={proyectoOptions}
                  values={selectedProyNames}
                  onValuesChange={(names) => {
                    const ids = names.map((n) => proyNameToId.get(n) || n);
                    setSelectedProyectos(ids);
                  }}
                  placeholder="Todos los proyectos"
                />
              )}
            </div>

            <div className="min-w-[160px]">
              <label className="text-sm font-medium mb-1 block">Tipo de Oferta</label>
              <Select value={selectedTipoOferta} onValueChange={setSelectedTipoOferta}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="propiedad">Propiedades</SelectItem>
                  <SelectItem value="producto">Productos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-10">
                <X className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
        </div>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {STAGES.map((stage) => {
              const cards = stageMap.get(stage.key) || [];
              const collapsed = collapsedStages.has(stage.key);

              if (collapsed) {
                return (
                  <div key={stage.key} className="min-w-[48px]">
                    <button
                      className={cn(
                        "h-full min-h-[200px] w-12 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:opacity-80",
                        stage.color
                      )}
                      onClick={() => toggleCollapse(stage.key)}
                      title={`Mostrar ${stage.label}`}
                    >
                      <ChevronRight className="h-4 w-4 shrink-0" />
                      <span className="[writing-mode:vertical-lr] text-xs font-semibold whitespace-nowrap">{stage.label}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{cards.length}</Badge>
                    </button>
                  </div>
                );
              }

              return (
                <div key={stage.key} className="min-w-[300px] max-w-[300px]">
                  <div className={cn("rounded-t-lg px-3 py-2 flex items-center justify-between", stage.color)}>
                    <span className="font-semibold text-sm">{stage.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleCollapse(stage.key)} title="Contraer columna">
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto">
                    {cards.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Sin ofertas</p>
                    ) : (
                      cards.map((card) => (
                        <Card key={card.id} className="sozu-card">
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  {card.lead_nombre || "Sin cliente"}
                                </p>
                                {card.proyecto_nombre && (
                                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                    <Building2 className="h-3 w-3 shrink-0" />
                                    {card.proyecto_nombre} · {card.propiedad_nombre || "—"}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                {card.id_producto ? "OP" : "O"}-{String(card.id).padStart(6, "0")}
                              </span>
                            </div>
                            {card.precio != null && card.precio > 0 && (
                              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                                {formatCurrency(card.precio)}
                              </p>
                            )}
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="truncate max-w-[60%]">{card.agente_nombre || card.email_creador}</span>
                              <span className="flex items-center gap-0.5">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(card.fecha_generacion), "dd MMM", { locale: es })}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
