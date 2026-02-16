import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ENVIRONMENT } from "@/lib/config";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Copy, Stamp, FileText, Loader2, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
export default function Comisiones() {
  const {
    toast
  } = useToast();
  const queryClient = useQueryClient();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [filtroId, setFiltroId] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroEdificio, setFiltroEdificio] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroNumero, setFiltroNumero] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [filtroEfectivo, setFiltroEfectivo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [generarLoading, setGenerarLoading] = useState<number | null>(null);
  const [timbrarDialog, setTimbrarDialog] = useState<{ isOpen: boolean; cuentaId: number } | null>(null);
  const [timbrarLoading, setTimbrarLoading] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<{ isOpen: boolean; url: string; title: string }>({ isOpen: false, url: '', title: '' });
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado al portapapeles`
    });
  };
  const pagarComisionMutation = useMutation({
    mutationFn: async ({
      cuentaId,
      montoComision
    }: {
      cuentaId: number;
      montoComision: number;
    }) => {
      const {
        error
      } = await supabase.from("cuentas_cobranza").update({
        es_pagada_comision_venta: true,
        monto_comision_pagado: montoComision,
        fecha_pago_comision: new Date().toISOString().split('T')[0]
      }).eq("id", cuentaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["comisiones"]
      });
      toast({
        title: "Comisión pagada",
        description: "La comisión se ha marcado como pagada exitosamente"
      });
    },
    onError: error => {
      toast({
        title: "Error",
        description: "Hubo un error al pagar la comisión",
        variant: "destructive"
      });
      console.error("Error al pagar comisión:", error);
    }
  });
  const handlePagarComision = (comision: any) => {
    const montoBase = comision.porcentaje_comision_venta / 100 * comision.precio_final;
    const montoFinal = comision.iva_incluido ? montoBase * 1.16 : montoBase;
    pagarComisionMutation.mutate({
      cuentaId: comision.id,
      montoComision: montoFinal
    });
  };
  const {
    data: comisiones,
    isLoading
  } = useQuery({
    queryKey: ["comisiones"],
    queryFn: async () => {
      // Paso 1: Obtener cuentas de cobranza básicas (sin mantenimiento)
      const {
        data: cuentas,
        error: cuentasError
      } = (await supabase.from("cuentas_cobranza").select(`
          id,
          precio_final,
          porcentaje_comision_venta,
          iva_incluido,
          monto_comision_pagado,
          fecha_pago_comision,
          es_comision_venta_efectivo,
          es_pagada_comision_venta,
          id_oferta,
          url_factura_comision,
          es_draft_factura_comision
        `).is("id_cuenta_cobranza_padre", null).order("id", {
        ascending: false
      })) as any;
      if (cuentasError) throw cuentasError;
      if (!cuentas || cuentas.length === 0) return [];

      // Paso 1.5: Filtrar solo cuentas con enganche completo pagado
      const cuentaIds = cuentas.map(c => c.id);

      // Obtener acuerdos de enganche (id_concepto = 2) no completados
      const {
        data: acuerdosEnganchePendientes,
        error: acuerdosError
      } = await supabase.from("acuerdos_pago").select("id_cuenta_cobranza").in("id_cuenta_cobranza", cuentaIds).eq("id_concepto", 2) // Enganche
      .eq("pago_completado", false).eq("activo", true);
      if (acuerdosError) throw acuerdosError;

      // IDs de cuentas con enganche pendiente
      const cuentasConEnganchePendiente = new Set(acuerdosEnganchePendientes?.map(a => a.id_cuenta_cobranza) || []);

      // Filtrar solo cuentas que NO tienen enganche pendiente Y que tienen al menos un acuerdo de enganche
      const {
        data: acuerdosEnganches,
        error: acuerdosEngancheError
      } = await supabase.from("acuerdos_pago").select("id_cuenta_cobranza").in("id_cuenta_cobranza", cuentaIds).eq("id_concepto", 2).eq("activo", true);
      if (acuerdosEngancheError) throw acuerdosEngancheError;
      const cuentasConEnganche = new Set(acuerdosEnganches?.map(a => a.id_cuenta_cobranza) || []);

      // Solo incluir cuentas que tienen enganche Y lo tienen completo
      const cuentasFiltradas = cuentas.filter(c => cuentasConEnganche.has(c.id) && !cuentasConEnganchePendiente.has(c.id));
      if (cuentasFiltradas.length === 0) return [];

      // Paso 2: Obtener ofertas relacionadas
      const ofertaIds = cuentasFiltradas.map(c => c.id_oferta).filter(id => id !== null);
      const {
        data: ofertas,
        error: ofertasError
      } = ofertaIds.length > 0 ? await supabase.from("ofertas").select(`
              id,
              id_propiedad,
              id_producto
            `).in("id", ofertaIds) : {
        data: [],
        error: null
      };
      if (ofertasError) throw ofertasError;

      // Paso 3: Obtener propiedades y modelos relacionados (con dueño)
      const propiedadIds = ofertas?.filter(o => o.id_propiedad).map(o => o.id_propiedad) || [];
      const {
        data: propiedades,
        error: propiedadesError
      } = propiedadIds.length > 0 ? await supabase.from("propiedades").select(`
              id,
              numero_propiedad,
              id_edificio_modelo,
              id_entidad_relacionada_dueno,
              id_estatus_disponibilidad
            `).in("id", propiedadIds) : {
        data: [],
        error: null
      };
      if (propiedadesError) throw propiedadesError;

      // Paso 4: Obtener edificios y modelos
      const edificioModeloIds = propiedades?.map(p => p.id_edificio_modelo).filter(Boolean) || [];
      const {
        data: edificiosModelos,
        error: edificiosModelosError
      } = edificioModeloIds.length > 0 ? await supabase.from("edificios_modelos").select(`
              id,
              id_edificio,
              modelos!edificios_modelos_id_modelo_fkey(nombre)
            `).in("id", edificioModeloIds) : {
        data: [],
        error: null
      };
      if (edificiosModelosError) throw edificiosModelosError;
      const edificioIdsReal = edificiosModelos?.map(em => em.id_edificio).filter(Boolean) || [];
      const {
        data: edificiosData,
        error: edificiosDataError
      } = edificioIdsReal.length > 0 ? await supabase.from("edificios").select(`
              id,
              nombre,
              id_proyecto
            `).in("id", edificioIdsReal) : {
        data: [],
        error: null
      };
      if (edificiosDataError) throw edificiosDataError;

      // Paso 5: Obtener proyectos
      const proyectoIds = edificiosData?.map(e => e.id_proyecto).filter(Boolean) || [];
      const {
        data: proyectos,
        error: proyectosError
      } = proyectoIds.length > 0 ? await supabase.from("proyectos").select(`
              id,
              nombre
            `).in("id", proyectoIds) : {
        data: [],
        error: null
      };
      if (proyectosError) throw proyectosError;

      // Paso 6: Obtener productos con categorías
      const productoIds = ofertas?.filter(o => o.id_producto).map(o => o.id_producto) || [];
      const {
        data: productos,
        error: productosError
      } = productoIds.length > 0 ? await supabase.from("productos_servicios").select(`
              id,
              nombre,
              id_categoria,
              categorias_producto!productos_servicios_id_categoria_fkey(nombre)
            `).in("id", productoIds) : {
        data: [],
        error: null
      };
      if (productosError) throw productosError;

      // Paso 6.5: Obtener entidades relacionadas (dueños) de las propiedades
      const entidadIds = propiedades?.map(p => p.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const {
        data: entidadesRelacionadas,
        error: entidadesError
      } = entidadIds.length > 0 ? await supabase.from("entidades_relacionadas").select(`
              id,
              cuenta_stp_comisiones,
              facturar_comision_sozu,
              personas!fk_entrel_persona(
                nombre_legal,
                nombre_comercial
              )
            `).in("id", entidadIds) : {
        data: [],
        error: null
      };
      if (entidadesError) throw entidadesError;

      // Paso 7: Combinar todos los datos (factura comisión Sozu ahora está en la cuenta directamente)
      return cuentasFiltradas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = propiedades?.find(p => p.id === oferta?.id_propiedad);
        const edificioModelo = edificiosModelos?.find(em => em.id === propiedad?.id_edificio_modelo);
        const edificio = edificiosData?.find(e => e.id === edificioModelo?.id_edificio);
        const proyecto = proyectos?.find(pr => pr.id === edificio?.id_proyecto);
        const producto = productos?.find(prod => prod.id === oferta?.id_producto);

        // Obtener cuenta_stp_comisiones y nombre del dueño desde la entidad relacionada de la propiedad
        const entidadDueno = entidadesRelacionadas?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const cuenta_stp_comisiones = entidadDueno?.cuenta_stp_comisiones;
        const nombre_dueno = entidadDueno?.personas?.nombre_comercial || entidadDueno?.personas?.nombre_legal;

        // Determinar tipo de cuenta
        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        if (oferta?.id_producto && producto) {
          const categoriaNombre = producto.categorias_producto?.nombre?.toLowerCase();
          tipo = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';
        }
        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: edificioModelo?.modelos?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
          tipo: tipo,
          cuenta_stp_comisiones,
          nombre_dueno,
          id_estatus_disponibilidad: propiedad?.id_estatus_disponibilidad,
          dueno_facturar: (entidadDueno as any)?.facturar_comision_sozu || false,
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

  const handleGenerarFactura = async (cuentaId: number) => {
    setGenerarLoading(cuentaId);
    try {
      const { data, error } = await supabase.functions.invoke('generar-factura-comision-sozu', {
        body: { id_cuenta_cobranza: cuentaId, environment: ENVIRONMENT }
      });
      if (error) throw error;
      if (data?.not_applicable) {
        toast({ title: "No aplica", description: data.message });
      } else if (data?.already_exists) {
        toast({ title: "Ya existe", description: data.message });
      } else {
        toast({ title: "Factura generada", description: "Factura draft de comisión generada exitosamente" });
      }
      queryClient.invalidateQueries({ queryKey: ["comisiones"] });
    } catch (err) {
      console.error("Error generando factura:", err);
      toast({ title: "Error", description: "No se pudo generar la factura", variant: "destructive" });
    } finally {
      setGenerarLoading(null);
    }
  };

  const handleTimbrarFactura = async () => {
    if (!timbrarDialog) return;
    setTimbrarLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('timbrar-factura-comision-sozu', {
        body: { id_cuenta_cobranza: timbrarDialog.cuentaId, environment: ENVIRONMENT }
      });
      if (error) throw error;
      toast({ title: "Factura timbrada", description: "La factura se ha timbrado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["comisiones"] });
    } catch (err) {
      console.error("Error timbrando factura:", err);
      toast({ title: "Error", description: "No se pudo timbrar la factura", variant: "destructive" });
    } finally {
      setTimbrarLoading(false);
      setTimbrarDialog(null);
    }
  };


  const comisionesFiltradas = comisiones?.filter((comision: any) => {
    // Filtro general
    if (filtroGeneral) {
      const searchTerm = filtroGeneral.toLowerCase();
      const matchId = formatCuentaCobranzaId(comision.id, comision.tipo).toLowerCase().includes(searchTerm);
      const matchProyecto = comision.proyecto_nombre?.toLowerCase().includes(searchTerm);
      const matchNumero = (comision.numero_departamento || comision.producto_nombre || "").toLowerCase().includes(searchTerm);
      const matchModelo = comision.modelo_nombre?.toLowerCase().includes(searchTerm);
      if (!matchId && !matchProyecto && !matchNumero && !matchModelo) {
        return false;
      }
    }

    // Filtro por ID
    if (filtroId && !formatCuentaCobranzaId(comision.id, comision.tipo).includes(filtroId)) {
      return false;
    }

    // Filtro por tipo
    if (filtroTipo && !comision.tipo?.toLowerCase().includes(filtroTipo.toLowerCase())) {
      return false;
    }

    // Filtro por proyecto
    if (filtroProyecto && !comision.proyecto_nombre?.toLowerCase().includes(filtroProyecto.toLowerCase())) {
      return false;
    }

    // Filtro por edificio
    if (filtroEdificio && !comision.edificio_nombre?.toLowerCase().includes(filtroEdificio.toLowerCase())) {
      return false;
    }

    // Filtro por modelo
    if (filtroModelo && !comision.modelo_nombre?.toLowerCase().includes(filtroModelo.toLowerCase())) {
      return false;
    }

    // Filtro por número
    if (filtroNumero) {
      const numero = (comision.numero_departamento || comision.producto_nombre || "").toLowerCase();
      if (!numero.includes(filtroNumero.toLowerCase())) {
        return false;
      }
    }

    // Filtro por estatus
    if (filtroEstatus && filtroEstatus !== "todos") {
      const esPagado = comision.es_pagada_comision_venta;
      const estatusTexto = esPagado ? "pagado" : "pendiente";
      if (estatusTexto !== filtroEstatus) {
        return false;
      }
    }

    // Filtro por efectivo
    if (filtroEfectivo && filtroEfectivo !== "todos") {
      const esEfectivo = comision.es_comision_venta_efectivo;
      const efectivoTexto = esEfectivo ? "si" : "no";
      if (efectivoTexto !== filtroEfectivo) {
        return false;
      }
    }
    return true;
  }) || [];

  // Pagination logic
  const totalPages = Math.ceil(comisionesFiltradas.length / itemsPerPage);
  const paginatedComisiones = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return comisionesFiltradas.slice(startIndex, startIndex + itemsPerPage);
  }, [comisionesFiltradas, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [filtroGeneral, filtroId, filtroTipo, filtroProyecto, filtroEdificio, filtroModelo, filtroNumero, filtroEstatus, filtroEfectivo]);

  const renderPaginationItems = () => {
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

  if (isLoading) {
    return <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>;
  }
  return <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Comisiones</CardTitle>
            <Badge variant="outline" className="text-lg px-4 py-1">
              {comisionesFiltradas.length} cuenta{comisionesFiltradas.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-4">
              <Input type="text" placeholder="Buscar por ID, proyecto, número o modelo..." value={filtroGeneral} onChange={e => setFiltroGeneral(e.target.value)} />
            </div>
            
            <Input type="text" placeholder="Filtrar por ID..." value={filtroId} onChange={e => setFiltroId(e.target.value)} />

            <Input type="text" placeholder="Filtrar por tipo..." value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} />

            <Input type="text" placeholder="Filtrar por proyecto..." value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)} />

            <Input type="text" placeholder="Filtrar por edificio..." value={filtroEdificio} onChange={e => setFiltroEdificio(e.target.value)} />

            <Input type="text" placeholder="Filtrar por modelo..." value={filtroModelo} onChange={e => setFiltroModelo(e.target.value)} />

            <Input type="text" placeholder="Filtrar por número..." value={filtroNumero} onChange={e => setFiltroNumero(e.target.value)} />

            <Select value={filtroEstatus} onValueChange={setFiltroEstatus}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por estatus..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="pagado">Pagado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroEfectivo} onValueChange={setFiltroEfectivo}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por efectivo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="si">Sí</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Edificio</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>No. Departamento</TableHead>
                <TableHead>Entidad Dueña</TableHead>
                <TableHead>STP de Comisión</TableHead>
                <TableHead>Precio final</TableHead>
                <TableHead>Comisión</TableHead>
                <TableHead>Monto Comisión Pagado</TableHead>
                <TableHead>Fecha Pago Comisión</TableHead>
                <TableHead>Comisión En Efectivo</TableHead>
                <TableHead>Fact. Comisión Sozu</TableHead>
                <TableHead>Estatus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedComisiones?.map((comision: any) => {
              return <TableRow key={comision.id} className={comision.es_comision_venta_efectivo ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}>
                    <TableCell className="font-medium">
                      <button onClick={() => copyToClipboard(formatCuentaCobranzaId(comision.id, comision.tipo), "Número de cuenta")} className="flex items-center gap-2 hover:text-primary transition-colors cursor-pointer">
                        {formatCuentaCobranzaId(comision.id, comision.tipo)}
                        <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{comision.tipo}</Badge>
                    </TableCell>
                    <TableCell>{comision.proyecto_nombre || "-"}</TableCell>
                    <TableCell>{comision.edificio_nombre || "-"}</TableCell>
                    <TableCell>{comision.modelo_nombre || "-"}</TableCell>
                    <TableCell>{comision.producto_nombre || "-"}</TableCell>
                    <TableCell>
                      {comision.numero_departamento || "-"}
                    </TableCell>
                    <TableCell>
                      {comision.nombre_dueno || "-"}
                    </TableCell>
                    <TableCell>
                      {comision.cuenta_stp_comisiones ? <button onClick={() => copyToClipboard(comision.cuenta_stp_comisiones, "Cuenta STP")} className="flex items-center gap-2 hover:text-primary transition-colors cursor-pointer">
                          {comision.cuenta_stp_comisiones}
                          <Copy className="h-3 w-3" />
                        </button> : "-"}
                    </TableCell>
                    <TableCell>{formatMonto(comision.precio_final)}</TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="relative">
                        <div className="pr-16">
                          {(() => {
                        const montoBase = comision.porcentaje_comision_venta / 100 * comision.precio_final;
                        const montoFinal = comision.iva_incluido ? montoBase * 1.16 : montoBase;
                        return <div className="font-medium">
                                {formatMonto(montoFinal)}
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  ({comision.porcentaje_comision_venta}%)
                                </div>
                              </div>;
                      })()}
                        </div>
                        {comision.iva_incluido && <Badge variant="default" className="absolute top-0 right-0 text-[10px] px-1.5 py-0 bg-green-600 hover:bg-green-700">
                            IVA Incluido
                          </Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatMonto(comision.monto_comision_pagado)}
                    </TableCell>
                    <TableCell>
                      {comision.fecha_pago_comision ? format(new Date(comision.fecha_pago_comision), "dd/MMM/yyyy", {
                    locale: es
                  }) : "-"}
                    </TableCell>
                    <TableCell>
                      {comision.es_comision_venta_efectivo ? <Badge variant="secondary">Sí</Badge> : <Badge variant="outline">No</Badge>}
                    </TableCell>
                    <TableCell>
                    {(() => {
                        const esVendida = comision.id_estatus_disponibilidad === 5;
                        const requiereFactura = comision.dueno_facturar;
                        const urlFactura = comision.url_factura_comision;
                        const esDraft = comision.es_draft_factura_comision;
                        
                        if (!urlFactura) {
                          if (!requiereFactura) {
                            return <span className="text-muted-foreground">-</span>;
                          }
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerarFactura(comision.id)}
                              disabled={!esVendida || generarLoading === comision.id}
                            >
                              {generarLoading === comision.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                              Generar
                            </Button>
                          );
                        }
                        if (esDraft) {
                          return (
                            <div className="flex items-center gap-1">
                              <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Draft</Badge>
                              {urlFactura.startsWith('http') && !urlFactura.includes('pendiente') && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  title="Preview"
                                  onClick={() => setPreviewDialog({ isOpen: true, url: urlFactura, title: `Preview Factura Comisión Sozu - Cuenta ${formatCuentaCobranzaId(comision.id, comision.tipo)}` })}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title="Regenerar"
                                onClick={() => handleGenerarFactura(comision.id)}
                                disabled={generarLoading === comision.id}
                              >
                                {generarLoading === comision.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title="Timbrar"
                                onClick={() => setTimbrarDialog({ isOpen: true, cuentaId: comision.id })}
                              >
                                <Stamp className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        }
                        // Timbrada
                        return (
                          <div className="flex items-center gap-1">
                            <Badge className="bg-green-600 hover:bg-green-700 text-white">Timbrada</Badge>
                            {urlFactura && (
                              <Button size="sm" variant="ghost" onClick={() => window.open(urlFactura, '_blank')}>
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {comision.es_pagada_comision_venta ? <Badge variant="default">Pagado</Badge> : comision.es_comision_venta_efectivo ? <Button size="sm" onClick={() => handlePagarComision(comision)} disabled={pagarComisionMutation.isPending}>
                          {pagarComisionMutation.isPending ? "Pagando..." : "Marcar como Pagado"}
                        </Button> : <Badge variant="destructive">Pendiente</Badge>}
                    </TableCell>
                  </TableRow>;
            })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, comisionesFiltradas.length)} de {comisionesFiltradas.length} comisiones
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {renderPaginationItems()}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmación para timbrar */}
      <Dialog open={!!timbrarDialog?.isOpen} onOpenChange={(open) => { if (!open) setTimbrarDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Timbrado</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas timbrar esta factura de comisión? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimbrarDialog(null)} disabled={timbrarLoading}>
              Cancelar
            </Button>
            <Button onClick={handleTimbrarFactura} disabled={timbrarLoading}>
              {timbrarLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Timbrando...</> : <><Stamp className="h-4 w-4 mr-2" /> Timbrar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de preview de factura */}
      <Dialog open={previewDialog.isOpen} onOpenChange={(open) => { if (!open) setPreviewDialog({ isOpen: false, url: '', title: '' }); }}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewDialog.title}</DialogTitle>
            <DialogDescription>Vista previa del documento de factura</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 h-full">
            <iframe
              src={previewDialog.url}
              className="w-full h-full border rounded-md"
              title="Preview Factura"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}