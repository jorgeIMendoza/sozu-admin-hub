import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, CheckCircle2, AlertCircle, DollarSign, Clock, FileText, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";

type TabKey = 'todas' | 'pendiente' | 'en_revision' | 'factura_requerida' | 'programada' | 'pagada';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'factura_requerida', label: 'Factura requerida' },
  { key: 'programada', label: 'Programada' },
  { key: 'pagada', label: 'Pagada' },
];

const AgentComisiones = () => {
  const { profile, user } = useAuth();
  const { impersonatedAgentEmail, impersonatedAgentPersonaId, isImpersonating } = useAgentImpersonation();
  const navigate = useNavigate();
  const personaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const agentEmail = isImpersonating ? impersonatedAgentEmail : (user?.email || profile?.email);
  const isAgentRole = profile?.rol_nombre === 'Agente Inmobiliario';
  const { steps, percentage, isLoading: onboardingLoading, canAccessComisiones, missingForComisiones } = useAgentOnboardingStatus(personaId);
  const [activeTab, setActiveTab] = useState<TabKey>('todas');
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/comisiones');
    track({ page: 'agent_comisiones', elementId: 'page_view', elementType: 'page' });
  }, []);

  // Use the centralized canAccessComisiones from the hook
  const canReceivePayments = canAccessComisiones;

  // Fetch comisiones with property status and factura info
  const { data: comisiones = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ['agent-comisiones', agentEmail],
    queryFn: async () => {
      if (!agentEmail) return [];

      const { data: comisionistas } = await (supabase as any)
        .from('comisionistas')
        .select('id_cuenta_cobranza, porcentaje_comision, aprobada, pagada, fecha_creacion, url_evidencia_pago')
        .eq('email_usuario', agentEmail)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });

      if (!comisionistas || comisionistas.length === 0) return [];

      const cuentaIds = [...new Set(comisionistas.map((c: any) => c.id_cuenta_cobranza).filter(Boolean))] as number[];
      const cuentaMap = new Map<number, any>();

      if (cuentaIds.length > 0) {
        const { data: cuentas } = await (supabase as any)
          .from('cuentas_cobranza')
          .select('id, id_oferta, precio_final')
          .in('id', cuentaIds);

        if (cuentas) {
          const ofertaIds = cuentas.map((c: any) => c.id_oferta).filter(Boolean);
          let ofertaMap = new Map<number, any>();
          
          if (ofertaIds.length > 0) {
            const { data: ofertas } = await (supabase as any)
              .from('ofertas')
              .select('id, id_propiedad, id_producto')
              .in('id', ofertaIds);
            
            const propIds = (ofertas || []).map((o: any) => o.id_propiedad).filter(Boolean);
            const prodIds = [...new Set((ofertas || []).map((o: any) => o.id_producto).filter(Boolean))] as number[];
            let propMap = new Map<number, any>();
            let prodMap = new Map<number, string>();

            if (prodIds.length > 0) {
              const { data: prods } = await (supabase as any)
                .from('productos_servicios')
                .select('id, nombre')
                .in('id', prodIds);
              (prods || []).forEach((p: any) => prodMap.set(p.id, p.nombre));
            }
            
            if (propIds.length > 0) {
              const { data: props } = await (supabase as any)
                .from('propiedades')
                .select('id, numero_propiedad, id_edificio_modelo, id_estatus_disponibilidad')
                .in('id', propIds);
              
              const emIds = [...new Set((props || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))];
              let propToProject = new Map<number, string>();
              
              if (emIds.length > 0) {
                const { data: ems } = await (supabase as any).from('edificios_modelos').select('id, id_edificio').in('id', emIds);
                const edIds = [...new Set((ems || []).map((em: any) => em.id_edificio).filter(Boolean))];
                if (edIds.length > 0) {
                  const { data: eds } = await (supabase as any).from('edificios').select('id, id_proyecto').in('id', edIds);
                  const pjIds = [...new Set((eds || []).map((e: any) => e.id_proyecto).filter(Boolean))];
                  if (pjIds.length > 0) {
                    const { data: pjs } = await (supabase as any).from('proyectos').select('id, nombre').in('id', pjIds);
                    const pjMap = new Map((pjs || []).map((p: any) => [p.id, p.nombre]));
                    const edToP = new Map((eds || []).map((e: any) => [e.id, e.id_proyecto]));
                    const emToE = new Map((ems || []).map((em: any) => [em.id, em.id_edificio]));
                    (props || []).forEach((p: any) => {
                      const eId = emToE.get(p.id_edificio_modelo);
                      const pjId = eId ? edToP.get(eId) : null;
                      if (pjId) propToProject.set(p.id, (pjMap.get(pjId) as string) || '');
                    });
                  }
                }
              }
              
              (props || []).forEach((p: any) => propMap.set(p.id, { ...p, proyecto: propToProject.get(p.id) || '' }));
            }
            
            (ofertas || []).forEach((o: any) => {
              const prop = propMap.get(o.id_propiedad);
              const productoNombre = o.id_producto ? prodMap.get(o.id_producto) || '' : '';
              const tipoDerivado = o.id_producto ? 'Producto' : 'Propiedad';
              ofertaMap.set(o.id, { ...prop, productoNombre, tipoDerivado });
            });
          }
          
          cuentas.forEach((c: any) => {
            const info = ofertaMap.get(c.id_oferta);
            cuentaMap.set(c.id, { 
              ...c, 
              propiedad: info?.numero_propiedad, 
              proyecto: info?.proyecto, 
              precio_final: c.precio_final, 
              tipo: info?.tipoDerivado || 'Propiedad',
              productoNombre: info?.productoNombre || '',
              id_estatus_disponibilidad: info?.id_estatus_disponibilidad,
            });
          });
        }
      }

      const { data: facturas } = await (supabase as any)
        .from('documentos')
        .select('id, id_tipo_documento')
        .eq('id_persona', personaId)
        .eq('id_tipo_documento', 46)
        .eq('activo', true);
      const hasFactura = (facturas || []).length > 0;

      return comisionistas.map((c: any) => {
        const cuenta = cuentaMap.get(c.id_cuenta_cobranza);
        const precioFinal = cuenta?.precio_final || 0;
        const montoComision = precioFinal * (c.porcentaje_comision || 0) / 100;
        const propSold = cuenta?.id_estatus_disponibilidad === 5;

        let detailedStatus: string;
        if (c.pagada) {
          detailedStatus = 'pagada';
        } else if (c.aprobada && hasFactura) {
          detailedStatus = 'programada';
        } else if (c.aprobada && !hasFactura) {
          detailedStatus = 'factura_requerida';
        } else if (propSold) {
          detailedStatus = 'en_revision';
        } else {
          detailedStatus = 'pendiente';
        }

        return {
          ...c,
          proyecto: cuenta?.proyecto || '',
          propiedad: cuenta?.propiedad || '',
          productoNombre: cuenta?.productoNombre || '',
          precio_final: precioFinal,
          monto_comision: montoComision,
          detailed_status: detailedStatus,
          cuenta_cobranza_label: formatCuentaCobranzaId(c.id_cuenta_cobranza, cuenta?.tipo),
        };
      });
    },
    enabled: !!agentEmail,
    staleTime: 30_000,
  });

  const isLoading = onboardingLoading || comisionesLoading;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pendiente': return { label: 'Pendiente', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: Clock };
      case 'en_revision': return { label: 'En revisión', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: FileText };
      case 'factura_requerida': return { label: 'Factura requerida', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertCircle };
      case 'programada': return { label: 'Programada', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: CalendarCheck };
      case 'pagada': return { label: 'Pagada', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 };
      default: return { label: 'Pendiente', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: Clock };
    }
  };

  const totalCobrado = comisiones
    .filter((c: any) => c.detailed_status === 'pagada')
    .reduce((sum: number, c: any) => sum + (c.monto_comision || 0), 0);

  const totalPorCobrar = comisiones
    .filter((c: any) => c.detailed_status !== 'pagada')
    .reduce((sum: number, c: any) => sum + (c.monto_comision || 0), 0);

  const visibleTabs = isAgentRole 
    ? TABS 
    : TABS.filter(t => t.key !== 'factura_requerida');

  const filteredComisiones = activeTab === 'todas' 
    ? comisiones 
    : comisiones.filter((c: any) => c.detailed_status === activeTab);

  // Blocked state - only for Agente Inmobiliario role
  if (isAgentRole && !onboardingLoading && !canReceivePayments) {
    return (
      <div className="pb-24">
        <AgentPortalHeader showAgentName />
        <div className="p-4 space-y-5">
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
              <Lock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-[hsl(var(--agent-text))]">Perfil incompleto</p>
              <p className="text-xs text-[hsl(var(--agent-text-secondary))]">
                Completa tu perfil para ver y recibir comisiones
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {missingForComisiones.map(item => (
              <CheckItem key={item} label={item} done={false} />
            ))}
            {missingForComisiones.length === 0 && <CheckItem label="Perfil completo" done={true} />}
          </div>

          <button
            onClick={() => {
              track({ page: 'agent_comisiones', elementId: 'btn_completar_perfil_comisiones', elementLabel: 'Completar perfil' });
              navigate('/admin/agent/perfil');
            }}
            className="w-full py-2.5 rounded-xl bg-[hsl(var(--agent-primary))] text-white text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Completar perfil
          </button>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="pb-24">
      <AgentPortalHeader showAgentName />

      {/* Title */}
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-2xl font-bold text-[hsl(var(--agent-text))]">Comisiones</h1>
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">Tu wallet de ingresos</p>
      </div>

      {/* Summary cards */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-[hsl(var(--agent-primary))] p-4 shadow-md">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-white/80">Total cobrado</p>
            <CheckCircle2 className="h-4 w-4 text-white/60" />
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(totalCobrado)}</p>
          <p className="text-[10px] text-white/60 mt-0.5">MXN · acumulado</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-[hsl(var(--agent-text-secondary))]">Por cobrar</p>
            <DollarSign className="h-4 w-4 text-[hsl(var(--agent-muted))]" />
          </div>
          <p className="text-xl font-bold text-[hsl(var(--agent-text))]">{formatCurrency(totalPorCobrar)}</p>
          <p className="text-[10px] text-[hsl(var(--agent-text-secondary))] mt-0.5">MXN · en proceso</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-4 mb-4">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 pb-2">
            {visibleTabs.map(tab => {
              const count = tab.key === 'todas' 
                ? comisiones.length 
                : comisiones.filter((c: any) => c.detailed_status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    track({ page: 'agent_comisiones', elementId: 'btn_filtro_tab', elementLabel: tab.label, metadata: { tab: tab.key } });
                    setActiveTab(tab.key);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
                    activeTab === tab.key
                      ? "bg-[hsl(var(--agent-primary))] text-white border-[hsl(var(--agent-primary))]"
                      : "bg-white text-[hsl(var(--agent-text-secondary))] border-gray-200 hover:border-gray-300"
                  )}
                >
                  {tab.label}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* List */}
      <div className="px-4 space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-muted))]" />
          </div>
        ) : filteredComisiones.length === 0 ? (
          <div className="text-center py-12 text-sm text-[hsl(var(--agent-text-secondary))]">
            {activeTab === 'todas' ? 'Aún no tienes comisiones' : 'Sin comisiones en esta categoría'}
          </div>
        ) : (
          filteredComisiones.map((c: any, idx: number) => {
            const status = getStatusConfig(c.detailed_status);
            const StatusIcon = status.icon;
            return (
              <div key={`${c.id_cuenta_cobranza}-${idx}`} className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-[hsl(var(--agent-text))]">
                      {c.proyecto || 'Sin proyecto'}
                      {c.propiedad ? ` · ${c.propiedad}` : ''}
                    </p>
                    <p className="text-xs text-[hsl(var(--agent-text-secondary))] truncate">
                      {c.cuenta_cobranza_label}
                      {' · '}
                      {c.productoNombre
                        ? `${c.productoNombre}${c.propiedad ? ` · Depto ${c.propiedad}` : ''}`
                        : c.propiedad ? `Departamento ${c.propiedad}` : 'Sin unidad'}
                    </p>
                  </div>
                  <p className="text-base font-bold text-[hsl(var(--agent-text))] shrink-0">
                    {formatCurrency(c.monto_comision || 0)}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <Badge variant="outline" className={cn("text-[10px] shrink-0 border gap-1", status.color)}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </Badge>
                  {c.precio_final > 0 && (
                    <span className="text-[10px] text-[hsl(var(--agent-text-secondary))]">
                      Venta: {formatCurrency(c.precio_final)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

function CheckItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
      )}
      <span className={cn("text-sm", done ? "text-[hsl(var(--agent-text))]" : "text-[hsl(var(--agent-text-secondary))]")}>
        {label}
      </span>
    </div>
  );
}

export default AgentComisiones;
