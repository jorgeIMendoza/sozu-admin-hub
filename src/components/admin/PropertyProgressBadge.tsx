import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock, Circle, AlertTriangle, CreditCard, Users, FileCheck, FileText, ChevronRight } from "lucide-react";
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
  cuentaDetalle?: {
    numero_escritura?: string | null;
    fecha_escritura?: string | null;
    id_notario?: number | null;
  } | null;
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

// Define explicit types to avoid Supabase type inference issues
interface DocumentoRow {
  id: number;
  id_tipo_documento: number;
  id_estatus_verificacion: number | null;
  id_persona: number | null;
}

interface TipoDocumentoRow {
  id: number;
  nombre: string;
  id_categoria_documento: number | null;
}

export function PropertyProgressBadge({
  cuentaId,
  estatusActual,
  cuentaDetalle,
}: PropertyProgressBadgeProps) {
  const [selectedStage, setSelectedStage] = useState<StageData | null>(null);

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

  // Fetch documents with their types
  const { data: documentosData, isLoading: isLoadingDocs } = useQuery({
    queryKey: ['progress-badge-documentos', cuentaId],
    queryFn: async (): Promise<Array<{
      id: number;
      id_tipo_documento: number;
      id_estatus_verificacion: number | null;
      id_persona: number | null;
      tipos_documento: TipoDocumentoRow | null;
    }>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAny = supabase as any;
      
      const { data: rawDocs, error } = await supabaseAny
        .from('documentos_cuenta')
        .select('id, id_tipo_documento, id_estatus_verificacion, id_persona')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);
      
      const docs = rawDocs as DocumentoRow[] | null;
      if (error || !docs || docs.length === 0) return [];

      const tipoIds = [...new Set(docs.map(d => d.id_tipo_documento))];
      
      const { data: rawTipos } = await supabaseAny
        .from('tipos_documento')
        .select('id, nombre, id_categoria_documento')
        .in('id', tipoIds);
      
      const tipos = rawTipos as TipoDocumentoRow[] | null;
      
      const tiposMap = new Map<number, TipoDocumentoRow>();
      tipos?.forEach(t => tiposMap.set(t.id, t));
      
      return docs.map(d => ({
        id: d.id,
        id_tipo_documento: d.id_tipo_documento,
        id_estatus_verificacion: d.id_estatus_verificacion,
        id_persona: d.id_persona,
        tipos_documento: tiposMap.get(d.id_tipo_documento) || null
      }));
    },
    staleTime: 60000,
  });

  const isLoading = isLoadingAcuerdos || isLoadingCompradores || isLoadingDocs;

  const calculateStages = (): StageData[] => {
    const stages: StageData[] = [];
    const hasCompradores = (compradoresCount ?? 0) > 0;
    const documentos = documentosData || [];

    // ============ PAGOS (antes Vendido) ============
    const pagosConditions: ConditionItem[] = [];
    
    const statusOk = estatusActual >= 4;
    pagosConditions.push({
      label: 'Propiedad apartada',
      completed: statusOk,
      detail: statusOk ? 'Estatus válido' : 'La propiedad debe estar apartada'
    });

    // Consolidated payments (excluding 9 - escrituración)
    const pagosTodos = acuerdosPago?.filter(a => a.id_concepto !== 9) ?? [];
    if (pagosTodos.length > 0) {
      const pagosCompletados = pagosTodos.filter(p => p.pago_completado).length;
      pagosConditions.push({
        label: 'Pagos',
        completed: pagosCompletados === pagosTodos.length,
        detail: `${pagosCompletados}/${pagosTodos.length} completado(s)`
      });
    }

    pagosConditions.push({
      label: 'Compradores registrados',
      completed: hasCompradores,
      detail: hasCompradores ? `${compradoresCount} comprador(es)` : 'Sin compradores'
    });

    // Tipo 18 = "Contrato firmado completamente"
    const contratoFirmado = documentos.some(d => d.id_tipo_documento === 18 && d.id_estatus_verificacion === 2);
    pagosConditions.push({
      label: 'Contrato firmado verificado',
      completed: contratoFirmado,
      detail: contratoFirmado ? 'Verificado' : 'Pendiente de verificación'
    });

    const pagosCompleted = pagosConditions.filter(c => c.completed).length;
    const pagosPercentage = Math.round((pagosCompleted / pagosConditions.length) * 100);
    const allPagosComplete = pagosCompleted === pagosConditions.length;
    stages.push({
      name: 'Pagos',
      status: allPagosComplete ? 'completed' : pagosCompleted > 0 ? 'in-progress' : 'pending',
      percentage: pagosPercentage,
      conditions: pagosConditions,
    });

    // ============ ESCRITURACIÓN ============
    const escrituracionConditions: ConditionItem[] = [];
    
    const estatusValidoEscrituracion = estatusActual === 5 || estatusActual === 9;
    escrituracionConditions.push({
      label: 'Estatus válido (Vendido o Pagada)',
      completed: estatusValidoEscrituracion || estatusActual >= 7,
      detail: estatusActual >= 7 ? 'Ya en escrituración' : estatusValidoEscrituracion ? 'Listo' : 'Debe estar Vendido o Pagada'
    });

    const pagosPendientes = acuerdosPago?.filter(a => a.id_concepto !== 9 && !a.pago_completado) ?? [];
    const cuentaPagada = pagosPendientes.length === 0;
    escrituracionConditions.push({
      label: 'Cuenta pagada completamente',
      completed: cuentaPagada,
      detail: cuentaPagada ? 'Todos los pagos completados' : `${pagosPendientes.length} pago(s) pendiente(s)`
    });

    escrituracionConditions.push({
      label: 'Compradores registrados',
      completed: hasCompradores,
      detail: hasCompradores ? `${compradoresCount} comprador(es)` : 'Sin compradores'
    });

    const docsCompradoresPendientes = documentos.filter(d => {
      const cat = d.tipos_documento?.id_categoria_documento;
      const isExcludedCategory = cat === 7 || cat === 8;
      return d.id_persona && !isExcludedCategory && d.id_estatus_verificacion !== 2;
    });
    const docsVerificados = docsCompradoresPendientes.length === 0 && hasCompradores;
    escrituracionConditions.push({
      label: 'Documentos de compradores verificados',
      completed: docsVerificados,
      detail: docsVerificados ? 'Todos verificados' : `${docsCompradoresPendientes.length} documento(s) pendiente(s)`
    });

    const escrituracionCompleted = escrituracionConditions.filter(c => c.completed).length;
    const escrituracionPercentage = Math.round((escrituracionCompleted / escrituracionConditions.length) * 100);
    const allEscrituracionComplete = escrituracionCompleted === escrituracionConditions.length;
    stages.push({
      name: 'Escrituración',
      status: allEscrituracionComplete ? 'completed' : escrituracionCompleted > 0 ? 'in-progress' : 'pending',
      percentage: escrituracionPercentage,
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

    const datosEscrituraCompletos = !!cuentaDetalle?.numero_escritura;
    entregaConditions.push({
      label: 'Datos de escritura completos',
      completed: datosEscrituraCompletos,
      detail: datosEscrituraCompletos ? 'Número de escritura registrado' : 'Faltan datos de escritura'
    });

    const docsEntrega = documentos.filter(d => d.tipos_documento?.id_categoria_documento === 7);
    const docsEntregaVerificados = docsEntrega.filter(d => d.id_estatus_verificacion === 2);
    const entregaDocsOk = docsEntrega.length > 0 && docsEntregaVerificados.length === docsEntrega.length;
    entregaConditions.push({
      label: 'Documentos de entrega verificados',
      completed: entregaDocsOk,
      detail: docsEntrega.length === 0 ? 'Sin documentos de entrega' : `${docsEntregaVerificados.length}/${docsEntrega.length} verificados`
    });

    const entregaCompleted = entregaConditions.filter(c => c.completed).length;
    const entregaPercentage = Math.round((entregaCompleted / entregaConditions.length) * 100);
    const allEntregaComplete = entregaCompleted === entregaConditions.length;
    stages.push({
      name: 'Entrega',
      status: allEntregaComplete ? 'completed' : entregaCompleted > 0 ? 'in-progress' : 'pending',
      percentage: entregaPercentage,
      conditions: entregaConditions,
    });

    return stages;
  };

  const stages = calculateStages();
  const isEnDemanda = estatusActual === 11;

  if (isLoading) {
    return <div className="w-20 h-4 bg-muted animate-pulse rounded" />;
  }

  const getStatusColor = (status: StageData['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500 text-white';
      case 'in-progress': return 'bg-blue-500 text-white';
      default: return 'bg-muted-foreground/20 text-muted-foreground';
    }
  };

  const getStatusIcon = (status: StageData['status']) => {
    switch (status) {
      case 'completed': return <Check className="h-2.5 w-2.5" />;
      case 'in-progress': return <Clock className="h-2.5 w-2.5" />;
      default: return <Circle className="h-2.5 w-2.5" />;
    }
  };

  const getConditionIcon = (label: string) => {
    if (label.includes('Pago') || label.includes('pagada')) return <CreditCard className="h-3 w-3" />;
    if (label.includes('Comprador')) return <Users className="h-3 w-3" />;
    if (label.includes('Documento') || label.includes('Contrato')) return <FileText className="h-3 w-3" />;
    return <FileCheck className="h-3 w-3" />;
  };

  return (
    <Popover onOpenChange={(open) => { if (!open) setSelectedStage(null); }}>
      <PopoverTrigger asChild>
        <div className={cn(
          "flex items-center gap-0.5 p-1 rounded border cursor-pointer hover:bg-muted/50 transition-colors",
          isEnDemanda && "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/20"
        )}>
          {isEnDemanda && <AlertTriangle className="h-3 w-3 text-yellow-600 mr-1" />}
          {stages.map((stage, index) => (
            <div key={stage.name} className="flex items-center">
              <div 
                className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center",
                  getStatusColor(stage.status)
                )}
              >
                {getStatusIcon(stage.status)}
              </div>
              {index < stages.length - 1 && (
                <div className={cn("w-2 h-0.5", stage.status === 'completed' ? "bg-green-500" : "bg-muted-foreground/20")} />
              )}
            </div>
          ))}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center">
        {selectedStage ? (
          // Detail view for selected stage
          <div className="space-y-2">
            <button 
              onClick={() => setSelectedStage(null)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              ← Volver
            </button>
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{selectedStage.name}</h4>
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                selectedStage.status === 'completed' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                selectedStage.status === 'in-progress' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                selectedStage.status === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {selectedStage.percentage}%
              </span>
            </div>
            <Progress 
              value={selectedStage.percentage} 
              className={cn(
                "h-1.5",
                selectedStage.status === 'completed' && "[&>div]:bg-green-500",
                selectedStage.status === 'in-progress' && "[&>div]:bg-blue-500"
              )} 
            />
            <div className="space-y-1.5 pt-1">
              {selectedStage.conditions.map((condition, idx) => (
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
        ) : (
          // Overview view
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Progreso de la Cuenta</h4>
            {stages.map((stage) => (
              <button
                key={stage.name}
                onClick={() => setSelectedStage(stage)}
                className="w-full text-left hover:bg-muted/50 rounded p-1.5 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{stage.name}</span>
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "text-xs font-medium",
                      stage.status === 'completed' && "text-green-600 dark:text-green-400",
                      stage.status === 'in-progress' && "text-blue-600 dark:text-blue-400",
                      stage.status === 'pending' && "text-muted-foreground"
                    )}>
                      {stage.percentage}%
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
                <Progress 
                  value={stage.percentage} 
                  className={cn(
                    "h-1.5",
                    stage.status === 'completed' && "[&>div]:bg-green-500",
                    stage.status === 'in-progress' && "[&>div]:bg-blue-500"
                  )} 
                />
              </button>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-1">
              Clic en cada etapa para ver el detalle
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
