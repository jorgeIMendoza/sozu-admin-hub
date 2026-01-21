import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock, Circle, AlertTriangle, CreditCard, Users, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PropertyProgressBadgeProps {
  cuentaId: number;
  estatusActual: number;
}

interface ConditionItem {
  label: string;
  completed: boolean;
  detail?: string;
}

interface StageData {
  name: string;
  status: 'completed' | 'in-progress' | 'pending';
  percentage: number;
  conditions: ConditionItem[];
}

export function PropertyProgressBadge({
  cuentaId,
  estatusActual,
}: PropertyProgressBadgeProps) {
  // Fetch payment agreements status
  const { data: acuerdosPago, isLoading: isLoadingAcuerdos } = useQuery({
    queryKey: ['progress-badge-acuerdos', cuentaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('acuerdos_pago')
        .select('id, id_concepto, pago_completado, monto')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);
      return data || [];
    },
    staleTime: 60000,
  });

  // Fetch active buyers count
  const { data: compradoresCount, isLoading: isLoadingCompradores } = useQuery({
    queryKey: ['progress-badge-compradores', cuentaId],
    queryFn: async () => {
      const { count } = await supabase
        .from('compradores')
        .select('*', { count: 'exact', head: true })
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);
      return count || 0;
    },
    staleTime: 60000,
  });

  const isLoading = isLoadingAcuerdos || isLoadingCompradores;

  const calculateStages = (): StageData[] => {
    const stages: StageData[] = [];
    const hasCompradores = (compradoresCount ?? 0) > 0;

    // ============ VENDIDO ============
    const vendidoConditions: ConditionItem[] = [];
    
    const statusOk = estatusActual >= 4;
    vendidoConditions.push({
      label: 'Propiedad apartada',
      completed: statusOk,
      detail: statusOk ? 'Estatus válido' : 'La propiedad debe estar apartada'
    });

    // Consolidated payments (excluding 7 and 9)
    const pagosVendido = acuerdosPago?.filter(a => a.id_concepto !== 7 && a.id_concepto !== 9) ?? [];
    if (pagosVendido.length > 0) {
      const pagosCompletados = pagosVendido.filter(p => p.pago_completado).length;
      vendidoConditions.push({
        label: 'Pagos',
        completed: pagosCompletados === pagosVendido.length,
        detail: `${pagosCompletados}/${pagosVendido.length} completado(s)`
      });
    }

    vendidoConditions.push({
      label: 'Compradores registrados',
      completed: hasCompradores,
      detail: hasCompradores ? `${compradoresCount} comprador(es)` : 'Sin compradores'
    });

    const vendidoCompleted = vendidoConditions.filter(c => c.completed).length;
    const vendidoPercentage = Math.round((vendidoCompleted / vendidoConditions.length) * 100);
    stages.push({
      name: 'Vendido',
      status: estatusActual >= 5 ? 'completed' : vendidoCompleted > 0 ? 'in-progress' : 'pending',
      percentage: estatusActual >= 5 ? 100 : vendidoPercentage,
      conditions: vendidoConditions,
    });

    // ============ ESCRITURACIÓN ============
    const escrituracionConditions: ConditionItem[] = [];
    
    const estatusValidoEscrituracion = estatusActual === 5 || estatusActual === 9;
    escrituracionConditions.push({
      label: 'Estatus válido',
      completed: estatusValidoEscrituracion || estatusActual >= 7,
      detail: estatusActual >= 7 ? 'Ya en escrituración' : estatusValidoEscrituracion ? 'Listo' : 'Debe estar Vendido o Pagada'
    });

    const pagosPendientes = acuerdosPago?.filter(a => a.id_concepto !== 7 && a.id_concepto !== 9 && !a.pago_completado) ?? [];
    const cuentaPagada = pagosPendientes.length === 0;
    escrituracionConditions.push({
      label: 'Cuenta pagada',
      completed: cuentaPagada,
      detail: cuentaPagada ? 'Todos los pagos completados' : `${pagosPendientes.length} pendiente(s)`
    });

    escrituracionConditions.push({
      label: 'Compradores registrados',
      completed: hasCompradores,
      detail: hasCompradores ? `${compradoresCount} comprador(es)` : 'Sin compradores'
    });

    const escrituracionCompleted = escrituracionConditions.filter(c => c.completed).length;
    const escrituracionPercentage = Math.round((escrituracionCompleted / escrituracionConditions.length) * 100);
    stages.push({
      name: 'Escrituración',
      status: estatusActual >= 7 ? 'completed' : (estatusActual >= 5 && escrituracionCompleted > 0) ? 'in-progress' : 'pending',
      percentage: estatusActual >= 7 ? 100 : escrituracionPercentage,
      conditions: escrituracionConditions,
    });

    // ============ ENTREGA ============
    const entregaConditions: ConditionItem[] = [];
    
    const enEscrituracion = estatusActual === 7;
    entregaConditions.push({
      label: 'Propiedad en escrituración',
      completed: enEscrituracion || estatusActual === 8,
      detail: estatusActual === 8 ? 'Entregada' : enEscrituracion ? 'En proceso' : 'Debe completar escrituración'
    });

    const contraEntregaAcuerdo = acuerdosPago?.find(a => a.id_concepto === 7);
    const contraEntregaPaid = !contraEntregaAcuerdo || contraEntregaAcuerdo.pago_completado;
    entregaConditions.push({
      label: 'Pago contra entrega',
      completed: contraEntregaPaid,
      detail: !contraEntregaAcuerdo ? 'No aplica' : contraEntregaAcuerdo.pago_completado ? 'Completado' : 'Pendiente'
    });

    const entregaCompleted = entregaConditions.filter(c => c.completed).length;
    const entregaPercentage = Math.round((entregaCompleted / entregaConditions.length) * 100);
    stages.push({
      name: 'Entrega',
      status: estatusActual === 8 ? 'completed' : (estatusActual === 7 && entregaCompleted > 0) ? 'in-progress' : 'pending',
      percentage: estatusActual === 8 ? 100 : entregaPercentage,
      conditions: entregaConditions,
    });

    return stages;
  };

  const stages = calculateStages();
  const isEnDemanda = estatusActual === 11;

  if (isLoading) {
    return <div className="w-20 h-4 bg-muted animate-pulse rounded" />;
  }

  return (
    <div className={cn(
      "flex items-center gap-0.5 p-1 rounded border",
      isEnDemanda && "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/20"
    )}>
      {isEnDemanda && <AlertTriangle className="h-3 w-3 text-yellow-600 mr-1" />}
      {stages.map((stage, index) => (
        <div key={stage.name} className="flex items-center">
          <StageIndicatorBadge stage={stage} />
          {index < stages.length - 1 && (
            <div className={cn("w-2 h-0.5", stage.status === 'completed' ? "bg-green-500" : "bg-muted-foreground/20")} />
          )}
        </div>
      ))}
    </div>
  );
}

function StageIndicatorBadge({ stage }: { stage: StageData }) {
  const getStatusColor = () => {
    switch (stage.status) {
      case 'completed': return 'bg-green-500 text-white';
      case 'in-progress': return 'bg-blue-500 text-white';
      default: return 'bg-muted-foreground/20 text-muted-foreground';
    }
  };

  const getStatusIcon = () => {
    switch (stage.status) {
      case 'completed': return <Check className="h-2.5 w-2.5" />;
      case 'in-progress': return <Clock className="h-2.5 w-2.5" />;
      default: return <Circle className="h-2.5 w-2.5" />;
    }
  };

  const getConditionIcon = (label: string) => {
    if (label.includes('Pago') || label.includes('pagada')) return <CreditCard className="h-3 w-3" />;
    if (label.includes('Comprador')) return <Users className="h-3 w-3" />;
    return <FileCheck className="h-3 w-3" />;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          className={cn(
            "w-4 h-4 rounded-full flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all",
            getStatusColor()
          )}
          title={`Clic para ver detalle de ${stage.name}`}
        >
          {getStatusIcon()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{stage.name}</h4>
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              stage.status === 'completed' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
              stage.status === 'in-progress' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              stage.status === 'pending' && "bg-muted text-muted-foreground"
            )}>
              {stage.percentage}%
            </span>
          </div>
          <Progress 
            value={stage.percentage} 
            className={cn(
              "h-1.5",
              stage.status === 'completed' && "[&>div]:bg-green-500",
              stage.status === 'in-progress' && "[&>div]:bg-blue-500"
            )} 
          />
          <div className="space-y-1.5 pt-1">
            {stage.conditions.map((condition, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "flex items-start gap-2 text-xs p-1.5 rounded",
                  condition.completed ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
                )}
              >
                <div className={cn("mt-0.5 flex-shrink-0", condition.completed ? "text-green-600" : "text-red-500")}>
                  {condition.completed ? <Check className="h-3 w-3" /> : getConditionIcon(condition.label)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "font-medium",
                    condition.completed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                  )}>
                    {condition.label}
                  </span>
                  {condition.detail && (
                    <p className="text-muted-foreground truncate">{condition.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
