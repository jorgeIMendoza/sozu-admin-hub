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

// Dominios internos del grupo empresarial (usuarios con estos dominios NO son externos)
const DOMINIOS_INTERNOS_GRUPO = [
  'sozu.com',
  'investimento.mx',
  'tallwood.mx',
  'daiku.mx'
];

// Helper para verificar si un email pertenece al grupo interno
function esEmailDelGrupoInterno(email: string): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return DOMINIOS_INTERNOS_GRUPO.some(d => domain === d);
}

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

// Helper para obtener todas las cuentas de cobranza con comisionistas externos
// Ahora incluye tanto pagadas como no pagadas
async function fetchAllCuentasConComisionistas() {
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
        id_oferta,
        es_pagada_comision_venta
      `)
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
  const { registrarAprobacion, registrarPago } = useActivityLogger();
  const { canApprove, canUpdate, isSuperAdmin } = usePagePermissions('/admin/comisiones-externas');
  
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedCuentas, setExpandedCuentas] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("por-pagar");
  const [selectedComision, setSelectedComision] = useState<{ email: string; idCuenta: number } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [currentPagePorPagar, setCurrentPagePorPagar] = useState(1);
  const [currentPagePagadas, setCurrentPagePagadas] = useState(1);
  const itemsPerPage = 50;

  const fechaLimite = useMemo(() => getFechaLimiteEnganche(), []);

  const toggleCuenta = (cuentaId: number) => {
    const newExpanded = new Set(expandedCuentas);
    if (newExpanded.has(cuentaId)) {
      newExpanded.delete(cuentaId);
    } else {
      newExpanded.add(cuentaId);
    }
    setExpandedCuentas(newExpanded);
  };

  // Query principal - mismo patrón que AprobacionComisiones
  const { data: cuentasConComisionistas, isLoading } = useQuery({
    queryKey: ["comisiones-externas"],
    queryFn: async () => {
      // Paso 1: Obtener todas las cuentas (pagadas y no pagadas)
      const cuentas = await fetchAllCuentasConComisionistas();
      if (!cuentas || cuentas.length === 0) return [];

      // Paso 2: Obtener ofertas relacionadas con propiedades y productos (en batches)
      const ofertaIds = cuentas.map(c => c.id_oferta).filter(id => id !== null);
      let ofertas: any[] = [];
      
      if (ofertaIds.length > 0) {
        const batchSize = 200;
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
                id_estatus_disponibilidad,
                estatus_disponibilidad!fk_propiedades_estatus_disp(id, nombre),
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
      let allComisionistas: any[] = [];
      const comBatchSize = 500;
      
      for (let i = 0; i < cuentaIds.length; i += comBatchSize) {
        const batchIds = cuentaIds.slice(i, i + comBatchSize);
        const { data: comisionistas, error: comisionistasError } = await supabase
          .from("comisionistas")
          .select("*")
          .in("id_cuenta_cobranza", batchIds)
          .eq("activo", true);

        if (comisionistasError) throw comisionistasError;
        if (comisionistas) allComisionistas = [...allComisionistas, ...comisionistas];
      }

      // Paso 5: Obtener nombres de usuarios y personas para los comisionistas
      const comisionistaEmails = [...new Set(allComisionistas?.map(c => c.email_usuario) || [])] as string[];
      
      // Fetch from usuarios con rol_id para identificar agentes inmobiliarios
      const { data: usuariosData } = comisionistaEmails.length > 0 
        ? await supabase.from("usuarios").select("email, nombre, rol_id").in("email", comisionistaEmails)
        : { data: [] };
      
      // Identificar emails de agentes inmobiliarios externos (rol_id = 3 Y NO son del grupo interno)
      const emailsAgentesInmobiliarios = new Set(
        usuariosData?.filter(u => 
          u.rol_id === AGENTE_INMOBILIARIO_ROL_ID && !esEmailDelGrupoInterno(u.email)
        ).map(u => u.email) || []
      );
      
      const usuariosMap = new Map<string, { nombre: string; esInmobiliaria: boolean; esAgenteInmobiliario: boolean }>();
      usuariosData?.forEach(u => {
        const esAgenteExterno = u.rol_id === AGENTE_INMOBILIARIO_ROL_ID && !esEmailDelGrupoInterno(u.email);
        usuariosMap.set(u.email, { 
          nombre: u.nombre, 
          esInmobiliaria: false,
          esAgenteInmobiliario: esAgenteExterno
        });
      });
      
      // IMPORTANTE: Buscar inmobiliarias en personas para TODOS los emails de comisionistas
      // Las inmobiliarias pueden tener registro en usuarios Y en personas
      const emailsInmobiliarias = new Set<string>();
      
      if (comisionistaEmails.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', comisionistaEmails)
          .eq('tipo_persona', 'pm')
          .eq('activo', true);
        
        personasData?.forEach(p => {
          if (p.email) {
            emailsInmobiliarias.add(p.email);
            // Actualizar el map con información de inmobiliaria
            const existingData = usuariosMap.get(p.email);
            usuariosMap.set(p.email, { 
              nombre: existingData?.nombre || p.nombre_legal, 
              esInmobiliaria: true,
              esAgenteInmobiliario: existingData?.esAgenteInmobiliario || false
            });
          }
        });
      }
      
      // Buscar nombres para emails que no están en usuarios ni en personas
      const emailsNotInMap = comisionistaEmails.filter(email => !usuariosMap.has(email));
      
      if (emailsNotInMap.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInMap)
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

      // Paso 6: Obtener acuerdos de pago con enganche
      let acuerdosPago: any[] = [];
      for (let i = 0; i < cuentaIds.length; i += comBatchSize) {
        const batchIds = cuentaIds.slice(i, i + comBatchSize);
        const { data: acuerdos } = await supabase
          .from("acuerdos_pago")
          .select(`
            id_cuenta_cobranza,
            pago_completado,
            conceptos_pago!fk_acpago_concepto(nombre),
            aplicaciones_pago(
              activo,
              pagos!fk_aplicaciones_pago_pago(fecha_pago)
            )
          `)
          .in("id_cuenta_cobranza", batchIds)
          .eq("activo", true);
        
        if (acuerdos) acuerdosPago = [...acuerdosPago, ...acuerdos];
      }

      // Paso 7: Obtener facturas de comisión externa
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
          if (f.numero && f.url && f.id_cuenta_cobranza) {
            const key = `${f.numero}_${f.id_cuenta_cobranza}`;
            facturasMap.set(key, f.url);
          }
        });
      }

      // Paso 8: Combinar datos - filtrar solo cuentas con al menos un comisionista externo
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

        // Obtener fecha de pago del enganche
        const engancheAcuerdo = acuerdosPago.find((ap: any) => 
          ap.id_cuenta_cobranza === cuenta.id &&
          ap.pago_completado && 
          ap.conceptos_pago?.nombre?.toLowerCase() === 'enganche'
        );
        const aplicacionActiva = engancheAcuerdo?.aplicaciones_pago?.find((app: any) => app.activo);
        const fechaPagoEnganche = aplicacionActiva?.pagos?.fecha_pago || null;

        // Procesar comisionistas y marcar externos/internos
        const comisionistasFiltered = (allComisionistas?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [])
          .map(c => {
            const userData = usuariosMap.get(c.email_usuario);
            const esExterno = emailsInmobiliarias.has(c.email_usuario) || emailsAgentesInmobiliarios.has(c.email_usuario);
            const facturaKey = `${c.email_usuario}_${cuenta.id}`;
            const urlFactura = facturasMap.get(facturaKey) || null;
            
            return {
              ...c,
              nombre: userData?.nombre || c.email_usuario,
              esInmobiliaria: userData?.esInmobiliaria || false,
              esAgenteInmobiliario: userData?.esAgenteInmobiliario || false,
              esExterno,
              urlFactura,
              montoComision: (cuenta.precio_final * c.porcentaje_comision) / 100
            };
          });

        // Verificar si tiene al menos un comisionista externo
        const tieneComisionistaExterno = comisionistasFiltered.some(c => c.esExterno);

        const estatusDisponibilidad = propiedad?.estatus_disponibilidad?.nombre || null;
        const idEstatusDisponibilidad = propiedad?.id_estatus_disponibilidad || null;

        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: modelo?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
          tipo,
          fechaPagoEnganche,
          estatus_disponibilidad: estatusDisponibilidad,
          id_estatus_disponibilidad: idEstatusDisponibilidad,
          comisionistas: comisionistasFiltered,
          tieneComisionistaExterno
        };
      }).filter(cuenta => cuenta.tieneComisionistaExterno); // Solo mostrar cuentas con externos
    }
  });

  // Mutación para aprobar comisionista
  const aprobarMutation = useMutation({
    mutationFn: async ({ email, idCuenta, montoComision, nombreComisionista, proyectoNombre, numeroDepartamento }: { email: string; idCuenta: number; montoComision?: number; nombreComisionista?: string; proyectoNombre?: string; numeroDepartamento?: string }) => {
      const { error } = await supabase
        .from("comisionistas")
        .update({ aprobada: true })
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true);
      
      if (error) throw error;
      return { email, idCuenta, montoComision, nombreComisionista, proyectoNombre, numeroDepartamento };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["comisiones-externas"] });
      
      await registrarAprobacion('comisionistas', {
        email_comisionista: data.email,
        id_cuenta_cobranza: data.idCuenta,
        tipo: 'agente_externo'
      }, 'aprobar_comision_externa');

      const montoFormateado = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(data.montoComision || 0);
      const deptoLabel = data.proyectoNombre && data.numeroDepartamento
        ? `${data.proyectoNombre} ${data.numeroDepartamento}`
        : `Cuenta ${formatCuentaCobranzaId(data.idCuenta)}`;

      // Enviar correo de notificación al comisionista externo
      try {
        const { data: adminsProyecto } = await supabase
          .from('usuarios')
          .select('email')
          .eq('rol_id', 2)
          .eq('activo', true);
        
        const ccEmails = adminsProyecto?.map(a => a.email).join(',') || '';

        await supabase.functions.invoke('enviar-notificacion', {
          body: {
            tipo: 'email',
            from: 'Notificaciones Sozu <notificaciones@sozu.com>',
            email: data.email,
            cc: ccEmails,
            asunto: 'Comisión de venta aprobada',
            mensaje: {
              nombre: data.nombreComisionista || data.email,
              asunto: 'Comisión de venta aprobada',
              texto: `La comisión de venta para el departamento ${deptoLabel} ha sido aprobada, el monto es ${montoFormateado} + IVA, favor de generar y adjuntar factura en plataforma.`,
            },
            templateId: 36978552,
          },
        });
        console.log(`[ComisionesExternas] Notificación de aprobación enviada a ${data.email}`);
      } catch (notifError) {
        console.error('[ComisionesExternas] Error enviando notificación:', notifError);
      }
      
      toast({
        title: "Comisión aprobada",
        description: `Notificación enviada a ${data.email} por ${montoFormateado} + IVA.`
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

      const { error: docError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: idCuenta,
          id_tipo_documento: tipoDocFactura,
          url: urlData.publicUrl,
          numero: email,
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
        description: "La factura ha sido cargada exitosamente."
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
    onSuccess: async (data) => {
      // Log the external commission payment
      await registrarPago({
        tipo: 'comision_externa',
        email_comisionista: data.email,
        id_cuenta_cobranza: data.idCuenta
      });

      queryClient.invalidateQueries({ queryKey: ["comisiones-externas"] });
      
      toast({
        title: "Pago registrado",
        description: "El pago de la comisión ha sido registrado exitosamente."
      });
      setPagoDialogOpen(false);
      setEvidenciaFile(null);
      setSelectedComision(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al registrar el pago",
        variant: "destructive"
      });
      console.error("Error al pagar:", error);
    }
  });

  const formatMonto = (monto: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(monto);
  };

  // Filtrar cuentas
  const cuentasFiltradas = cuentasConComisionistas?.filter((cuenta: any) => {
    if (filtroGeneral) {
      const searchTerm = filtroGeneral.toLowerCase();
      const matchId = formatCuentaCobranzaId(cuenta.id, cuenta.tipo).toLowerCase().includes(searchTerm);
      const matchProyecto = cuenta.proyecto_nombre?.toLowerCase().includes(searchTerm);
      const matchNumero = (cuenta.numero_departamento || cuenta.producto_nombre || "").toLowerCase().includes(searchTerm);
      const matchModelo = cuenta.modelo_nombre?.toLowerCase().includes(searchTerm);
      const matchComisionista = cuenta.comisionistas.some((c: any) => 
        c.nombre?.toLowerCase().includes(searchTerm) || c.email_usuario?.toLowerCase().includes(searchTerm)
      );
      
      if (!matchId && !matchProyecto && !matchNumero && !matchModelo && !matchComisionista) {
        return false;
      }
    }
    return true;
  }) || [];

  // Separar en "por pagar" y "pagadas" basándose en comisionistas externos
  const cuentasPorPagar = cuentasFiltradas.filter((cuenta: any) => 
    cuenta.comisionistas.some((c: any) => c.esExterno && !c.pagada)
  );

  const cuentasPagadas = cuentasFiltradas.filter((cuenta: any) => 
    cuenta.comisionistas.filter((c: any) => c.esExterno).every((c: any) => c.pagada)
  );

  // Paginación
  const totalPagesPorPagar = Math.ceil(cuentasPorPagar.length / itemsPerPage);
  const totalPagesPagadas = Math.ceil(cuentasPagadas.length / itemsPerPage);

  const paginatedPorPagar = useMemo(() => {
    const startIndex = (currentPagePorPagar - 1) * itemsPerPage;
    return cuentasPorPagar.slice(startIndex, startIndex + itemsPerPage);
  }, [cuentasPorPagar, currentPagePorPagar, itemsPerPage]);

  const paginatedPagadas = useMemo(() => {
    const startIndex = (currentPagePagadas - 1) * itemsPerPage;
    return cuentasPagadas.slice(startIndex, startIndex + itemsPerPage);
  }, [cuentasPagadas, currentPagePagadas, itemsPerPage]);

  // Reset pages when filter changes
  useMemo(() => {
    setCurrentPagePorPagar(1);
    setCurrentPagePagadas(1);
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

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones Externas</CardTitle>
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

  const renderCuentasTable = (cuentas: any[], isPorPagar: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"></TableHead>
          <TableHead>No. Cuenta</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Proyecto</TableHead>
          <TableHead>Edificio</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>No. Depto</TableHead>
          <TableHead>Estatus de propiedad</TableHead>
          <TableHead>Estatus de comisión</TableHead>
          <TableHead>Precio final</TableHead>
          <TableHead>Comisión Sozu</TableHead>
          <TableHead>Comisionistas Ext.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuentas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
              No hay comisiones externas {isPorPagar ? 'por pagar' : 'pagadas'}
            </TableCell>
          </TableRow>
        ) : (
          cuentas.map((cuenta: any) => {
            const isExpanded = expandedCuentas.has(cuenta.id);
            const comisionistasExternos = cuenta.comisionistas.filter((c: any) => c.esExterno);
            const comisionistasInternos = cuenta.comisionistas.filter((c: any) => !c.esExterno);
            
            return (
              <>
                <TableRow 
                  key={cuenta.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleCuenta(cuenta.id)}
                >
                  <TableCell>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{cuenta.tipo}</Badge>
                  </TableCell>
                  <TableCell>{cuenta.proyecto_nombre || 'N/A'}</TableCell>
                  <TableCell>{cuenta.edificio_nombre || 'N/A'}</TableCell>
                  <TableCell>{cuenta.modelo_nombre || 'N/A'}</TableCell>
                  <TableCell>{cuenta.producto_nombre || '-'}</TableCell>
                  <TableCell>{cuenta.numero_departamento || '-'}</TableCell>
                  <TableCell>
                    {cuenta.estatus_disponibilidad ? (
                      <Badge variant="outline" className={
                        cuenta.id_estatus_disponibilidad === 5 ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                        cuenta.id_estatus_disponibilidad === 9 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                        cuenta.id_estatus_disponibilidad === 4 ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                        ''
                      }>
                        {cuenta.estatus_disponibilidad}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Determinar estatus de comisión basado en comisionistas externos
                      const allPagadas = comisionistasExternos.length > 0 && comisionistasExternos.every((c: any) => c.pagada);
                      const anyConFactura = comisionistasExternos.some((c: any) => c.urlFactura && c.aprobada && !c.pagada);
                      const anyAprobadaSinFactura = comisionistasExternos.some((c: any) => c.aprobada && !c.urlFactura && !c.pagada);
                      const anySinAprobar = comisionistasExternos.some((c: any) => !c.aprobada);

                      if (allPagadas) {
                        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Pagada</Badge>;
                      } else if (anyConFactura) {
                        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendiente de pago</Badge>;
                      } else if (anyAprobadaSinFactura) {
                        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Aprobado/Sin factura</Badge>;
                      } else if (anySinAprobar) {
                        return <Badge variant="outline" className="bg-muted text-muted-foreground">Sin aprobar</Badge>;
                      }
                      return <Badge variant="outline">-</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>{formatMonto(cuenta.precio_final || 0)}</TableCell>
                  <TableCell>
                    {cuenta.es_pagada_comision_venta ? (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        Pagada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        Pendiente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {comisionistasExternos.length} externo(s)
                    </Badge>
                  </TableCell>
                </TableRow>
                
                {isExpanded && (
                  <TableRow key={`${cuenta.id}-expanded`}>
                    <TableCell colSpan={13} className="bg-muted/30 p-4">
                      <div className="space-y-4">
                        {/* Comisionistas Externos */}
                        <div>
                          <h4 className="font-semibold mb-2 text-sm">Comisionistas Externos</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>% Comisión</TableHead>
                                <TableHead>Monto</TableHead>
                                 <TableHead>Estatus de comisión</TableHead>
                                <TableHead>Factura</TableHead>
                                <TableHead>Acciones</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {comisionistasExternos.map((com: any, idx: number) => (
                                <TableRow key={`ext-${cuenta.id}-${idx}`}>
                                  <TableCell>{com.nombre}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{com.email_usuario}</TableCell>
                                  <TableCell>
                                    <Badge variant={com.esInmobiliaria ? "default" : "secondary"}>
                                      {com.esInmobiliaria ? "Inmobiliaria" : "Agente Inmob."}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{com.porcentaje_comision?.toFixed(4)}%</TableCell>
                                  <TableCell>
                                    {formatMonto(com.montoComision)}
                                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">+ IVA</Badge>
                                  </TableCell>
                                  <TableCell>
                                    {com.pagada ? (
                                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Pagada</Badge>
                                    ) : com.aprobada && com.urlFactura ? (
                                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendiente de pago</Badge>
                                    ) : com.aprobada && !com.urlFactura ? (
                                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Aprobado/Sin factura</Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-muted text-muted-foreground">Sin aprobar</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {com.urlFactura ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(com.urlFactura, '_blank');
                                        }}
                                      >
                                        <Eye className="h-4 w-4 mr-1" />
                                        Ver
                                      </Button>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">Sin factura</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      {/* Aprobar - solo habilitado si estatus es Vendido (id=5) */}
                                      {!com.aprobada && (canApprove || isSuperAdmin) && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                           onClick={(e) => {
                                            e.stopPropagation();
                                            aprobarMutation.mutate({ email: com.email_usuario, idCuenta: cuenta.id, montoComision: com.montoComision, nombreComisionista: com.nombre, proyectoNombre: cuenta.proyecto_nombre, numeroDepartamento: cuenta.numero_departamento });
                                          }}
                                          disabled={aprobarMutation.isPending || cuenta.id_estatus_disponibilidad !== 5}
                                          title={cuenta.id_estatus_disponibilidad !== 5 ? 'Solo se puede aprobar cuando la propiedad está en estatus Vendido' : ''}
                                        >
                                          <Check className="h-4 w-4 mr-1" />
                                          Aprobar
                                        </Button>
                                      )}
                                      
                                      {/* Subir factura */}
                                      {com.aprobada && !com.urlFactura && !com.pagada && (canUpdate || isSuperAdmin) && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedComision({ email: com.email_usuario, idCuenta: cuenta.id });
                                            setUploadDialogOpen(true);
                                          }}
                                        >
                                          <Upload className="h-4 w-4 mr-1" />
                                          Factura
                                        </Button>
                                      )}
                                      
                                      {/* Mostrar estatus cuando hay factura */}
                                      {com.aprobada && com.urlFactura && !com.pagada && (
                                        <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                          Pendiente de pago
                                        </Badge>
                                      )}
                                      
                                      {/* Ver evidencia de pago */}
                                      {com.pagada && com.url_evidencia_pago && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(com.url_evidencia_pago, '_blank');
                                          }}
                                        >
                                          <FileText className="h-4 w-4 mr-1" />
                                          Evidencia
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Comisionistas Internos (sin acciones) */}
                        {comisionistasInternos.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2 text-sm text-muted-foreground">
                              Comisionistas Internos (solo lectura)
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nombre</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>% Comisión</TableHead>
                                  <TableHead>Monto</TableHead>
                                  <TableHead>Estado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {comisionistasInternos.map((com: any, idx: number) => (
                                  <TableRow key={`int-${cuenta.id}-${idx}`} className="opacity-70">
                                    <TableCell>{com.nombre}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{com.email_usuario}</TableCell>
                                    <TableCell>{com.porcentaje_comision?.toFixed(4)}%</TableCell>
                                    <TableCell>{formatMonto(com.montoComision)}</TableCell>
                                    <TableCell>
                                      {com.pagada ? (
                                        <Badge className="bg-green-500">Pagada</Badge>
                                      ) : com.aprobada ? (
                                        <Badge className="bg-blue-500">Aprobada</Badge>
                                      ) : (
                                        <Badge variant="outline">Pendiente</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto py-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Comisiones Externas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtro */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cuenta, proyecto, comisionista..."
              value={filtroGeneral}
              onChange={(e) => setFiltroGeneral(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="por-pagar">
                Por Pagar ({cuentasPorPagar.length})
              </TabsTrigger>
              <TabsTrigger value="pagadas">
                Pagadas ({cuentasPagadas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="por-pagar" className="mt-4">
              {renderCuentasTable(paginatedPorPagar, true)}
              
              {totalPagesPorPagar > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPagePorPagar(Math.max(1, currentPagePorPagar - 1))}
                          className={currentPagePorPagar === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {renderPaginationItems(totalPagesPorPagar, currentPagePorPagar, setCurrentPagePorPagar)}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPagePorPagar(Math.min(totalPagesPorPagar, currentPagePorPagar + 1))}
                          className={currentPagePorPagar === totalPagesPorPagar ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pagadas" className="mt-4">
              {renderCuentasTable(paginatedPagadas, false)}
              
              {totalPagesPagadas > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPagePagadas(Math.max(1, currentPagePagadas - 1))}
                          className={currentPagePagadas === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {renderPaginationItems(totalPagesPagadas, currentPagePagadas, setCurrentPagePagadas)}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPagePagadas(Math.min(totalPagesPagadas, currentPagePagadas + 1))}
                          className={currentPagePagadas === totalPagesPagadas ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

      {/* Dialog para subir factura */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Factura de Comisión Externa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="factura">Archivo de Factura (PDF)</Label>
              <Input
                id="factura"
                type="file"
                accept=".pdf"
                onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
              />
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

      {/* Dialog para registrar pago */}
      <Dialog open={pagoDialogOpen} onOpenChange={setPagoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago de Comisión</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="evidencia">Evidencia de Pago (opcional)</Label>
              <Input
                id="evidencia"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setEvidenciaFile(e.target.files?.[0] || null)}
              />
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
              {pagarMutation.isPending ? "Procesando..." : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
