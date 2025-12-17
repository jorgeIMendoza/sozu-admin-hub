import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

interface ProjectCollectionSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectId: number;
  cuentaIds: number[];
  totalColocado: number;
  totalCobrado: number;
  valorProyecto: number;
  isRepresentanteEmpresaDuena?: boolean;
  isDesarrollador?: boolean;
  ownershipEntityIds?: number[];
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

interface OwnerSummary {
  id_entidad: number;
  dueno_nombre: string;
  tipo_entidad: string;
  cuentas_count: number;
  total_colocado: number;
  total_cobrado: number;
  total_restante: number;
}

export function ProjectCollectionSummaryDialog({ 
  isOpen, 
  onClose, 
  projectName, 
  projectId,
  cuentaIds,
  totalColocado,
  totalCobrado,
  valorProyecto,
  isRepresentanteEmpresaDuena,
  isDesarrollador,
  ownershipEntityIds
}: ProjectCollectionSummaryDialogProps) {
  const [activeTab, setActiveTab] = useState("todos");
  
  // Query for owner breakdown
  const { data: ownerBreakdown, isLoading: isLoadingOwners } = useQuery({
    queryKey: ["project-owner-breakdown", projectId, cuentaIds.length],
    queryFn: async () => {
      if (!cuentaIds.length) return [];

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: `
          SELECT 
            er.id as id_entidad,
            p.nombre_legal as dueno_nombre,
            te.nombre as tipo_entidad,
            COUNT(cc.id) as cuentas_count,
            SUM(cc.precio_final) as total_colocado,
            SUM(COALESCE(pagos.total_pagado, 0)) as total_cobrado
          FROM cuentas_cobranza cc
          JOIN ofertas o ON cc.id_oferta = o.id
          JOIN propiedades prop ON o.id_propiedad = prop.id
          JOIN entidades_relacionadas er ON prop.id_entidad_relacionada_dueno = er.id
          JOIN personas p ON er.id_persona = p.id
          JOIN tipos_entidad te ON er.id_tipo_entidad = te.id
          LEFT JOIN (
            SELECT 
              ap.id_cuenta_cobranza,
              SUM(apl.monto) as total_pagado
            FROM aplicaciones_pago apl
            JOIN acuerdos_pago ap ON apl.id_acuerdo_pago = ap.id
            WHERE apl.activo = true AND apl.es_multa = false AND ap.activo = true
            GROUP BY ap.id_cuenta_cobranza
          ) pagos ON pagos.id_cuenta_cobranza = cc.id
          WHERE cc.id IN (${cuentaIds.join(',')})
            AND cc.activo = true
            AND o.id_producto IS NULL
          GROUP BY er.id, p.nombre_legal, te.nombre
          ORDER BY total_colocado DESC
        `,
        max_rows: 100
      });

      if (error) {
        console.error('Error fetching owner breakdown:', error);
        return [];
      }

      return ((data as unknown) as OwnerSummary[])?.map(row => ({
        ...row,
        total_colocado: Number(row.total_colocado) || 0,
        total_cobrado: Number(row.total_cobrado) || 0,
        total_restante: (Number(row.total_colocado) || 0) - (Number(row.total_cobrado) || 0),
        cuentas_count: Number(row.cuentas_count) || 0
      })) || [];
    },
    enabled: isOpen && cuentaIds.length > 0,
  });

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["project-collection-summary", projectName, cuentaIds.length],
    queryFn: async () => {
      if (!cuentaIds.length) return null;

      // Query aggregated totals directly from the database using SQL
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

  // Filter owners by type
  const duenos = ownerBreakdown?.filter(o => o.tipo_entidad === 'Dueño' || o.tipo_entidad === 'Propietario') || [];
  const aportantes = ownerBreakdown?.filter(o => o.tipo_entidad === 'Aportante') || [];

  // If user is Representante de empresa dueña or Desarrollador, filter to only their entities
  const filteredDuenos = (isRepresentanteEmpresaDuena || isDesarrollador) && ownershipEntityIds?.length
    ? duenos.filter(d => ownershipEntityIds.includes(d.id_entidad))
    : duenos;
  
  const filteredAportantes = (isRepresentanteEmpresaDuena || isDesarrollador) && ownershipEntityIds?.length
    ? aportantes.filter(a => ownershipEntityIds.includes(a.id_entidad))
    : aportantes;

  const renderOwnerList = (owners: OwnerSummary[]) => {
    if (owners.length === 0) {
      return <p className="text-sm text-muted-foreground py-4">No hay datos disponibles</p>;
    }

    return (
      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {owners.map((owner, index) => (
          <div key={owner.id_entidad} className="p-3 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{owner.dueno_nombre}</span>
              <span className="text-xs text-muted-foreground">{owner.cuentas_count} propiedades</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block">Colocado</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold cursor-help">{formatCurrencyCompact(owner.total_colocado)}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(owner.total_colocado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div>
                <span className="text-muted-foreground block">Cobrado</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-green-600 cursor-help">{formatCurrencyCompact(owner.total_cobrado)}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(owner.total_cobrado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div>
                <span className="text-muted-foreground block">Restante</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-orange-600 cursor-help">{formatCurrencyCompact(owner.total_restante)}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(owner.total_restante)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumen de Cobranza - {projectName}</DialogTitle>
        </DialogHeader>

        {isLoading || isLoadingOwners ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !summaryData ? (
          <p className="text-sm text-muted-foreground py-4">No hay datos disponibles</p>
        ) : (
          <div className="space-y-6">
            {/* Resumen General con Valor del Proyecto */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Valor del Proyecto</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-lg font-bold text-blue-600 cursor-help">{formatCurrencyCompact(valorProyecto)}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(valorProyecto)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
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

            {/* Tabs para desglose por dueños/aportantes */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="duenos">Dueños ({filteredDuenos.length})</TabsTrigger>
                <TabsTrigger value="aportantes">Aportantes ({filteredAportantes.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="todos" className="mt-4">
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
                <div className="space-y-3 mt-6">
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
                  <div className="space-y-3 mt-6">
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
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 mt-6">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      <strong>Nota:</strong> Existe una diferencia de {formatCurrencyCompact(Math.abs(diferenciaColocado))} entre el Total Colocado ({formatCurrencyCompact(totalColocado)}) 
                      y la suma de acuerdos de pago ({formatCurrencyCompact(totalAcuerdos)}). 
                      Esto puede deberse a ajustes en precios finales o acuerdos pendientes de registrar.
                    </p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="duenos" className="mt-4">
                <h3 className="font-semibold text-sm mb-3">Desglose por Dueños</h3>
                {renderOwnerList(filteredDuenos)}
              </TabsContent>
              
              <TabsContent value="aportantes" className="mt-4">
                <h3 className="font-semibold text-sm mb-3">Desglose por Aportantes</h3>
                {renderOwnerList(filteredAportantes)}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}