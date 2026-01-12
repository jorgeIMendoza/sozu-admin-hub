import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export default function PagarComisiones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [selectedComisionista, setSelectedComisionista] = useState<{ email: string; idCuenta: number } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pagarTodas, setPagarTodas] = useState<{ type: 'comisionista' | 'cuenta', data: any } | null>(null);
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

  const pagarComisionMutation = useMutation({
    mutationFn: async ({ email, idCuenta, file }: { email: string; idCuenta: number; file: File }) => {
      // Subir archivo a storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${email}_${idCuenta}_${Date.now()}.${fileExt}`;
      const filePath = `evidencias-pago-comision/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Actualizar comisionista
      const { data: updateData, error: updateError } = await supabase
        .from("comisionistas")
        .update({ 
          pagada: true,
          url_evidencia_pago: publicUrl
        })
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true)
        .select();
      
      if (updateError) throw updateError;
      
      if (!updateData || updateData.length === 0) {
        throw new Error("No se encontró la comisión para actualizar");
      }
      
      return updateData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["totales-comisiones"] });
      toast({
        title: "Comisión pagada",
        description: `La comisión ha sido marcada como pagada exitosamente. ${data?.length || 0} registro(s) actualizado(s).`
      });
      setUploadDialogOpen(false);
      setEvidenciaFile(null);
      setSelectedComisionista(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al procesar el pago",
        variant: "destructive"
      });
      console.error("Error al pagar comisión:", error);
    }
  });

  const pagarTodasMutation = useMutation({
    mutationFn: async ({ cuentas, file }: { cuentas: Array<{ email: string; idCuenta: number }>, file: File }) => {
      // Subir archivo a storage
      const fileExt = file.name.split('.').pop();
      const fileName = `pago_multiple_${Date.now()}.${fileExt}`;
      const filePath = `evidencias-pago-comision/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Actualizar todas las comisiones
      const resultados = [];
      for (const cuenta of cuentas) {
        const { data: updateData, error: updateError } = await supabase
          .from("comisionistas")
          .update({ 
            pagada: true,
            url_evidencia_pago: publicUrl
          })
          .eq("email_usuario", cuenta.email)
          .eq("id_cuenta_cobranza", cuenta.idCuenta)
          .eq("activo", true)
          .select();
        
        if (updateError) throw updateError;
        
        if (!updateData || updateData.length === 0) {
          console.warn(`No se encontró comisión para ${cuenta.email} - cuenta ${cuenta.idCuenta}`);
        } else {
          resultados.push(updateData[0]);
        }
      }
      
      if (resultados.length === 0) {
        throw new Error("No se actualizó ninguna comisión");
      }
      
      return resultados;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["totales-comisiones"] });
      toast({
        title: "Comisiones pagadas",
        description: `Todas las comisiones han sido marcadas como pagadas exitosamente. ${data?.length || 0} registro(s) actualizado(s).`
      });
      setUploadDialogOpen(false);
      setEvidenciaFile(null);
      setPagarTodas(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al procesar los pagos",
        variant: "destructive"
      });
      console.error("Error al pagar comisiones:", error);
    }
  });

  const { data: comisionistasAgrupados, isLoading: loadingComisionistas } = useQuery({
    queryKey: ["pagar-comisiones", "por-comisionista"],
    queryFn: async () => {
      const { data: comisionistas, error } = await supabase
        .from("comisionistas")
        .select(`
          email_usuario,
          porcentaje_comision,
          pagada,
          url_evidencia_pago,
          aprobada,
          id_cuenta_cobranza,
          cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
            id,
            precio_final,
            ofertas!fk_cuentas_cobranza_oferta!inner(
              id_propiedad,
              id_producto,
              propiedades!fk_ofertas_propiedad(
                numero_propiedad,
                edificios_modelos!propiedades_id_edificio_modelo_fkey(
                  edificios!edificios_modelos_id_edificio_fkey(
                    nombre,
                    proyectos!edificios_id_proyecto_fkey(nombre)
                  ),
                  modelos!edificios_modelos_id_modelo_fkey(nombre)
                )
              ),
              productos_servicios!ofertas_id_producto_fkey(
                id,
                categorias_producto!productos_servicios_id_categoria_fkey(nombre)
              )
            )
          )
        `)
        .eq("activo", true)
        .eq("aprobada", true)
        .order("email_usuario");

      if (error) throw error;

      // Obtener nombres de usuarios
      const emails = [...new Set(comisionistas.map((c: any) => c.email_usuario))];
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, nombre")
        .in("email", emails);

      const usuariosMap = new Map(usuarios?.map(u => [u.email, u.nombre]) || []);

      // Agrupar por comisionista
      const grouped = comisionistas.reduce((acc: any, com: any) => {
        if (!acc[com.email_usuario]) {
          acc[com.email_usuario] = {
            email: com.email_usuario,
            nombre: usuariosMap.get(com.email_usuario) || 'N/A',
            montoTotal: 0,
            cuentas: []
          };
        }

        const cuenta = com.cuentas_cobranza;
        const oferta = cuenta.ofertas;
        const propiedad = oferta?.propiedades;
        const producto = oferta?.productos_servicios;
        const montoComision = (cuenta.precio_final * com.porcentaje_comision) / 100;

        acc[com.email_usuario].montoTotal += montoComision;
        acc[com.email_usuario].cuentas.push({
          idCuenta: cuenta.id,
          numeroCuenta: formatCuentaCobranzaId(cuenta.id),
          tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
          proyecto: propiedad?.edificios_modelos?.edificios?.proyectos?.nombre || 'N/A',
          edificio: propiedad?.edificios_modelos?.edificios?.nombre || 'N/A',
          modelo: propiedad?.edificios_modelos?.modelos?.nombre || 'N/A',
          numeroDepartamento: propiedad?.numero_propiedad || 'N/A',
          precioFinal: cuenta.precio_final,
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  const { data: cuentasAgrupadas, isLoading: loadingCuentas } = useQuery({
    queryKey: ["pagar-comisiones", "por-cuenta"],
    queryFn: async () => {
      const { data: comisionistas, error } = await supabase
        .from("comisionistas")
        .select(`
          email_usuario,
          porcentaje_comision,
          pagada,
          url_evidencia_pago,
          aprobada,
          id_cuenta_cobranza,
          cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
            id,
            precio_final,
            ofertas!fk_cuentas_cobranza_oferta!inner(
              id_propiedad,
              id_producto,
              propiedades!fk_ofertas_propiedad(
                numero_propiedad,
                edificios_modelos!propiedades_id_edificio_modelo_fkey(
                  edificios!edificios_modelos_id_edificio_fkey(
                    nombre,
                    proyectos!edificios_id_proyecto_fkey(nombre)
                  ),
                  modelos!edificios_modelos_id_modelo_fkey(nombre)
                )
              ),
              productos_servicios!ofertas_id_producto_fkey(
                id,
                categorias_producto!productos_servicios_id_categoria_fkey(nombre)
              )
            )
          )
        `)
        .eq("activo", true)
        .eq("aprobada", true)
        .order("id_cuenta_cobranza");

      if (error) throw error;

      // Obtener nombres de usuarios
      const emails = [...new Set(comisionistas.map((c: any) => c.email_usuario))];
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, nombre")
        .in("email", emails);

      const usuariosMap = new Map(usuarios?.map(u => [u.email, u.nombre]) || []);

      // Agrupar por cuenta
      const grouped = comisionistas.reduce((acc: any, com: any) => {
        const cuentaId = com.id_cuenta_cobranza;
        if (!acc[cuentaId]) {
          const cuenta = com.cuentas_cobranza;
          const oferta = cuenta.ofertas;
          const propiedad = oferta?.propiedades;
          const producto = oferta?.productos_servicios;

          acc[cuentaId] = {
            idCuenta: cuenta.id,
            numeroCuenta: formatCuentaCobranzaId(cuenta.id),
            tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
            proyecto: propiedad?.edificios_modelos?.edificios?.proyectos?.nombre || 'N/A',
            edificio: propiedad?.edificios_modelos?.edificios?.nombre || 'N/A',
            modelo: propiedad?.edificios_modelos?.modelos?.nombre || 'N/A',
            numeroDepartamento: propiedad?.numero_propiedad || 'N/A',
            precioFinal: cuenta.precio_final,
            montoTotalComision: 0,
            porcentajeTotalComision: 0,
            comisionistas: []
          };
        }

        const montoComision = (com.cuentas_cobranza.precio_final * com.porcentaje_comision) / 100;

        acc[cuentaId].montoTotalComision += montoComision;
        acc[cuentaId].porcentajeTotalComision += com.porcentaje_comision;

        acc[cuentaId].comisionistas.push({
          email: com.email_usuario,
          nombre: usuariosMap.get(com.email_usuario) || 'N/A',
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEvidenciaFile(e.target.files[0]);
    }
  };

  const handlePagar = () => {
    if (!evidenciaFile) {
      toast({
        title: "Error",
        description: "Debe seleccionar un archivo de evidencia",
        variant: "destructive"
      });
      return;
    }

    if (pagarTodas) {
      // Pagar todas las comisiones
      const cuentas = pagarTodas.type === 'comisionista'
        ? pagarTodas.data.cuentas
            .filter((c: any) => !c.pagada)
            .map((c: any) => ({ email: pagarTodas.data.email, idCuenta: c.idCuenta }))
        : pagarTodas.data.comisionistas
            .filter((c: any) => !c.pagada)
            .map((c: any) => ({ email: c.email, idCuenta: pagarTodas.data.idCuenta }));

      pagarTodasMutation.mutate({ cuentas, file: evidenciaFile });
    } else if (selectedComisionista) {
      // Pagar una sola comisión
      pagarComisionMutation.mutate({
        email: selectedComisionista.email,
        idCuenta: selectedComisionista.idCuenta,
        file: evidenciaFile
      });
    }
  };

  const openPagarDialog = (email: string, idCuenta: number) => {
    setSelectedComisionista({ email, idCuenta });
    setPagarTodas(null);
    setUploadDialogOpen(true);
  };

  const openPagarTodasDialog = (type: 'comisionista' | 'cuenta', data: any) => {
    setPagarTodas({ type, data });
    setSelectedComisionista(null);
    setUploadDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return formatCurrency(value);
  };

  const comisionistasFiltrados = comisionistasAgrupados?.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    com.nombre.toLowerCase().includes(filtroGeneral.toLowerCase())
  ) || [];

  const cuentasFiltradas = cuentasAgrupadas?.filter((cuenta: any) =>
    cuenta.numeroCuenta.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    cuenta.proyecto.toLowerCase().includes(filtroGeneral.toLowerCase())
  ) || [];

  // Pagination logic
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

  // Reset pages when filter changes
  useMemo(() => {
    setCurrentPageComisionistas(1);
    setCurrentPageCuentas(1);
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

  // Calcular totales para las cards de resumen
  const { data: totalesComisiones } = useQuery({
    queryKey: ["totales-comisiones"],
    queryFn: async () => {
      const { data: comisionistas, error } = await supabase
        .from("comisionistas")
        .select(`
          porcentaje_comision,
          pagada,
          id_cuenta_cobranza,
          cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
            precio_final
          )
        `)
        .eq("activo", true)
        .eq("aprobada", true);

      if (error) throw error;

      let montoTotal = 0;
      let montoDispersado = 0;
      let montoPendiente = 0;

      comisionistas.forEach((com: any) => {
        const montoComision = (com.cuentas_cobranza.precio_final * com.porcentaje_comision) / 100;
        montoTotal += montoComision;
        
        if (com.pagada) {
          montoDispersado += montoComision;
        } else {
          montoPendiente += montoComision;
        }
      });

      return {
        montoTotal,
        montoDispersado,
        montoPendiente
      };
    }
  });

  const { data: totalesComisionesSozu } = useQuery({
    queryKey: ["totales-comisiones-sozu"],
    queryFn: async () => {
      // Usar RPC para obtener los totales de forma precisa (sin límite de 1000 registros)
      const { data, error } = await supabase.rpc('get_totales_comisiones_sozu');

      if (error) throw error;

      return {
        montoTotalSozu: Number(data?.[0]?.monto_total_sozu || 0),
        montoYaCobrado: Number(data?.[0]?.monto_ya_cobrado || 0),
        montoPorCobrar: Number(data?.[0]?.monto_por_cobrar || 0)
      };
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pagar Comisiones</h1>
          <p className="text-muted-foreground">Gestión de pagos de comisiones aprobadas</p>
        </div>
      </div>

      {/* Cards de resumen */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comisiones a Cobrar por Sozu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {totalesComisionesSozu ? formatCompactCurrency(totalesComisionesSozu.montoPorCobrar) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisión general pendiente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comisiones Ya Cobradas por Sozu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalesComisionesSozu ? formatCompactCurrency(totalesComisionesSozu.montoYaCobrado) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisión general cobrada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto Total de Comisiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalesComisiones ? formatCompactCurrency(totalesComisiones.montoTotal) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total de comisiones aprobadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto a Dispersar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {totalesComisiones ? formatCompactCurrency(totalesComisiones.montoPendiente) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisiones pendientes de pago
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto Dispersado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalesComisiones ? formatCompactCurrency(totalesComisiones.montoDispersado) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisiones ya pagadas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar..."
          value={filtroGeneral}
          onChange={(e) => setFiltroGeneral(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs defaultValue="por-comisionista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-comisionista">Agrupada por Comisionista</TabsTrigger>
          <TabsTrigger value="por-cuenta">Agrupada por Cuenta de Cobranza</TabsTrigger>
        </TabsList>

        <TabsContent value="por-comisionista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones por Comisionista</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingComisionistas ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-right">Monto Total</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedComisionistas?.map((com: any) => (
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
                          <TableCell className="font-medium">{com.nombre}</TableCell>
                          <TableCell>{com.email}</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(com.montoTotal)}
                          </TableCell>
                          <TableCell>
                            {com.cuentas.some((c: any) => !c.pagada) && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPagarTodasDialog('comisionista', com);
                                }}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Pagar Todas
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedItems.has(com.email) && (
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
                                      <TableHead className="text-right">Precio Final</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Estatus</TableHead>
                                      <TableHead>Acciones</TableHead>
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
                                          {cuenta.pagada ? (
                                            <Badge variant="default">Pagada</Badge>
                                          ) : (
                                            <Badge variant="secondary">Pendiente</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-2">
                                            {!cuenta.pagada ? (
                                              <Button
                                                size="sm"
                                                onClick={() => openPagarDialog(com.email, cuenta.idCuenta)}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Pagar
                                              </Button>
                                            ) : cuenta.urlEvidencia ? (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(cuenta.urlEvidencia, '_blank')}
                                              >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Ver Evidencia
                                              </Button>
                                            ) : null}
                                          </div>
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

              {/* Pagination for Comisionistas */}
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
              <CardTitle>Comisiones por Cuenta de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCuentas ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
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
                      <TableHead className="text-right">Monto Comisión</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas?.map((cuenta: any) => (
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
                          <TableCell className="text-right font-bold">
                            {formatCurrency(cuenta.montoTotalComision)}
                            <span className="text-muted-foreground text-xs ml-1">
                              ({cuenta.porcentajeTotalComision.toFixed(2)}%)
                            </span>
                          </TableCell>
                          <TableCell>
                            {cuenta.comisionistas.some((c: any) => !c.pagada) && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPagarTodasDialog('cuenta', cuenta);
                                }}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Pagar Todas
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedItems.has(`cuenta-${cuenta.idCuenta}`) && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Nombre</TableHead>
                                      <TableHead>Usuario</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Estatus</TableHead>
                                      <TableHead>Acciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {cuenta.comisionistas.map((com: any) => (
                                      <TableRow key={`${cuenta.idCuenta}-${com.email}`}>
                                        <TableCell className="font-medium">{com.nombre}</TableCell>
                                        <TableCell>{com.email}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(com.montoComision)}
                                          <span className="text-muted-foreground text-xs ml-1">
                                            ({com.porcentajeComision}%)
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {com.pagada ? (
                                            <Badge variant="default">Pagada</Badge>
                                          ) : (
                                            <Badge variant="secondary">Pendiente</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-2">
                                            {!com.pagada ? (
                                              <Button
                                                size="sm"
                                                onClick={() => openPagarDialog(com.email, cuenta.idCuenta)}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Pagar
                                              </Button>
                                            ) : com.urlEvidencia ? (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(com.urlEvidencia, '_blank')}
                                              >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Ver Evidencia
                                              </Button>
                                            ) : null}
                                          </div>
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

              {/* Pagination for Cuentas */}
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

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pagarTodas ? 'Pagar Todas las Comisiones' : 'Subir Evidencia de Pago'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {pagarTodas && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Se pagarán {pagarTodas.type === 'comisionista' 
                    ? `${pagarTodas.data.cuentas.filter((c: any) => !c.pagada).length} comisiones pendientes del comisionista ${pagarTodas.data.nombre}`
                    : `${pagarTodas.data.comisionistas.filter((c: any) => !c.pagada).length} comisiones pendientes de la cuenta ${pagarTodas.data.numeroCuenta}`
                  }
                </p>
              </div>
            )}
            <div>
              <Label>Archivo de evidencia</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="mt-2"
              />
              {evidenciaFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Archivo seleccionado: {evidenciaFile.name}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setEvidenciaFile(null);
                  setSelectedComisionista(null);
                  setPagarTodas(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePagar}
                disabled={!evidenciaFile || pagarComisionMutation.isPending || pagarTodasMutation.isPending}
              >
                {(pagarComisionMutation.isPending || pagarTodasMutation.isPending) ? "Procesando..." : "Confirmar Pago"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
