import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProjectCollectionSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  cuentaIds: number[];
  totalColocado: number;
  totalCobrado: number;
}

// Concept IDs (from conceptos_pago table):
// 1 = Apartado
// 2 = Enganche
// 3 = Pago a contra entrega (Contraentrega)
// 4 = Pago especial
// 5 = Parcialidad (Mensualidades)
// 6 = Cesión de derechos

const DURANTE_OBRA_CONCEPTS = [1, 2, 4, 5]; // Apartado, Enganche, Pago especial, Parcialidad/Mensualidades
const CONTRAENTREGA_CONCEPT = 3; // Pago a contra entrega

export function ProjectCollectionSummaryDialog({ 
  isOpen, 
  onClose, 
  projectName, 
  cuentaIds,
  totalColocado,
  totalCobrado
}: ProjectCollectionSummaryDialogProps) {
  
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["project-collection-summary", projectName, cuentaIds],
    queryFn: async () => {
      if (!cuentaIds.length) return null;

      // Get all acuerdos_pago for these cuentas
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza, id_concepto, monto, pago_completado')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true)
        .limit(50000);

      if (acuerdosError) throw acuerdosError;
      if (!acuerdos || acuerdos.length === 0) return null;

      // Get aplicaciones_pago for these acuerdos
      const acuerdoIds = acuerdos.map(a => a.id);
      const { data: aplicaciones, error: aplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .select('id_acuerdo_pago, monto')
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true)
        .eq('es_multa', false)
        .limit(100000);

      if (aplicacionesError) throw aplicacionesError;

      // Create a map of acuerdo_id to concept_id
      const acuerdoToConceptMap = acuerdos.reduce((acc: Record<number, number>, a) => {
        acc[a.id] = a.id_concepto;
        return acc;
      }, {});

      // Calculate totals by concept type
      let totalDuranteObra = 0;
      let totalContraentrega = 0;
      let pagadoDuranteObra = 0;
      let pagadoContraentrega = 0;

      // Calculate total amounts per concept
      acuerdos.forEach(acuerdo => {
        if (DURANTE_OBRA_CONCEPTS.includes(acuerdo.id_concepto)) {
          totalDuranteObra += acuerdo.monto || 0;
        } else if (acuerdo.id_concepto === CONTRAENTREGA_CONCEPT) {
          totalContraentrega += acuerdo.monto || 0;
        }
      });

      // Calculate paid amounts per concept from aplicaciones
      (aplicaciones || []).forEach(app => {
        const conceptId = acuerdoToConceptMap[app.id_acuerdo_pago];
        if (DURANTE_OBRA_CONCEPTS.includes(conceptId)) {
          pagadoDuranteObra += app.monto || 0;
        } else if (conceptId === CONTRAENTREGA_CONCEPT) {
          pagadoContraentrega += app.monto || 0;
        }
      });

      const restanteDuranteObra = totalDuranteObra - pagadoDuranteObra;
      const restanteContraentrega = totalContraentrega - pagadoContraentrega;
      
      // Total sum of all acuerdos
      const totalAcuerdos = totalDuranteObra + totalContraentrega;

      return {
        totalDuranteObra,
        totalContraentrega,
        totalAcuerdos,
        pagadoDuranteObra,
        pagadoContraentrega,
        restanteDuranteObra,
        restanteContraentrega,
        porcentajePagadoObra: totalDuranteObra > 0 ? (pagadoDuranteObra / totalDuranteObra) * 100 : 0,
        porcentajePagadoEntrega: totalContraentrega > 0 ? (pagadoContraentrega / totalContraentrega) * 100 : 0,
        porcentajeRestanteObra: totalDuranteObra > 0 ? (restanteDuranteObra / totalDuranteObra) * 100 : 0,
        porcentajeRestanteEntrega: totalContraentrega > 0 ? (restanteContraentrega / totalContraentrega) * 100 : 0,
      };
    },
    enabled: isOpen && cuentaIds.length > 0,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatCurrencyCompact = (amount: number) => {
    const absValue = Math.abs(amount);
    if (absValue >= 1_000_000) {
      const millions = amount / 1_000_000;
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(millions);
      return `$${formatted} M`;
    } else if (absValue >= 1_000) {
      const thousands = amount / 1_000;
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(thousands);
      return `$${formatted} K`;
    }
    return formatCurrency(amount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resumen de Cobranza - {projectName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !summaryData ? (
          <p className="text-sm text-muted-foreground py-4">No hay datos disponibles</p>
        ) : (
          <div className="space-y-6">
            {/* Resumen General */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Colocado</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold cursor-help">{formatCurrencyCompact(totalColocado)}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(totalColocado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Cobrado</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold text-green-600 cursor-help">{formatCurrencyCompact(totalCobrado)}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(totalCobrado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Restante</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold text-orange-600 cursor-help">{formatCurrencyCompact(totalColocado - totalCobrado)}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(totalColocado - totalCobrado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Note about acuerdos coverage */}
            {summaryData.totalAcuerdos > 0 && Math.abs(totalColocado - summaryData.totalAcuerdos) > 1 && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                <strong>Nota:</strong> El desglose por etapa suma {formatCurrencyCompact(summaryData.totalAcuerdos)} (acuerdos de pago generados). 
                La diferencia de {formatCurrencyCompact(totalColocado - summaryData.totalAcuerdos)} corresponde a cuentas sin esquema de pagos asignado.
              </div>
            )}

            {/* Durante la Obra Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-2">Desglose por Etapa - Durante la Obra</h3>
              <p className="text-xs text-muted-foreground">(Apartado + Enganche + Pagos Especiales + Parcialidades)</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold cursor-help">{formatCurrencyCompact(summaryData.totalDuranteObra)}</p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(summaryData.totalDuranteObra)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold text-green-600 cursor-help">
                          {formatCurrencyCompact(summaryData.pagadoDuranteObra)}
                          <span className="text-xs font-normal ml-1">({summaryData.porcentajePagadoObra.toFixed(1)}%)</span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(summaryData.pagadoDuranteObra)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Restante</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold text-orange-600 cursor-help">
                        {formatCurrencyCompact(summaryData.restanteDuranteObra)}
                        <span className="text-xs font-normal ml-1">({summaryData.porcentajeRestanteObra.toFixed(1)}%)</span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(summaryData.restanteDuranteObra)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* A la Entrega Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-2">Desglose por Etapa - A la Entrega</h3>
              <p className="text-xs text-muted-foreground">(Pago a Contra Entrega)</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold cursor-help">{formatCurrencyCompact(summaryData.totalContraentrega)}</p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(summaryData.totalContraentrega)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold text-green-600 cursor-help">
                          {formatCurrencyCompact(summaryData.pagadoContraentrega)}
                          <span className="text-xs font-normal ml-1">({summaryData.porcentajePagadoEntrega.toFixed(1)}%)</span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(summaryData.pagadoContraentrega)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Restante</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold text-orange-600 cursor-help">
                        {formatCurrencyCompact(summaryData.restanteContraentrega)}
                        <span className="text-xs font-normal ml-1">({summaryData.porcentajeRestanteEntrega.toFixed(1)}%)</span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(summaryData.restanteContraentrega)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
