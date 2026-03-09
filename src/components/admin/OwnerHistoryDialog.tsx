import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, User, CreditCard, BadgeCheck, Clock, History, CalendarCheck, XCircle, FileText, AlertTriangle, ArrowDownToLine } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatCuentaCobranzaId } from '@/utils/cuentaCobranzaUtils';
import { cn } from '@/lib/utils';

interface OwnerHistoryDialogProps {
  propertyId: number;
  numeroPropiedad: string;
  propietarioOriginal: string;
  esPropietarioActualComprador?: boolean;
  idEstatusDisponibilidad?: number;
  idTipoTransaccion?: number;
  nombreTipoTransaccion?: string;
  trigger?: React.ReactNode;
}

interface CuentaProducto {
  cuenta_id: number;
  producto_nombre: string;
  precio_final: number;
  total_pagado: number;
  monto_penalizacion: number;
  monto_reembolso: number;
  url_evidencia_reembolso: string | null;
}

interface OwnerHistoryEntry {
  cuenta_id: number;
  precio_final: number;
  total_pagado: number;
  completamente_pagada: boolean;
  fecha_compra: string;
  fecha_entrega: string | null;
  tiene_cuenta_mantenimiento: boolean;
  id_tipo_cancelacion: number | null;
  nombre_tipo_cancelacion: string | null;
  monto_penalizacion: number;
  monto_reembolso: number;
  url_evidencia_cancelacion: string | null;
  url_evidencia_reembolso: string | null;
  compradores: {
    id_persona: number;
    nombre_legal: string;
    rfc: string | null;
    porcentaje_copropiedad: number;
  }[];
  cuentas_producto: CuentaProducto[];
  total_pagado_consolidado: number;
  total_penalizacion_consolidado: number;
  total_reembolso_consolidado: number;
}

export function OwnerHistoryDialog({
  propertyId,
  numeroPropiedad,
  propietarioOriginal,
  esPropietarioActualComprador = false,
  idEstatusDisponibilidad,
  idTipoTransaccion,
  nombreTipoTransaccion,
  trigger
}: OwnerHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  
  // Check if property is in "Asignado" status (fideicomiso)
  const esAsignado = idEstatusDisponibilidad === 10;
  // Check if property is in "Reventa" status
  const esReventa = idTipoTransaccion === 2;

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['owner-history', propertyId, esReventa],
    queryFn: async () => {
      // 1. Get ALL ofertas for this property (including inactive for history)
      const { data: ofertasData, error: ofertasError } = await supabase
        .from('ofertas')
        .select('id')
        .eq('id_propiedad', propertyId)
        .is('id_producto', null);

      if (ofertasError) throw ofertasError;
      if (!ofertasData || ofertasData.length === 0) return { entries: [], esFideicomiso: false };

      const ofertaIds = ofertasData.map(o => o.id);

      // 2. Get cuentas_cobranza for these ofertas (include cancelled for history)
      // Include: active accounts + cancelled by Rescisión(3) or Reventa(7)
      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select('id, precio_final, fecha_compra, fecha_creacion, id_oferta, id_tipo_cancelacion, tipos_cancelacion:id_tipo_cancelacion(nombre), monto_cobro_cancelacion, url_evidencia_cancelacion, url_evidencia_reembolso')
        .in('id_oferta', ofertaIds)
        .is('id_cuenta_cobranza_padre', null)
        .or('id_tipo_cancelacion.is.null,id_tipo_cancelacion.in.(3,7)')
        .order('fecha_compra', { ascending: true });

      if (cuentasError) throw cuentasError;
      if (!cuentasData || cuentasData.length === 0) return { entries: [], esFideicomiso: false };

      const cuentaIds = cuentasData.map(c => c.id);

      // 2.5. Check if any account has "Asignación" concept (id=15) - this means it's a fideicomiso
      const { data: acuerdosAsignacion } = await supabase
        .from('acuerdos_pago')
        .select('id_cuenta_cobranza')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('id_concepto', 15) // Asignación
        .eq('activo', true)
        .limit(1);
      
      const esFideicomiso = (acuerdosAsignacion && acuerdosAsignacion.length > 0);

      // 3. Get maintenance accounts (fecha_entrega) for each main account
      const { data: cuentasMantenimiento } = await supabase
        .from('cuentas_cobranza')
        .select('id_cuenta_cobranza_padre, fecha_creacion')
        .in('id_cuenta_cobranza_padre', cuentaIds)
        .eq('activo', true);

      // Map: cuenta_padre_id -> fecha_creacion (delivery date = when maintenance account was created)
      const cuentasConMantenimiento: Record<number, string> = {};
      cuentasMantenimiento?.forEach(cm => {
        if (cm.id_cuenta_cobranza_padre) {
          cuentasConMantenimiento[cm.id_cuenta_cobranza_padre] = cm.fecha_creacion;
        }
      });

      // 4. Get all pagos for these cuentas to calculate total paid
      const { data: pagosData } = await supabase
        .from('pagos')
        .select('id_cuenta_cobranza, monto')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      // Calculate total paid per cuenta
      const pagosPorCuenta: Record<number, number> = {};
      pagosData?.forEach(pago => {
        pagosPorCuenta[pago.id_cuenta_cobranza] = 
          (pagosPorCuenta[pago.id_cuenta_cobranza] || 0) + Number(pago.monto || 0);
      });

      // 5. Get compradores for each cuenta - separate query for personas
      const { data: compradoresData } = await supabase
        .from('compradores')
        .select('id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true)
        .order('porcentaje_copropiedad', { ascending: false });

      // Get persona IDs
      const personaIds = (compradoresData || []).map(c => c.id_persona);
      
      // Fetch personas separately
      let personasMap: Record<number, { nombre_legal: string; rfc: string | null }> = {};
      if (personaIds.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('id, nombre_legal, rfc')
          .in('id', personaIds);
        
        (personasData || []).forEach(p => {
          personasMap[p.id] = {
            nombre_legal: p.nombre_legal || 'Sin nombre',
            rfc: p.rfc || null
          };
        });
      }

      // Group compradores by cuenta with persona data
      const compradoresPorCuenta: Record<number, any[]> = {};
      (compradoresData || []).forEach(comp => {
        if (!compradoresPorCuenta[comp.id_cuenta_cobranza]) {
          compradoresPorCuenta[comp.id_cuenta_cobranza] = [];
        }
        const persona = personasMap[comp.id_persona];
        compradoresPorCuenta[comp.id_cuenta_cobranza].push({
          id_persona: comp.id_persona,
          nombre_legal: persona?.nombre_legal || 'Sin nombre',
          rfc: persona?.rfc || null,
          porcentaje_copropiedad: Number(comp.porcentaje_copropiedad) || 0
        });
      });

      // 6. Get product accounts for cancelled entries (same property, different ofertas with id_producto)
      const cancelledCuentaIds = cuentasData
        .filter(c => c.id_tipo_cancelacion !== null)
        .map(c => c.id);

      let productAccountsByParent: Record<number, CuentaProducto[]> = {};

      if (cancelledCuentaIds.length > 0) {
        const { data: productOfertasData } = await supabase
          .from('ofertas')
          .select('id, id_producto')
          .eq('id_propiedad', propertyId)
          .not('id_producto', 'is', null);

        if (productOfertasData && productOfertasData.length > 0) {
          const productOfertaIds = productOfertasData.map(o => o.id);
          const productIdMap: Record<number, number> = {};
          productOfertasData.forEach(o => { productIdMap[o.id] = o.id_producto!; });

          const { data: productCuentas } = await supabase
            .from('cuentas_cobranza')
            .select('id, precio_final, id_oferta, id_tipo_cancelacion, monto_cobro_cancelacion, url_evidencia_reembolso')
            .in('id_oferta', productOfertaIds)
            .or('id_tipo_cancelacion.in.(3,7)');

          if (productCuentas && productCuentas.length > 0) {
            const productCuentaIds = productCuentas.map(pc => pc.id);

            const { data: productPagos } = await supabase
              .from('pagos')
              .select('id_cuenta_cobranza, monto')
              .in('id_cuenta_cobranza', productCuentaIds)
              .eq('activo', true);

            const productPagosPorCuenta: Record<number, number> = {};
            productPagos?.forEach(p => {
              productPagosPorCuenta[p.id_cuenta_cobranza] = (productPagosPorCuenta[p.id_cuenta_cobranza] || 0) + Number(p.monto || 0);
            });

            const productIds = [...new Set(Object.values(productIdMap))];
            const { data: productosData } = await supabase
              .from('productos_servicios')
              .select('id, nombre')
              .in('id', productIds);

            const productNamesMap: Record<number, string> = {};
            productosData?.forEach(p => { productNamesMap[p.id] = p.nombre; });

            const parentCuentaId = cancelledCuentaIds[0];
            productCuentas.forEach(pc => {
              const totalPagado = productPagosPorCuenta[pc.id] || 0;
              const penalizacion = Number((pc as any).monto_cobro_cancelacion) || 0;
              const reembolso = totalPagado > 0 ? Math.max(0, totalPagado - penalizacion) : 0;
              const productoId = productIdMap[pc.id_oferta];
              const productoNombre = productNamesMap[productoId] || 'Producto';

              if (!productAccountsByParent[parentCuentaId]) {
                productAccountsByParent[parentCuentaId] = [];
              }
              productAccountsByParent[parentCuentaId].push({
                cuenta_id: pc.id,
                producto_nombre: productoNombre,
                precio_final: Number(pc.precio_final) || 0,
                total_pagado: totalPagado,
                monto_penalizacion: penalizacion,
                monto_reembolso: reembolso,
                url_evidencia_reembolso: (pc as any).url_evidencia_reembolso || null,
              });
            });
          }
        }
      }

      // Build the history entries
      const entries: OwnerHistoryEntry[] = cuentasData.map(cuenta => {
        const totalPagado = pagosPorCuenta[cuenta.id] || 0;
        const precioFinal = Number(cuenta.precio_final) || 0;
        const restante = +(precioFinal - totalPagado).toFixed(2);
        const tieneMantenimiento = !!cuentasConMantenimiento[cuenta.id];
        const fechaEntrega = cuentasConMantenimiento[cuenta.id] || null;
        const tipoCancelacion = (cuenta as any).tipos_cancelacion as { nombre: string } | null;
        const montoPenalizacion = Number((cuenta as any).monto_cobro_cancelacion) || 0;
        const urlEvidenciaCancelacion = (cuenta as any).url_evidencia_cancelacion || null;
        const urlEvidenciaReembolso = (cuenta as any).url_evidencia_reembolso || null;
        const isCancelled = cuenta.id_tipo_cancelacion !== null;
        const montoReembolso = isCancelled ? Math.max(0, totalPagado - montoPenalizacion) : 0;
        const cuentasProducto = productAccountsByParent[cuenta.id] || [];

        const totalPagadoProductos = cuentasProducto.reduce((sum, cp) => sum + cp.total_pagado, 0);
        const totalPenalizacionProductos = cuentasProducto.reduce((sum, cp) => sum + cp.monto_penalizacion, 0);
        const totalReembolsoProductos = cuentasProducto.reduce((sum, cp) => sum + cp.monto_reembolso, 0);

        return {
          cuenta_id: cuenta.id,
          precio_final: precioFinal,
          total_pagado: totalPagado,
          completamente_pagada: restante <= 0 && precioFinal > 0,
          fecha_compra: cuenta.fecha_compra || cuenta.fecha_creacion,
          fecha_entrega: fechaEntrega,
          tiene_cuenta_mantenimiento: tieneMantenimiento,
          id_tipo_cancelacion: cuenta.id_tipo_cancelacion ?? null,
          nombre_tipo_cancelacion: tipoCancelacion?.nombre || null,
          monto_penalizacion: montoPenalizacion,
          monto_reembolso: montoReembolso,
          url_evidencia_cancelacion: urlEvidenciaCancelacion,
          url_evidencia_reembolso: urlEvidenciaReembolso,
          compradores: compradoresPorCuenta[cuenta.id] || [],
          cuentas_producto: cuentasProducto,
          total_pagado_consolidado: totalPagado + totalPagadoProductos,
          total_penalizacion_consolidado: montoPenalizacion + totalPenalizacionProductos,
          total_reembolso_consolidado: montoReembolso + totalReembolsoProductos,
        };
      });

      return { entries, esFideicomiso };
    },
    enabled: open,
    staleTime: 60 * 1000 // Cache for 1 minute
  });

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
  };

  const formatDate = (dateString: string) => {
    // For date-only strings (YYYY-MM-DD), append T12:00:00 to avoid timezone shift
    const normalized = dateString.length === 10 ? `${dateString}T12:00:00` : dateString;
    return new Date(normalized).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleOpenDialog = () => {
    setOpen(true);
  };

  // Determine if this property was ever part of a fideicomiso (from query or status)
  const esFideicomiso = historyData?.esFideicomiso || esAsignado;
  const entries = historyData?.entries || [];

  // Get the current owner name for delivered properties
  const getCurrentOwnerNames = () => {
    if (!entries || entries.length === 0) return null;
    
    const entregada = entries.find(e => e.tiene_cuenta_mantenimiento);
    if (entregada && entregada.compradores.length > 0) {
      return entregada.compradores.map(c => c.nombre_legal);
    }
    return null;
  };

  return (
    <>
      {/* Trigger Button */}
      {trigger ? (
        <span onClick={handleOpenDialog}>{trigger}</span>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenDialog}
                className="h-6 w-6 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent"
              >
                <History className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ver historial de propietarios</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Historial de Propietarios
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Propiedad {numeroPropiedad}
            </p>
          </DialogHeader>

          <div className="relative py-4">
            {/* Timeline line */}
            <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-primary/50 to-muted" />

            <div className="space-y-0">
              {/* Original Owner - Only show if NOT fideicomiso */}
              {!esFideicomiso && (
                <div className="relative flex gap-4 pb-8">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <Building2 className="h-5 w-5" />
                  </div>
                  
                  <div className="flex-1 pt-1">
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Propietario de Origen
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold">{propietarioOriginal}</h3>
                      {!entries?.some(e => e.tiene_cuenta_mantenimiento) && !esFideicomiso && !esReventa && entries.length === 0 && (
                        <Badge variant="default" className="mt-2">
                          Propietario Actual
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="relative flex gap-4 pb-8">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Skeleton className="h-5 w-5" />
                  </div>
                  <div className="flex-1 pt-1">
                    <Skeleton className="h-40 w-full rounded-lg" />
                  </div>
                </div>
              )}

              {/* History Entries */}
              {!isLoading && entries && entries.map((entry, index) => {
                const isCancelled = entry.id_tipo_cancelacion !== null;
                const isDelivered = entry.tiene_cuenta_mantenimiento && !isCancelled;
                const isLast = index === entries.length - 1;
                const isEntryFideicomiso = esFideicomiso && !isDelivered && !isCancelled;
                // For resale: the last delivered entry is still the current owner
                const isCurrentOwnerInResale = esReventa && isLast && isDelivered;
                // Determine if this entry is an intermediate owner
                const isIntermediateOwner = index > 0 && !isLast;
                
                // Determine the label for this entry
                const getEntryLabel = () => {
                  if (isCancelled) return 'Propietario Anterior';
                  if (isDelivered && isLast) return 'Propietario Actual';
                  if (isEntryFideicomiso && isLast) return 'Propietario Actual';
                  if (isIntermediateOwner) return 'Propietario';
                  if (!isDelivered && !isEntryFideicomiso) return 'Transacción en Proceso';
                  return 'Propietario';
                };
                
                // Get badge content for this entry
                const getBadgeContent = () => {
                  if (isCurrentOwnerInResale && nombreTipoTransaccion) {
                    return nombreTipoTransaccion;
                  }
                  if (isDelivered) return 'Entregada';
                  if (isEntryFideicomiso) return 'Fideicomiso';
                  return 'En Proceso';
                };
                
                return (
                  <div key={entry.cuenta_id} className={cn("relative flex gap-4", !isLast && "pb-8")}>
                    {/* Timeline dot */}
                    <div className={cn(
                      "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg transition-all",
                      isCancelled
                        ? "bg-red-500 text-white"
                        : isCurrentOwnerInResale
                          ? "bg-orange-500 text-white"
                          : isDelivered 
                            ? "bg-green-500 text-white" 
                            : isEntryFideicomiso
                              ? "bg-blue-500 text-white"
                              : "bg-amber-500 text-white"
                    )}>
                      {isCancelled ? (
                        <XCircle className="h-5 w-5" />
                      ) : isDelivered ? (
                        <BadgeCheck className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    
                    <div className="flex-1 pt-1">
                      <div className={cn(
                        "rounded-lg border p-4 shadow-sm transition-all",
                        isCancelled
                          ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30 opacity-75"
                          : isCurrentOwnerInResale
                            ? "border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/30"
                            : isDelivered 
                              ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30" 
                              : isEntryFideicomiso
                                ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30"
                                : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30"
                      )}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {getEntryLabel()}
                            </span>
                            {/* Status badge */}
                            {isCancelled ? (
                              <Badge className="bg-red-600 hover:bg-red-700 text-white">
                                {entry.nombre_tipo_cancelacion || 'Cancelada'}
                              </Badge>
                            ) : isDelivered ? (
                              <Badge className="bg-green-600 hover:bg-green-700 text-white">
                                Entregada
                              </Badge>
                            ) : isEntryFideicomiso ? (
                              <Badge className="bg-blue-600 hover:bg-blue-700 text-white">
                                Fideicomiso
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                                En Proceso
                              </Badge>
                            )}
                            {/* Transaction type badge (Re-venta) - only for last entry in resale */}
                            {isCurrentOwnerInResale && nombreTipoTransaccion && (
                              <Badge className="bg-orange-600 hover:bg-orange-700 text-white">
                                {nombreTipoTransaccion}
                              </Badge>
                            )}
                            {isEntryFideicomiso && isLast && (
                              <Badge variant="default" className="ml-auto">
                                Propietario Actual
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Compradores - Show names prominently */}
                        {entry.compradores.length > 0 ? (
                          <div className="mb-4">
                            {entry.compradores.map((comprador, cidx) => (
                              <div key={comprador.id_persona} className={cn(
                                "flex items-center gap-2",
                                cidx > 0 && "mt-2"
                              )}>
                                <User className="h-5 w-5 text-muted-foreground" />
                                <span className="text-lg font-semibold">{comprador.nombre_legal}</span>
                                {entry.compradores.length > 1 && (
                                  <Badge variant="outline" className="text-xs">
                                    {comprador.porcentaje_copropiedad.toFixed(0)}%
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mb-4 text-muted-foreground italic">
                            Sin compradores registrados
                          </div>
                        )}

                        {/* Details grid - Show fideicomiso info OR account details */}
                        {isEntryFideicomiso ? (
                          <div className="border-t pt-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Building2 className="h-4 w-4" />
                              <span>Esta propiedad forma parte de un <strong className="text-foreground">fideicomiso</strong></span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                              <CalendarCheck className="h-4 w-4" />
                              <span>Fecha de asignación:</span>
                              <span className="text-foreground">{formatDate(entry.fecha_compra)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm border-t pt-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Cuenta:</span>
                                <span className="font-mono font-medium text-xs">
                                  {formatCuentaCobranzaId(entry.cuenta_id)}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {isDelivered ? 'Entrega:' : 'Compra:'}
                                </span>
                                <span className="text-xs">
                                  {formatDate(isDelivered && entry.fecha_entrega ? entry.fecha_entrega : entry.fecha_compra)}
                                </span>
                              </div>
                              
                              <div>
                                <span className="text-muted-foreground">Precio:</span>
                                <span className="ml-2 font-medium">{formatCurrency(entry.precio_final)}</span>
                              </div>
                              
                              <div>
                                <span className="text-muted-foreground">Pagado:</span>
                                <span className={cn(
                                  "ml-2 font-medium",
                                  entry.completamente_pagada && !isCancelled ? "text-green-600 dark:text-green-400" : ""
                                )}>
                                  {formatCurrency(entry.total_pagado)}
                                </span>
                              </div>
                            </div>

                            {/* Cancelled account breakdown: Penalización, Reembolso, Evidence */}
                            {isCancelled && entry.total_pagado_consolidado > 0 && (
                              <div className="border-t border-red-200 dark:border-red-800 pt-3 space-y-3">
                                {/* If there are product accounts, show detailed breakdown */}
                                {entry.cuentas_producto.length > 0 ? (
                                  <>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Desglose por cuenta</p>
                                    <div className="rounded-md border border-red-200 dark:border-red-800 overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-red-50 dark:bg-red-950/40">
                                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Cuenta</th>
                                            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Pagado</th>
                                            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Penalización</th>
                                            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Reembolso</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {/* Main property account */}
                                          <tr className="border-t border-red-100 dark:border-red-900">
                                            <td className="px-2 py-1.5">
                                              <span className="font-mono">{formatCuentaCobranzaId(entry.cuenta_id)}</span>
                                              <span className="ml-1 text-muted-foreground">(Propiedad)</span>
                                            </td>
                                            <td className="text-right px-2 py-1.5">{formatCurrency(entry.total_pagado)}</td>
                                            <td className="text-right px-2 py-1.5 text-red-600 dark:text-red-400">
                                              {entry.monto_penalizacion > 0 ? formatCurrency(entry.monto_penalizacion) : '$0.00'}
                                            </td>
                                            <td className="text-right px-2 py-1.5">{formatCurrency(entry.monto_reembolso)}</td>
                                          </tr>
                                          {/* Product accounts */}
                                          {entry.cuentas_producto.map(cp => (
                                            <tr key={cp.cuenta_id} className="border-t border-red-100 dark:border-red-900">
                                              <td className="px-2 py-1.5">
                                                <span className="font-mono">{formatCuentaCobranzaId(cp.cuenta_id, 'Producto')}</span>
                                                <span className="ml-1 text-muted-foreground">({cp.producto_nombre})</span>
                                              </td>
                                              <td className="text-right px-2 py-1.5">
                                                {cp.total_pagado > 0 ? formatCurrency(cp.total_pagado) : '$0.00'}
                                              </td>
                                              <td className="text-right px-2 py-1.5 text-red-600 dark:text-red-400">
                                                {cp.monto_penalizacion > 0 ? formatCurrency(cp.monto_penalizacion) : '$0.00'}
                                              </td>
                                              <td className="text-right px-2 py-1.5">
                                                {cp.monto_reembolso > 0 ? formatCurrency(cp.monto_reembolso) : '$0.00'}
                                              </td>
                                            </tr>
                                          ))}
                                          {/* Totals row */}
                                          <tr className="border-t-2 border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30 font-semibold">
                                            <td className="px-2 py-1.5">Total</td>
                                            <td className="text-right px-2 py-1.5">{formatCurrency(entry.total_pagado_consolidado)}</td>
                                            <td className="text-right px-2 py-1.5 text-red-600 dark:text-red-400">{formatCurrency(entry.total_penalizacion_consolidado)}</td>
                                            <td className="text-right px-2 py-1.5 font-bold">{formatCurrency(entry.total_reembolso_consolidado)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : (
                                  /* Simple view when no product accounts */
                                  <>
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4 text-red-500" />
                                      <span className="text-muted-foreground">Penalización:</span>
                                      <span className="font-medium text-red-600 dark:text-red-400">
                                        {entry.monto_penalizacion > 0 ? formatCurrency(entry.monto_penalizacion) : 'Sin registro'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-muted-foreground">Reembolso:</span>
                                      <span className="font-medium">
                                        {formatCurrency(entry.monto_reembolso)}
                                      </span>
                                    </div>
                                  </>
                                )}
                                {/* Evidence links */}
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {entry.url_evidencia_cancelacion && (
                                    <a
                                      href={entry.url_evidencia_cancelacion}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Convenio de cancelación
                                    </a>
                                  )}
                                  {entry.url_evidencia_reembolso && (
                                    <a
                                      href={entry.url_evidencia_reembolso}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Acuse de cheque
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}


              {/* No History Message */}
              {!isLoading && (!entries || entries.length === 0) && !esReventa && (
                <div className="relative flex gap-4">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                    <History className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-muted-foreground text-center">
                        Esta propiedad no tiene historial de ventas registrado.
                      </p>
                      <p className="text-sm text-muted-foreground text-center mt-1">
                        El único propietario es el propietario de origen.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
