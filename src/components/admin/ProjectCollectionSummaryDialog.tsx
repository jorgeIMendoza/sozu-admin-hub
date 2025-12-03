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

// Durante la Obra: 1, 2, 4, 5, 6 (Apartado, Enganche, Pago especial, Parcialidad, Cesión de derechos)
// A la Entrega: 3 (Pago a contra entrega)

export function ProjectCollectionSummaryDialog({ 
  isOpen, 
  onClose, 
  projectName, 
  cuentaIds,
  totalColocado,
  totalCobrado
}: ProjectCollectionSummaryDialogProps) {
  
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["project-collection-summary", projectName, cuentaIds.length],
    queryFn: async () => {
      if (!cuentaIds.length) return null;

      // Query aggregated totals directly from the database using SQL
      // This avoids any client-side limits
      const { data: acuerdosTotals, error: acuerdosError } = await supabase
        .rpc('execute_safe_query', {
          query_text: `
            SELECT 
              CASE 
                WHEN id_concepto IN (1, 2, 4, 5, 6) THEN 'durante_obra'
                WHEN id_concepto = 3 THEN 'contraentrega'
                ELSE 'otro'
              END as categoria,
              SUM(monto) as total_monto
            FROM acuerdos_pago
            WHERE id_cuenta_cobranza IN (${cuentaIds.join(',')})
              AND activo = true
            GROUP BY categoria
          `,
          max_rows: 10
        });

      if (acuerdosError) throw acuerdosError;

      // Query aggregated paid amounts
      const { data: pagadoTotals, error: pagadoError } = await supabase
        .rpc('execute_safe_query', {
          query_text: `
            SELECT 
              CASE 
                WHEN ap.id_concepto IN (1, 2, 4, 5, 6) THEN 'durante_obra'
                WHEN ap.id_concepto = 3 THEN 'contraentrega'
                ELSE 'otro'
              END as categoria,
              SUM(apl.monto) as total_pagado
            FROM aplicaciones_pago apl
            JOIN acuerdos_pago ap ON apl.id_acuerdo_pago = ap.id
            WHERE ap.id_cuenta_cobranza IN (${cuentaIds.join(',')})
              AND apl.activo = true
              AND apl.es_multa = false
              AND ap.activo = true
            GROUP BY categoria
          `,
          max_rows: 10
        });

      if (pagadoError) throw pagadoError;

      // Parse results
      const acuerdosArray = acuerdosTotals as Array<{ categoria: string; total_monto: number }> || [];
      const pagadoArray = pagadoTotals as Array<{ categoria: string; total_pagado: number }> || [];

      let totalDuranteObra = 0;
      let totalContraentrega = 0;
      let totalOtros = 0;
      let pagadoDuranteObra = 0;
      let pagadoContraentrega = 0;

      // Process acuerdos totals
      acuerdosArray.forEach(row => {
        if (row.categoria === 'durante_obra') {
          totalDuranteObra = Number(row.total_monto) || 0;
        } else if (row.categoria === 'contraentrega') {
          totalContraentrega = Number(row.total_monto) || 0;
        } else if (row.categoria === 'otro') {
          totalOtros = Number(row.total_monto) || 0;
        }
      });

      // Process pagado totals
      pagadoArray.forEach(row => {
        if (row.categoria === 'durante_obra') {
          pagadoDuranteObra = Number(row.total_pagado) || 0;
        } else if (row.categoria === 'contraentrega') {
          pagadoContraentrega = Number(row.total_pagado) || 0;
        }
      });

      const restanteDuranteObra = totalDuranteObra - pagadoDuranteObra;
      const restanteContraentrega = totalContraentrega - pagadoContraentrega;
      
      // Sum from acuerdos_pago
      const totalFromAcuerdos = totalDuranteObra + totalContraentrega + totalOtros;

      return {
        totalDuranteObra,
        totalContraentrega,
        totalOtros,
        totalFromAcuerdos,
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

  // Calculate percentages for the breakdown relative to totalFromAcuerdos (from acuerdos_pago)
  const totalAcuerdos = summaryData?.totalFromAcuerdos || 0;
  const porcentajeDuranteObra = totalAcuerdos > 0 && summaryData ? (summaryData.totalDuranteObra / totalAcuerdos) * 100 : 0;
  const porcentajeContraentrega = totalAcuerdos > 0 && summaryData ? (summaryData.totalContraentrega / totalAcuerdos) * 100 : 0;
  const porcentajeOtros = totalAcuerdos > 0 && summaryData ? (summaryData.totalOtros / totalAcuerdos) * 100 : 0;
  
  // Difference between precio_final and acuerdos_pago totals
  const diferenciaColocado = summaryData ? totalColocado - totalAcuerdos : 0;

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

            {/* Durante la Obra Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm border-b pb-2">Desglose por Etapa - Durante la Obra</h3>
              <p className="text-xs text-muted-foreground">(Apartado + Enganche + Pagos Especiales + Parcialidades + Cesión de derechos)</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold cursor-help">
                          {formatCurrencyCompact(summaryData.totalDuranteObra)}
                          <span className="text-xs font-normal ml-1 text-muted-foreground">({porcentajeDuranteObra.toFixed(1)}%)</span>
                        </p>
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
                        <p className="text-lg font-bold cursor-help">
                          {formatCurrencyCompact(summaryData.totalContraentrega)}
                          <span className="text-xs font-normal ml-1 text-muted-foreground">({porcentajeContraentrega.toFixed(1)}%)</span>
                        </p>
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

            {/* Otros conceptos - solo mostrar si hay */}
            {summaryData.totalOtros > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm border-b pb-2">Otros Conceptos</h3>
                <p className="text-xs text-muted-foreground">(Pagos por cancelación, etc.)</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Monto Total</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-lg font-bold cursor-help">
                          {formatCurrencyCompact(summaryData.totalOtros)}
                          <span className="text-xs font-normal ml-1 text-muted-foreground">({porcentajeOtros.toFixed(1)}%)</span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(summaryData.totalOtros)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}

            {/* Nota sobre diferencia si existe */}
            {Math.abs(diferenciaColocado) > 1 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Nota:</strong> Existe una diferencia de {formatCurrencyCompact(Math.abs(diferenciaColocado))} entre el Total Colocado ({formatCurrencyCompact(totalColocado)}) 
                  y la suma de acuerdos de pago ({formatCurrencyCompact(totalAcuerdos)}). 
                  Esto puede deberse a ajustes en precios finales o acuerdos pendientes de registrar.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
