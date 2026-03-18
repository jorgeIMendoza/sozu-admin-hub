import { useState, useMemo, useEffect } from "react";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, Plus, User, Clock, Building2, Calendar, FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { PipelineOfferDetailDialog } from "@/components/admin/agent-portal/PipelineOfferDetailDialog";

const STAGES = [
  { key: 'all', label: 'Todas', color: 'bg-gray-100 text-gray-800', borderColor: 'border-gray-400' },
  { key: 'nuevas', label: 'Nuevas', color: 'bg-blue-100 text-blue-800', borderColor: 'border-blue-400' },
  { key: 'pendientes', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', borderColor: 'border-yellow-400' },
  { key: 'aprobadas', label: 'Aprobadas', color: 'bg-green-100 text-green-800', borderColor: 'border-green-400' },
  { key: 'rechazadas', label: 'Rechazadas', color: 'bg-red-100 text-red-800', borderColor: 'border-red-400' },
  { key: 'revision', label: 'Revisión', color: 'bg-purple-100 text-purple-800', borderColor: 'border-purple-400' },
  { key: 'apartado', label: 'Apartado', color: 'bg-orange-100 text-orange-800', borderColor: 'border-orange-400' },
  { key: 'gen_contrato', label: 'Contrato', color: 'bg-indigo-100 text-indigo-800', borderColor: 'border-indigo-400' },
  { key: 'firma_contrato', label: 'Firma', color: 'bg-teal-100 text-teal-800', borderColor: 'border-teal-400' },
  { key: 'cierre', label: 'Cierre', color: 'bg-emerald-100 text-emerald-800', borderColor: 'border-emerald-500' },
  { key: 'expiradas', label: 'Expiradas', color: 'bg-gray-100 text-gray-500', borderColor: 'border-gray-300' },
] as const;

// Same MIN_DATE as WorkflowOfertas: 1 month
const MIN_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
})();

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
  const { impersonatedAgentEmail, isImpersonating } = useAgentImpersonation();
  const navigate = useNavigate();
  const agentEmail = isImpersonating ? impersonatedAgentEmail : (user?.email || profile?.email);
  const [activeStage, setActiveStage] = useState<string>('all');
  const [selectedOferta, setSelectedOferta] = useState<any>(null);
  const { permissions } = useAgentPortalPermissions();
  const pipelinePerms = permissions['/admin/agent/pipeline'];
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/pipeline');
    track({ page: 'agent_pipeline', elementId: 'page_view', elementType: 'page' });
  }, []);

  const { data: ofertas = [], isLoading } = useQuery({
    queryKey: ['agent-pipeline', agentEmail],
    queryFn: async () => {
      if (!agentEmail) return [];

      const { data: ofertasData } = await (supabase as any)
        .from('ofertas')
        .select('id, email_creador, fecha_generacion, fecha_creacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, activo, id_propiedad, id_persona_lead, id_producto')
        .eq('email_creador', agentEmail)
        .eq('activo', true)
        .gte('fecha_generacion', MIN_DATE)
        .order('fecha_generacion', { ascending: false });

      if (!ofertasData || ofertasData.length === 0) return [];

      const propIds = [...new Set(ofertasData.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const leadIds = [...new Set(ofertasData.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];
      const productoIds = [...new Set(ofertasData.map((o: any) => o.id_producto).filter(Boolean))] as number[];
      const ofertaIds = ofertasData.map((o: any) => o.id);

      const [propRes, leadRes, cuentaRes, productosRes] = await Promise.all([
        propIds.length > 0
          ? (supabase as any).from('propiedades').select('id, numero_propiedad, precio_lista, id_estatus_disponibilidad, id_edificio_modelo').in('id', propIds)
          : { data: [] as any[] },
        leadIds.length > 0
          ? (supabase as any).from('personas').select('id, nombre_legal, nombre_comercial').in('id', leadIds)
          : { data: [] as any[] },
        ofertaIds.length > 0
          ? (supabase as any).from('cuentas_cobranza').select('id, id_oferta, contrato_draft').in('id_oferta', ofertaIds).eq('activo', true)
          : { data: [] as any[] },
        productoIds.length > 0
          ? (supabase as any).from('productos_servicios').select('id, nombre, precio_lista, id_proyecto').in('id', productoIds)
          : { data: [] as any[] },
      ]) as [{ data: any[] }, { data: any[] }, { data: any[] }, { data: any[] }];

      // Build proyecto map from propiedades (edificios_modelos -> edificios -> proyectos)
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
            (propRes.data || []).forEach((p: any) => {
              const edId = emToEdId.get(p.id_edificio_modelo);
              const projId = edId ? edToProjId.get(edId) : null;
              const projName = projId ? (projMap.get(projId) as string) : null;
              if (projName) propToProject.set(p.id, projName);
            });
          }
        }
      }

      // Also get project names for productos
      const productoProjIds = [...new Set((productosRes.data || []).map((p: any) => p.id_proyecto).filter(Boolean))] as number[];
      let productoToProject = new Map<number, string>();
      if (productoProjIds.length > 0) {
        const { data: projs } = await (supabase as any)
          .from('proyectos').select('id, nombre').in('id', productoProjIds);
        (projs || []).forEach((p: any) => productoToProject.set(p.id, p.nombre));
      }

      // Check for signed contracts
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

      // Get inmobiliaria for the agent
      let inmobiliariaNombre = '';
      const { data: usrData } = await (supabase as any)
        .from('usuarios').select('id_persona').eq('email', agentEmail).eq('activo', true).limit(1);
      if (usrData && usrData[0]?.id_persona) {
        const agentPersonaId = usrData[0].id_persona;
        const { data: erData } = await (supabase as any)
          .from('entidades_relacionadas')
          .select('id_persona_duena_lead')
          .eq('id_persona', agentPersonaId)
          .eq('id_tipo_entidad', 19)
          .eq('activo', true)
          .limit(1);
        if (erData && erData[0]?.id_persona_duena_lead) {
          const { data: inmobPersona } = await (supabase as any)
            .from('personas').select('nombre_comercial, nombre_legal').eq('id', erData[0].id_persona_duena_lead).limit(1);
          inmobiliariaNombre = inmobPersona?.[0]?.nombre_comercial || inmobPersona?.[0]?.nombre_legal || '';
        }
      }

      const propMap = new Map<number, any>((propRes.data || []).map((p: any) => [p.id, p]));
      const leadMap = new Map<number, string>((leadRes.data || []).map((l: any) => [l.id, l.nombre_legal || l.nombre_comercial || 'Sin nombre']));
      const productoMap = new Map<number, any>((productosRes.data || []).map((p: any) => [p.id, p]));
      const cuentaByOferta = new Map<number, any>();
      (cuentaRes.data || []).forEach((c: any) => { if (c.id_oferta) cuentaByOferta.set(c.id_oferta, c); });

      return ofertasData.map((o: any) => {
        const prop = propMap.get(o.id_propiedad);
        const producto = o.id_producto ? productoMap.get(o.id_producto) : null;
        const cuenta = cuentaByOferta.get(o.id);
        const isProducto = !!o.id_producto;
        const proyectoNombre = isProducto
          ? (producto?.id_proyecto ? productoToProject.get(producto.id_proyecto) || '' : '')
          : (propToProject.get(o.id_propiedad) || '');

        const enriched = {
          ...o,
          lead_nombre: leadMap.get(o.id_persona_lead) || 'Sin prospecto',
          propiedad_nombre: prop?.numero_propiedad || '',
          producto_nombre: producto?.nombre || '',
          precio: isProducto ? (producto?.precio_lista || null) : (prop?.precio_lista || null),
          proyecto_nombre: proyectoNombre,
          inmobiliaria_nombre: inmobiliariaNombre || 'Interno',
          estatus_disponibilidad: prop?.id_estatus_disponibilidad,
          cuenta_cobranza_id: cuenta?.id,
          contrato_draft: cuenta?.contrato_draft,
          tiene_contrato_firmado: cuenta ? signedSet.has(cuenta.id) : false,
          is_producto: isProducto,
        };
        enriched.stage = classifyOffer(enriched);
        return enriched;
      });
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

  const nonExpiredOfertas = useMemo(() => ofertas.filter((o: any) => o.stage !== 'expiradas'), [ofertas]);

  const displayOfertas = useMemo(() => {
    if (activeStage === 'all') return nonExpiredOfertas;
    return grouped[activeStage] || [];
  }, [nonExpiredOfertas, grouped, activeStage]);

  const totalMonto = useMemo(() => {
    return nonExpiredOfertas.reduce((sum: number, o: any) => sum + (o.precio || 0), 0);
  }, [nonExpiredOfertas]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(v);

  const getStageInfo = (stage: string) => {
    return STAGES.find(s => s.key === stage) || STAGES[0];
  };

  return (
    <div className="pb-24">
      <AgentPortalHeader showAgentName>
        {pipelinePerms.canCreate && (
          <div className="flex items-center justify-end -mt-2">
            <button
              onClick={() => {
                track({ page: 'agent_pipeline', elementId: 'btn_nueva_oferta', elementLabel: 'Nueva oferta' });
                navigate('/admin/agent/inventario/unidades?openFilters=true');
              }}
              className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--agent-primary))] active:opacity-70"
            >
              <Plus className="h-4 w-4" />
              Nueva oferta
            </button>
          </div>
        )}
        {!isLoading && (
          <>
            <p className="text-xs text-[hsl(var(--agent-text-secondary))]">
              {nonExpiredOfertas.length} ofertas · {formatCurrency(totalMonto)} en proceso
            </p>
            <p className="text-[10px] text-[hsl(var(--agent-muted))]">Últimos 30 días</p>
          </>
        )}
      </AgentPortalHeader>

      {/* Stage Filters */}
      <ScrollArea className="w-full px-4 pb-3">
        <div className="flex gap-2 py-1">
          {STAGES.map(stage => {
            const count = stage.key === 'all' ? nonExpiredOfertas.length : (grouped[stage.key]?.length || 0);
            const isActive = activeStage === stage.key;
            if (stage.key !== 'all' && count === 0) return null;
            return (
              <button
                key={stage.key}
                onClick={() => {
                  track({ page: 'agent_pipeline', elementId: 'btn_filtro_etapa', elementLabel: stage.label, metadata: { etapa: stage.key } });
                  setActiveStage(stage.key);
                }}
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
              getStageInfo={getStageInfo}
              onClick={() => setSelectedOferta(oferta)}
            />
          ))
        )}
      </div>

      {selectedOferta && (
        <PipelineOfferDetailDialog
          open={!!selectedOferta}
          onOpenChange={(v) => { if (!v) setSelectedOferta(null); }}
          oferta={selectedOferta}
          formatCurrency={formatCurrency}
          stageInfo={getStageInfo(selectedOferta.stage)}
        />
      )}
    </div>
  );
};

function OfertaCard({ oferta, formatCurrency, getStageInfo, onClick }: {
  oferta: any;
  formatCurrency: (v: number) => string;
  getStageInfo: (s: string) => { key: string; label: string; color: string; borderColor: string };
  onClick?: () => void;
}) {
  const stageInfo = getStageInfo(oferta.stage);
  const ofertaLabel = oferta.is_producto
    ? `OP-${String(oferta.id).padStart(6, '0')}`
    : `O-${String(oferta.id).padStart(6, '0')}`;

  const unitLabel = oferta.is_producto
    ? `${oferta.producto_nombre || 'Producto'} (${oferta.propiedad_nombre})`
    : (oferta.proyecto_nombre
      ? `${oferta.proyecto_nombre} - ${oferta.propiedad_nombre}`
      : oferta.propiedad_nombre);

  const cuentaTipo = oferta.is_producto ? 'Producto' : 'Propiedad';

  return (
    <div onClick={onClick} className={cn("rounded-xl bg-white border-l-4 border border-gray-100 shadow-sm p-3.5 cursor-pointer active:scale-[0.98] transition-transform", stageInfo.borderColor)}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[hsl(var(--agent-text-secondary))] font-mono">
            Oferta: {ofertaLabel}
          </span>
          <Badge className={cn("text-[10px] shrink-0 border-0", stageInfo.color)}>
            {stageInfo.label}
          </Badge>
        </div>

        <p className="text-sm font-medium text-[hsl(var(--agent-text))] truncate">
          {unitLabel}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--agent-text-secondary))]">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{oferta.lead_nombre}</span>
        </div>

        {oferta.inmobiliaria_nombre && (
          <div className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3 w-3 shrink-0 text-[hsl(var(--agent-text-secondary))]" />
            <span className={cn("truncate font-medium", oferta.inmobiliaria_nombre === 'Interno' ? 'text-orange-600' : 'text-[hsl(var(--agent-primary))]')}>
              {oferta.inmobiliaria_nombre}
            </span>
          </div>
        )}

        {oferta.cuenta_cobranza_id && (
          <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--agent-text-secondary))]">
            <FileText className="h-3 w-3 shrink-0" />
            <span>{formatCuentaCobranzaId(oferta.cuenta_cobranza_id, cuentaTipo as any)}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {oferta.precio != null && oferta.precio > 0 && (
            <span className="text-xs font-semibold text-[hsl(var(--agent-text))]">
              {formatCurrency(oferta.precio)}
            </span>
          )}
          <span className="text-[10px] text-[hsl(var(--agent-text-secondary))] flex items-center gap-0.5 ml-auto">
            <Calendar className="h-3 w-3" />
            {format(new Date(oferta.fecha_generacion), 'dd MMM yyyy', { locale: es })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default AgentPipeline;
