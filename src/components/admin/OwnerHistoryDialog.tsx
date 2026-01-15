import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, User, CreditCard, BadgeCheck, Clock, History, ArrowDown, CalendarCheck } from 'lucide-react';
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
  trigger?: React.ReactNode;
}

interface OwnerHistoryEntry {
  cuenta_id: number;
  precio_final: number;
  total_pagado: number;
  completamente_pagada: boolean;
  fecha_creacion: string;
  fecha_entrega: string | null;
  tiene_cuenta_mantenimiento: boolean;
  compradores: {
    id_persona: number;
    nombre_legal: string;
    rfc: string | null;
    porcentaje_copropiedad: number;
  }[];
}

export function OwnerHistoryDialog({
  propertyId,
  numeroPropiedad,
  propietarioOriginal,
  esPropietarioActualComprador = false,
  trigger
}: OwnerHistoryDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['owner-history', propertyId],
    queryFn: async () => {
      // 1. First get ofertas for this property (not products)
      const { data: ofertasData, error: ofertasError } = await supabase
        .from('ofertas')
        .select('id')
        .eq('id_propiedad', propertyId)
        .is('id_producto', null)
        .eq('activo', true);

      if (ofertasError) throw ofertasError;
      if (!ofertasData || ofertasData.length === 0) return [];

      const ofertaIds = ofertasData.map(o => o.id);

      // 2. Get cuentas_cobranza for these ofertas
      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select('id, precio_final, fecha_creacion, id_oferta')
        .in('id_oferta', ofertaIds)
        .eq('activo', true)
        .is('id_tipo_cancelacion', null)
        .is('id_cuenta_cobranza_padre', null) // Only main accounts, not maintenance
        .order('fecha_creacion', { ascending: true });

      if (cuentasError) throw cuentasError;
      if (!cuentasData || cuentasData.length === 0) return [];

      const cuentaIds = cuentasData.map(c => c.id);

      // 3. Check which cuentas have maintenance accounts (this indicates delivery)
      const { data: cuentasMantenimiento } = await supabase
        .from('cuentas_cobranza')
        .select('id_cuenta_cobranza_padre, fecha_creacion')
        .in('id_cuenta_cobranza_padre', cuentaIds)
        .eq('activo', true);

      // Map: cuenta_padre_id -> fecha_creacion (delivery date)
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

      // 5. Get compradores for each cuenta
      const { data: compradoresData } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza,
          id_persona,
          porcentaje_copropiedad,
          personas!inner(nombre_legal, rfc)
        `)
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true)
        .order('porcentaje_copropiedad', { ascending: false });

      // Group compradores by cuenta
      const compradoresPorCuenta: Record<number, any[]> = {};
      compradoresData?.forEach(comp => {
        if (!compradoresPorCuenta[comp.id_cuenta_cobranza]) {
          compradoresPorCuenta[comp.id_cuenta_cobranza] = [];
        }
        compradoresPorCuenta[comp.id_cuenta_cobranza].push({
          id_persona: comp.id_persona,
          nombre_legal: (comp.personas as any)?.nombre_legal || 'Sin nombre',
          rfc: (comp.personas as any)?.rfc || null,
          porcentaje_copropiedad: Number(comp.porcentaje_copropiedad) || 0
        });
      });

      // Build the history entries
      const history: OwnerHistoryEntry[] = cuentasData.map(cuenta => {
        const totalPagado = pagosPorCuenta[cuenta.id] || 0;
        const precioFinal = Number(cuenta.precio_final) || 0;
        const restante = +(precioFinal - totalPagado).toFixed(2);
        const tieneMantenimiento = !!cuentasConMantenimiento[cuenta.id];
        const fechaEntrega = cuentasConMantenimiento[cuenta.id] || null;

        return {
          cuenta_id: cuenta.id,
          precio_final: precioFinal,
          total_pagado: totalPagado,
          completamente_pagada: restante <= 0 && precioFinal > 0,
          fecha_creacion: cuenta.fecha_creacion,
          fecha_entrega: fechaEntrega,
          tiene_cuenta_mantenimiento: tieneMantenimiento,
          compradores: compradoresPorCuenta[cuenta.id] || []
        };
      });

      return history;
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
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleOpenDialog = () => {
    setOpen(true);
  };

  // Get the current owner for display
  const getCurrentOwnerDisplay = () => {
    if (!historyData || historyData.length === 0) return null;
    
    // Find the entry with maintenance account (delivered)
    const entregada = historyData.find(e => e.tiene_cuenta_mantenimiento);
    if (entregada && entregada.compradores.length > 0) {
      return entregada.compradores.map(c => c.nombre_legal).join(', ');
    }
    return null;
  };

  const currentOwner = historyData ? getCurrentOwnerDisplay() : null;

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
              {/* Original Owner - Always first */}
              <div className="relative flex gap-4 pb-8">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Building2 className="h-5 w-5" />
                </div>
                
                <div className="flex-1 pt-1">
                  <div className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Dueño Original
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold">{propietarioOriginal}</h3>
                    {!esPropietarioActualComprador && !currentOwner && (
                      <Badge variant="default" className="mt-2">
                        Propietario Actual
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

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
              {!isLoading && historyData && historyData.map((entry, index) => {
                const isDelivered = entry.tiene_cuenta_mantenimiento;
                const isLast = index === historyData.length - 1;
                
                return (
                  <div key={entry.cuenta_id} className={cn("relative flex gap-4", !isLast && "pb-8")}>
                    {/* Timeline dot */}
                    <div className={cn(
                      "relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg transition-all",
                      isDelivered 
                        ? "bg-green-500 text-white" 
                        : "bg-amber-500 text-white"
                    )}>
                      {isDelivered ? (
                        <BadgeCheck className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    
                    <div className="flex-1 pt-1">
                      <div className={cn(
                        "rounded-lg border p-4 shadow-sm transition-all",
                        isDelivered 
                          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30" 
                          : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30"
                      )}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {isDelivered ? 'Propietario Actual' : 'Transacción en Proceso'}
                            </span>
                            {isDelivered ? (
                              <Badge className="bg-green-600 hover:bg-green-700 text-white">
                                Entregada
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                                En Proceso
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Compradores */}
                        {entry.compradores.length > 0 && (
                          <div className="mb-4">
                            {entry.compradores.map((comprador, cidx) => (
                              <div key={comprador.id_persona} className={cn(
                                "flex items-center gap-2",
                                cidx > 0 && "mt-1"
                              )}>
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold">{comprador.nombre_legal}</span>
                                {entry.compradores.length > 1 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({comprador.porcentaje_copropiedad.toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Details grid */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
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
                              {isDelivered ? 'Entrega:' : 'Inicio:'}
                            </span>
                            <span className="text-xs">
                              {formatDate(isDelivered && entry.fecha_entrega ? entry.fecha_entrega : entry.fecha_creacion)}
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
                              entry.completamente_pagada ? "text-green-600 dark:text-green-400" : ""
                            )}>
                              {formatCurrency(entry.total_pagado)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* No History Message */}
              {!isLoading && (!historyData || historyData.length === 0) && (
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
                        El único propietario es el dueño original.
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
