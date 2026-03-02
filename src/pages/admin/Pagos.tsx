import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, CreditCard, Eye, X, Edit, Plus, Download, Loader2, Filter, TrendingUp, TrendingDown, Equal, AlertCircle, DollarSign, CheckCircle, FileText, Upload, Banknote, ChevronDown, ChevronUp, Wallet, Scale, Building2, FileSpreadsheet as SatIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { CompradoresDetailDialog } from "@/components/admin/CompradoresDetailDialog";
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { CancelCuentaDialog } from "@/components/admin/CancelCuentaDialog";
import { CashPaymentDetailDialog } from "@/components/admin/CashPaymentDetailDialog";
import { ProjectCollectionSummaryDialog } from "@/components/admin/ProjectCollectionSummaryDialog";
import { PropertyProgressBadge } from "@/components/admin/PropertyProgressBadge";
import { SATNotificationDialog } from "@/components/admin/SATNotificationDialog";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { EstadoCuentaEdgeFunctionService } from "@/services/estadoCuentaEdgeFunctionService";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { FileSpreadsheet } from "lucide-react";
import { useCuentasCobranzaPaginadas, CuentaCobranza } from "@/hooks/useCuentasCobranzaPaginadas";

// Re-export interfaces from the hook for internal use
interface CashPayment {
  fecha_pago: string;
  monto: number;
}
export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
  const [selectedTipos, setSelectedTipos] = useState<Array<'Propiedad' | 'Producto' | 'Servicio'>>(['Propiedad', 'Producto', 'Servicio']);

  // Filter states
  const [idCuentaFilter, setIdCuentaFilter] = useState("");
  const [productoFilter, setProductoFilter] = useState("");
  const [compradoresFilter, setCompradoresFilter] = useState("");
  const [clabeFilter, setClabeFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [noPropiedadFilter, setNoPropiedadFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [estatusFilter, setEstatusFilter] = useState<number[]>([]);
  const [cancelDialog, setCancelDialog] = useState<{
    isOpen: boolean;
    cuenta: CuentaCobranza | null;
  }>({
    isOpen: false,
    cuenta: null
  });
  const [editDialog, setEditDialog] = useState<{
    isOpen: boolean;
    cuenta: CuentaCobranza | null;
  }>({
    isOpen: false,
    cuenta: null
  });
  const [loadingDownload, setLoadingDownload] = useState<number | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    isOpen: boolean;
    cuenta: CuentaCobranza | null;
  }>({
    isOpen: false,
    cuenta: null
  });
  const [cashDialog, setCashDialog] = useState<{
    isOpen: boolean;
    cuenta: CuentaCobranza | null;
  }>({
    isOpen: false,
    cuenta: null
  });
  const [uploadingCep, setUploadingCep] = useState(false);
  const [isGeneratingEstadoCuenta, setIsGeneratingEstadoCuenta] = useState<number | null>(null);
  const [isExportingData, setIsExportingData] = useState(false);
  const [satDialog, setSatDialog] = useState<{
    isOpen: boolean;
    cuenta: CuentaCobranza | null;
  }>({
    isOpen: false,
    cuenta: null
  });
  
  // Estado para controlar si las estadísticas están expandidas (con persistencia en localStorage)
  const [statsExpanded, setStatsExpanded] = useState(() => {
    const saved = localStorage.getItem('pagos-stats-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // State for project summary dialog
  const [projectSummaryDialog, setProjectSummaryDialog] = useState<{
    isOpen: boolean;
    projectName: string;
    projectId: number;
    cuentaIds: number[];
    totalColocado: number;
    totalCobrado: number;
    valorProyecto: number;
  }>({
    isOpen: false,
    projectName: "",
    projectId: 0,
    cuentaIds: [],
    totalColocado: 0,
    totalCobrado: 0,
    valorProyecto: 0
  });

  // Paginación
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageCancelled, setCurrentPageCancelled] = useState(1);
  const itemsPerPage = 50;
  const {
    toast
  } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // Project access control
  const { 
    accessibleProjectIds, 
    hasUnrestrictedAccess, 
    isLoading: isLoadingAccess,
    isRepresentanteEmpresaDuena,
    isDesarrollador,
    ownershipEntityIds 
  } = useProjectAccess();

  // Page permissions
  const { canCreate, canUpdate, canDelete, canExport, isSuperAdmin } = usePagePermissions('/admin/cuentas-cobranza');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { data: estatusDisponibilidad } = useQuery({
    queryKey: ["estatus_disponibilidad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    }
  });

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPageActive(1);
  }, [searchTerm, idCuentaFilter, productoFilter, compradoresFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter, selectedTipos, estatusFilter]);
  useEffect(() => {
    setCurrentPageCancelled(1);
  }, [searchTerm, idCuentaFilter, productoFilter, compradoresFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter, selectedTipos, estatusFilter]);

  // Combined search term for the hook (combines searchTerm + individual filters)
  const combinedSearchTerm = searchTerm || undefined;

  // Use the new paginated hook for ACTIVE accounts
  const {
    data: activeCuentasData,
    isLoading: isLoadingActive
  } = useCuentasCobranzaPaginadas({
    page: currentPageActive,
    perPage: itemsPerPage,
    idCuenta: idCuentaFilter || undefined,
    proyecto: proyectoFilter || undefined,
    clabe: clabeFilter || undefined,
    noPropiedad: noPropiedadFilter || undefined,
    modelo: modeloFilter || undefined,
    compradores: compradoresFilter || undefined,
    producto: productoFilter || undefined,
    estatusIds: estatusFilter.length > 0 ? estatusFilter : undefined,
    tipos: selectedTipos.length < 3 ? selectedTipos : undefined,
    activo: true,
    enabled: !isLoadingAccess,
    search: searchTerm || undefined
  });

  // Use the new paginated hook for CANCELLED accounts
  const {
    data: cancelledCuentasData,
    isLoading: isLoadingCancelled
  } = useCuentasCobranzaPaginadas({
    page: currentPageCancelled,
    perPage: itemsPerPage,
    idCuenta: idCuentaFilter || undefined,
    proyecto: proyectoFilter || undefined,
    clabe: clabeFilter || undefined,
    noPropiedad: noPropiedadFilter || undefined,
    modelo: modeloFilter || undefined,
    compradores: compradoresFilter || undefined,
    producto: productoFilter || undefined,
    estatusIds: estatusFilter.length > 0 ? estatusFilter : undefined,
    tipos: selectedTipos.length < 3 ? selectedTipos : undefined,
    activo: false,
    enabled: !isLoadingAccess,
    search: searchTerm || undefined
  });

  // Query for global statistics (fast aggregate)
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: [
      "cuentas_cobranza_stats",
      hasUnrestrictedAccess,
      accessibleProjectIds,
      ownershipEntityIds,
      isRepresentanteEmpresaDuena
    ],
    enabled: !isLoadingAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cuentas_cobranza_stats' as any, {
        p_proyecto_ids: hasUnrestrictedAccess ? null : (accessibleProjectIds.length > 0 ? accessibleProjectIds : null),
        p_dueno_entity_ids: isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0 ? ownershipEntityIds : null,
      });

      if (error) {
        console.error('Error fetching stats:', error);
        return null;
      }

      const result = (data as any)?.[0] || null;
      return result;
    }
  });

  const isLoading = isLoadingActive || isLoadingCancelled;

  // Extract data from hooks
  const paginatedCuentasActivas = activeCuentasData?.cuentas || [];
  const totalActivasCount = activeCuentasData?.totalCount || 0;
  const totalActivasPages = activeCuentasData?.totalPages || 1;

  const paginatedCuentasCanceladas = cancelledCuentasData?.cuentas || [];
  const totalCancelladasCount = cancelledCuentasData?.totalCount || 0;
  const totalCancelladasPages = cancelledCuentasData?.totalPages || 1;

  // Debug log for project access
  console.log('🔍 Project Access Debug:', { 
    isLoadingAccess, 
    hasUnrestrictedAccess, 
    accessibleProjectIds: accessibleProjectIds?.length,
    isRepresentanteEmpresaDuena,
    ownershipEntityIds: ownershipEntityIds?.length 
  });

  // Query to calculate valor total del proyecto (precio_final of accounts + precio_lista of available properties)
  const { data: valorProyectosData, isLoading: isLoadingValorProyectos } = useQuery({
    queryKey: ["valor-proyectos", accessibleProjectIds, hasUnrestrictedAccess, ownershipEntityIds, isRepresentanteEmpresaDuena],
    queryFn: async () => {
      console.log('🏗️ Running valor proyectos query...');
      // Build WHERE clause based on access
      let projectFilter = '';
      if (!hasUnrestrictedAccess) {
        if (accessibleProjectIds.length === 0) {
          return {};
        }
        projectFilter = `AND p.id IN (${accessibleProjectIds.join(',')})`;
      }

      let ownerFilter = '';
      if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
        ownerFilter = `AND prop.id_entidad_relacionada_dueno IN (${ownershipEntityIds.join(',')})`;
      }

      // Query without CTEs - use subquery in FROM clause
      const query = `
        SELECT 
          pv.id_proyecto,
          pv.proyecto_nombre,
          COUNT(DISTINCT pv.prop_id) as total_propiedades,
          SUM(pv.valor_propiedad) as valor_total_proyecto
        FROM (
          SELECT DISTINCT ON (prop.id)
            p.id as id_proyecto,
            p.nombre as proyecto_nombre,
            prop.id as prop_id,
            CASE 
              WHEN cc.id IS NOT NULL AND cc.activo = true THEN cc.precio_final 
              ELSE COALESCE(prop.precio_lista, 0) 
            END as valor_propiedad
          FROM proyectos p
          JOIN entidades_relacionadas er ON er.id_proyecto = p.id AND er.activo = true AND er.id_tipo_entidad IN (4, 15)
          JOIN propiedades prop ON prop.id_entidad_relacionada_dueno = er.id AND prop.activo = true
          LEFT JOIN ofertas o ON o.id_propiedad = prop.id AND o.activo = true AND o.id_producto IS NULL
          LEFT JOIN cuentas_cobranza cc ON cc.id_oferta = o.id AND cc.id_cuenta_cobranza_padre IS NULL AND cc.activo = true
          WHERE p.activo = true ${projectFilter} ${ownerFilter}
          ORDER BY prop.id, cc.id DESC NULLS LAST
        ) pv
        GROUP BY pv.id_proyecto, pv.proyecto_nombre
        ORDER BY valor_total_proyecto DESC
      `;

      console.log('Valor proyectos query:', query);

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: query,
        max_rows: 1000
      });

      if (error) {
        console.error('Error fetching valor proyectos:', error);
        return {};
      }

      console.log('Valor proyectos data:', data);

      const result = (data as Array<{
        id_proyecto: number;
        proyecto_nombre: string;
        total_propiedades: number;
        valor_total_proyecto: number;
      }>) || [];

      return result.reduce((acc, row) => {
        acc[row.id_proyecto] = {
          nombre: row.proyecto_nombre,
          valorTotal: Number(row.valor_total_proyecto) || 0,
          totalPropiedades: Number(row.total_propiedades) || 0
        };
        return acc;
      }, {} as Record<number, { nombre: string; valorTotal: number; totalPropiedades: number }>);
    },
    enabled: !isLoadingAccess
  });

  // Derive current data based on active tab
  const currentCuentas = activeTab === "activas" ? paginatedCuentasActivas : paginatedCuentasCanceladas;
  const filteredCuentas = currentCuentas; // Already filtered by the server
  const paginatedCuentas = currentCuentas; // Already paginated by the server

  // Pagination logic - now uses server-side totals
  const currentPage = activeTab === "activas" ? currentPageActive : currentPageCancelled;
  const setCurrentPage = activeTab === "activas" ? setCurrentPageActive : setCurrentPageCancelled;
  const totalFilteredCount = activeTab === "activas" ? totalActivasCount : totalCancelladasCount;
  const totalPages = activeTab === "activas" ? totalActivasPages : totalCancelladasPages;

  const handleTipoToggle = (tipo: 'Propiedad' | 'Producto' | 'Servicio') => {
    setSelectedTipos(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  };
  
  // Función para alternar expansión de estadísticas
  const toggleStatsExpanded = () => {
    const newValue = !statsExpanded;
    setStatsExpanded(newValue);
    localStorage.setItem('pagos-stats-expanded', JSON.stringify(newValue));
  };

  // Statistics from the server-side aggregate query
  const cuentasPropiedadesActivasCount = statsData?.total_propiedades || 0;
  const cuentasProductosActivasCount = statsData?.total_productos || 0;
  const totalCuentasActivas = statsData?.total_cuentas_activas || 0;
  
  // Total Colocado (from stats RPC)
  const totalMontoPropiedades = Number(statsData?.total_colocado_propiedades) || 0;
  const totalMontoProductos = Number(statsData?.total_colocado_productos) || 0;
  const totalMonto = totalMontoPropiedades + totalMontoProductos;
  
  // Total Cobrado (from stats RPC)
  const totalCobradoPropiedades = Number(statsData?.total_cobrado_propiedades) || 0;
  const totalCobradoProductos = Number(statsData?.total_cobrado_productos) || 0;
  const totalCobrado = totalCobradoPropiedades + totalCobradoProductos;
  
  // Parse project stats from JSONB
  const proyectosStats = useMemo(() => {
    if (!statsData?.stats_por_proyecto) return [];
    const stats = statsData.stats_por_proyecto as Array<{
      id_proyecto: number;
      proyecto: string;
      count: number;
      colocado: number;
      cobrado: number;
    }>;
    return stats.slice(0, 3).map(proy => ({
      proyecto: proy.proyecto,
      count: proy.count,
      total: Number(proy.colocado) || 0,
      promedio: proy.count > 0 ? (Number(proy.colocado) / proy.count) : 0,
      cobrado: Number(proy.cobrado) || 0,
      restante: (Number(proy.colocado) || 0) - (Number(proy.cobrado) || 0),
      cuentaIds: [] as number[], // Not available from aggregate, but not critical
      id_proyecto: proy.id_proyecto,
      valorProyecto: valorProyectosData?.[proy.id_proyecto]?.valorTotal || Number(proy.colocado) || 0
    }));
  }, [statsData, valorProyectosData]);

  const top3Proyectos = proyectosStats;
  
  // Calculate valor total de todos los proyectos
  const valorTotalProyectos = useMemo(() => {
    if (!valorProyectosData) return 0;
    // Get project IDs that have active accounts from stats
    const proyectosConCuentasIds = new Set(
      proyectosStats.map(data => data.id_proyecto).filter(id => id > 0)
    );
    // Only sum values of projects with active accounts
    return Object.entries(valorProyectosData)
      .filter(([idStr]) => proyectosConCuentasIds.has(parseInt(idStr)))
      .reduce((sum, [, proj]) => sum + proj.valorTotal, 0);
  }, [valorProyectosData, proyectosStats]);

  // Promedio de productos
  const promedioProductos = cuentasProductosActivasCount > 0 ? totalMontoProductos / cuentasProductosActivasCount : 0;

  const formatCurrency = (amount: number) => {
    // Aggressively eliminate -0
    let value = amount;
    // Convert to fixed then back to number to eliminate -0
    value = +value.toFixed(2);
    // If very close to zero, force to 0
    if (Math.abs(value) < 0.01) {
      value = 0;
    }
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };
  const formatCurrencyCompact = (amount: number) => {
    // Aggressively eliminate -0
    let value = amount;
    value = +value.toFixed(2);
    if (Math.abs(value) < 0.01) {
      value = 0;
    }
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000) {
      // Format as millions with 2 decimal places and comma separator
      const millions = value / 1_000_000;
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(millions);
      return `$${formatted} M`;
    } else if (absValue >= 1_000) {
      // Format as thousands with 2 decimal places and comma separator
      const thousands = value / 1_000;
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(thousands);
      return `$${formatted} K`;
    } else {
      // For amounts less than 1000, use regular format
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
  };

  // Handler to open cancel dialog
  const handleCancelCuenta = (cuenta: CuentaCobranza) => {
    setCancelDialog({
      isOpen: true,
      cuenta
    });
  };
  const handleDownloadEstadoCuenta = async (idCuenta: number) => {
    try {
      setIsGeneratingEstadoCuenta(idCuenta);
      const service = new EstadoCuentaEdgeFunctionService();
      await service.generateEstadoCuenta({
        id_cuenta: idCuenta
      });
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
      setIsGeneratingEstadoCuenta(null);
    }
  };
  const handleEditCuenta = (cuenta: CuentaCobranza) => {
    setEditDialog({
      isOpen: true,
      cuenta
    });
  };

  // Navigation functions
  const handlePropertyClick = (clabe: string) => {
    navigate(`/admin/propiedades?search=${encodeURIComponent(clabe)}`);
  };
  const handleCompradorClick = (rfc: string) => {
    navigate(`/admin/compradores?search=${encodeURIComponent(rfc)}`);
  };
  const handleVendedorClick = (nombreVendedor: string) => {
    navigate(`/admin/entidades-legales?search=${encodeURIComponent(nombreVendedor)}`);
  };
  const handleAddManualPayment = (cuenta: CuentaCobranza) => {
    setPaymentDialog({
      isOpen: true,
      cuenta
    });
  };
  const handleDownloadOffer = async (cuenta: CuentaCobranza) => {
    try {
      setLoadingDownload(cuenta.id);

      // Import storage service
      const { ofertaPdfStorageService } = await import('@/services/ofertaPdfStorageService');

      // Get the offer data for this account
      const {
        data: offerData,
        error: offerError
      } = await supabase.from('cuentas_cobranza').select(`
          id_oferta,
          ofertas!fk_cuentas_cobranza_oferta(
            id,
            id_propiedad,
            id_producto,
            url
          )
        `).eq('id', cuenta.id).single();
      
      if (offerError) {
        console.error('Error fetching offer data:', offerError);
        toast({
          title: "Error",
          description: "Error al obtener los datos de la oferta",
          variant: "destructive"
        });
        return;
      }
      
      if (!offerData?.id_oferta || !offerData.ofertas) {
        toast({
          title: "Error",
          description: "No se encontró la oferta asociada a esta cuenta",
          variant: "destructive"
        });
        return;
      }

      // Check if URL already exists
      const existingUrl = offerData.ofertas.url;
      
      if (existingUrl) {
        // Validar que los datos críticos no hayan cambiado
        const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offerData.id_oferta);
        
        if (validation.wasInvalidated) {
          // URL fue invalidada, regenerar PDF
          toast({
            title: "Regenerando PDF",
            description: "Los datos de la oferta han sido actualizados, regenerando..."
          });
        } else {
          // URL sigue siendo válida, descargar directamente
          toast({
            title: "Descargando PDF",
            description: "Descargando el PDF de la oferta..."
          });
          
          const filename = existingUrl.split('/').pop() || `oferta-${offerData.id_oferta}.pdf`;
          await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
          
          toast({
            title: "PDF descargado",
            description: "La oferta se ha descargado exitosamente"
          });
          return;
        }
      }
      
      // No hay URL o fue invalidada, generar nuevo PDF
      {
        // No URL, generate new PDF
        toast({
          title: "Generando PDF",
          description: "Preparando la descarga del PDF de la oferta..."
        });

        const {
          generateOfferPDF
        } = await import('@/services/htmlToPdfService');

        // Check if it's a product/service offer or property offer
        if (offerData.ofertas.id_producto && !offerData.ofertas.id_propiedad) {
          // It's a product/service offer
          await generateOfferPDF({
            propertyId: offerData.ofertas.id_propiedad || 0,
            offerId: offerData.id_oferta,
            propertyNumber: cuenta.producto_nombre || '',
            leadName: cuenta.compradores[0]?.nombre_legal || 'Sin comprador',
            leadEmail: '',
            leadPhone: '',
            creatorEmail: 'admin@system.com',
            isProductOffer: true,
            productId: offerData.ofertas.id_producto
          });
        } else if (offerData.ofertas.id_propiedad) {
          // It's a property offer
          await generateOfferPDF({
            propertyId: offerData.ofertas.id_propiedad,
            offerId: offerData.id_oferta,
            propertyNumber: cuenta.numero_propiedad,
            leadName: cuenta.compradores[0]?.nombre_legal || 'Sin comprador',
            leadEmail: '',
            leadPhone: '',
            creatorEmail: 'admin@system.com'
          });
        } else {
          toast({
            title: "Error",
            description: "La oferta no tiene propiedad ni producto asociado",
            variant: "destructive"
          });
          return;
        }
        
        toast({
          title: "PDF Generado",
          description: "La oferta se ha generado y descargado exitosamente"
        });
      }

      // Enviar por correo al prospecto (fire-and-forget)
      const { sendOfferEmailAfterDownload } = await import('@/services/ofertaEmailService');
      sendOfferEmailAfterDownload({
        offerId: offerData.id_oferta,
        propertyNumber: cuenta.numero_propiedad,
      });
    } catch (error) {
      console.error('Error downloading offer:', error);
      toast({
        title: "Error",
        description: `No se pudo descargar la oferta: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        variant: "destructive"
      });
    } finally {
      setLoadingDownload(null);
    }
  };
  const handleCepUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos .zip",
        variant: "destructive"
      });
      return;
    }
    setUploadingCep(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/cargarArchivoCep`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        throw new Error('Error al cargar el archivo');
      }
      toast({
        title: "Éxito",
        description: "CEPs cargados correctamente"
      });

      // Reset the input
      event.target.value = '';

      // Refresh the data
      queryClient.invalidateQueries({
        queryKey: ["cuentas_cobranza"]
      });
    } catch (error) {
      console.error("Error uploading CEPs:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los CEPs",
        variant: "destructive"
      });
    } finally {
      setUploadingCep(false);
    }
  };

  // Helper function to generate pagination items with ellipsis
  const getPaginationItems = (currentPage: number, totalPages: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7; // Maximum number of page buttons to show

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      return Array.from({
        length: totalPages
      }, (_, i) => i + 1);
    }

    // Always show first page
    items.push(1);

    // Calculate range around current page
    let rangeStart = Math.max(2, currentPage - 1);
    let rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    // Adjust range if we're near the start or end
    if (currentPage <= 3) {
      rangeEnd = Math.min(4, totalPages - 1);
    }
    if (currentPage >= totalPages - 2) {
      rangeStart = Math.max(totalPages - 3, 2);
    }

    // Add ellipsis after first page if needed
    if (rangeStart > 2) {
      items.push('ellipsis');
    }

    // Add range around current page
    for (let i = rangeStart; i <= rangeEnd; i++) {
      items.push(i);
    }

    // Add ellipsis before last page if needed
    if (rangeEnd < totalPages - 1) {
      items.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      items.push(totalPages);
    }
    return items;
  };
  const renderPagination = (currentPage: number, totalPages: number, onPageChange: (page: number) => void) => {
    if (totalPages <= 1) return null;
    return <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => onPageChange(Math.max(1, currentPage - 1))} className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
            {getPaginationItems(currentPage, totalPages).map((item, index) => item === 'ellipsis' ? <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem> : <PaginationItem key={item}>
                  <PaginationLink onClick={() => onPageChange(item as number)} isActive={currentPage === item} className="cursor-pointer">
                    {item}
                  </PaginationLink>
                </PaginationItem>)}
            <PaginationItem>
              <PaginationNext onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>;
  };
  return <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Cuentas de Cobranza</h1>
          <p className="text-muted-foreground">
            Listado de cuentas de cobranza registradas en el sistema
          </p>
        </div>
        {(canCreate || isSuperAdmin) && (
          <div>
            <input type="file" id="cep-upload" accept=".zip" className="hidden" onChange={handleCepUpload} disabled={uploadingCep} />
            <Button onClick={() => document.getElementById('cep-upload')?.click()} disabled={uploadingCep}>
              {uploadingCep ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Subiendo...
                </> : <>
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Cep's
                </>}
            </Button>
          </div>
        )}
      </div>

      {/* Sección de estadísticas contraíble */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Resumen de Cuentas</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleStatsExpanded}
              className="h-8 w-8 p-0"
            >
              {statsExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        
        {statsExpanded && (
          <CardContent className="space-y-6">
            {/* Cards de estadísticas generales */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cuentas Activas</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalCuentasActivas}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Propiedades: <span className="font-medium text-foreground">{cuentasPropiedadesActivasCount}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total de cuentas de propiedades activas</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Productos: <span className="font-medium text-foreground">{cuentasProductosActivasCount}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total de cuentas de productos y servicios activas</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
          
          {/* Merged Card: Resumen Financiero del Proyecto */}
          <Card className="col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resumen Financiero</CardTitle>
              <Scale className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {/* Valor del Proyecto */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Valor del Proyecto</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xl font-bold text-blue-600 cursor-help">
                          {formatCurrencyCompact(valorTotalProyectos)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(valorTotalProyectos)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Propiedades vendidas + disponibles
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                {/* Monto Total Colocado */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Monto Colocado</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xl font-bold cursor-help">
                          {formatCurrencyCompact(totalMonto)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalMonto)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <div>Prop: {formatCurrencyCompact(totalMontoPropiedades)}</div>
                    <div>Prod: {formatCurrencyCompact(totalMontoProductos)}</div>
                  </div>
                </div>
                
                {/* Monto Total Cobrado */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Monto Cobrado</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xl font-bold text-green-600 cursor-help">
                          {formatCurrencyCompact(totalCobrado)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalCobrado)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <div>Prop: <span className="text-green-600">{formatCurrencyCompact(totalCobradoPropiedades)}</span></div>
                    <div>Prod: <span className="text-green-600">{formatCurrencyCompact(totalCobradoProductos)}</span></div>
                  </div>
                </div>
                
                {/* Restante por colocar - solo propiedades ya que valorTotalProyectos solo incluye propiedades */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Restante por colocar</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`text-xl font-bold cursor-help ${Math.max(0, valorTotalProyectos - totalMontoPropiedades) === 0 ? 'text-green-600' : 'text-purple-600'}`}>
                          {formatCurrencyCompact(Math.max(0, valorTotalProyectos - totalMontoPropiedades))}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(Math.max(0, valorTotalProyectos - totalMontoPropiedades))}</p>
                        <p className="text-xs text-muted-foreground mt-1">Valor proyecto (propiedades) - Propiedades colocadas</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                {/* Restante por cobrar */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Restante por cobrar</div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xl font-bold text-orange-600 cursor-help">
                          {formatCurrencyCompact(totalMonto - totalCobrado)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalMonto - totalCobrado)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Colocado - Cobrado</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <div>Prop: <span className="text-orange-600">{formatCurrencyCompact(totalMontoPropiedades - totalCobradoPropiedades)}</span></div>
                    <div>Prod: <span className="text-orange-600">{formatCurrencyCompact(totalMontoProductos - totalCobradoProductos)}</span></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Cuenta</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">
                        <div className="text-xs text-muted-foreground">Propiedades</div>
                        <div className="text-xl font-bold">
                          {formatCurrencyCompact(cuentasPropiedadesActivasCount > 0 ? totalMontoPropiedades / cuentasPropiedadesActivasCount : 0)}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(cuentasPropiedadesActivasCount > 0 ? totalMontoPropiedades / cuentasPropiedadesActivasCount : 0)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">
                        <div className="text-xs text-muted-foreground">Productos</div>
                        <div className="text-xl font-bold">
                          {formatCurrencyCompact(promedioProductos)}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(promedioProductos)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </div>

            {/* Grid con dos secciones: Top 3 Propiedades y Estadísticas de Productos */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Lado izquierdo: Top 3 Proyectos de Propiedades */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Top 3 Proyectos con Más Cuentas (Propiedades)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
            <CardContent>
              {top3Proyectos.length > 0 ? (
                <div className="space-y-4">
                  {top3Proyectos.map((item, index) => (
                    <div key={item.proyecto} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-semibold">
                            #{index + 1}
                          </Badge>
                          <button 
                            className="text-sm font-medium truncate max-w-[200px] text-primary hover:underline cursor-pointer text-left"
                            onClick={() => setProjectSummaryDialog({
                              isOpen: true,
                              projectName: item.proyecto,
                              projectId: item.id_proyecto,
                              cuentaIds: item.cuentaIds,
                              totalColocado: item.total,
                              totalCobrado: item.cobrado,
                              valorProyecto: item.valorProyecto
                            })}
                          >
                            {item.proyecto}
                          </button>
                        </div>
                        <Badge variant="secondary" className="ml-2">
                          {item.count} {item.count === 1 ? 'cuenta' : 'cuentas'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground pl-7">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Valor Proy:</span>
                                <span className="font-semibold text-blue-600">{formatCurrencyCompact(item.valorProyecto)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.valorProyecto)}</p>
                              <p className="text-xs text-muted-foreground">Valor total del proyecto</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Colocado:</span>
                                <span className="font-semibold text-foreground">{formatCurrencyCompact(item.total)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.total)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Cobrado:</span>
                                <span className="font-semibold text-green-600">{formatCurrencyCompact(item.cobrado)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.cobrado)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Rest. colocar:</span>
                                <span className="font-semibold text-purple-600">{formatCurrencyCompact(item.valorProyecto - item.total)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.valorProyecto - item.total)}</p>
                              <p className="text-xs text-muted-foreground">Valor proyecto - Colocado</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Rest. cobrar:</span>
                                <span className="font-semibold text-orange-600">{formatCurrencyCompact(item.restante)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.restante)}</p>
                              <p className="text-xs text-muted-foreground">Colocado - Cobrado</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <span className="block text-muted-foreground">Promedio:</span>
                                <span className="font-semibold text-foreground">{formatCurrencyCompact(item.promedio)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.promedio)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay proyectos de propiedades disponibles</p>
              )}
            </CardContent>
          </Card>

          {/* Lado derecho: Estadísticas de Productos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estadísticas de Productos y Servicios</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cuentasProductosActivasCount > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total de Cuentas</span>
                      <Badge variant="secondary">
                        {cuentasProductosActivasCount} {cuentasProductosActivasCount === 1 ? 'cuenta' : 'cuentas'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Monto Total Colocado</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-lg font-semibold cursor-help">{formatCurrencyCompact(totalMontoProductos)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(totalMontoProductos)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Monto Total Cobrado</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-lg font-semibold text-green-600 cursor-help">{formatCurrencyCompact(totalCobradoProductos)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(totalCobradoProductos)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Restante por cobrar</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-lg font-semibold text-orange-600 cursor-help">{formatCurrencyCompact(totalMontoProductos - totalCobradoProductos)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(totalMontoProductos - totalCobradoProductos)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Promedio por Cuenta</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-lg font-semibold cursor-help">{formatCurrencyCompact(promedioProductos)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(promedioProductos)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay cuentas de productos o servicios disponibles</p>
              )}
            </CardContent>
          </Card>
        </div>
          </CardContent>
        )}
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="activas">Cuentas Activas ({totalActivasCount})</TabsTrigger>
          <TabsTrigger value="canceladas">Cuentas Canceladas ({totalCancelladasCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="mt-6">
          <Card>
            <CardHeader>
              <div className="space-y-4">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" />
                </div>
                
                {/* Filters grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium mb-2 block">ID Cuenta</label>
                    <Input placeholder="Filtrar por ID..." value={idCuentaFilter} onChange={e => setIdCuentaFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tipo</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          <span className="truncate">Tipo ({selectedTipos.length})</span>
                          <Filter className="h-4 w-4 ml-2 flex-shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 bg-background z-50" align="start">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Filtrar por Tipo</h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-propiedad" checked={selectedTipos.includes('Propiedad')} onCheckedChange={() => handleTipoToggle('Propiedad')} />
                              <Label htmlFor="tipo-propiedad" className="cursor-pointer">
                                Propiedad
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-producto" checked={selectedTipos.includes('Producto')} onCheckedChange={() => handleTipoToggle('Producto')} />
                              <Label htmlFor="tipo-producto" className="cursor-pointer">
                                Producto
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-servicio" checked={selectedTipos.includes('Servicio')} onCheckedChange={() => handleTipoToggle('Servicio')} />
                              <Label htmlFor="tipo-servicio" className="cursor-pointer">
                                Servicio
                              </Label>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Nombre de producto</label>
                    <Input placeholder="Filtrar por producto..." value={productoFilter} onChange={e => setProductoFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Compradores</label>
                    <Input placeholder="Filtrar por comprador..." value={compradoresFilter} onChange={e => setCompradoresFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">CLABE</label>
                    <Input placeholder="Filtrar por CLABE..." value={clabeFilter} onChange={e => setClabeFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Proyecto</label>
                    <Input placeholder="Filtrar por proyecto..." value={proyectoFilter} onChange={e => setProyectoFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">No. Propiedad</label>
                    <Input placeholder="Filtrar por propiedad..." value={noPropiedadFilter} onChange={e => setNoPropiedadFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Modelo</label>
                    <Input placeholder="Filtrar por modelo..." value={modeloFilter} onChange={e => setModeloFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Estatus de Propiedad</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          <span className="truncate">
                            {estatusFilter.length === 0 ? "Todos" : `${estatusFilter.length} seleccionados`}
                          </span>
                          <Filter className="h-4 w-4 ml-2 flex-shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 bg-background z-50" align="start">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Filtrar por Estatus</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {estatusDisponibilidad?.map((estatus) => (
                              <div key={estatus.id} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`estatus-${estatus.id}`} 
                                  checked={estatusFilter.includes(estatus.id)} 
                                  onCheckedChange={() => {
                                    setEstatusFilter(prev => 
                                      prev.includes(estatus.id) 
                                        ? prev.filter(id => id !== estatus.id) 
                                        : [...prev, estatus.id]
                                    );
                                  }} 
                                />
                                <Label htmlFor={`estatus-${estatus.id}`} className="cursor-pointer text-sm">
                                  {estatus.nombre}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                {/* Clear filters button and Export */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                  setSearchTerm("");
                  setIdCuentaFilter("");
                  setSelectedTipos(['Propiedad', 'Producto', 'Servicio']);
                  setProductoFilter("");
                  setCompradoresFilter("");
                  setClabeFilter("");
                  setProyectoFilter("");
                  setNoPropiedadFilter("");
                  setModeloFilter("");
                  setEstatusFilter([]);
                }}>
                    Limpiar Filtros
                  </Button>
                  {(canExport || isSuperAdmin) && paginatedCuentasActivas.length > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        setIsExportingData(true);
                        try {
                          console.log('[Export] Starting batched export for active accounts');
                          
                          const batchSize = 1000;
                          let allData: any[] = [];
                          let offset = 0;
                          let hasMore = true;
                          
                          // Fetch in batches to bypass PostgREST 1000 row limit
                          while (hasMore) {
                            console.log(`[Export] Fetching batch at offset ${offset}`);
                            const { data: batchData, error } = await supabase
                              .rpc('get_cuentas_cobranza_export' as any, {
                                p_id_cuenta: idCuentaFilter || null,
                                p_proyecto: proyectoFilter || null,
                                p_clabe: clabeFilter || null,
                                p_no_propiedad: noPropiedadFilter || null,
                                p_modelo: modeloFilter || null,
                                p_compradores: compradoresFilter || null,
                                p_producto: productoFilter || null,
                                p_estatus_ids: estatusFilter.length > 0 ? estatusFilter : null,
                                p_tipos: selectedTipos.length < 3 ? selectedTipos : null,
                                p_activo: true,
                                p_proyecto_ids: hasUnrestrictedAccess ? null : (accessibleProjectIds.length > 0 ? accessibleProjectIds : null),
                                p_dueno_entity_ids: isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0 ? ownershipEntityIds : null,
                                p_limit: batchSize,
                                p_offset: offset,
                              });
                            
                            if (error) {
                              console.error('Error fetching batch:', error);
                              toast({ title: "Error", description: "No se pudo obtener los datos para exportar.", variant: "destructive" });
                              return;
                            }
                            
                            if (batchData && batchData.length > 0) {
                              allData = [...allData, ...batchData];
                              console.log(`[Export] Retrieved ${batchData.length} records, total: ${allData.length}`);
                              offset += batchSize;
                              hasMore = batchData.length === batchSize;
                            } else {
                              hasMore = false;
                            }
                          }
                          
                          if (allData.length === 0) {
                            toast({ title: "Sin datos", description: "No hay datos para exportar.", variant: "destructive" });
                            return;
                          }
                          
                          console.log(`[Export] Total retrieved: ${allData.length} records`);
                          
                          const exportData = allData.map((cuenta: any) => ({
                            'ID Cuenta': formatCuentaCobranzaId(cuenta.id, cuenta.tipo),
                            'Tipo': cuenta.tipo,
                            'Nombre de producto': cuenta.producto || 'N/A',
                            'Comprador': cuenta.comprador || 'Sin compradores',
                            'Propietario': cuenta.dueno,
                            'CLABE': cuenta.clabe_stp || 'N/A',
                            'Proyecto': cuenta.proyecto,
                            'Edificio': cuenta.edificio,
                            'No. Propiedad': cuenta.numero_propiedad,
                            'Modelo': cuenta.modelo,
                            'Estatus de Propiedad': cuenta.estatus_disponibilidad_nombre || 'N/A',
                            'Metraje': cuenta.metraje ? `${Number(cuenta.metraje).toFixed(2)} m²` : 'N/A',
                            'Precio/m²': cuenta.metraje && Number(cuenta.metraje) > 0 ? Number(cuenta.precio_final) / Number(cuenta.metraje) : 'N/A',
                            'Precio Final': cuenta.precio_final,
                            'Pagado': cuenta.pagado,
                            'Restante': cuenta.restante,
                          }));
                          await exportToExcel({ data: exportData, filename: 'cuentas_cobranza_activas' });
                        } catch (err) {
                          console.error('Export error:', err);
                          toast({ title: "Error", description: "Ocurrió un error al exportar.", variant: "destructive" });
                        } finally {
                          setIsExportingData(false);
                        }
                      }}
                      disabled={isExporting || isExportingData}
                    >
                      {(isExporting || isExportingData) ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                      )}
                      {(isExporting || isExportingData) ? 'Exportando...' : 'Exportar Excel'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filtered count display */}
              {!isLoading && <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando <span className="font-semibold text-foreground">{paginatedCuentasActivas.length}</span> de <span className="font-semibold text-foreground">{totalActivasCount}</span> cuentas
                </div>}
              {isLoading ? <div className="text-center py-8">Cargando cuentas de cobranza...</div> : filteredCuentas.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || idCuentaFilter || productoFilter || compradoresFilter || clabeFilter || proyectoFilter || noPropiedadFilter || modeloFilter || selectedTipos.length < 3 || estatusFilter.length > 0 ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de cobranza activas"}
                </div> : <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nombre de producto</TableHead>
                      <TableHead>Compradores</TableHead>
                      <TableHead>Propietario</TableHead>
                      <TableHead>CLABE</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Edificio</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Estatus de Propiedad</TableHead>
                      <TableHead>Metraje</TableHead>
                      <TableHead>Precio/m²</TableHead>
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Progreso para Entrega</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
{paginatedCuentas.map(cuenta => <TableRow key={cuenta.id} className={
                      cuenta.id_estatus_disponibilidad === 11
                        ? "bg-amber-50 dark:bg-amber-950/30"
                        : cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && !cuenta.tiene_multas_pendientes && (cuenta.tiene_acuerdos || cuenta.precio_final === 0)
                          ? "bg-green-50 dark:bg-green-950/20" 
                          : ""
                    }>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
                            {cuenta.id_estatus_disponibilidad === 11 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-semibold">⚖️ Propiedad En Demanda</p>
                                    <p className="text-sm">Esta cuenta está bloqueada por un proceso legal</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {cuenta.collection_id && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                                      {cuenta.collection_id}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-sm">Cuenta anterior: {cuenta.collection_id}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!cuenta.tiene_acuerdos && cuenta.precio_final > 0 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Plan de pagos no seleccionado</p>
                                    <p className="text-sm">La cuenta de cobranza fue generada pero falta seleccionar el esquema de pago para generar los acuerdos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : !cuenta.apartado_pagado && cuenta.restante > 0.01 && cuenta.id_estatus_disponibilidad !== 10 && cuenta.precio_final > 0 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Pago inicial pendiente</p>
                                    <p className="text-sm">Esta cuenta fue generada pero aún no ha recibido el pago inicial completo</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : null}
                            {/* Discrepancy indicator */}
                            {cuenta.tiene_acuerdos && Math.abs(cuenta.discrepancia || 0) > 0.01 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Discrepancia detectada</p>
                                    <p className="text-sm">Precio final: {formatCurrency(cuenta.precio_final)}</p>
                                    <p className="text-sm">Suma de acuerdos: {formatCurrency(cuenta.total_acuerdos || 0)}</p>
                                    <p className="text-sm font-medium mt-1">
                                      Diferencia: {formatCurrency(cuenta.discrepancia)}
                                      {cuenta.discrepancia > 0 ? ' (acuerdos faltantes)' : ' (acuerdos exceden precio)'}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.tipo === 'Propiedad' ? 'default' : cuenta.tipo === 'Producto' ? 'secondary' : 'outline'}>
                            {cuenta.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cuenta.producto_nombre ? <span className="text-sm">{cuenta.producto_nombre}</span> : <span className="text-muted-foreground text-xs">N/A</span>}
                        </TableCell>
                         <TableCell>
                           {cuenta.compradores.length > 0 ? cuenta.compradores.length > 1 ? <CompradoresDetailDialog compradores={cuenta.compradores} /> : <div className="space-y-1">
                                  <Badge variant="secondary" className="block w-fit cursor-pointer hover:bg-secondary/80" onClick={() => handleCompradorClick(cuenta.compradores[0].rfc || cuenta.compradores[0].nombre_legal)}>
                                   {cuenta.compradores[0].nombre_legal}
                                 </Badge>
                                 <div className="text-xs text-muted-foreground">
                                   {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                   <br />
                                   {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                 </div>
                               </div> : <span className="text-muted-foreground">Sin compradores</span>}
                         </TableCell>
                         <TableCell>
                           {cuenta.es_propietario_comprador && cuenta.compradores.length > 1 ? (
                             <CompradoresDetailDialog 
                               compradores={cuenta.compradores} 
                               label="propietarios"
                               trigger={
                                 <div className="cursor-pointer hover:bg-muted/50 p-1 rounded">
                                   <div className="flex items-center gap-1">
                                     <span className="font-medium">{cuenta.compradores[0].nombre_legal}</span>
                                     <Badge variant="secondary" className="text-xs">+{cuenta.compradores.length - 1}</Badge>
                                   </div>
                                   <span className="text-muted-foreground text-xs">(Comprador)</span>
                                 </div>
                               }
                             />
                           ) : cuenta.es_propietario_comprador ? (
                             <div>
                               <span className="cursor-pointer hover:text-primary hover:underline" onClick={() => handleVendedorClick(cuenta.dueno)}>
                                 {cuenta.dueno}
                               </span>
                               <div className="text-muted-foreground text-xs">(Comprador)</div>
                             </div>
                           ) : (
                             <span className="cursor-pointer hover:text-primary hover:underline" onClick={() => handleVendedorClick(cuenta.dueno)}>
                               {cuenta.dueno}
                             </span>
                           )}
                         </TableCell>
                          <TableCell>
                            {cuenta.clabe_stp ? <Badge variant="outline" className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => {
                      navigator.clipboard.writeText(cuenta.clabe_stp!);
                      toast({
                        title: "CLABE copiada",
                        description: "La cuenta CLABE se copió al portapapeles"
                      });
                    }}>
                                {cuenta.clabe_stp}
                              </Badge> : <span className="text-muted-foreground">Sin CLABE</span>}
                          </TableCell>
                         <TableCell>{cuenta.proyecto}</TableCell>
                         <TableCell>{cuenta.edificio}</TableCell>
                          <TableCell>
                            <span className="cursor-pointer hover:text-primary hover:underline font-medium" onClick={() => handlePropertyClick(cuenta.clabe_stp || cuenta.numero_propiedad)}>
                              {cuenta.numero_propiedad}
                            </span>
                          </TableCell>
                         <TableCell>{cuenta.modelo}</TableCell>
                         <TableCell>
                           {cuenta.estatus_propiedad ? (
                             <Badge variant="outline" className="text-xs">
                               {cuenta.estatus_propiedad}
                             </Badge>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' && cuenta.metraje ? (
                             <span>{cuenta.metraje.toFixed(2)} m²</span>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' && cuenta.precio_por_m2 ? (
                             <span className="font-semibold">{formatCurrency(cuenta.precio_por_m2)}</span>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell className="font-semibold text-green-600">
                           <div className="flex items-center justify-end gap-2">
                             <span>{formatCurrency(Number(cuenta.precio_final))}</span>
                              {(() => {
                        // Ajustar precio_final si hay comisión en efectivo usando fórmula inversa
                        let precioFinalAjustado = cuenta.precio_final;
                        if (cuenta.es_comision_venta_efectivo && cuenta.porcentaje_comision_venta) {
                          // Recalcular precio antes de aplicar la comisión
                          precioFinalAjustado = cuenta.precio_final / (1 - cuenta.porcentaje_comision_venta / 100);
                        }
                        const difference = cuenta.precio_lista ? precioFinalAjustado - cuenta.precio_lista : 0;
                        const tolerance = 10.0; // Tolerancia para redondeo

                        return <>
                                   {cuenta.precio_lista && difference > tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <TrendingUp className="h-4 w-4 text-orange-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final mayor a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : cuenta.precio_lista && difference < -tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <TrendingDown className="h-4 w-4 text-green-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final menor a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : cuenta.precio_lista && Math.abs(difference) <= tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <Equal className="h-4 w-4 text-blue-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final igual a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : null}
                                   {cuenta.es_comision_venta_efectivo && cuenta.porcentaje_comision_venta && <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <Banknote className="h-4 w-4 text-yellow-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Comisión pagada en efectivo ({cuenta.porcentaje_comision_venta.toFixed(2)}%)</p>
                                           <p className="text-xs mt-1">Precio antes de comisión: {formatCurrency(precioFinalAjustado)}</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider>}
                                 </>;
                      })()}
                           </div>
                         </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                         <TableCell className={`font-semibold ${cuenta.restante <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                           <div className="flex items-center gap-2">
                             {formatCurrency(cuenta.restante)}
                              {cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && !cuenta.tiene_multas_pendientes && (cuenta.tiene_acuerdos || cuenta.precio_final === 0) && (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <CheckCircle className="h-4 w-4 text-green-500" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     {cuenta.restante < -0.01 ? (
                                       <p>Cuenta pagada - Monto cobrado excede el precio final por {formatCurrency(Math.abs(cuenta.restante))}</p>
                                     ) : (
                                       <p>Cuenta completamente pagada</p>
                                     )}
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button variant="ghost" size="icon" onClick={() => setCashDialog({
                            isOpen: true,
                            cuenta
                          })}>
                                     <DollarSign className={`h-4 w-4 ${cuenta.cash_percentage >= 85 ? 'text-red-600' : cuenta.cash_percentage >= 75 ? 'text-yellow-600' : 'text-green-600'}`} />
                                   </Button>
                                 </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Límite: {formatCurrency(cuenta.cash_limit || 0)}</p>
                                    <p>Pagado: {formatCurrency(cuenta.cash_paid || 0)}</p>
                                    <p>Aún permitido: {formatCurrency(cuenta.cash_remaining || 0)}</p>
                                  </TooltipContent>
                               </Tooltip>
                             </TooltipProvider> : <span className="text-muted-foreground text-xs">N/A</span>}
                         </TableCell>
                         {/* Progress column - only for Propiedad */}
                         <TableCell>
                            {cuenta.tipo === 'Propiedad' && cuenta.id_estatus_disponibilidad ? (
                              <PropertyProgressBadge 
                                cuentaId={cuenta.id} 
                                estatusActual={cuenta.id_estatus_disponibilidad}
                                restante={cuenta.restante}
                              />
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                           <TableCell>
                             <TooltipProvider>
                               <div className="flex gap-2">
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="outline" size="icon" asChild>
                                       <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                         <Eye className="h-4 w-4" />
                                       </Link>
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Ver Detalle</p>
                                   </TooltipContent>
                                 </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="icon" onClick={() => handleDownloadEstadoCuenta(cuenta.id)} disabled={isGeneratingEstadoCuenta !== null}>
                                        {isGeneratingEstadoCuenta === cuenta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Descargar Estado de Cuenta</p>
                                    </TooltipContent>
                                  </Tooltip>
                                 {(canUpdate || isSuperAdmin) && (
                                  <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="outline" size="icon" onClick={() => handleEditCuenta(cuenta)}>
                                       <Edit className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Editar Cuenta</p>
                                   </TooltipContent>
                                 </Tooltip>
                                 )}
                                 {(canUpdate || isSuperAdmin) && (
                                  <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="outline" size="icon" onClick={() => handleAddManualPayment(cuenta)} disabled={cuenta.pagado >= cuenta.precio_final}>
                                       <Plus className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>{cuenta.pagado >= cuenta.precio_final ? 'Cuenta totalmente pagada' : 'Agregar Pago Manual'}</p>
                                   </TooltipContent>
                                 </Tooltip>
                                 )}
                                  {/* SAT Notification Button - For Propiedad with estatus 7, 8, or 9 */}
                                  {cuenta.tipo === 'Propiedad' && [7, 8, 9].includes(cuenta.id_estatus_disponibilidad) && (
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                       <Button 
                                         variant="outline" 
                                         size="icon" 
                                         onClick={() => setSatDialog({ isOpen: true, cuenta })}
                                         className="relative"
                                       >
                                         <span className="font-bold text-[10px]">SAT</span>
                                       </Button>
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>Notificación al SAT</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 )}
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="outline" size="icon" onClick={() => handleDownloadOffer(cuenta)} disabled={loadingDownload === cuenta.id}>
                                       {loadingDownload === cuenta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Descargar Oferta</p>
                                   </TooltipContent>
                                 </Tooltip>
                                 {(canDelete || isSuperAdmin) && (
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                      <Button variant="destructive" size="icon" onClick={() => handleCancelCuenta(cuenta)}>
                                       <X className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Cancelar Cuenta</p>
                                   </TooltipContent>
                                 </Tooltip>
                                 )}
                               </div>
                             </TooltipProvider>
                          </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>}
              {renderPagination(currentPage, totalPages, setCurrentPage)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canceladas" className="mt-6">
          <Card>
            <CardHeader>
              <div className="space-y-4">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" />
                </div>
                
                {/* Filters grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium mb-2 block">ID Cuenta</label>
                    <Input placeholder="Filtrar por ID..." value={idCuentaFilter} onChange={e => setIdCuentaFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tipo</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          <span className="truncate">Tipo ({selectedTipos.length})</span>
                          <Filter className="h-4 w-4 ml-2 flex-shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 bg-background z-50" align="start">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Filtrar por Tipo</h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-propiedad-canceladas" checked={selectedTipos.includes('Propiedad')} onCheckedChange={() => handleTipoToggle('Propiedad')} />
                              <Label htmlFor="tipo-propiedad-canceladas" className="cursor-pointer">
                                Propiedad
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-producto-canceladas" checked={selectedTipos.includes('Producto')} onCheckedChange={() => handleTipoToggle('Producto')} />
                              <Label htmlFor="tipo-producto-canceladas" className="cursor-pointer">
                                Producto
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="tipo-servicio-canceladas" checked={selectedTipos.includes('Servicio')} onCheckedChange={() => handleTipoToggle('Servicio')} />
                              <Label htmlFor="tipo-servicio-canceladas" className="cursor-pointer">
                                Servicio
                              </Label>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Nombre de producto</label>
                    <Input placeholder="Filtrar por producto..." value={productoFilter} onChange={e => setProductoFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Compradores</label>
                    <Input placeholder="Filtrar por comprador..." value={compradoresFilter} onChange={e => setCompradoresFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">CLABE</label>
                    <Input placeholder="Filtrar por CLABE..." value={clabeFilter} onChange={e => setClabeFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Proyecto</label>
                    <Input placeholder="Filtrar por proyecto..." value={proyectoFilter} onChange={e => setProyectoFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">No. Propiedad</label>
                    <Input placeholder="Filtrar por propiedad..." value={noPropiedadFilter} onChange={e => setNoPropiedadFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Modelo</label>
                    <Input placeholder="Filtrar por modelo..." value={modeloFilter} onChange={e => setModeloFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Estatus de Propiedad</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          <span className="truncate">
                            {estatusFilter.length === 0 ? "Todos" : `${estatusFilter.length} seleccionados`}
                          </span>
                          <Filter className="h-4 w-4 ml-2 flex-shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 bg-background z-50" align="start">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Filtrar por Estatus</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {estatusDisponibilidad?.map((estatus) => (
                              <div key={estatus.id} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`estatus-canceladas-${estatus.id}`} 
                                  checked={estatusFilter.includes(estatus.id)} 
                                  onCheckedChange={() => {
                                    setEstatusFilter(prev => 
                                      prev.includes(estatus.id) 
                                        ? prev.filter(id => id !== estatus.id) 
                                        : [...prev, estatus.id]
                                    );
                                  }} 
                                />
                                <Label htmlFor={`estatus-canceladas-${estatus.id}`} className="cursor-pointer text-sm">
                                  {estatus.nombre}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                {/* Clear filters button and Export */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                  setSearchTerm("");
                  setIdCuentaFilter("");
                  setSelectedTipos(['Propiedad', 'Producto', 'Servicio']);
                  setProductoFilter("");
                  setCompradoresFilter("");
                  setClabeFilter("");
                  setProyectoFilter("");
                  setNoPropiedadFilter("");
                  setModeloFilter("");
                  setEstatusFilter([]);
                }}>
                    Limpiar Filtros
                  </Button>
                  {(canExport || isSuperAdmin) && paginatedCuentasCanceladas.length > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        setIsExportingData(true);
                        try {
                          console.log('[Export] Starting batched export for cancelled accounts');
                          
                          const batchSize = 1000;
                          let allData: any[] = [];
                          let offset = 0;
                          let hasMore = true;
                          
                          // Fetch in batches to bypass PostgREST 1000 row limit
                          while (hasMore) {
                            console.log(`[Export] Fetching batch at offset ${offset}`);
                            const { data: batchData, error } = await supabase
                              .rpc('get_cuentas_cobranza_export' as any, {
                                p_id_cuenta: idCuentaFilter || null,
                                p_proyecto: proyectoFilter || null,
                                p_clabe: clabeFilter || null,
                                p_no_propiedad: noPropiedadFilter || null,
                                p_modelo: modeloFilter || null,
                                p_compradores: compradoresFilter || null,
                                p_producto: productoFilter || null,
                                p_estatus_ids: estatusFilter.length > 0 ? estatusFilter : null,
                                p_tipos: selectedTipos.length < 3 ? selectedTipos : null,
                                p_activo: false, // Cancelled accounts
                                p_proyecto_ids: hasUnrestrictedAccess ? null : (accessibleProjectIds.length > 0 ? accessibleProjectIds : null),
                                p_dueno_entity_ids: isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0 ? ownershipEntityIds : null,
                                p_limit: batchSize,
                                p_offset: offset,
                              });
                            
                            if (error) {
                              console.error('Error fetching batch:', error);
                              toast({ title: "Error", description: "No se pudo obtener los datos para exportar.", variant: "destructive" });
                              return;
                            }
                            
                            if (batchData && batchData.length > 0) {
                              allData = [...allData, ...batchData];
                              console.log(`[Export] Retrieved ${batchData.length} records, total: ${allData.length}`);
                              offset += batchSize;
                              hasMore = batchData.length === batchSize;
                            } else {
                              hasMore = false;
                            }
                          }
                          
                          if (allData.length === 0) {
                            toast({ title: "Sin datos", description: "No hay datos para exportar.", variant: "destructive" });
                            return;
                          }
                          
                          console.log(`[Export] Total retrieved: ${allData.length} records`);
                          
                          const exportData = allData.map((cuenta: any) => ({
                            'ID Cuenta': formatCuentaCobranzaId(cuenta.id, cuenta.tipo),
                            'Tipo': cuenta.tipo,
                            'Nombre de producto': cuenta.producto || 'N/A',
                            'Comprador': cuenta.comprador || 'Sin compradores',
                            'Dueño': cuenta.dueno,
                            'CLABE': cuenta.clabe_stp || 'N/A',
                            'Proyecto': cuenta.proyecto,
                            'Edificio': cuenta.edificio,
                            'No. Propiedad': cuenta.numero_propiedad,
                            'Modelo': cuenta.modelo,
                            'Estatus de Propiedad': cuenta.estatus_disponibilidad_nombre || 'N/A',
                            'Metraje': cuenta.metraje ? `${Number(cuenta.metraje).toFixed(2)} m²` : 'N/A',
                            'Precio/m²': cuenta.metraje && Number(cuenta.metraje) > 0 ? Number(cuenta.precio_final) / Number(cuenta.metraje) : 'N/A',
                            'Precio Final': cuenta.precio_final,
                            'Pagado': cuenta.pagado,
                            'Restante': cuenta.restante,
                            'Motivo Cancelación': 'N/A',
                          }));
                          await exportToExcel({ data: exportData, filename: 'cuentas_cobranza_canceladas' });
                        } catch (err) {
                          console.error('Export error:', err);
                          toast({ title: "Error", description: "Ocurrió un error al exportar.", variant: "destructive" });
                        } finally {
                          setIsExportingData(false);
                        }
                      }}
                      disabled={isExporting || isExportingData}
                    >
                      {(isExporting || isExportingData) ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                      )}
                      {(isExporting || isExportingData) ? 'Exportando...' : 'Exportar Excel'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filtered count display */}
              {!isLoading && <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando <span className="font-semibold text-foreground">{paginatedCuentasCanceladas.length}</span> de <span className="font-semibold text-foreground">{totalCancelladasCount}</span> cuentas
                </div>}
              {isLoading ? <div className="text-center py-8">Cargando cuentas de cobranza...</div> : filteredCuentas.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || idCuentaFilter || productoFilter || compradoresFilter || clabeFilter || proyectoFilter || noPropiedadFilter || modeloFilter || selectedTipos.length < 3 || estatusFilter.length > 0 ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de cobranza canceladas"}
                </div> : <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nombre de producto</TableHead>
                      <TableHead>Compradores</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>CLABE</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Edificio</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Estatus de Propiedad</TableHead>
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Motivo Cancelación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas.map(cuenta => <TableRow key={cuenta.id} className={
                      cuenta.id_estatus_disponibilidad === 11
                        ? "bg-amber-50 dark:bg-amber-950/30"
                        : cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 
                          ? "bg-green-50 dark:bg-green-950/20" 
                          : ""
                    }>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
                            {cuenta.id_estatus_disponibilidad === 11 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-semibold">⚖️ Propiedad En Demanda</p>
                                    <p className="text-sm">Esta cuenta está bloqueada por un proceso legal</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {cuenta.collection_id && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                                      {cuenta.collection_id}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-sm">Cuenta anterior: {cuenta.collection_id}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!cuenta.tiene_acuerdos ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Plan de pagos no seleccionado</p>
                                    <p className="text-sm">La cuenta de cobranza fue generada pero falta seleccionar el esquema de pago para generar los acuerdos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : !cuenta.apartado_pagado && cuenta.restante > 0.01 && cuenta.id_estatus_disponibilidad !== 10 ? <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Pago inicial pendiente</p>
                                    <p className="text-sm">Esta cuenta fue generada pero aún no ha recibido el pago inicial completo</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.tipo === 'Propiedad' ? 'default' : cuenta.tipo === 'Producto' ? 'secondary' : 'outline'}>
                            {cuenta.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cuenta.producto_nombre ? <span className="text-sm">{cuenta.producto_nombre}</span> : <span className="text-muted-foreground text-xs">N/A</span>}
                        </TableCell>
                         <TableCell>
                           {cuenta.compradores.length > 0 ? cuenta.compradores.length > 1 ? <CompradoresDetailDialog compradores={cuenta.compradores} /> : <div className="space-y-1">
                                  <Badge variant="secondary" className="block w-fit cursor-pointer hover:bg-secondary/80" onClick={() => handleCompradorClick(cuenta.compradores[0].rfc || cuenta.compradores[0].nombre_legal)}>
                                   {cuenta.compradores[0].nombre_legal}
                                 </Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                    <br />
                                    {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                  </div>
                               </div> : <span className="text-muted-foreground">Sin compradores</span>}
                         </TableCell>
                         <TableCell>
                           <span className="cursor-pointer hover:text-primary hover:underline" onClick={() => handleVendedorClick(cuenta.dueno)}>
                             {cuenta.dueno}
                           </span>
                         </TableCell>
                          <TableCell>
                            {cuenta.clabe_stp ? <Badge variant="outline" className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => {
                      navigator.clipboard.writeText(cuenta.clabe_stp!);
                      toast({
                        title: "CLABE copiada",
                        description: "La cuenta CLABE se copió al portapapeles"
                      });
                    }}>
                                {cuenta.clabe_stp}
                              </Badge> : <span className="text-muted-foreground">Sin CLABE</span>}
                          </TableCell>
                         <TableCell>{cuenta.proyecto}</TableCell>
                         <TableCell>{cuenta.edificio}</TableCell>
                          <TableCell>
                            <span className="cursor-pointer hover:text-primary hover:underline font-medium" onClick={() => handlePropertyClick(cuenta.clabe_stp || cuenta.numero_propiedad)}>
                              {cuenta.numero_propiedad}
                            </span>
                          </TableCell>
                         <TableCell>{cuenta.modelo}</TableCell>
                         <TableCell>
                           {cuenta.estatus_propiedad ? (
                             <Badge variant="outline" className="text-xs">
                               {cuenta.estatus_propiedad}
                             </Badge>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell className="font-semibold text-green-600">
                           <div className="flex items-center justify-end gap-2">
                             <span>{formatCurrency(Number(cuenta.precio_final))}</span>
                             {(() => {
                        // Ajustar precio_final si hay comisión en efectivo
                        // La comisión se calcula como: precio_lista * porcentaje
                        let precioFinalAjustado = cuenta.precio_final;
                        if (cuenta.es_comision_venta_efectivo && cuenta.porcentaje_comision_venta && cuenta.precio_lista) {
                          const montoComision = cuenta.precio_lista * (cuenta.porcentaje_comision_venta / 100);
                          precioFinalAjustado = cuenta.precio_final + montoComision;
                        }
                        const difference = cuenta.precio_lista ? precioFinalAjustado - cuenta.precio_lista : 0;
                        const tolerance = 10.0; // Tolerancia para redondeo

                        return <>
                                   {cuenta.precio_lista && difference > tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <TrendingUp className="h-4 w-4 text-orange-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final mayor a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : cuenta.precio_lista && difference < -tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <TrendingDown className="h-4 w-4 text-green-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final menor a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : cuenta.precio_lista && Math.abs(difference) <= tolerance ? <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <Equal className="h-4 w-4 text-blue-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Precio final igual a precio de lista</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider> : null}
                                   {cuenta.es_comision_venta_efectivo && cuenta.porcentaje_comision_venta && <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger>
                                           <Banknote className="h-4 w-4 text-yellow-600" />
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Comisión pagada en efectivo ({cuenta.porcentaje_comision_venta.toFixed(2)}%)</p>
                                           <p className="text-xs mt-1">Precio antes de comisión: {formatCurrency(precioFinalAjustado)}</p>
                                         </TooltipContent>
                                       </Tooltip>
                                     </TooltipProvider>}
                                 </>;
                      })()}
                           </div>
                         </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                         <TableCell className={`font-semibold ${cuenta.restante <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                           <div className="flex items-center gap-2">
                             {formatCurrency(cuenta.restante)}
                             {cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 && (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <CheckCircle className="h-4 w-4 text-green-500" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     {cuenta.restante < -0.01 ? (
                                       <p>Cuenta pagada - Monto cobrado excede el precio final por {formatCurrency(Math.abs(cuenta.restante))}</p>
                                     ) : (
                                       <p>Cuenta completamente pagada</p>
                                     )}
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button variant="ghost" size="icon" onClick={() => setCashDialog({
                            isOpen: true,
                            cuenta
                          })}>
                                     <DollarSign className={`h-4 w-4 ${cuenta.cash_percentage >= 85 ? 'text-red-600' : cuenta.cash_percentage >= 75 ? 'text-yellow-600' : 'text-green-600'}`} />
                                   </Button>
                                 </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Límite: {formatCurrency(cuenta.cash_limit || 0)}</p>
                                    <p>Pagado: {formatCurrency(cuenta.cash_paid || 0)}</p>
                                    <p>Aún permitido: {formatCurrency(cuenta.cash_remaining || 0)}</p>
                                  </TooltipContent>
                               </Tooltip>
                             </TooltipProvider> : <span className="text-muted-foreground text-xs">N/A</span>}
                         </TableCell>
                         <TableCell>
                          <Badge variant={cuenta.motivo_cancelacion === "Cesión de derechos" ? "secondary" : "destructive"}>
                            {cuenta.motivo_cancelacion || "Sin especificar"}
                          </Badge>
                        </TableCell>
                         <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" asChild>
                                      <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                        <Eye className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver Detalle</p>
                                  </TooltipContent>
                                </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="icon" onClick={() => handleDownloadEstadoCuenta(cuenta.id)} disabled={isGeneratingEstadoCuenta !== null}>
                                        {isGeneratingEstadoCuenta === cuenta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Descargar Estado de Cuenta</p>
                                    </TooltipContent>
                                  </Tooltip>
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                     <Button variant="outline" size="icon" onClick={() => handleDownloadOffer(cuenta)} disabled={loadingDownload === cuenta.id}>
                                       {loadingDownload === cuenta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Descargar Oferta</p>
                                   </TooltipContent>
                                 </Tooltip>
                              </div>
                            </TooltipProvider>
                         </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>}
              {renderPagination(currentPage, totalPages, setCurrentPage)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {cancelDialog.isOpen && cancelDialog.cuenta && <CancelCuentaDialog isOpen={cancelDialog.isOpen} onClose={() => setCancelDialog({
      isOpen: false,
      cuenta: null
    })} cuentaId={cancelDialog.cuenta.id} precioFinal={cancelDialog.cuenta.precio_final} totalPagado={cancelDialog.cuenta.pagado} idOferta={cancelDialog.cuenta.id_oferta} clabeStpOriginal={cancelDialog.cuenta.clabe_stp} onSuccess={() => {
      queryClient.invalidateQueries({
        queryKey: ["cuentas_cobranza"]
      });
      setCancelDialog({
        isOpen: false,
        cuenta: null
      });
    }} />}

      {editDialog.isOpen && editDialog.cuenta && <EditCuentaCobranzaDialog cuenta={editDialog.cuenta} onClose={() => setEditDialog({
      isOpen: false,
      cuenta: null
    })} onUpdate={() => {
      queryClient.invalidateQueries({
        queryKey: ["cuentas_cobranza"]
      });
      setEditDialog({
        isOpen: false,
        cuenta: null
      });
    }} />}

      {paymentDialog.cuenta && <AddManualPaymentDialog isOpen={paymentDialog.isOpen} cuentaCobranzaId={paymentDialog.cuenta.id} cuentaCobranzaLabel={formatCuentaCobranzaId(paymentDialog.cuenta.id, paymentDialog.cuenta.tipo)} onClose={() => setPaymentDialog({
      isOpen: false,
      cuenta: null
    })} tipoCuenta={paymentDialog.cuenta.tipo} precioFinal={paymentDialog.cuenta.precio_final} montoPagado={paymentDialog.cuenta.pagado} />}

      {cashDialog.cuenta && <CashPaymentDetailDialog isOpen={cashDialog.isOpen} onClose={() => setCashDialog({
      isOpen: false,
      cuenta: null
    })} cashLimit={cashDialog.cuenta.cash_limit || 0} cashPaid={cashDialog.cuenta.cash_paid || 0} cashRemaining={cashDialog.cuenta.cash_remaining || 0} cashPercentage={cashDialog.cuenta.cash_percentage || 0} cashPayments={cashDialog.cuenta.cash_payments || []} />}

      <ProjectCollectionSummaryDialog
        isOpen={projectSummaryDialog.isOpen}
        onClose={() => setProjectSummaryDialog({ isOpen: false, projectName: "", projectId: 0, cuentaIds: [], totalColocado: 0, totalCobrado: 0, valorProyecto: 0 })}
        projectName={projectSummaryDialog.projectName}
        projectId={projectSummaryDialog.projectId}
        cuentaIds={projectSummaryDialog.cuentaIds}
        totalColocado={projectSummaryDialog.totalColocado}
        totalCobrado={projectSummaryDialog.totalCobrado}
        valorProyecto={projectSummaryDialog.valorProyecto}
        isRepresentanteEmpresaDuena={isRepresentanteEmpresaDuena}
        ownershipEntityIds={ownershipEntityIds}
      />

      {satDialog.cuenta && (
        <SATNotificationDialog
          isOpen={satDialog.isOpen}
          onClose={() => setSatDialog({ isOpen: false, cuenta: null })}
          cuentaCobranzaId={satDialog.cuenta.id}
          cuentaLabel={formatCuentaCobranzaId(satDialog.cuenta.id, satDialog.cuenta.tipo)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['cuentas_cobranza'] })}
        />
      )}
    </div>;
}