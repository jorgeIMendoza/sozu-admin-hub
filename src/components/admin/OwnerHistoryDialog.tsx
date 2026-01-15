import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Building2, User, CreditCard, BadgeCheck, Clock, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
      // 1. Get all active cuentas_cobranza for this property (not products)
      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          precio_final,
          fecha_creacion,
          ofertas!inner(id_propiedad, id_producto)
        `)
        .eq('ofertas.id_propiedad', propertyId)
        .is('ofertas.id_producto', null)
        .eq('activo', true)
        .is('id_tipo_cancelacion', null)
        .order('fecha_creacion', { ascending: true });

      if (cuentasError) throw cuentasError;
      if (!cuentasData || cuentasData.length === 0) return [];

      const cuentaIds = cuentasData.map(c => c.id);

      // 2. Get all pagos for these cuentas to calculate total paid
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

      // 3. Get compradores for each cuenta
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

        return {
          cuenta_id: cuenta.id,
          precio_final: precioFinal,
          total_pagado: totalPagado,
          completamente_pagada: restante <= 0 && precioFinal > 0,
          fecha_creacion: cuenta.fecha_creacion,
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
      month: 'short',
      day: 'numeric'
    });
  };

  // Determine current owner from the history
  const propietarioActual = historyData?.find(h => h.completamente_pagada)?.compradores || null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                >
                  <History className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ver historial de propietarios</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Propietarios - Propiedad {numeroPropiedad}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Original Owner Section */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Dueño Original</h3>
            </div>
            <div className="flex items-center gap-2 pl-7">
              <span className="text-lg">{propietarioOriginal}</span>
              {!esPropietarioActualComprador && (
                <Badge variant="default" className="ml-2">
                  Propietario Actual
                </Badge>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {/* History Entries */}
          {!isLoading && historyData && historyData.length > 0 && (
            <div className="space-y-4">
              {historyData.map((entry, index) => (
                <div
                  key={entry.cuenta_id}
                  className={cn(
                    "rounded-lg border p-4",
                    entry.completamente_pagada 
                      ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30" 
                      : "bg-card"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-semibold">
                        {entry.completamente_pagada ? 'Propietario Actual' : 'Transacción en Proceso'}
                      </h3>
                      {entry.completamente_pagada && (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          <BadgeCheck className="h-3 w-3 mr-1" />
                          Completada
                        </Badge>
                      )}
                      {!entry.completamente_pagada && (
                        <Badge variant="secondary">
                          <Clock className="h-3 w-3 mr-1" />
                          En Proceso
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Account Info */}
                  <div className="grid grid-cols-2 gap-4 mb-4 pl-7 text-sm">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Cuenta:</span>
                      <span className="font-mono font-medium">
                        {formatCuentaCobranzaId(entry.cuenta_id)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fecha:</span>
                      <span className="ml-2">{formatDate(entry.fecha_creacion)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Precio Final:</span>
                      <span className="ml-2 font-medium">{formatCurrency(entry.precio_final)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Pagado:</span>
                      <span className={cn(
                        "ml-2 font-medium",
                        entry.completamente_pagada ? "text-green-600 dark:text-green-400" : ""
                      )}>
                        {formatCurrency(entry.total_pagado)}
                      </span>
                    </div>
                  </div>

                  {/* Buyers Table */}
                  {entry.compradores.length > 0 && (
                    <div className="pl-7">
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        Compradores ({entry.compradores.length})
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>RFC</TableHead>
                            <TableHead className="text-right">% Copropiedad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.compradores.map((comprador) => (
                            <TableRow key={comprador.id_persona}>
                              <TableCell className="font-medium">
                                {comprador.nombre_legal}
                              </TableCell>
                              <TableCell>
                                {comprador.rfc ? (
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {comprador.rfc}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {comprador.porcentaje_copropiedad.toFixed(2)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No History Message */}
          {!isLoading && (!historyData || historyData.length === 0) && (
            <div className="text-center text-muted-foreground py-8">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Esta propiedad no tiene historial de ventas registrado.</p>
              <p className="text-sm mt-1">El único propietario es el dueño original.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
