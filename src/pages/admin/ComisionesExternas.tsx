import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Check, Upload, Eye, FileText, Search } from "lucide-react";
import { format, parseISO, endOfMonth, subMonths, isBefore, isEqual } from "date-fns";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";

// ID del rol "Agente Inmobiliario"
const AGENTE_INMOBILIARIO_ROL_ID = 3;

// Función para obtener la fecha límite de enganche
function getFechaLimiteEnganche(): Date {
  const today = new Date();
  const currentDay = today.getDate();
  
  if (currentDay >= 16) {
    const limitDate = new Date(today.getFullYear(), today.getMonth(), 15, 23, 59, 59, 999);
    return limitDate;
  } else {
    const lastMonth = subMonths(today, 1);
    return endOfMonth(lastMonth);
  }
}

// Helper para obtener comisionistas de agentes externos
async function fetchExternalAgentCommissions() {
  const batchSize = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  // Obtener usuarios con rol Agente Inmobiliario
  const { data: agentesInmobiliarios, error: errorAgentes } = await supabase
    .from('usuarios')
    .select('email')
    .eq('rol_id', AGENTE_INMOBILIARIO_ROL_ID)
    .eq('activo', true);

  if (errorAgentes) {
    console.error('[ComisionesExternas] Error fetching agentes inmobiliarios:', errorAgentes);
  }

  const emailsAgentes = agentesInmobiliarios?.map(a => a.email) || [];
  console.log('[ComisionesExternas] Agentes Inmobiliarios encontrados:', emailsAgentes.length, emailsAgentes.slice(0, 5));

  // Obtener inmobiliarias (personas morales)
  const { data: inmobiliarias, error: errorInmobiliarias } = await supabase
    .from('personas')
    .select('email')
    .eq('tipo_persona', 'pm')
    .eq('activo', true)
    .not('email', 'is', null);

  if (errorInmobiliarias) {
    console.error('[ComisionesExternas] Error fetching inmobiliarias:', errorInmobiliarias);
  }

  const emailsInmobiliarias = inmobiliarias?.map(i => i.email).filter(Boolean) || [];
  console.log('[ComisionesExternas] Inmobiliarias encontradas:', emailsInmobiliarias.length);

  // Combinar emails de agentes externos
  const emailsExternos = [...new Set([...emailsAgentes, ...emailsInmobiliarias])];
  console.log('[ComisionesExternas] Total emails externos combinados:', emailsExternos.length);
  
  // Debug: verificar si los emails de la cuenta 1671 están incluidos
  const emailsTest = ['jorge.externo@yopmail.com', 'contacto@vivaltainmobiliaria.com'];
  emailsTest.forEach(email => {
    console.log(`[ComisionesExternas] ¿${email} está en lista?`, emailsExternos.includes(email));
  });

  if (emailsExternos.length === 0) {
    console.warn('[ComisionesExternas] No hay emails externos, retornando vacío');
    return [];
  }

  while (hasMore) {
    const { data, error } = await supabase
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
          es_pagada_comision_venta,
          acuerdos_pago!fk_acpago_cuenta(
            id_concepto,
            pago_completado,
            conceptos_pago!fk_acpago_concepto(nombre),
            aplicaciones_pago(
              activo,
              pagos!fk_aplicaciones_pago_pago(fecha_pago)
            )
          ),
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
      .in("email_usuario", emailsExternos)
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('[ComisionesExternas] Error fetching comisionistas:', error);
      throw error;
    }

    console.log(`[ComisionesExternas] Batch ${from}-${from + batchSize - 1}: ${data?.length || 0} registros`);
    
    // Debug: buscar específicamente cuenta 1671
    const cuenta1671 = data?.filter((c: any) => c.id_cuenta_cobranza === 1671);
    if (cuenta1671 && cuenta1671.length > 0) {
      console.log('[ComisionesExternas] ¡Cuenta 1671 encontrada en batch!', cuenta1671);
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  console.log('[ComisionesExternas] Total registros obtenidos:', allData.length);
  
  // Debug: verificar cuenta 1671 en datos finales
  const final1671 = allData.filter((c: any) => c.id_cuenta_cobranza === 1671);
  console.log('[ComisionesExternas] Cuenta 1671 en datos finales:', final1671.length, final1671);

  return allData;
}

// Función para buscar el tipo de documento "Factura de comisión externa"
async function getTipoDocumentoFactura() {
  const { data, error } = await supabase
    .from('tipos_documento')
    .select('id')
    .eq('nombre', 'Factura de comisión externa')
    .eq('activo', true)
    .single();
  
  if (error) {
    console.error('Error obteniendo tipo de documento:', error);
    return null;
  }
  return data?.id;
}

export default function ComisionesExternas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarAprobacion } = useActivityLogger();
  const { canApprove, canUpdate, isSuperAdmin } = usePagePermissions('/admin/comisiones-externas');
  
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedComision, setSelectedComision] = useState<{ email: string; idCuenta: number } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
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

  // Query para comisionistas externos
  const { data: comisionistasExternos, isLoading } = useQuery({
    queryKey: ["comisiones-externas"],
    queryFn: async () => {
      const comisionistas = await fetchExternalAgentCommissions();

      // Obtener información de usuarios y personas
      const emails = [...new Set(comisionistas.map((c: any) => c.email_usuario))];
      
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('email, nombre, rol_id')
        .in('email', emails);

      const usuariosMap = new Map<string, { nombre: string; esInmobiliaria: boolean; esAgenteInmobiliario: boolean }>();
      usuarios?.forEach(u => {
        usuariosMap.set(u.email, { 
          nombre: u.nombre, 
          esInmobiliaria: false,
          esAgenteInmobiliario: u.rol_id === AGENTE_INMOBILIARIO_ROL_ID
        });
      });

      // Buscar en personas (inmobiliarias)
      const emailsNotInUsuarios = emails.filter(email => !usuariosMap.has(email));
      
      if (emailsNotInUsuarios.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInUsuarios)
          .eq('activo', true);
        
        personasData?.forEach(p => {
          usuariosMap.set(p.email, { 
            nombre: p.nombre_legal, 
            esInmobiliaria: p.tipo_persona === 'pm',
            esAgenteInmobiliario: false
          });
        });
      }

      // Obtener documentos de factura para cada comisionista
      const cuentaIds = [...new Set(comisionistas.map((c: any) => c.id_cuenta_cobranza))];
      const tipoDocFactura = await getTipoDocumentoFactura();
      
      let facturasMap = new Map<string, string>();
      if (tipoDocFactura && cuentaIds.length > 0) {
        const { data: facturas } = await supabase
          .from('documentos')
          .select('id_cuenta_cobranza, url, numero')
          .in('id_cuenta_cobranza', cuentaIds)
          .eq('id_tipo_documento', tipoDocFactura)
          .eq('activo', true);
        
        facturas?.forEach(f => {
          // El campo numero guarda el email del comisionista
          if (f.numero && f.url && f.id_cuenta_cobranza) {
            const key = `${f.numero}_${f.id_cuenta_cobranza}`;
            facturasMap.set(key, f.url);
          }
        });
      }

      // Agrupar por comisionista - Solo cuentas donde la comisión de venta ya fue pagada a Sozu
      const grouped = comisionistas.reduce((acc: any, com: any) => {
        const cuenta = com.cuentas_cobranza;
        
        // Solo incluir cuentas donde la comisión de venta ya fue pagada a Sozu
        if (!cuenta.es_pagada_comision_venta) return acc;
        
        if (!acc[com.email_usuario]) {
          const userData = usuariosMap.get(com.email_usuario);
          acc[com.email_usuario] = {
            email: com.email_usuario,
            nombre: userData?.nombre || 'N/A',
            esInmobiliaria: userData?.esInmobiliaria || false,
            esAgenteInmobiliario: userData?.esAgenteInmobiliario || false,
            montoTotal: 0,
            cuentas: []
          };
        }
        const oferta = cuenta.ofertas;
        const propiedad = oferta?.propiedades;
        const producto = oferta?.productos_servicios;
        const montoComision = (cuenta.precio_final * com.porcentaje_comision) / 100;
        
        // Obtener fecha de pago del enganche
        const engancheAcuerdo = cuenta.acuerdos_pago?.find((ap: any) => 
          ap.pago_completado && ap.conceptos_pago?.nombre?.toLowerCase() === 'enganche'
        );
        const aplicacionActiva = engancheAcuerdo?.aplicaciones_pago?.find((app: any) => app.activo);
        const fechaPagoEnganche = aplicacionActiva?.pagos?.fecha_pago || null;

        // Verificar si tiene factura
        const facturaKey = `${com.email_usuario}_${cuenta.id}`;
        const urlFactura = facturasMap.get(facturaKey) || null;

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
          aprobada: com.aprobada,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago,
          urlFactura,
          fechaPagoEnganche
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  // Mutación para aprobar comisionista
  const aprobarMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["comisiones-externas"] });
      
      await registrarAprobacion('comisionistas', {
        email_comisionista: data.email,
        id_cuenta_cobranza: data.idCuenta,
        tipo: 'agente_externo'
      }, 'aprobar_comision_externa');
      
      toast({
        title: "Comisión aprobada",
        description: "La comisión ha sido aprobada. Ahora puede subir la factura."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al aprobar la comisión",
        variant: "destructive"
      });
      console.error("Error al aprobar:", error);
    }
  });

  // Mutación para subir factura
  const subirFacturaMutation = useMutation({
    mutationFn: async ({ email, idCuenta, file }: { email: string; idCuenta: number; file: File }) => {
      const tipoDocFactura = await getTipoDocumentoFactura();
      if (!tipoDocFactura) throw new Error("Tipo de documento no encontrado");

      const fileExt = file.name.split('.').pop();
      const fileName = `factura_comision_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${idCuenta}_${Date.now()}.${fileExt}`;
      const filePath = `facturas-comision-externa/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Guardar documento con numero que identifica al comisionista
      const { error: docError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: idCuenta,
          id_tipo_documento: tipoDocFactura,
          url: urlData.publicUrl,
          numero: email, // Guardamos el email del comisionista en el campo numero
          activo: true
        });

      if (docError) throw docError;
      
      return { email, idCuenta, url: urlData.publicUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comisiones-externas"] });
      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      
      toast({
        title: "Factura cargada",
        description: "La factura ha sido cargada exitosamente. La comisión ahora aparecerá en Pagar Comisiones."
      });
      setUploadDialogOpen(false);
      setFacturaFile(null);
      setSelectedComision(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al cargar la factura",
        variant: "destructive"
      });
      console.error("Error al subir factura:", error);
    }
  });

  // Mutación para pagar comisión
  const pagarMutation = useMutation({
    mutationFn: async ({ email, idCuenta, file }: { email: string; idCuenta: number; file?: File }) => {
      let publicUrl: string | null = null;
      
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${email.replace(/[^a-zA-Z0-9]/g, '_')}_${idCuenta}_${Date.now()}.${fileExt}`;
        const filePath = `evidencias-pago-comision/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      }

      const updatePayload: { pagada: boolean; url_evidencia_pago?: string } = { 
        pagada: true
      };
      if (publicUrl) {
        updatePayload.url_evidencia_pago = publicUrl;
      }
      
      const { error: updateError } = await supabase
        .from("comisionistas")
        .update(updatePayload)
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true);
      
      if (updateError) throw updateError;
      
      return { email, idCuenta };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comisiones-externas"] });
      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      
      toast({
        title: "Comisión pagada",
        description: "La comisión ha sido marcada como pagada."
      });
      setPagoDialogOpen(false);
      setEvidenciaFile(null);
      setSelectedComision(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al pagar la comisión",
        variant: "destructive"
      });
      console.error("Error al pagar:", error);
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  // Separar comisiones por estado
  const comisionesPorPagar = useMemo(() => {
    return (comisionistasExternos as any[])?.map((com: any) => {
      const cuentasPorPagar = com.cuentas.filter((c: any) => {
        // No pagada, aprobada o no
        if (c.pagada) return false;
        return true;
      });
      
      return {
        ...com,
        cuentas: cuentasPorPagar,
        montoTotal: cuentasPorPagar.reduce((sum: number, c: any) => sum + c.montoComision, 0)
      };
    }).filter((com: any) => com.cuentas.length > 0) || [];
  }, [comisionistasExternos]);

  const comisionesPagadas = useMemo(() => {
    return (comisionistasExternos as any[])?.map((com: any) => {
      const cuentasPagadas = com.cuentas.filter((c: any) => c.pagada);
      
      return {
        ...com,
        cuentas: cuentasPagadas,
        montoTotal: cuentasPagadas.reduce((sum: number, c: any) => sum + c.montoComision, 0)
      };
    }).filter((com: any) => com.cuentas.length > 0) || [];
  }, [comisionistasExternos]);

  // Filtrar
  const comisionesPorPagarFiltradas = comisionesPorPagar.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    com.nombre.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const comisionesPagadasFiltradas = comisionesPagadas.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    com.nombre.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const totalPages = Math.ceil(comisionesPorPagarFiltradas.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return comisionesPorPagarFiltradas.slice(startIndex, startIndex + itemsPerPage);
  }, [comisionesPorPagarFiltradas, currentPage, itemsPerPage]);

  const renderPaginationItems = (totalPages: number, currentPage: number, setCurrentPage: (page: number) => void) => {
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

  const openFacturaDialog = (email: string, idCuenta: number) => {
    setSelectedComision({ email, idCuenta });
    setUploadDialogOpen(true);
  };

  const openPagoDialog = (email: string, idCuenta: number) => {
    setSelectedComision({ email, idCuenta });
    setPagoDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Comisiones Externas</h1>
          <p className="text-muted-foreground">Gestión de comisiones de agentes inmobiliarios e inmobiliarias</p>
        </div>
      </div>

      {/* Filtro de búsqueda */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={filtroGeneral}
              onChange={(e) => setFiltroGeneral(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="por-pagar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-pagar">
            Comisiones por Pagar ({comisionesPorPagarFiltradas.length})
          </TabsTrigger>
          <TabsTrigger value="pagadas">
            Comisiones Pagadas ({comisionesPagadasFiltradas.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="por-pagar">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones Externas por Pagar</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : paginatedData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay comisiones externas pendientes
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Comisionista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Monto Total</TableHead>
                      <TableHead className="text-right"># Cuentas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((com: any) => (
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
                          <TableCell>
                            {com.esInmobiliaria ? (
                              <Badge variant="secondary">Inmobiliaria</Badge>
                            ) : com.esAgenteInmobiliario ? (
                              <Badge variant="outline">Agente Inmobiliario</Badge>
                            ) : (
                              <Badge variant="outline">Externo</Badge>
                            )}
                          </TableCell>
                          <TableCell>{com.email}</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(com.montoTotal)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="default">{com.cuentas.length}</Badge>
                          </TableCell>
                        </TableRow>
                        {expandedItems.has(com.email) && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Cuenta</TableHead>
                                      <TableHead>Proyecto</TableHead>
                                      <TableHead>Edificio</TableHead>
                                      <TableHead>Depto</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Estado</TableHead>
                                      <TableHead>Factura</TableHead>
                                      <TableHead>Acciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {com.cuentas.map((cuenta: any) => (
                                      <TableRow key={cuenta.idCuenta}>
                                        <TableCell>{cuenta.numeroCuenta}</TableCell>
                                        <TableCell>{cuenta.proyecto}</TableCell>
                                        <TableCell>{cuenta.edificio}</TableCell>
                                        <TableCell>{cuenta.numeroDepartamento}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(cuenta.montoComision)}
                                          <span className="text-muted-foreground text-xs ml-1">
                                            ({Number(cuenta.porcentajeComision).toFixed(4)}%)
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {cuenta.aprobada ? (
                                            <Badge variant="default" className="bg-green-600">Aprobada</Badge>
                                          ) : (
                                            <Badge variant="secondary">Pendiente</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {cuenta.urlFactura ? (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(cuenta.urlFactura, '_blank');
                                              }}
                                            >
                                              <Eye className="h-4 w-4 mr-1" />
                                              Ver
                                            </Button>
                                          ) : cuenta.aprobada ? (
                                            <span className="text-orange-500 text-xs">Pendiente</span>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-2">
                                            {!cuenta.aprobada && (canApprove || isSuperAdmin) && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  aprobarMutation.mutate({ 
                                                    email: com.email, 
                                                    idCuenta: cuenta.idCuenta 
                                                  });
                                                }}
                                                disabled={aprobarMutation.isPending}
                                              >
                                                <Check className="h-4 w-4 mr-1" />
                                                Aprobar
                                              </Button>
                                            )}
                                            {cuenta.aprobada && !cuenta.urlFactura && (canUpdate || isSuperAdmin) && (
                                              <Button
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openFacturaDialog(com.email, cuenta.idCuenta);
                                                }}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Subir Factura
                                              </Button>
                                            )}
                                            {cuenta.aprobada && cuenta.urlFactura && !cuenta.pagada && (canUpdate || isSuperAdmin) && (
                                              <Button
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPagoDialog(com.email, cuenta.idCuenta);
                                                }}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Pagar
                                              </Button>
                                            )}
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, comisionesPorPagarFiltradas.length)} de {comisionesPorPagarFiltradas.length}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {renderPaginationItems(totalPages, currentPage, setCurrentPage)}
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
        </TabsContent>

        <TabsContent value="pagadas">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones Externas Pagadas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : comisionesPagadasFiltradas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay comisiones externas pagadas
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Comisionista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Monto Total Pagado</TableHead>
                      <TableHead className="text-right"># Cuentas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comisionesPagadasFiltradas.map((com: any) => (
                      <>
                        <TableRow 
                          key={`pagado-${com.email}`}
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
                          <TableCell className="font-medium">{com.nombre}</TableCell>
                          <TableCell>
                            {com.esInmobiliaria ? (
                              <Badge variant="secondary">Inmobiliaria</Badge>
                            ) : (
                              <Badge variant="outline">Agente Inmobiliario</Badge>
                            )}
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
                            <TableCell colSpan={6} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Cuenta</TableHead>
                                      <TableHead>Proyecto</TableHead>
                                      <TableHead>Edificio</TableHead>
                                      <TableHead>Depto</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Factura</TableHead>
                                      <TableHead>Evidencia</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {com.cuentas.map((cuenta: any) => (
                                      <TableRow key={cuenta.idCuenta}>
                                        <TableCell>{cuenta.numeroCuenta}</TableCell>
                                        <TableCell>{cuenta.proyecto}</TableCell>
                                        <TableCell>{cuenta.edificio}</TableCell>
                                        <TableCell>{cuenta.numeroDepartamento}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(cuenta.montoComision)}
                                        </TableCell>
                                        <TableCell>
                                          {cuenta.urlFactura ? (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => window.open(cuenta.urlFactura, '_blank')}
                                            >
                                              <FileText className="h-4 w-4 mr-1" />
                                              Ver
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">-</span>
                                          )}
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
                                            <span className="text-muted-foreground text-xs">-</span>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para subir factura */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Factura de Comisión Externa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="factura">Archivo de Factura (PDF, XML)</Label>
              <Input
                id="factura"
                type="file"
                accept=".pdf,.xml"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFacturaFile(e.target.files[0]);
                  }
                }}
              />
              {facturaFile && (
                <p className="text-sm text-muted-foreground">
                  Archivo seleccionado: {facturaFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedComision && facturaFile) {
                  subirFacturaMutation.mutate({
                    email: selectedComision.email,
                    idCuenta: selectedComision.idCuenta,
                    file: facturaFile
                  });
                }
              }}
              disabled={!facturaFile || subirFacturaMutation.isPending}
            >
              {subirFacturaMutation.isPending ? "Subiendo..." : "Subir Factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para pagar */}
      <Dialog open={pagoDialogOpen} onOpenChange={setPagoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar Comisión Externa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evidencia">Evidencia de Pago (opcional)</Label>
              <Input
                id="evidencia"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setEvidenciaFile(e.target.files[0]);
                  }
                }}
              />
              {evidenciaFile && (
                <p className="text-sm text-muted-foreground">
                  Archivo seleccionado: {evidenciaFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedComision) {
                  pagarMutation.mutate({
                    email: selectedComision.email,
                    idCuenta: selectedComision.idCuenta,
                    file: evidenciaFile || undefined
                  });
                }
              }}
              disabled={pagarMutation.isPending}
            >
              {pagarMutation.isPending ? "Procesando..." : "Marcar como Pagada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
