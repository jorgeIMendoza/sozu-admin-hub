import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

// Helper para obtener todas las cuentas de cobranza sin límite de 1000
async function fetchAllCuentasCobranza() {
  const batchSize = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("cuentas_cobranza")
      .select(`
        id,
        precio_final,
        porcentaje_comision_venta,
        iva_incluido,
        id_oferta
      `)
      .eq("es_pagada_comision_venta", true)
      .is("id_cuenta_cobranza_padre", null)
      .order("id", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

export default function AprobacionComisiones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarAprobacion } = useActivityLogger();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedCuentas, setExpandedCuentas] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("pendientes");
  const [currentPagePendientes, setCurrentPagePendientes] = useState(1);
  const [currentPageCompletas, setCurrentPageCompletas] = useState(1);
  const itemsPerPage = 50;

  const toggleCuenta = (cuentaId: number) => {
    const newExpanded = new Set(expandedCuentas);
    if (newExpanded.has(cuentaId)) {
      newExpanded.delete(cuentaId);
    } else {
      newExpanded.add(cuentaId);
    }
    setExpandedCuentas(newExpanded);
  };

  const aprobarComisionistaMutation = useMutation({
    mutationFn: async ({ email, idCuenta }: { email: string; idCuenta: number }) => {
      const { error } = await supabase
        .from("comisionistas")
        .update({ aprobada: true })
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true);
      
      if (error) throw error;
      return { email, idCuenta };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["aprobacion-comisiones"] });
      
      // Registrar la aprobación en el log de actividades
      await registrarAprobacion('comisionistas', {
        email_comisionista: data.email,
        id_cuenta_cobranza: data.idCuenta,
        tipo: 'individual'
      }, 'aprobar_comision');
      
      toast({
        title: "Comisionista aprobado",
        description: "La comisión ha sido aprobada exitosamente"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al aprobar la comisión",
        variant: "destructive"
      });
      console.error("Error al aprobar comisionista:", error);
    }
  });

  const aprobarTodosComisionistasMutation = useMutation({
    mutationFn: async (idCuenta: number) => {
      const { error } = await supabase
        .from("comisionistas")
        .update({ aprobada: true })
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true)
        .eq("aprobada", false);
      
      if (error) throw error;
      return idCuenta;
    },
    onSuccess: async (idCuenta) => {
      queryClient.invalidateQueries({ queryKey: ["aprobacion-comisiones"] });
      
      // Registrar la aprobación masiva en el log de actividades
      await registrarAprobacion('comisionistas', {
        id_cuenta_cobranza: idCuenta,
        tipo: 'masivo'
      }, 'aprobar_comisiones_masivo');
      
      toast({
        title: "Comisionistas aprobados",
        description: "Todas las comisiones han sido aprobadas exitosamente"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al aprobar las comisiones",
        variant: "destructive"
      });
      console.error("Error al aprobar comisionistas:", error);
    }
  });

  const { data: cuentasConComisionistas, isLoading } = useQuery({
    queryKey: ["aprobacion-comisiones"],
    queryFn: async () => {
      // Paso 1: Obtener TODAS las cuentas donde la comisión está pagada (sin límite de 1000)
      const cuentas = await fetchAllCuentasCobranza();
      if (!cuentas || cuentas.length === 0) return [];

      // Paso 2: Obtener ofertas relacionadas con propiedades y productos (en batches para evitar límite de URL)
      const ofertaIds = cuentas.map(c => c.id_oferta).filter(id => id !== null);
      let ofertas: any[] = [];
      
      if (ofertaIds.length > 0) {
        const batchSize = 200; // Usar batches más pequeños para nested selects
        for (let i = 0; i < ofertaIds.length; i += batchSize) {
          const batchIds = ofertaIds.slice(i, i + batchSize);
          const { data: batchOfertas, error: ofertasError } = await supabase
            .from("ofertas")
            .select(`
              id,
              id_propiedad,
              id_producto,
              propiedades!ofertas_id_propiedad_fkey(
                id,
                numero_propiedad,
                id_edificio_modelo,
                edificios_modelos!propiedades_id_edificio_modelo_fkey(
                  id,
                  id_edificio,
                  id_modelo,
                  modelos!edificios_modelos_id_modelo_fkey(nombre),
                  edificios!edificios_modelos_id_edificio_fkey(
                    id,
                    nombre,
                    id_proyecto,
                    proyectos!edificios_id_proyecto_fkey(id, nombre)
                  )
                )
              )
            `)
            .in("id", batchIds);

          if (ofertasError) throw ofertasError;
          if (batchOfertas) ofertas = [...ofertas, ...batchOfertas];
        }
      }

      // Paso 3: Obtener productos (si aplica)
      const productoIds = ofertas?.filter(o => o.id_producto).map(o => o.id_producto) || [];
      const { data: productos, error: productosError } = productoIds.length > 0
        ? await supabase.from("productos_servicios").select(`
            id,
            nombre,
            id_categoria,
            categorias_producto!productos_servicios_id_categoria_fkey(nombre)
          `).in("id", productoIds)
        : { data: [], error: null };

      if (productosError) throw productosError;

      // Paso 4: Obtener comisionistas para todas las cuentas
      const cuentaIds = cuentas.map(c => c.id);
      const { data: comisionistas, error: comisionistasError } = await supabase
        .from("comisionistas")
        .select("*")
        .in("id_cuenta_cobranza", cuentaIds)
        .eq("activo", true);

      if (comisionistasError) throw comisionistasError;

      // Paso 5: Obtener nombres de usuarios y personas para los comisionistas
      const comisionistaEmails = [...new Set(comisionistas?.map(c => c.email_usuario) || [])] as string[];
      
      // Fetch from usuarios con rol_id para identificar agentes inmobiliarios
      const { data: usuariosData } = comisionistaEmails.length > 0 
        ? await supabase.from("usuarios").select("email, nombre, rol_id").in("email", comisionistaEmails)
        : { data: [] };
      
      // Identificar emails de agentes inmobiliarios (rol_id = 3)
      const emailsAgentesInmobiliarios = new Set(
        usuariosData?.filter(u => u.rol_id === 3).map(u => u.email) || []
      );
      
      const usuariosMap = new Map<string, { nombre: string; esInmobiliaria: boolean; esAgenteInmobiliario: boolean }>();
      usuariosData?.forEach(u => {
        usuariosMap.set(u.email, { 
          nombre: u.nombre, 
          esInmobiliaria: false,
          esAgenteInmobiliario: u.rol_id === 3
        });
      });
      
      // Find emails not in usuarios and fetch from personas (inmobiliarias)
      const emailsNotInUsuarios = comisionistaEmails.filter(email => !usuariosMap.has(email));
      
      // Set para emails de inmobiliarias
      const emailsInmobiliarias = new Set<string>();
      
      if (emailsNotInUsuarios.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInUsuarios)
          .eq('activo', true);
        
        personasData?.forEach(p => {
          const esInmobiliaria = p.tipo_persona === 'pm';
          if (esInmobiliaria && p.email) {
            emailsInmobiliarias.add(p.email);
          }
          usuariosMap.set(p.email, { 
            nombre: p.nombre_legal, 
            esInmobiliaria,
            esAgenteInmobiliario: false
          });
        });
      }

      // Paso 6: Combinar datos
      return cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const edificioModelo = propiedad?.edificios_modelos;
        const edificio = edificioModelo?.edificios;
        const proyecto = edificio?.proyectos;
        const modelo = edificioModelo?.modelos;
        const producto = productos?.find(prod => prod.id === oferta?.id_producto);

        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        if (oferta?.id_producto && producto) {
          const categoriaNombre = producto.categorias_producto?.nombre?.toLowerCase();
          tipo = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';
        }

        // Filtrar comisionistas: excluir agentes externos (inmobiliarias y agentes inmobiliarios)
        const comisionistasFiltered = (comisionistas?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [])
          .filter(c => {
            // Excluir si es inmobiliaria o agente inmobiliario
            const esAgenteExterno = emailsInmobiliarias.has(c.email_usuario) || emailsAgentesInmobiliarios.has(c.email_usuario);
            return !esAgenteExterno;
          })
          .map(c => {
            const userData = usuariosMap.get(c.email_usuario);
            return {
              ...c,
              nombre: userData?.nombre || 'N/A',
              esInmobiliaria: userData?.esInmobiliaria || false
            };
          });

        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: modelo?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
          tipo,
          comisionistas: comisionistasFiltered
        };
      });
    }
  });

  const formatMonto = (monto: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(monto);
  };

  // Aplicar filtros
  const cuentasFiltradas = cuentasConComisionistas?.filter((cuenta: any) => {
    if (filtroGeneral) {
      const searchTerm = filtroGeneral.toLowerCase();
      const matchId = formatCuentaCobranzaId(cuenta.id, cuenta.tipo).toLowerCase().includes(searchTerm);
      const matchProyecto = cuenta.proyecto_nombre?.toLowerCase().includes(searchTerm);
      const matchNumero = (cuenta.numero_departamento || cuenta.producto_nombre || "").toLowerCase().includes(searchTerm);
      const matchModelo = cuenta.modelo_nombre?.toLowerCase().includes(searchTerm);
      
      if (!matchId && !matchProyecto && !matchNumero && !matchModelo) {
        return false;
      }
    }
    return true;
  }) || [];

  // Separar en pendientes y completas
  // Pendientes: cuentas que tienen comisionistas no aprobados
  const cuentasPendientes = cuentasFiltradas.filter((cuenta: any) => 
    cuenta.comisionistas.length > 0 && cuenta.comisionistas.some((c: any) => !c.aprobada)
  );

  // Completas: cuentas sin comisionistas O donde todos están aprobados
  const cuentasCompletas = cuentasFiltradas.filter((cuenta: any) => 
    cuenta.comisionistas.length === 0 || cuenta.comisionistas.every((c: any) => c.aprobada)
  );

  // Pagination logic
  const totalPagesPendientes = Math.ceil(cuentasPendientes.length / itemsPerPage);
  const totalPagesCompletas = Math.ceil(cuentasCompletas.length / itemsPerPage);

  const paginatedPendientes = useMemo(() => {
    const startIndex = (currentPagePendientes - 1) * itemsPerPage;
    return cuentasPendientes.slice(startIndex, startIndex + itemsPerPage);
  }, [cuentasPendientes, currentPagePendientes, itemsPerPage]);

  const paginatedCompletas = useMemo(() => {
    const startIndex = (currentPageCompletas - 1) * itemsPerPage;
    return cuentasCompletas.slice(startIndex, startIndex + itemsPerPage);
  }, [cuentasCompletas, currentPageCompletas, itemsPerPage]);

  // Reset pages when filter changes
  useMemo(() => {
    setCurrentPagePendientes(1);
    setCurrentPageCompletas(1);
  }, [filtroGeneral]);

  const renderPaginationItems = (totalPages: number, currentPage: number, setCurrentPage: (page: number) => void) => {
    const items = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
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

  // Calcular totales
  const calcularPorcentajeTotalComisiones = (cuenta: any) => {
    // Usar el porcentaje de la cuenta de cobranza como fuente de verdad
    return cuenta.porcentaje_comision_venta || 0;
  };
  
  const calcularPorcentajeDispersarComisiones = (cuenta: any) => {
    // Sumar todos los comisionistas no pagados (para mostrar el total que se dispersará)
    const comisionistasADispersar = cuenta.comisionistas.filter((c: any) => !c.pagada);
    const totalPorcentaje = comisionistasADispersar.reduce((sum: number, c: any) => sum + (c.porcentaje_comision || 0), 0);
    return totalPorcentaje;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Aprobación de Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderCuentasTable = (cuentas: any[], isPendientes: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"></TableHead>
          <TableHead>No. Cuenta</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Proyecto</TableHead>
          <TableHead>Edificio</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>No. Departamento</TableHead>
          <TableHead>Precio final</TableHead>
          <TableHead>Comisión Total</TableHead>
          <TableHead>Comisión a dispersar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuentas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
              No hay cuentas {isPendientes ? 'pendientes' : 'completas'}
            </TableCell>
          </TableRow>
        ) : (
          cuentas.map((cuenta: any) => {
            const isExpanded = expandedCuentas.has(cuenta.id);
            const comisionistasPendientes = cuenta.comisionistas.filter((c: any) => !c.aprobada);
            const porcentajeTotalPendiente = calcularPorcentajeTotalComisiones(cuenta);
            const porcentajeDispersar = calcularPorcentajeDispersarComisiones(cuenta);
            const tieneComisionistas = cuenta.comisionistas.length > 0;
            
            return (
              <React.Fragment key={cuenta.id}>
                <TableRow className="cursor-pointer hover:bg-accent/50">
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)} className="font-medium">
                    {formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    <Badge variant="outline">{cuenta.tipo}</Badge>
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.proyecto_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.edificio_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.modelo_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.numero_departamento || cuenta.producto_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {formatMonto(cuenta.precio_final)}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    <div className="space-y-1">
                      <div className="font-medium">{formatMonto((cuenta.precio_final * porcentajeTotalPendiente) / 100)}</div>
                      <Badge variant={porcentajeTotalPendiente > 0 ? "default" : "secondary"}>
                        {porcentajeTotalPendiente.toFixed(2)}%
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    <div className="space-y-1">
                      <div className="font-medium">{formatMonto((cuenta.precio_final * porcentajeDispersar) / 100)}</div>
                      <Badge variant={porcentajeDispersar > 0 ? "default" : "secondary"}>
                        {porcentajeDispersar.toFixed(2)}%
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
                
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/30 p-6">
                      <div className="space-y-4">
                        {!tieneComisionistas ? (
                          <div className="text-center py-4 text-muted-foreground">
                            No se han configurado comisionistas para esta cuenta
                          </div>
                        ) : (
                          <>
                            {isPendientes && comisionistasPendientes.length > 0 && (
                              <div className="flex justify-end mb-4">
                                <Button
                                  onClick={() => aprobarTodosComisionistasMutation.mutate(cuenta.id)}
                                  disabled={aprobarTodosComisionistasMutation.isPending}
                                >
                                  Aprobar Todos
                                </Button>
                              </div>
                            )}

                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nombre</TableHead>
                                  <TableHead>Email Comisionista</TableHead>
                                  <TableHead>Comisión</TableHead>
                                  <TableHead>Estado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cuenta.comisionistas.map((comisionista: any) => {
                                  const montoBase = (cuenta.precio_final * comisionista.porcentaje_comision) / 100;
                                  const montoFinal = cuenta.iva_incluido ? montoBase * 1.16 : montoBase;
                                  
                                  return (
                                    <TableRow key={comisionista.email_usuario}>
                                      <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                          {comisionista.nombre || 'N/A'}
                                          {comisionista.esInmobiliaria && (
                                            <Badge variant="secondary" className="text-xs">Inmobiliaria</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>{comisionista.email_usuario}</TableCell>
                                      <TableCell>
                                        <div className="space-y-1">
                                          <div className="font-medium">{formatMonto(montoFinal)}</div>
                                          <Badge variant="outline">
                                            {comisionista.porcentaje_comision.toFixed(2)}%
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {comisionista.aprobada ? (
                                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                            <Check className="h-3 w-3 mr-1" />
                                            Aprobado
                                          </Badge>
                                        ) : isPendientes ? (
                                          <Button
                                            size="sm"
                                            onClick={() => aprobarComisionistaMutation.mutate({
                                              email: comisionista.email_usuario,
                                              idCuenta: cuenta.id
                                            })}
                                            disabled={aprobarComisionistaMutation.isPending}
                                          >
                                            <Check className="h-4 w-4 mr-2" />
                                            Aprobar
                                          </Button>
                                        ) : null}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {cuenta.comisionistas.length > 0 && (
                                  <TableRow className="font-semibold bg-muted/50">
                                    <TableCell colSpan={2}>Total a dispersar</TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <div className="font-bold">{formatMonto((cuenta.precio_final * porcentajeDispersar) / 100)}</div>
                                        <Badge variant="default">
                                          {porcentajeDispersar.toFixed(2)}%
                                        </Badge>
                                      </div>
                                    </TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Aprobación de Comisiones</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtro General */}
          <div className="mb-6">
            <Input
              type="text"
              placeholder="Buscar por ID, proyecto, número o modelo..."
              value={filtroGeneral}
              onChange={(e) => setFiltroGeneral(e.target.value)}
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="pendientes">
                Aprobaciones Pendientes
                <Badge variant="outline" className="ml-2">
                  {cuentasPendientes.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completas">
                Aprobaciones Completas
                <Badge variant="outline" className="ml-2">
                  {cuentasCompletas.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes">
              {renderCuentasTable(paginatedPendientes, true)}
              {totalPagesPendientes > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((currentPagePendientes - 1) * itemsPerPage) + 1} - {Math.min(currentPagePendientes * itemsPerPage, cuentasPendientes.length)} de {cuentasPendientes.length} cuentas
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPagePendientes(Math.max(1, currentPagePendientes - 1))}
                          className={currentPagePendientes === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {renderPaginationItems(totalPagesPendientes, currentPagePendientes, setCurrentPagePendientes)}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPagePendientes(Math.min(totalPagesPendientes, currentPagePendientes + 1))}
                          className={currentPagePendientes === totalPagesPendientes ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>

            <TabsContent value="completas">
              {renderCuentasTable(paginatedCompletas, false)}
              {totalPagesCompletas > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((currentPageCompletas - 1) * itemsPerPage) + 1} - {Math.min(currentPageCompletas * itemsPerPage, cuentasCompletas.length)} de {cuentasCompletas.length} cuentas
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPageCompletas(Math.max(1, currentPageCompletas - 1))}
                          className={currentPageCompletas === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {renderPaginationItems(totalPagesCompletas, currentPageCompletas, setCurrentPageCompletas)}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPageCompletas(Math.min(totalPagesCompletas, currentPageCompletas + 1))}
                          className={currentPageCompletas === totalPagesCompletas ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
