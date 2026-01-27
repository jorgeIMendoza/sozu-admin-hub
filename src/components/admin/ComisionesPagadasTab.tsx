import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

interface ComisionesPagadasTabProps {
  comisionistasAgrupados: any[];
  cuentasAgrupadas: any[];
  loadingComisionistas: boolean;
  loadingCuentas: boolean;
  filtroGeneral: string;
  formatCurrency: (value: number) => string;
}

export default function ComisionesPagadasTab({
  comisionistasAgrupados,
  cuentasAgrupadas,
  loadingComisionistas,
  loadingCuentas,
  filtroGeneral,
  formatCurrency
}: ComisionesPagadasTabProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [currentPageComisionistas, setCurrentPageComisionistas] = useState(1);
  const [currentPageCuentas, setCurrentPageCuentas] = useState(1);
  const itemsPerPage = 50;

  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // Filtrar solo comisiones pagadas (pagada = true)
  const comisionistasPagadas = useMemo(() => {
    return comisionistasAgrupados?.map((com: any) => ({
      ...com,
      cuentas: com.cuentas.filter((c: any) => c.pagada),
      montoTotal: com.cuentas.filter((c: any) => c.pagada).reduce((sum: number, c: any) => sum + c.montoComision, 0),
    })).filter((com: any) => com.cuentas.length > 0) || [];
  }, [comisionistasAgrupados]);

  const cuentasPagadas = useMemo(() => {
    return cuentasAgrupadas?.map((cuenta: any) => ({
      ...cuenta,
      comisionistas: cuenta.comisionistas.filter((c: any) => c.pagada),
      montoTotalComision: cuenta.comisionistas.filter((c: any) => c.pagada).reduce((sum: number, c: any) => sum + c.montoComision, 0),
    })).filter((cuenta: any) => cuenta.comisionistas.length > 0) || [];
  }, [cuentasAgrupadas]);

  const comisionistasFiltrados = comisionistasPagadas.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    com.nombre.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const cuentasFiltradas = cuentasPagadas.filter((cuenta: any) =>
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
    <Tabs defaultValue="por-comisionista" className="space-y-4">
      <TabsList>
        <TabsTrigger value="por-comisionista">Agrupada por Comisionista</TabsTrigger>
        <TabsTrigger value="por-cuenta">Agrupada por Cuenta de Cobranza</TabsTrigger>
      </TabsList>

      <TabsContent value="por-comisionista" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones Pagadas por Comisionista</CardTitle>
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
                No hay comisiones pagadas
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Monto Total Pagado</TableHead>
                    <TableHead className="text-right"># Comisiones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedComisionistas.map((com: any) => (
                    <>
                      <TableRow 
                        key={com.email}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleItem(`pagado-${com.email}`)}
                      >
                        <TableCell>
                          {expandedItems.has(`pagado-${com.email}`) ? (
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
                        <TableCell className="text-right font-bold text-green-600">
                          {formatCurrency(com.montoTotal)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="default">{com.cuentas.length}</Badge>
                        </TableCell>
                      </TableRow>
                      {expandedItems.has(`pagado-${com.email}`) && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 p-0">
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
                                    <TableHead>Evidencia</TableHead>
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
                                          ({cuenta.porcentajeComision}%)
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        {com.esExterno && cuenta.urlFacturaExterna ? (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => window.open(cuenta.urlFacturaExterna, '_blank')}
                                          >
                                            <FileText className="h-4 w-4 mr-1" />
                                            Ver
                                          </Button>
                                        ) : com.esExterno ? (
                                          <span className="text-muted-foreground text-xs">-</span>
                                        ) : null}
                                      </TableCell>
                                      <TableCell>
                                        {cuenta.urlEvidencia ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => window.open(cuenta.urlEvidencia, '_blank')}
                                          >
                                            <Eye className="h-4 w-4 mr-1" />
                                            Ver
                                          </Button>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">Sin evidencia</span>
                                        )}
                                      </TableCell>
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
            <CardTitle>Comisiones Pagadas por Cuenta de Cobranza</CardTitle>
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
                No hay comisiones pagadas
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
                    <TableHead className="text-right">Monto Total Pagado</TableHead>
                    <TableHead className="text-right"># Comisionistas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCuentas.map((cuenta: any) => (
                    <>
                      <TableRow 
                        key={cuenta.idCuenta}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleItem(`cuenta-pagado-${cuenta.idCuenta}`)}
                      >
                        <TableCell>
                          {expandedItems.has(`cuenta-pagado-${cuenta.idCuenta}`) ? (
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
                        <TableCell className="text-right font-bold text-green-600">
                          {formatCurrency(cuenta.montoTotalComision)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="default">{cuenta.comisionistas.length}</Badge>
                        </TableCell>
                      </TableRow>
                      {expandedItems.has(`cuenta-pagado-${cuenta.idCuenta}`) && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Porcentaje</TableHead>
                                    <TableHead className="text-right">Monto Comisión</TableHead>
                                    <TableHead>Factura</TableHead>
                                    <TableHead>Evidencia</TableHead>
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
                                      <TableCell>
                                        {comisionista.urlEvidencia ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => window.open(comisionista.urlEvidencia, '_blank')}
                                          >
                                            <Eye className="h-4 w-4 mr-1" />
                                            Ver
                                          </Button>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">Sin evidencia</span>
                                        )}
                                      </TableCell>
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
  );
}
