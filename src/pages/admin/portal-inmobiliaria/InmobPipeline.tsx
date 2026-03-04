import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, User, Building2, Calendar, DollarSign } from "lucide-react";
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
  agente_nombre?: string;
  precio?: number | null;
  estatus_disponibilidad?: number;
  cuenta_cobranza_id?: number;
  contrato_draft?: string | null;
  tiene_contrato_firmado?: boolean;
  stage?: string;
}

const STAGES = [
  { key: "nuevas", label: "Nuevas Ofertas", color: "bg-blue-100 text-blue-800" },
  { key: "pendientes", label: "Pendientes", color: "bg-yellow-100 text-yellow-800" },
  { key: "aprobadas", label: "Aprobadas", color: "bg-green-100 text-green-800" },
  { key: "rechazadas", label: "Rechazadas", color: "bg-red-100 text-red-800" },
  { key: "revision", label: "En Revisión", color: "bg-purple-100 text-purple-800" },
  { key: "apartado", label: "Apartado", color: "bg-orange-100 text-orange-800" },
  { key: "gen_contrato", label: "Gen. Contrato", color: "bg-indigo-100 text-indigo-800" },
  { key: "firma_contrato", label: "Firma Contrato", color: "bg-teal-100 text-teal-800" },
  { key: "cierre", label: "Cierre de Venta", color: "bg-emerald-100 text-emerald-800" },
];

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

const MIN_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
})();

export default function InmobPipeline() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

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

  // Fetch ofertas
  const { data: ofertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-pipeline-ofertas", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      const { data } = await supabase
        .from("ofertas")
        .select("id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad, id_producto, id_persona_lead")
        .in("email_creador", agentEmails)
        .eq("activo", true)
        .gte("fecha_generacion", MIN_DATE)
        .order("fecha_generacion", { ascending: false }) as any;
      if (!data) return [];

      // Enrich with property, project, lead data
      const propIds = [...new Set(data.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const leadIds = [...new Set(data.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];
      const ofertaIds = data.map((o: any) => o.id);

      const [propRes, leadRes, cuentaRes] = await Promise.all([
        propIds.length > 0
          ? (supabase.from("propiedades").select("id, numero_propiedad, precio_lista, id_estatus_disponibilidad, id_edificio_modelo").in("id", propIds) as any)
          : { data: [] },
        leadIds.length > 0
          ? (supabase.from("personas").select("id, nombre_legal, nombre_comercial").in("id", leadIds) as any)
          : { data: [] },
        ofertaIds.length > 0
          ? (supabase.from("cuentas_cobranza").select("id, id_oferta, contrato_draft").in("id_oferta", ofertaIds).eq("activo", true) as any)
          : { data: [] },
      ]);

      // Build maps
      const propMap = new Map<number, any>();
      (propRes.data || []).forEach((p: any) => propMap.set(p.id, p));

      const leadMap = new Map<number, string>();
      (leadRes.data || []).forEach((l: any) => leadMap.set(l.id, l.nombre_legal || l.nombre_comercial || "Sin nombre"));

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

      // Resolve projects
      const emIds = [...new Set((propRes.data || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
      const proyectoByProp = new Map<number, string>();
      if (emIds.length > 0) {
        const { data: ems } = await supabase.from("edificios_modelos").select("id, id_edificio").in("id", emIds) as any;
        const edIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))] as number[];
        if (edIds.length > 0) {
          const { data: eds } = await supabase.from("edificios").select("id, id_proyecto").in("id", edIds) as any;
          const projIds = [...new Set((eds || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
          if (projIds.length > 0) {
            const { data: projs } = await supabase.from("proyectos").select("id, nombre").in("id", projIds);
            const projMap = new Map<number, string>();
            (projs || []).forEach((p: any) => projMap.set(p.id, p.nombre));
            const edToPj = new Map<number, number>();
            (eds || []).forEach((e: any) => edToPj.set(e.id, e.id_proyecto));
            const emToPj = new Map<number, number>();
            (ems || []).forEach((em: any) => { const pj = edToPj.get(em.id_edificio); if (pj) emToPj.set(em.id, pj); });
            (propRes.data || []).forEach((p: any) => {
              const pjId = emToPj.get(p.id_edificio_modelo);
              if (pjId) proyectoByProp.set(p.id, projMap.get(pjId) || "");
            });
          }
        }
      }

      return data.map((o: any) => {
        const prop = o.id_propiedad ? propMap.get(o.id_propiedad) : null;
        const cuenta = cuentaMap.get(o.id);
        const card: PipelineCard = {
          ...o,
          lead_nombre: o.id_persona_lead ? leadMap.get(o.id_persona_lead) : undefined,
          propiedad_nombre: prop?.numero_propiedad || undefined,
          proyecto_nombre: o.id_propiedad ? proyectoByProp.get(o.id_propiedad) : undefined,
          agente_nombre: agentNameMap.get(o.email_creador),
          precio: prop?.precio_lista,
          estatus_disponibilidad: prop?.id_estatus_disponibilidad,
          cuenta_cobranza_id: cuenta?.id,
          contrato_draft: cuenta?.contrato_draft,
          tiene_contrato_firmado: cuenta ? firmadoSet.has(cuenta.id) : false,
        };
        card.stage = classifyOffer(card);
        return card;
      });
    },
    enabled: agentEmails.length > 0,
    staleTime: 2 * 60_000,
  });

  // Group by stage
  const stageMap = useMemo(() => {
    const m = new Map<string, PipelineCard[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    ofertas.forEach((o) => {
      if (o.stage && o.stage !== "expiradas") {
        const arr = m.get(o.stage);
        if (arr) arr.push(o);
      }
    });
    return m;
  }, [ofertas]);

  // Auto-collapse empty stages
  useEffect(() => {
    const empty = new Set<string>();
    STAGES.forEach((s) => {
      if ((stageMap.get(s.key)?.length || 0) === 0) empty.add(s.key);
    });
    setCollapsedStages(empty);
  }, [stageMap]);

  const toggleCollapse = (key: string) => {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Vista general de ofertas de tus agentes</p>
      </div>

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
              return (
                <div
                  key={stage.key}
                  className={cn(
                    "shrink-0 rounded-xl border border-border bg-muted/30 transition-all",
                    collapsed ? "w-12 cursor-pointer" : "w-72"
                  )}
                  onClick={collapsed ? () => toggleCollapse(stage.key) : undefined}
                >
                  {/* Header */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 border-b border-border cursor-pointer select-none",
                      collapsed && "flex-col py-4"
                    )}
                    onClick={!collapsed ? () => toggleCollapse(stage.key) : undefined}
                  >
                    {collapsed ? (
                      <>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                          {stage.label} ({cards.length})
                        </span>
                      </>
                    ) : (
                      <>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Badge className={cn("text-xs", stage.color)}>{stage.label}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{cards.length}</span>
                      </>
                    )}
                  </div>

                  {/* Cards */}
                  {!collapsed && (
                    <div className="p-2 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                      {cards.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Sin ofertas</p>
                      ) : (
                        cards.map((card) => (
                          <Card key={card.id} className="sozu-card">
                            <CardContent className="p-3 space-y-2">
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
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {card.id_producto ? "OP" : "O"}-{String(card.id).padStart(6, "0")}
                                </span>
                              </div>
                              {card.precio && (
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
                  )}
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
