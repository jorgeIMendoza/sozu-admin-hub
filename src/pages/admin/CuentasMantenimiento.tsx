import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, Eye, Loader2, Package, UserPlus, FileDown } from "lucide-react";
import { EstadoCuentaMantenimientoService } from "@/services/estadoCuentaMantenimientoService";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { CompradoresDetailDialog } from "@/components/admin/CompradoresDetailDialog";
import { ComplementosDetailDialog } from "@/components/admin/ComplementosDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import { AddResidenteDialog } from "@/components/admin/AddResidenteDialog";
import { ResidentesDetailDialog } from "@/components/admin/ResidentesDetailDialog";
import { useCuentasMantenimientoPaginadas, type CuentaMantenimiento } from "@/hooks/useCuentasMantenimientoPaginadas";

interface Residente {
  id_persona: number;
  nombre_legal: string;
  activo: boolean;
}

export default function CuentasMantenimiento() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Input values (immediate UI state)
  const [idCuentaInput, setIdCuentaInput] = useState("");
  const [propietariosInput, setPropietariosInput] = useState("");
  const [clabeInput, setClabeInput] = useState("");
  const [proyectoInput, setProyectoInput] = useState("");
  const [noPropiedadInput, setNoPropiedadInput] = useState("");
  const [modeloInput, setModeloInput] = useState("");
  const [claveCatastralInput, setClaveCatastralInput] = useState("");
  
  // Debounced filter values (sent to RPC)
  const [idCuentaFilter, setIdCuentaFilter] = useState("");
  const [propietariosFilter, setPropietariosFilter] = useState("");
  const [clabeFilter, setClabeFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [noPropiedadFilter, setNoPropiedadFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [claveCatastralFilter, setClaveCatastralFilter] = useState("");
  
  const [complementosDialog, setComplementosDialog] = useState<{ isOpen: boolean; cuenta: CuentaMantenimiento | null }>({
    isOpen: false,
    cuenta: null,
  });
  
  const [addResidenteDialog, setAddResidenteDialog] = useState<{ isOpen: boolean; cuenta: CuentaMantenimiento | null }>({
    isOpen: false,
    cuenta: null,
  });
  
  const [residentesDialog, setResidentesDialog] = useState<{ isOpen: boolean; residentes: Residente[] }>({
    isOpen: false,
    residentes: [],
  });
  
  const [generatingEstadoCuenta, setGeneratingEstadoCuenta] = useState<number | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, idCuentaFilter, propietariosFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter, claveCatastralFilter]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Debounce column filters
  useEffect(() => {
    const timer = setTimeout(() => {
      setIdCuentaFilter(idCuentaInput);
      setPropietariosFilter(propietariosInput);
      setClabeFilter(clabeInput);
      setProyectoFilter(proyectoInput);
      setNoPropiedadFilter(noPropiedadInput);
      setModeloFilter(modeloInput);
      setClaveCatastralFilter(claveCatastralInput);
    }, 400);

    return () => clearTimeout(timer);
  }, [idCuentaInput, propietariosInput, clabeInput, proyectoInput, noPropiedadInput, modeloInput, claveCatastralInput]);

  // Función para normalizar saldos pequeños a cero
  const normalizarSaldo = (saldo: number): number => {
    return Math.abs(saldo) < 0.01 ? 0 : saldo;
  };

  // Use the new paginated hook
  const { data, isLoading } = useCuentasMantenimientoPaginadas({
    page: currentPage,
    perPage: itemsPerPage,
    idCuenta: idCuentaFilter,
    propietarios: propietariosFilter,
    clabe: clabeFilter,
    proyecto: proyectoFilter,
    noPropiedad: noPropiedadFilter,
    modelo: modeloFilter,
    claveCatastral: claveCatastralFilter,
    search: searchTerm,
  });

  const paginatedCuentas = data?.cuentas || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 0;

  // Refocus search input after loading completes
  useEffect(() => {
    if (!isLoading && inputValue && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isLoading, inputValue]);

  const clearFilters = () => {
    // Clear input values
    setIdCuentaInput("");
    setPropietariosInput("");
    setClabeInput("");
    setProyectoInput("");
    setNoPropiedadInput("");
    setModeloInput("");
    setClaveCatastralInput("");
    setInputValue("");
    // Clear debounced values immediately
    setIdCuentaFilter("");
    setPropietariosFilter("");
    setClabeFilter("");
    setProyectoFilter("");
    setNoPropiedadFilter("");
    setModeloFilter("");
    setClaveCatastralFilter("");
    setSearchTerm("");
  };

  const hasActiveFilters = idCuentaInput || propietariosInput || 
                          clabeInput || proyectoInput || noPropiedadInput || 
                          modeloInput || claveCatastralInput || inputValue;

  // Helper function to generate pagination items with ellipsis
  const getPaginationItems = (currentPage: number, totalPages: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    items.push(1);

    let rangeStart = Math.max(2, currentPage - 1);
    let rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    if (currentPage <= 3) {
      rangeEnd = Math.min(4, totalPages - 1);
    }
    if (currentPage >= totalPages - 2) {
      rangeStart = Math.max(totalPages - 3, 2);
    }

    if (rangeStart > 2) {
      items.push('ellipsis');
    }

    for (let i = rangeStart; i <= rangeEnd; i++) {
      items.push(i);
    }

    if (rangeEnd < totalPages - 1) {
      items.push('ellipsis');
    }

    if (totalPages > 1) {
      items.push(totalPages);
    }
    return items;
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} 
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} 
              />
            </PaginationItem>
            {getPaginationItems(currentPage, totalPages).map((item, index) => 
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink 
                    onClick={() => setCurrentPage(item as number)} 
                    isActive={currentPage === item} 
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} 
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} 
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  if (isLoading && paginatedCuentas.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-lg text-muted-foreground">Cargando cuentas de mantenimiento...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas de Mantenimientos</h1>
          <p className="text-muted-foreground">
            Gestiona todas las cuentas de mantenimiento ({totalCount})
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Buscar por ID, propietario, RFC, CLABE, proyecto, propiedad..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-8"
              />
            </div>
            
            {/* Filters grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">ID Cuenta</label>
                <Input
                  placeholder="Filtrar por ID..."
                  value={idCuentaInput}
                  onChange={(e) => setIdCuentaInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Propietarios</label>
                <Input
                  placeholder="Filtrar por propietario..."
                  value={propietariosInput}
                  onChange={(e) => setPropietariosInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">CLABE STP</label>
                <Input
                  placeholder="Filtrar por CLABE..."
                  value={clabeInput}
                  onChange={(e) => setClabeInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Proyecto</label>
                <Input
                  placeholder="Filtrar por proyecto..."
                  value={proyectoInput}
                  onChange={(e) => setProyectoInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">No. Propiedad</label>
                <Input
                  placeholder="Filtrar por propiedad..."
                  value={noPropiedadInput}
                  onChange={(e) => setNoPropiedadInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Modelo</label>
                <Input
                  placeholder="Filtrar por modelo..."
                  value={modeloInput}
                  onChange={(e) => setModeloInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Clave Catastral</label>
                <Input
                  placeholder="Filtrar por clave..."
                  value={claveCatastralInput}
                  onChange={(e) => setClaveCatastralInput(e.target.value)}
                />
              </div>
            </div>
            
            {/* Clear filters button */}
            <div className="flex justify-end">
              <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtered count display */}
          <div className="mb-4 text-sm text-muted-foreground">
            Mostrando <span className="font-semibold text-foreground">{paginatedCuentas.length}</span> de <span className="font-semibold text-foreground">{totalCount}</span> cuentas
            {isLoading && <Loader2 className="inline h-4 w-4 animate-spin ml-2" />}
          </div>
          
          <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">ID</TableHead>
                      <TableHead>Propietarios</TableHead>
                      <TableHead>Residente</TableHead>
                      <TableHead>CLABE STP</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Clave Catastral</TableHead>
                      <TableHead className="text-right">Pago mantenimiento acumulado</TableHead>
                      <TableHead className="text-right">Total Pagado</TableHead>
                      <TableHead className="text-right">Saldo Pendiente / a Favor</TableHead>
                      <TableHead>Próxima Fecha de Pago</TableHead>
                      <TableHead className="text-center">Complementos</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                          {hasActiveFilters ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de mantenimiento"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedCuentas.map((cuenta) => (
                        <TableRow key={cuenta.id}>
                          <TableCell className="font-medium">
                            {formatCuentaMantenimientoId(cuenta.id)}
                          </TableCell>
                          <TableCell>
                            {cuenta.compradores.length > 0 ? (
                              cuenta.compradores.length > 1 ? (
                                <CompradoresDetailDialog 
                                  compradores={cuenta.compradores} 
                                  label="propietarios"
                                />
                              ) : (
                                <div className="space-y-1">
                                  <Badge 
                                    variant="secondary" 
                                    className="block w-fit"
                                  >
                                    {cuenta.compradores[0].nombre_legal}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                    <br />
                                    {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                  </div>
                                </div>
                              )
                            ) : (
                              <span className="text-muted-foreground">Sin propietarios</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => cuenta.residentes.length > 0 && setResidentesDialog({ isOpen: true, residentes: cuenta.residentes })}
                                      disabled={cuenta.residentes.length === 0}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{cuenta.residentes.length > 0 ? "Ver detalle de residentes" : "Sin asignar"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                          <TableCell 
                            className="font-mono text-xs cursor-pointer hover:bg-secondary/50 transition-colors"
                            onClick={() => {
                              if (cuenta.clabe_stp) {
                                navigator.clipboard.writeText(cuenta.clabe_stp);
                                toast({
                                  title: "CLABE STP copiada",
                                  description: "La CLABE STP se ha copiado al portapapeles",
                                });
                              }
                            }}
                          >
                            {cuenta.clabe_stp || '-'}
                          </TableCell>
                          <TableCell>{cuenta.proyecto}</TableCell>
                          <TableCell>{cuenta.numero_propiedad}</TableCell>
                          <TableCell>{cuenta.modelo}</TableCell>
                          <TableCell>
                            {cuenta.clave_catastral || '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ${cuenta.pagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {(() => {
                              const saldo = normalizarSaldo(cuenta.restante);
                              // Usar total_pagos (suma real de pagos) en lugar de pagado (aplicaciones)
                              const excedente = cuenta.total_pagos - cuenta.precio_final;
                              const tieneSaldoAFavor = excedente > 0.01;
                              
                              if (tieneSaldoAFavor) {
                                return (
                                  <span className="text-green-600">
                                    ${excedente.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a favor
                                  </span>
                                );
                              } else if (saldo > 0.01) {
                                return (
                                  <span className="text-orange-600">
                                    ${saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                );
                              } else {
                                return <span className="text-muted-foreground">$0.00</span>;
                              }
                            })()}
                          </TableCell>
                          <TableCell>
                            {cuenta.proxima_fecha_pago ? (
                              <Badge variant="outline">
                                {(() => {
                                  // Parse fecha como local, no UTC
                                  const [year, month, day] = cuenta.proxima_fecha_pago.split('-').map(Number);
                                  const fecha = new Date(year, month - 1, day);
                                  return fecha.toLocaleDateString('es-MX', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  });
                                })()}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setComplementosDialog({ isOpen: true, cuenta })}
                                    >
                                      <Package className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver complementos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                           <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link to={`/admin/cuentas-mantenimiento/${cuenta.id}/detalle`}>
                                      <Button variant="ghost" size="icon">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver detalle</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      disabled={generatingEstadoCuenta === cuenta.id}
                                      onClick={async () => {
                                        try {
                                          setGeneratingEstadoCuenta(cuenta.id);
                                          const service = new EstadoCuentaMantenimientoService();
                                          await service.generateEstadoCuenta({ id_cuenta: cuenta.id });
                                          toast({
                                            title: "Estado de cuenta generado",
                                            description: "El PDF se ha descargado exitosamente."
                                          });
                                        } catch (error) {
                                          console.error("Error generating estado de cuenta:", error);
                                          toast({
                                            title: "Error",
                                            description: "No se pudo generar el estado de cuenta.",
                                            variant: "destructive"
                                          });
                                        } finally {
                                          setGeneratingEstadoCuenta(null);
                                        }
                                      }}
                                    >
                                      {generatingEstadoCuenta === cuenta.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <FileDown className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Descargar estado de cuenta</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setAddResidenteDialog({ isOpen: true, cuenta })}
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Asignar residente</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
          
          {/* Pagination */}
          {renderPagination()}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {complementosDialog.isOpen && complementosDialog.cuenta && (
        <ComplementosDetailDialog
          open={complementosDialog.isOpen}
          onClose={() => setComplementosDialog({ isOpen: false, cuenta: null })}
          bodegas={complementosDialog.cuenta.bodegas || []}
          estacionamientos={complementosDialog.cuenta.estacionamientos || []}
          productos={complementosDialog.cuenta.productos || []}
          propertyNumber={complementosDialog.cuenta.numero_propiedad}
        />
      )}

      {addResidenteDialog.isOpen && addResidenteDialog.cuenta && (
        <AddResidenteDialog
          open={addResidenteDialog.isOpen}
          onOpenChange={(open) => setAddResidenteDialog({ isOpen: open, cuenta: null })}
          cuentaMantenimientoId={addResidenteDialog.cuenta.id}
          compradores={addResidenteDialog.cuenta.compradores.filter(c => c.id_persona !== undefined).map(c => ({
            id_persona: c.id_persona!,
            nombre_legal: c.nombre_legal,
            porcentaje_copropiedad: c.porcentaje_copropiedad
          }))}
        />
      )}

      <ResidentesDetailDialog
        residentes={residentesDialog.residentes}
        open={residentesDialog.isOpen}
        onOpenChange={(open) => setResidentesDialog({ isOpen: open, residentes: [] })}
      />
    </div>
  );
}
