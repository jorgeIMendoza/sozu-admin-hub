import { useState, useMemo } from "react";
import { ENVIRONMENT } from "@/lib/config";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isBefore, isEqual } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Upload, Eye, FileText, Stamp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ComisionesPorPagarTabProps {
  comisionistasAgrupados: any[];
  cuentasAgrupadas: any[];
  loadingComisionistas: boolean;
  loadingCuentas: boolean;
  filtroGeneral: string;
  formatCurrency: (value: number) => string;
  openPagarDialog: (email: string, idCuenta: number) => void;
  openPagarTodasDialog: (type: 'comisionista' | 'cuenta', data: any) => void;
}

// Función para determinar la fecha límite de enganche según la lógica de negocio
function getFechaLimiteEnganche(): Date {
  const today = new Date();
  const currentDay = today.getDate();
  
  if (currentDay >= 16) {
    // Del 16 al fin de mes: mostrar comisiones con enganche pagado hasta el día 15 del mes actual
    const limitDate = new Date(today.getFullYear(), today.getMonth(), 15, 23, 59, 59, 999);
    return limitDate;
  } else {
    // Del 1 al 15: mostrar comisiones con enganche pagado hasta fin del mes anterior
    const lastMonth = subMonths(today, 1);
    return endOfMonth(lastMonth);
  }
}

export default function ComisionesPorPagarTab({
  comisionistasAgrupados,
  cuentasAgrupadas,
  loadingComisionistas,
  loadingCuentas,
  filtroGeneral,
  formatCurrency,
  openPagarDialog,
  openPagarTodasDialog
}: ComisionesPorPagarTabProps) {
  const { canUpdate, isSuperAdmin } = usePagePermissions('/admin/pagar-comisiones');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [currentPageComisionistas, setCurrentPageComisionistas] = useState(1);
  const [currentPageCuentas, setCurrentPageCuentas] = useState(1);
  const [timbrarDialog, setTimbrarDialog] = useState<{ idCuenta: number; idDocumento: number } | null>(null);
  const [isTimbrarLoading, setIsTimbrarLoading] = useState(false);
  const itemsPerPage = 50;

  const fechaLimite = useMemo(() => getFechaLimiteEnganche(), []);

  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleTimbrar = async () => {
    if (!timbrarDialog) return;
    setIsTimbrarLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('timbrar-factura-comision-sozu', {
        body: { id_cuenta_cobranza: timbrarDialog.idCuenta, id_documento: timbrarDialog.idDocumento, environment: ENVIRONMENT },
      });
      if (error) throw error;
      toast({ title: 'Factura timbrada', description: 'La factura de comisión ha sido timbrada exitosamente' });
      queryClient.invalidateQueries({ queryKey: ['pagar-comisiones'] });
    } catch (err) {
      console.error('Error timbrando factura:', err);
      toast({ title: 'Error', description: 'No se pudo timbrar la factura', variant: 'destructive' });
    } finally {
      setIsTimbrarLoading(false);
      setTimbrarDialog(null);
    }
  };

  const renderFacturaComisionSozu = (facturaComisionSozu: any, idCuenta: number) => {
    if (!facturaComisionSozu) return <span className="text-xs text-muted-foreground">-</span>;
    if (facturaComisionSozu.es_draft) {
      return (
        <div className="flex items-center gap-1">
          <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">Draft</Badge>
          {(canUpdate || isSuperAdmin) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={(e) => {
                e.stopPropagation();
                setTimbrarDialog({ idCuenta, idDocumento: facturaComisionSozu.id });
              }}
            >
              <Stamp className="h-3.5 w-3.5 mr-1" />
              Timbrar
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Timbrada</Badge>
        {facturaComisionSozu.url && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); window.open(facturaComisionSozu.url, '_blank'); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };
  // Filtrar comisiones por fecha de enganche y estado de pago
  const comisionistasPendientes = useMemo(() => {
    return comisionistasAgrupados?.map((com: any) => {
      // Filtrar cuentas pendientes que cumplan con la fecha límite
      const cuentasPendientes = com.cuentas.filter((c: any) => {
        if (c.pagada) return false;
        if (!c.fechaPagoEnganche) return false;
        const fechaEnganche = parseISO(c.fechaPagoEnganche);
        return isBefore(fechaEnganche, fechaLimite) || isEqual(fechaEnganche, fechaLimite);
      });
      
      const cuentasPagadas = com.cuentas.filter((c: any) => c.pagada);
      
      // Calcular montos
      const montoTotal = com.cuentas.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      const montoPendiente = cuentasPendientes.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      const montoPagado = cuentasPagadas.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      
      return {
        ...com,
        cuentas: cuentasPendientes,
        montoTotal, // Total de todas las comisiones (por pagar)
        montoPendiente, // Total pendiente que cumple con fecha
        montoPagado, // Total ya pagado
      };
    }).filter((com: any) => com.cuentas.length > 0) || [];
  }, [comisionistasAgrupados, fechaLimite]);

  const cuentasPendientes = useMemo(() => {
    return cuentasAgrupadas?.map((cuenta: any) => {
      // Filtrar comisionistas pendientes
      const comisionistasPendientes = cuenta.comisionistas.filter((c: any) => !c.pagada);
      const comisionistasPagados = cuenta.comisionistas.filter((c: any) => c.pagada);
      
      // Calcular montos
      const montoTotal = cuenta.comisionistas.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      const montoPendiente = comisionistasPendientes.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      const montoPagado = comisionistasPagados.reduce((sum: number, c: any) => sum + c.montoComision, 0);
      
      return {
        ...cuenta,
        comisionistas: comisionistasPendientes,
        montoTotal, // Total de todas las comisiones
        montoTotalComision: montoPendiente, // Mantener compatibilidad
        montoPendiente,
        montoPagado,
      };
    }).filter((cuenta: any) => cuenta.comisionistas.length > 0) || [];
  }, [cuentasAgrupadas]);

  const comisionistasFiltrados = comisionistasPendientes.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    com.nombre.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const cuentasFiltradas = cuentasPendientes.filter((cuenta: any) =>
    cuenta.numeroCuenta.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    cuenta.proyecto.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const totalPagesComisionistas = Math.ceil(comisionistasFiltrados.length / itemsPerPage);
  const totalPagesCuentas = Math.ceil(cuentasFiltradas.length / itemsPerPage);

  const paginatedComisionistas = useMemo(() => {
    const startIndex = (currentPageComisionistas - 1) * itemsPerPage;
    return comisionistasFiltrados.slice(startIndex, startIndex + itemsPerPage);
  }, [comisionistasFiltrados, currentPageComisionistas, itemsPerPage]);

  const paginatedCuentas = useMemo(() => {
    const startIndex = (currentPageCuentas - 1) * itemsPerPage;
    return cuentasFiltradas.slice(startIndex, startIndex + itemsPerPage);
  }, [cuentasFiltradas, currentPageCuentas, itemsPerPage]);

  const renderPaginationItems = (
    totalPages: number,
    currentPage: number,
    setCurrentPage: (page: number) => void
  ) => {
    const items = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(<PaginationEllipsis key="ellipsis-start" />);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink 
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<PaginationEllipsis key="ellipsis-end" />);
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <><Tabs defaultValue="por-comisionista" className="space-y-4">
      <TabsList>
        <TabsTrigger value="por-comisionista">Agrupada por Comisionista</TabsTrigger>
        <TabsTrigger value="por-cuenta">Agrupada por Cuenta de Cobranza</TabsTrigger>
      </TabsList>

      <TabsContent value="por-comisionista" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones Pendientes por Comisionista</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingComisionistas ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : comisionistasFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay comisiones pendientes por pagar
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Monto por Pagar</TableHead>
                    <TableHead className="text-right">Monto Pagado</TableHead>
                    <TableHead className="text-right">Monto Pendiente</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedComisionistas.map((com: any) => (
                    <>
                      <TableRow 
                        key={com.email}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleItem(com.email)}
                      >
                        <TableCell>
                          {expandedItems.has(com.email) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {com.nombre}
                            {com.esInmobiliaria && (
                              <Badge variant="secondary" className="text-xs">Inmobiliaria</Badge>
                            )}
                            {com.esExterno && !com.esInmobiliaria && (
                              <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">Externo</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{com.email}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(com.montoTotal)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(com.montoPagado)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-orange-600">
                          {formatCurrency(com.montoPendiente)}
                        </TableCell>
                        <TableCell>
                          {com.cuentas.length > 0 && (canUpdate || isSuperAdmin) && (() => {
                            const liberables = com.cuentas.filter((c: any) => c.esPagadaComisionVenta).length;
                            return (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPagarTodasDialog('comisionista', { ...com, cuentas: com.cuentas.filter((c: any) => c.esPagadaComisionVenta) });
                                }}
                                disabled={liberables === 0}
                                title={liberables === 0 ? 'Ninguna cuenta tiene la comisión Sozu pagada todavía' : liberables < com.cuentas.length ? `${com.cuentas.length - liberables} cuenta(s) bloqueadas: Sozu aún no cobra` : ''}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Pagar Todas ({liberables}/{com.cuentas.length})
                              </Button>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                      {expandedItems.has(com.email) && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Cuenta</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Proyecto</TableHead>
                                    <TableHead>Edificio</TableHead>
                                    <TableHead>Modelo</TableHead>
                                    <TableHead>Depto</TableHead>
                                    <TableHead>Fecha Pago Enganche</TableHead>
                                    <TableHead className="text-right">Precio Final</TableHead>
                                    <TableHead className="text-right">Comisión</TableHead>
                                    {com.esExterno && <TableHead>Factura</TableHead>}
                                    <TableHead>Fact. Comisión Sozu</TableHead>
                                    {(canUpdate || isSuperAdmin) && <TableHead>Acciones</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {com.cuentas.map((cuenta: any) => (
                                    <TableRow key={cuenta.idCuenta}>
                                      <TableCell>{cuenta.numeroCuenta}</TableCell>
                                      <TableCell>{cuenta.tipo}</TableCell>
                                      <TableCell>{cuenta.proyecto}</TableCell>
                                      <TableCell>{cuenta.edificio}</TableCell>
                                      <TableCell>{cuenta.modelo}</TableCell>
                                      <TableCell>{cuenta.numeroDepartamento}</TableCell>
                                      <TableCell>
                                        {cuenta.fechaPagoEnganche 
                                          ? format(parseISO(cuenta.fechaPagoEnganche), 'dd/MM/yyyy')
                                          : '-'}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(cuenta.precioFinal)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(cuenta.montoComision)}
                                        <span className="text-muted-foreground text-xs ml-1">
                                          ({Number(cuenta.porcentajeComision).toFixed(4)}%)
                                        </span>
                                      </TableCell>
                                      {com.esExterno && (
                                        <TableCell>
                                          {cuenta.urlFacturaExterna ? (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => window.open(cuenta.urlFacturaExterna, '_blank')}
                                            >
                                              <FileText className="h-4 w-4 mr-1" />
                                              Ver Factura
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">Sin factura</span>
                                          )}
                                        </TableCell>
                                      )}
                                      <TableCell>
                                        {renderFacturaComisionSozu(cuenta.facturaComisionSozu, cuenta.idCuenta)}
                                      </TableCell>
                                      {(canUpdate || isSuperAdmin) && (
                                        <TableCell>
                                          <Button
                                            size="sm"
                            onClick={() => openPagarDialog(com.email, cuenta.idCuenta)}
                            disabled={!cuenta.esPagadaComisionVenta}
                            title={!cuenta.esPagadaComisionVenta ? 'La comisión Sozu debe estar pagada antes de liberar el pago al externo' : ''}
                                          >
                                            <Upload className="h-4 w-4 mr-1" />
                                            Pagar
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}

            {totalPagesComisionistas > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {((currentPageComisionistas - 1) * itemsPerPage) + 1} - {Math.min(currentPageComisionistas * itemsPerPage, comisionistasFiltrados.length)} de {comisionistasFiltrados.length} comisionistas
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPageComisionistas(Math.max(1, currentPageComisionistas - 1))}
                        className={currentPageComisionistas === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {renderPaginationItems(totalPagesComisionistas, currentPageComisionistas, setCurrentPageComisionistas)}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPageComisionistas(Math.min(totalPagesComisionistas, currentPageComisionistas + 1))}
                        className={currentPageComisionistas === totalPagesComisionistas ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="por-cuenta" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones Pendientes por Cuenta de Cobranza</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCuentas ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : cuentasFiltradas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay comisiones pendientes por pagar
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Edificio</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Depto</TableHead>
                    <TableHead className="text-right">Precio Final</TableHead>
                    <TableHead className="text-right">Monto por Pagar</TableHead>
                    <TableHead className="text-right">Monto Pagado</TableHead>
                     <TableHead className="text-right">Monto Pendiente</TableHead>
                     <TableHead>Fact. Comisión Sozu</TableHead>
                     {(canUpdate || isSuperAdmin) && <TableHead>Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCuentas.map((cuenta: any) => (
                    <>
                      <TableRow 
                        key={cuenta.idCuenta}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleItem(`cuenta-${cuenta.idCuenta}`)}
                      >
                        <TableCell>
                          {expandedItems.has(`cuenta-${cuenta.idCuenta}`) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{cuenta.numeroCuenta}</TableCell>
                        <TableCell>{cuenta.tipo}</TableCell>
                        <TableCell>{cuenta.proyecto}</TableCell>
                        <TableCell>{cuenta.edificio}</TableCell>
                        <TableCell>{cuenta.modelo}</TableCell>
                        <TableCell>{cuenta.numeroDepartamento}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(cuenta.precioFinal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(cuenta.montoTotal)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(cuenta.montoPagado)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-orange-600">
                          {formatCurrency(cuenta.montoPendiente)}
                        </TableCell>
                        <TableCell>
                          {renderFacturaComisionSozu(cuenta.facturaComisionSozu, cuenta.idCuenta)}
                        </TableCell>
                        {(canUpdate || isSuperAdmin) && (
                          <TableCell>
                            {cuenta.comisionistas.length > 0 && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPagarTodasDialog('cuenta', cuenta);
                                }}
                                disabled={!cuenta.esPagadaComisionVenta}
                                title={!cuenta.esPagadaComisionVenta ? 'La comisión Sozu debe estar pagada antes de liberar el pago al externo' : ''}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Pagar Todas ({cuenta.comisionistas.length})
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      {expandedItems.has(`cuenta-${cuenta.idCuenta}`) && (
                        <TableRow>
                          <TableCell colSpan={12} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Porcentaje</TableHead>
                                    <TableHead className="text-right">Monto Comisión</TableHead>
                                    <TableHead>Factura</TableHead>
                                    {(canUpdate || isSuperAdmin) && <TableHead>Acciones</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {cuenta.comisionistas.map((comisionista: any) => (
                                    <TableRow key={comisionista.email}>
                                      <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                          {comisionista.nombre}
                                          {comisionista.esInmobiliaria && (
                                            <Badge variant="secondary" className="text-xs">Inmobiliaria</Badge>
                                          )}
                                          {comisionista.esExterno && !comisionista.esInmobiliaria && (
                                            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">Externo</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>{comisionista.email}</TableCell>
                                      <TableCell className="text-right">{Number(comisionista.porcentajeComision).toFixed(4)}%</TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(comisionista.montoComision)}
                                      </TableCell>
                                      <TableCell>
                                        {comisionista.esExterno && comisionista.urlFacturaExterna ? (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => window.open(comisionista.urlFacturaExterna, '_blank')}
                                          >
                                            <FileText className="h-4 w-4 mr-1" />
                                            Ver
                                          </Button>
                                        ) : comisionista.esExterno ? (
                                          <span className="text-muted-foreground text-xs">Sin factura</span>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">-</span>
                                        )}
                                      </TableCell>
                                      {(canUpdate || isSuperAdmin) && (
                                        <TableCell>
                                          <Button
                                            size="sm"
                            onClick={() => openPagarDialog(comisionista.email, cuenta.idCuenta)}
                            disabled={!cuenta.esPagadaComisionVenta}
                            title={!cuenta.esPagadaComisionVenta ? 'La comisión Sozu debe estar pagada antes de liberar el pago al externo' : ''}
                                          >
                                            <Upload className="h-4 w-4 mr-1" />
                                            Pagar
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}

            {totalPagesCuentas > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {((currentPageCuentas - 1) * itemsPerPage) + 1} - {Math.min(currentPageCuentas * itemsPerPage, cuentasFiltradas.length)} de {cuentasFiltradas.length} cuentas
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPageCuentas(Math.max(1, currentPageCuentas - 1))}
                        className={currentPageCuentas === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {renderPaginationItems(totalPagesCuentas, currentPageCuentas, setCurrentPageCuentas)}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPageCuentas(Math.min(totalPagesCuentas, currentPageCuentas + 1))}
                        className={currentPageCuentas === totalPagesCuentas ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    {/* Timbrar Confirmation Dialog */}
    <Dialog open={!!timbrarDialog} onOpenChange={() => setTimbrarDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Timbrado</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Está seguro de que desea timbrar esta factura de comisión? Esta acción generará una factura definitiva y no se puede deshacer.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTimbrarDialog(null)}>Cancelar</Button>
          <Button onClick={handleTimbrar} disabled={isTimbrarLoading}>
            {isTimbrarLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Timbrando...</> : <><Stamp className="h-4 w-4 mr-1" />Timbrar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
