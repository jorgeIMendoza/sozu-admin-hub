import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, Plus, User, Building2, DollarSign, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

const STAGES = [
  { key: 'all', label: 'Todas', borderColor: 'border-gray-400' },
  { key: 'nuevas', label: 'Nuevas', borderColor: 'border-blue-400' },
  { key: 'pendientes', label: 'Pendiente', borderColor: 'border-yellow-400' },
  { key: 'aprobadas', label: 'Aprobadas', borderColor: 'border-green-400' },
  { key: 'apartado', label: 'Apartado', borderColor: 'border-orange-400' },
  { key: 'gen_contrato', label: 'Contrato', borderColor: 'border-indigo-400' },
  { key: 'firma_contrato', label: 'Firma', borderColor: 'border-teal-400' },
  { key: 'cierre', label: 'Cierre', borderColor: 'border-emerald-500' },
] as const;

function isVigente(fechaGeneracion: string): boolean {
  const expira = new Date(fechaGeneracion);
  expira.setDate(expira.getDate() + 5);
  return expira >= new Date();
}

function classifyOffer(o: any): string {
  if (o.estatus_disponibilidad === 5) return 'cierre';
  if (o.tiene_contrato_firmado) return 'firma_contrato';
  if (o.contrato_draft) return 'gen_contrato';
  if (o.cuenta_cobranza_id && o.estatus_disponibilidad === 4) return 'apartado';

  const vigente = isVigente(o.fecha_generacion);
  if (!vigente && !o.cuenta_cobranza_id) return 'expiradas';

  if (!o.id_esquema_pago_seleccionado) return vigente ? 'nuevas' : 'expiradas';

  if (o.id_estatus_aprobacion === 1) return vigente ? 'pendientes' : 'expiradas';
  if (o.id_estatus_aprobacion === 2) return 'aprobadas';
  if (o.id_estatus_aprobacion === 3) return vigente ? 'rechazadas' : 'expiradas';
  if (o.id_estatus_aprobacion === 4) return vigente ? 'revision' : 'expiradas';

  return 'nuevas';
}

const AgentPipeline = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const agentEmail = user?.email || profile?.email;
  const [activeStage, setActiveStage] = useState<string>('all');
  const { permissions } = useAgentPortalPermissions();
  const pipelinePerms = permissions['/admin/agent/pipeline'];

  const { data: ofertas = [], isLoading } = useQuery({
    queryKey: ['agent-pipeline', agentEmail],
    queryFn: async () => {
      if (!agentEmail) return [];

      const minDate = new Date();
      minDate.setMonth(minDate.getMonth() - 3);

      const { data: ofertasData } = await (supabase as any)
        .from('ofertas')
        .select('id, email_creador, fecha_generacion, fecha_creacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, activo, id_propiedad, id_persona_lead, id_producto')
        .eq('email_creador', agentEmail)
        .eq('activo', true)
        .gte('fecha_generacion', minDate.toISOString().slice(0, 10))
        .order('fecha_generacion', { ascending: false });

      if (!ofertasData || ofertasData.length === 0) return [];

      // Enrich with property, lead, and cuenta data
      const propIds = [...new Set(ofertasData.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const leadIds = [...new Set(ofertasData.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];
      const ofertaIds = ofertasData.map((o: any) => o.id);

      const [propRes, leadRes, cuentaRes] = await Promise.all([
        propIds.length > 0
          ? (supabase as any).from('propiedades').select('id, numero_propiedad, precio_lista, id_estatus_disponibilidad, id_edificio_modelo').in('id', propIds)
          : { data: [] as any[] },
        leadIds.length > 0
          ? (supabase as any).from('personas').select('id, nombre_legal, nombre_comercial').in('id', leadIds)
          : { data: [] as any[] },
        ofertaIds.length > 0
          ? (supabase as any).from('cuentas_cobranza').select('id, id_oferta, contrato_draft').in('id_oferta', ofertaIds).eq('activo', true)
          : { data: [] as any[] },
      ]) as [{ data: any[] }, { data: any[] }, { data: any[] }];

      // Map edificio_modelo -> proyecto name
      const edModeloIds = [...new Set((propRes.data || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))];
      let propToProject = new Map<number, string>();

      if (edModeloIds.length > 0) {
        const { data: edModelos } = await (supabase as any)
          .from('edificios_modelos').select('id, id_edificio').in('id', edModeloIds);
        const edificioIds = [...new Set((edModelos || []).map((em: any) => em.id_edificio).filter(Boolean))];
        if (edificioIds.length > 0) {
          const { data: edificios } = await (supabase as any)
            .from('edificios').select('id, id_proyecto').in('id', edificioIds);
          const projIds = [...new Set((edificios || []).map((e: any) => e.id_proyecto).filter(Boolean))];
          if (projIds.length > 0) {
            const { data: projs } = await (supabase as any)
              .from('proyectos').select('id, nombre').in('id', projIds);
            const projMap = new Map((projs || []).map((p: any) => [p.id, p.nombre]));
            const edToProjId = new Map((edificios || []).map((e: any) => [e.id, e.id_proyecto]));
            const emToEdId = new Map((edModelos || []).map((em: any) => [em.id, em.id_edificio]));
            // prop.id_edificio_modelo -> edModelo.id_edificio -> edificio.id_proyecto -> proyecto.nombre
            (propRes.data || []).forEach((p: any) => {
              const edId = emToEdId.get(p.id_edificio_modelo);
              const projId = edId ? edToProjId.get(edId) : null;
              const projName = projId ? (projMap.get(projId) as string) : null;
              if (projName) propToProject.set(p.id, projName);
            });
          }
        }
      }

      // Check signed contracts
      const cuentaIds = (cuentaRes.data || []).map((c: any) => c.id);
      let signedSet = new Set<number>();
      if (cuentaIds.length > 0) {
        const { data: docs } = await (supabase as any)
          .from('documentos')
          .select('id_cuenta_cobranza')
          .in('id_cuenta_cobranza', cuentaIds)
          .eq('id_tipo_documento', 42)
          .eq('activo', true);
        (docs || []).forEach((d: any) => signedSet.add(d.id_cuenta_cobranza));
      }

      const propMap = new Map<number, any>((propRes.data || []).map((p: any) => [p.id, p]));
      const leadMap = new Map<number, string>((leadRes.data || []).map((l: any) => [l.id, l.nombre_legal || l.nombre_comercial || 'Sin nombre']));
      const cuentaByOferta = new Map<number, any>();
      (cuentaRes.data || []).forEach((c: any) => { if (c.id_oferta) cuentaByOferta.set(c.id_oferta, c); });

      return ofertasData.map((o: any) => {
        const prop = propMap.get(o.id_propiedad);
        const cuenta = cuentaByOferta.get(o.id);
        const enriched = {
          ...o,
          lead_nombre: leadMap.get(o.id_persona_lead) || 'Sin lead',
          propiedad_nombre: prop?.numero_propiedad || '',
          precio: prop?.precio_lista,
          proyecto_nombre: propToProject.get(o.id_propiedad) || '',
          estatus_disponibilidad: prop?.id_estatus_disponibilidad,
          cuenta_cobranza_id: cuenta?.id,
          contrato_draft: cuenta?.contrato_draft,
          tiene_contrato_firmado: cuenta ? signedSet.has(cuenta.id) : false,
        };
        enriched.stage = classifyOffer(enriched);
        return enriched;
      }).filter((o: any) => o.stage !== 'expiradas');
    },
    enabled: !!agentEmail,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    ofertas.forEach((o: any) => {
      if (!map[o.stage]) map[o.stage] = [];
      map[o.stage].push(o);
    });
    return map;
  }, [ofertas]);

  const displayOfertas = useMemo(() => {
    if (activeStage === 'all') return ofertas;
    return grouped[activeStage] || [];
  }, [ofertas, grouped, activeStage]);

  const totalMonto = useMemo(() => {
    return ofertas.reduce((sum: number, o: any) => sum + (o.precio || 0), 0);
  }, [ofertas]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);

  const getStageColor = (stage: string) => {
    const s = STAGES.find(s => s.key === stage);
    return s?.borderColor || 'border-gray-300';
  };

  const getStageBadgeLabel = (stage: string) => {
    switch (stage) {
      case 'nuevas': return 'Nueva';
      case 'pendientes': return 'Pendiente';
      case 'aprobadas': return 'Aprobada';
      case 'apartado': return 'Apartado';
      case 'gen_contrato': return 'Contrato';
      case 'firma_contrato': return 'Firma';
      case 'cierre': return 'Cerrada';
      default: return stage;
    }
  };

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">Pipeline</h1>
          {pipelinePerms.canUpdate && (
            <button
              onClick={() => navigate('/admin/agent/inventario')}
              className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--agent-primary))] active:opacity-70"
            >
              <Plus className="h-4 w-4" />
              Nueva oferta
            </button>
          )}
        </div>
        {!isLoading && (
          <p className="text-xs text-[hsl(var(--agent-text-secondary))] mt-1">
            {ofertas.length} ofertas · {formatCurrency(totalMonto)} en proceso
          </p>
        )}
      </div>

      {/* Stage Filters */}
      <ScrollArea className="w-full px-4 pb-3">
        <div className="flex gap-2 py-1">
          {STAGES.map(stage => {
            const count = stage.key === 'all' ? ofertas.length : (grouped[stage.key]?.length || 0);
            const isActive = activeStage === stage.key;
            return (
              <button
                key={stage.key}
                onClick={() => setActiveStage(stage.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  isActive
                    ? "bg-[hsl(var(--agent-primary))] text-white border-[hsl(var(--agent-primary))]"
                    : "bg-white text-[hsl(var(--agent-text-secondary))] border-gray-200"
                )}
              >
                {stage.label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Offer Cards */}
      <div className="px-4 space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-muted))]" />
          </div>
        ) : displayOfertas.length === 0 ? (
          <div className="text-center py-12 text-sm text-[hsl(var(--agent-text-secondary))]">
            No hay ofertas en esta etapa
          </div>
        ) : (
          displayOfertas.map((oferta: any) => (
            <OfertaCard
              key={oferta.id}
              oferta={oferta}
              formatCurrency={formatCurrency}
              getStageColor={getStageColor}
              getStageBadgeLabel={getStageBadgeLabel}
            />
          ))
        )}
      </div>
    </div>
  );
};

function OfertaCard({ oferta, formatCurrency, getStageColor, getStageBadgeLabel }: {
  oferta: any;
  formatCurrency: (v: number) => string;
  getStageColor: (s: string) => string;
  getStageBadgeLabel: (s: string) => string;
}) {
  const days = differenceInDays(new Date(), new Date(oferta.fecha_generacion));

  return (
    <div className={cn("rounded-xl bg-white border-l-4 border border-gray-100 shadow-sm p-3.5", getStageColor(oferta.stage))}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Lead name */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[hsl(var(--agent-text))] truncate">{oferta.lead_nombre}</p>
              {oferta.proyecto_nombre && (
                <p className="text-[11px] text-[hsl(var(--agent-text-secondary))] truncate">
                  {oferta.proyecto_nombre} {oferta.propiedad_nombre ? `· Unidad ${oferta.propiedad_nombre}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Amount & Days */}
          <div className="flex items-center gap-3">
            {oferta.precio && (
              <span className="text-xs font-semibold text-[hsl(var(--agent-text))]">
                {formatCurrency(oferta.precio)}
              </span>
            )}
            <span className="text-[10px] text-[hsl(var(--agent-text-secondary))] flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {days}d
            </span>
          </div>
        </div>

        {/* Stage badge */}
        <Badge variant="outline" className="text-[10px] shrink-0">
          {getStageBadgeLabel(oferta.stage)}
        </Badge>
      </div>
    </div>
  );
}

export default AgentPipeline;
