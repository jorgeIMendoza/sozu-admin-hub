import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface PropertyProgressBadgeProps {
  cuentaId: number;
  estatusActual: number;
}

interface StageData {
  name: string;
  status: 'completed' | 'in-progress' | 'pending';
  percentage: number;
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
    staleTime: 60000, // Cache for 1 minute
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

  // Calculate simple stage percentages without full document checks
  const calculateStages = (): StageData[] => {
    const stages: StageData[] = [];
    const hasCompradores = (compradoresCount ?? 0) > 0;

    // ============ VENDIDO (simple calculation) ============
    let vendidoConditions = 0;
    let vendidoTotal = 3; // status, compradores, at least one payment

    if (estatusActual >= 4) vendidoConditions++;
    if (hasCompradores) vendidoConditions++;
    
    // Check if any payment exists and is completed
    const hasAnyPayment = acuerdosPago && acuerdosPago.length > 0;
    const allPaymentsCompleted = acuerdosPago?.every(a => a.pago_completado) ?? false;
    if (hasAnyPayment && acuerdosPago.some(a => a.pago_completado)) vendidoConditions++;

    const vendidoPercentage = Math.round((vendidoConditions / vendidoTotal) * 100);
    stages.push({
      name: 'Vendido',
      status: estatusActual >= 5 ? 'completed' : vendidoConditions > 0 ? 'in-progress' : 'pending',
      percentage: estatusActual >= 5 ? 100 : vendidoPercentage,
    });

    // ============ ESCRITURACIÓN ============
    let escrituracionConditions = 0;
    let escrituracionTotal = 3;

    if (estatusActual >= 5) escrituracionConditions++;
    if (hasCompradores) escrituracionConditions++;
    // Exclude concepts 7 (contra entrega) and 9 from payment completion check
    const pagosPendientes = acuerdosPago?.filter(a => a.id_concepto !== 7 && a.id_concepto !== 9 && !a.pago_completado) ?? [];
    if (pagosPendientes.length === 0 && hasAnyPayment) escrituracionConditions++;

    const escrituracionPercentage = Math.round((escrituracionConditions / escrituracionTotal) * 100);
    stages.push({
      name: 'Escrituración',
      status: estatusActual >= 7 ? 'completed' : (estatusActual >= 5 && escrituracionConditions > 0) ? 'in-progress' : 'pending',
      percentage: estatusActual >= 7 ? 100 : escrituracionPercentage,
    });

    // ============ ENTREGA ============
    let entregaConditions = 0;
    let entregaTotal = 2;

    if (estatusActual >= 7) entregaConditions++;
    const contraEntregaAcuerdo = acuerdosPago?.find(a => a.id_concepto === 7);
    const contraEntregaPaid = !contraEntregaAcuerdo || contraEntregaAcuerdo.pago_completado;
    if (contraEntregaPaid) entregaConditions++;

    const entregaPercentage = Math.round((entregaConditions / entregaTotal) * 100);
    stages.push({
      name: 'Entrega',
      status: estatusActual === 8 ? 'completed' : (estatusActual === 7 && entregaConditions > 0) ? 'in-progress' : 'pending',
      percentage: estatusActual === 8 ? 100 : entregaPercentage,
    });

    return stages;
  };

  const stages = calculateStages();
  const isEnDemanda = estatusActual === 11;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Check className="h-3 w-3" />;
      case 'in-progress': return <Clock className="h-3 w-3" />;
      default: return <Circle className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500 text-white';
      case 'in-progress': return 'bg-blue-500 text-white';
      default: return 'bg-muted-foreground/20 text-muted-foreground';
    }
  };

  if (isLoading) {
    return <div className="w-20 h-4 bg-muted animate-pulse rounded" />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-1 p-1.5 rounded border cursor-pointer hover:bg-muted/50 transition-colors",
          isEnDemanda && "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/20"
        )}>
          {isEnDemanda && <AlertTriangle className="h-3 w-3 text-yellow-600" />}
          {stages.map((stage, index) => (
            <div key={stage.name} className="flex items-center">
              <div className={cn("w-4 h-4 rounded-full flex items-center justify-center", getStatusColor(stage.status))}>
                {getStatusIcon(stage.status)}
              </div>
              {index < stages.length - 1 && (
                <div className={cn("w-2 h-0.5", stage.status === 'completed' ? "bg-green-500" : "bg-muted-foreground/20")} />
              )}
            </div>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="center">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Progreso de la Cuenta</h4>
          {isEnDemanda && (
            <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">Propiedad en demanda</span>
            </div>
          )}
          {stages.map((stage) => (
            <div key={stage.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{stage.name}</span>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  stage.status === 'completed' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  stage.status === 'in-progress' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                )}>
                  {stage.percentage}%
                </Badge>
              </div>
              <Progress 
                value={stage.percentage} 
                className={cn(
                  "h-1.5",
                  stage.status === 'completed' && "[&>div]:bg-green-500",
                  stage.status === 'in-progress' && "[&>div]:bg-blue-500"
                )} 
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Clic en "Ver Detalle" para información completa
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
