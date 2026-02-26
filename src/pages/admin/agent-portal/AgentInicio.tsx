import { useState, useEffect } from "react";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Progress } from "@/components/ui/progress";
import { 
  CalendarPlus, UserPlus, TrendingUp, DollarSign, 
  ShoppingCart, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { AddProspectoFloatingDialog } from "@/components/admin/AddProspectoFloatingDialog";
import { AgendarCitaShowroomDialog } from "@/components/admin/AgendarCitaShowroomDialog";

const AgentInicio = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const personaId = profile?.id_persona;
  const agentEmail = user?.email || profile?.email;
  const isAgentRole = profile?.rol_nombre === 'Agente Inmobiliario';
  const { percentage, isLoading: onboardingLoading } = useAgentOnboardingStatus(personaId);
  const { permissions } = useAgentPortalPermissions();
  const inicioPerms = permissions['/admin/agent/inicio'];
  const [addProspectoOpen, setAddProspectoOpen] = useState(false);
  const [agendarCitaOpen, setAgendarCitaOpen] = useState(false);
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  const nombre = profile?.nombre?.split(" ")[0] || "Agente";

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/inicio');
    track({ page: 'agent_inicio', elementId: 'page_view', elementType: 'page' });
  }, []);

  // Get current hour for greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  // Fetch agent metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['agent-metrics', agentEmail, personaId],
    queryFn: async () => {
      if (!agentEmail) return null;

      // Fetch comisionistas
      const { data: comisionistas } = await (supabase as any)
        .from('comisionistas')
        .select('id_cuenta_cobranza, porcentaje_comision, aprobada, pagada')
        .eq('email_usuario', agentEmail)
        .eq('activo', true);

      if (!comisionistas || comisionistas.length === 0) {
        return { comisionPendiente: 0, comisionPagada: 0, ventasActivas: 0, ventasCerradas: 0 };
      }

      // Get cuentas for precio_final and oferta link
      const cuentaIds = [...new Set(comisionistas.map((c: any) => c.id_cuenta_cobranza).filter(Boolean))] as number[];
      let cuentaMap = new Map<number, any>();

      if (cuentaIds.length > 0) {
        const { data: cuentas } = await (supabase as any)
          .from('cuentas_cobranza')
          .select('id, id_oferta, precio_final')
          .in('id', cuentaIds);

        if (cuentas) {
          const ofertaIds = cuentas.map((c: any) => c.id_oferta).filter(Boolean);
          let propStatusMap = new Map<number, number>();

          if (ofertaIds.length > 0) {
            const { data: ofertas } = await (supabase as any)
              .from('ofertas')
              .select('id, id_propiedad')
              .in('id', ofertaIds);

            const propIds = (ofertas || []).map((o: any) => o.id_propiedad).filter(Boolean);
            let ofertaToProp = new Map<number, number>();
            (ofertas || []).forEach((o: any) => { if (o.id_propiedad) ofertaToProp.set(o.id, o.id_propiedad); });

            if (propIds.length > 0) {
              const { data: props } = await (supabase as any)
                .from('propiedades')
                .select('id, id_estatus_disponibilidad')
                .in('id', propIds);
              (props || []).forEach((p: any) => propStatusMap.set(p.id, p.id_estatus_disponibilidad));
            }

            cuentas.forEach((c: any) => {
              const propId = ofertaToProp.get(c.id_oferta);
              cuentaMap.set(c.id, {
                precio_final: c.precio_final || 0,
                propSold: propId ? propStatusMap.get(propId) === 5 : false,
              });
            });
          } else {
            cuentas.forEach((c: any) => cuentaMap.set(c.id, { precio_final: c.precio_final || 0, propSold: false }));
          }
        }
      }

      // Check if agent has factura (doc tipo 46)
      const { data: facturas } = await (supabase as any)
        .from('documentos')
        .select('id')
        .eq('id_persona', personaId)
        .eq('id_tipo_documento', 46)
        .eq('activo', true)
        .limit(1);
      const hasFactura = (facturas || []).length > 0;

      // Calculate detailed status and sums
      let comisionPendiente = 0;
      let comisionPagada = 0;
      let ventasActivas = 0;   // pendiente + en_revision
      let ventasCerradas = 0;  // programada + pagada

      comisionistas.forEach((c: any) => {
        const cuenta = cuentaMap.get(c.id_cuenta_cobranza);
        const precio = cuenta?.precio_final || 0;
        const monto = precio * (c.porcentaje_comision || 0) / 100;

        let status: string;
        if (c.pagada) {
          status = 'pagada';
        } else if (c.aprobada && hasFactura) {
          status = 'programada';
        } else if (c.aprobada && !hasFactura) {
          status = 'factura_requerida';
        } else if (cuenta?.propSold) {
          status = 'en_revision';
        } else {
          status = 'pendiente';
        }

        if (c.pagada) {
          comisionPagada += monto;
        } else {
          comisionPendiente += monto;
        }

        if (status === 'pendiente' || status === 'en_revision' || status === 'factura_requerida') {
          ventasActivas++;
        } else if (status === 'programada' || status === 'pagada') {
          ventasCerradas++;
        }
      });

      return { comisionPendiente, comisionPagada, ventasActivas, ventasCerradas };
    },
    enabled: !!agentEmail,
  });

  // Fetch attention items (ofertas that need action)
  const { data: attentionItems = [], isLoading: attentionLoading } = useQuery({
    queryKey: ['agent-attention', agentEmail],
    queryFn: async () => {
      if (!agentEmail) return [];

      const { data } = await (supabase as any)
        .from('ofertas')
        .select('id, id_estatus_aprobacion, fecha_generacion, id_propiedad, id_persona_lead')
        .eq('email_creador', agentEmail)
        .eq('activo', true)
        .in('id_estatus_aprobacion', [3, 4, 5])
        .order('fecha_generacion', { ascending: false })
        .limit(5);

      return data || [];
    },
    enabled: !!agentEmail,
  });

  const isLoading = onboardingLoading || metricsLoading;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  };

  const getStatusLabel = (statusId: number) => {
    switch (statusId) {
      case 3: return "Oferta aprobada";
      case 4: return "Pendiente de firma";
      case 5: return "Pendiente de enganche";
      default: return "Requiere atención";
    }
  };

  return (
    <div className="pb-24">
      <AgentPortalHeader>
        <div>
          <p className="text-sm text-[hsl(var(--agent-primary))]">
            {greeting}
          </p>
          <h1 className="text-2xl font-bold text-[hsl(var(--agent-text))]">
            {nombre}
          </h1>
          {attentionItems.length > 0 && (
            <p className="text-xs text-[hsl(var(--agent-amber))] flex items-center gap-1 mt-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Hoy tienes {attentionItems.length} acciones pendientes
            </p>
          )}
        </div>
      </AgentPortalHeader>

      <div className="p-4 space-y-5">

      {/* Onboarding Progress Banner - only for Agente Inmobiliario */}
      {isAgentRole && percentage < 100 && (
        <div className="w-full rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[hsl(var(--agent-text))]">
              Activa tu perfil profesional
            </span>
            <span className="text-sm font-bold text-[hsl(var(--agent-amber))]">{percentage}%</span>
          </div>
          <p className="text-xs text-[hsl(var(--agent-text-secondary))]">
            Te faltan {Math.round((100 - percentage) / 25)} bloques para recibir comisiones.
          </p>
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[hsl(var(--agent-amber))] rounded-full transition-all duration-700"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <button
            onClick={() => {
              track({ page: 'agent_inicio', elementId: 'btn_completar_perfil', elementLabel: 'Completar ahora' });
              navigate('/admin/agent/perfil');
            }}
            className="text-sm font-semibold text-[hsl(var(--agent-primary))] flex items-center gap-1 active:opacity-70"
          >
            Completar ahora <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Attention Items */}
      {attentionItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[hsl(var(--agent-text))] px-1 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--agent-amber))]" />
            Requieren tu atención
          </h2>
          <div className="space-y-2">
            {attentionItems.map((item: any) => (
              <div
                key={item.id}
                onClick={() => {
                  track({ page: 'agent_inicio', elementId: 'btn_atencion_item', elementLabel: 'Item atención', metadata: { oferta_id: item.id } });
                }}
                className="rounded-xl bg-white border border-gray-100 shadow-sm p-3 flex items-center gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--agent-text))] truncate">
                    {(item.personas as any)?.nombre_legal || "Cliente"}
                  </p>
                  <p className="text-xs text-[hsl(var(--agent-text-secondary))] truncate">
                    {getStatusLabel(item.id_estatus_aprobacion)} · {(item.propiedades as any)?.proyectos?.nombre}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[hsl(var(--agent-muted))] shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions — solo si tiene permiso de crear */}
      {inicioPerms.canCreate && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              track({ page: 'agent_inicio', elementId: 'btn_nuevo_prospecto', elementLabel: 'Nuevo prospecto' });
              setAddProspectoOpen(true);
            }}
            className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
          >
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-[hsl(var(--agent-text))]">Nuevo prospecto</span>
          </button>
          <button
            onClick={() => {
              track({ page: 'agent_inicio', elementId: 'btn_agendar_cita', elementLabel: 'Agendar cita' });
              setAgendarCitaOpen(true);
            }}
            className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <CalendarPlus className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-[hsl(var(--agent-text))]">Agendar cita</span>
          </button>
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[hsl(var(--agent-text))] px-1">
          Métricas comerciales
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--agent-muted))]" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Comisión pagada"
              value={formatCurrency(metrics?.comisionPagada || 0)}
              icon={CheckCircle2}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
            />
            <MetricCard
              label="Comisión pendiente"
              value={formatCurrency(metrics?.comisionPendiente || 0)}
              icon={DollarSign}
              color="text-[hsl(var(--agent-metric-green))]"
              bgColor="bg-emerald-50"
            />
            <MetricCard
              label="Ventas activas"
              value={String(metrics?.ventasActivas || 0)}
              icon={TrendingUp}
              color="text-blue-600"
              bgColor="bg-blue-50"
            />
            <MetricCard
              label="Ventas cerradas"
              value={String(metrics?.ventasCerradas || 0)}
              icon={ShoppingCart}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      {inicioPerms.canCreate && (
        <>
          <AddProspectoFloatingDialog open={addProspectoOpen} onOpenChange={setAddProspectoOpen} />
          <AgendarCitaShowroomDialog open={agendarCitaOpen} onOpenChange={setAgendarCitaOpen} />
        </>
      )}
      </div>
    </div>
  );
};

function MetricCard({ label, value, icon: Icon, color, bgColor }: {
  label: string;
  value: string;
  icon: any;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3.5 space-y-2">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", bgColor)}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div>
        <p className={cn("text-lg font-bold", color)}>{value}</p>
        <p className="text-[11px] text-[hsl(var(--agent-text-secondary))]">{label}</p>
      </div>
    </div>
  );
}

export default AgentInicio;
