import { useQuery } from "@tanstack/react-query";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, CheckCircle2, AlertCircle, DollarSign, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const AgentComisiones = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const personaId = profile?.id_persona;
  const agentEmail = user?.email || profile?.email;
  const { steps, percentage, isLoading: onboardingLoading } = useAgentOnboardingStatus(personaId);

  // Check profile completeness (fiscal + bank + docs)
  const fiscalComplete = steps.find(s => s.id === 'fiscal')?.isComplete ?? false;
  const bankComplete = steps.find(s => s.id === 'bank-accounts')?.isComplete ?? false;
  const docsComplete = steps.find(s => s.id === 'documents')?.isComplete ?? false;
  const canReceivePayments = fiscalComplete && bankComplete && docsComplete;

  // Fetch comisiones
  const { data: comisiones = [], isLoading: comisionesLoading } = useQuery({
    queryKey: ['agent-comisiones', agentEmail],
    queryFn: async () => {
      if (!agentEmail) return [];

      // Get comisionistas for this agent
      const { data: comisionistas } = await (supabase as any)
        .from('comisionistas')
        .select('id_cuenta_cobranza, porcentaje_comision, aprobada, pagada, fecha_creacion')
        .eq('email_usuario', agentEmail)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });

      if (!comisionistas || comisionistas.length === 0) return [];

      // Get cuentas_cobranza for project/property info
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
              .select('id, id_propiedad')
              .in('id', ofertaIds);
            
            const propIds = (ofertas || []).map((o: any) => o.id_propiedad).filter(Boolean);
            let propMap = new Map<number, any>();
            
            if (propIds.length > 0) {
              const { data: props } = await (supabase as any)
                .from('propiedades')
                .select('id, numero_propiedad, id_edificio_modelo')
                .in('id', propIds);
              
              // Get project names
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
            
            (ofertas || []).forEach((o: any) => ofertaMap.set(o.id, propMap.get(o.id_propiedad)));
          }
          
          cuentas.forEach((c: any) => {
            const prop = ofertaMap.get(c.id_oferta);
            cuentaMap.set(c.id, { ...c, propiedad: prop?.numero_propiedad, proyecto: prop?.proyecto, precio_final: c.precio_final });
          });
        }
      }

      return comisionistas.map((c: any) => {
        const cuenta = cuentaMap.get(c.id_cuenta_cobranza);
        const precioFinal = cuenta?.precio_final || 0;
        const montoComision = precioFinal * (c.porcentaje_comision || 0) / 100;
        const statusId = c.pagada ? 3 : c.aprobada ? 2 : 1;
        return {
          ...c,
          proyecto: cuenta?.proyecto || '',
          propiedad: cuenta?.propiedad || '',
          precio_final: precioFinal,
          monto_comision: montoComision,
          id_estatus_comision: statusId,
        };
      });
    },
    enabled: !!agentEmail,
    staleTime: 30_000,
  });

  const isLoading = onboardingLoading || comisionesLoading;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);

  const getStatusConfig = (statusId: number) => {
    switch (statusId) {
      case 1: return { label: 'Sin aprobar', color: 'text-gray-600 bg-gray-50 border-gray-200' };
      case 2: return { label: 'Aprobada', color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 3: return { label: 'Pagada', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      default: return { label: 'Pendiente', color: 'text-gray-600 bg-gray-50 border-gray-200' };
    }
  };

  const totalPendiente = comisiones
    .filter((c: any) => c.id_estatus_comision !== 3)
    .reduce((sum: number, c: any) => sum + (c.monto_comision || 0), 0);

  const totalPagada = comisiones
    .filter((c: any) => c.id_estatus_comision === 3)
    .reduce((sum: number, c: any) => sum + (c.monto_comision || 0), 0);

  // Blocked state
  if (!onboardingLoading && !canReceivePayments) {
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
            <CheckItem label="Información fiscal" done={fiscalComplete} />
            <CheckItem label="Cuenta bancaria" done={bankComplete} />
            <CheckItem label="Documentos (INE, Constancia, Contrato)" done={docsComplete} />
          </div>

          <button
            onClick={() => navigate('/admin/agent/perfil')}
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

      {/* Summary cards */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3.5">
          <p className="text-[11px] text-[hsl(var(--agent-text-secondary))]">Pendiente</p>
          <p className="text-lg font-bold text-[hsl(var(--agent-metric-green))]">{formatCurrency(totalPendiente)}</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3.5">
          <p className="text-[11px] text-[hsl(var(--agent-text-secondary))]">Pagada</p>
          <p className="text-lg font-bold text-[hsl(var(--agent-primary))]">{formatCurrency(totalPagada)}</p>
        </div>
      </div>

      {/* List */}
      <div className="px-4 space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-muted))]" />
          </div>
        ) : comisiones.length === 0 ? (
          <div className="text-center py-12 text-sm text-[hsl(var(--agent-text-secondary))]">
            Aún no tienes comisiones
          </div>
        ) : (
          comisiones.map((c: any) => {
            const status = getStatusConfig(c.id_estatus_comision);
            return (
              <div key={c.id_cuenta_cobranza} className="rounded-xl bg-white border border-gray-100 shadow-sm p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium text-[hsl(var(--agent-text))] truncate">
                      {c.proyecto || 'Sin proyecto'}
                    </p>
                    <p className="text-xs text-[hsl(var(--agent-text-secondary))] truncate">
                      {c.propiedad ? `Unidad ${c.propiedad}` : 'Sin unidad'}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] shrink-0 border", status.color)}>
                    {status.label}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-[hsl(var(--agent-primary))]">
                    {formatCurrency(c.monto_comision || 0)}
                  </span>
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
