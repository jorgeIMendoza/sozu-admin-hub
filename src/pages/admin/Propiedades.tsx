import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Edit, Trash2, Upload, Plus, Eye, Download, Car, Warehouse, CreditCard, Loader2, DollarSign, Calendar, Home, FileText, ArrowRightLeft, Zap, TrendingUp, TrendingDown, Equal, Check, X, ShoppingCart, AlertCircle, Banknote, Lock, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from "@/lib/config";
import { NewPropertyDialog } from "@/components/admin/NewPropertyDialog";
import { EditPropertyDialog } from "@/components/admin/EditPropertyDialog";
import { Settings2, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BulkUploadPropertiesDialog } from "@/components/admin/BulkUploadPropertiesDialog";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { NewProductOfferDialog } from "@/components/admin/NewProductOfferDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateOfferPDF } from "@/services/htmlToPdfService";
import { EstacionamientosDetailDialog } from "@/components/admin/EstacionamientosDetailDialog";
import { BodegasDetailDialog } from "@/components/admin/BodegasDetailDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { AsignarPropiedadDialog } from "@/components/admin/AsignarPropiedadDialog";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { NoProjectAccess } from "@/components/admin/NoProjectAccess";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { OwnerHistoryDialog } from "@/components/admin/OwnerHistoryDialog";
import { ReventaDialog } from "@/components/admin/ReventaDialog";
import { RefreshCw } from "lucide-react";
import { CambiarEstatusAprobacionDialog } from "@/components/admin/CambiarEstatusAprobacionDialog";

// Component to show factura document link
const FacturaCell = ({ propertyId }: { propertyId: number }) => {
  const { data: facturaDoc } = useQuery({
    queryKey: ['factura-doc', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('documentos')
        .select('url, id_tipo_documento, tipos_documento!inner(nombre)')
        .eq('id_propiedad', propertyId)
        .eq('activo', true)
        .eq('tipos_documento.nombre', 'Factura')
        .maybeSingle();
      return data;
    },
  });

  if (!facturaDoc?.url) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => window.open(facturaDoc.url, '_blank')}
          >
            <FileText className="h-4 w-4 text-primary" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Ver factura</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Component to show payment schemes for a project - Shows SI/NO with clickable popover
const EsquemasPagoCell = ({ projectId }: { projectId: number }) => {
  const [open, setOpen] = useState(false);
  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ['esquemas-pago-proyecto', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('esquemas_pago')
        .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades, porcentaje_descuento_aumento')
        .eq('id_proyecto', projectId)
        .is('id_producto', null)
        .eq('es_manual', false)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) return <span className="text-muted-foreground text-xs">...</span>;
  
  if (schemes.length === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        NO
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0">
          <Badge variant="default" className="cursor-pointer hover:bg-primary/80">
            SÍ ({schemes.length})
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">Esquemas de Pago Disponibles</h4>
          <p className="text-xs text-muted-foreground">{schemes.length} esquema(s) configurado(s)</p>
        </div>
        <div className="max-h-60 overflow-auto">
          {schemes.map((scheme) => (
            <div key={scheme.id} className="p-3 border-b last:border-b-0 hover:bg-muted/50">
              <div className="font-medium text-sm">{scheme.nombre}</div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Enganche:</span>
                  <span>{scheme.porcentaje_enganche}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Mensualidades:</span>
                  <span>{scheme.porcentaje_mensualidades}% ({scheme.numero_mensualidades} meses)</span>
                </div>
                <div className="flex justify-between">
                  <span>Entrega:</span>
                  <span>{scheme.porcentaje_entrega}%</span>
                </div>
                {scheme.porcentaje_descuento_aumento !== 0 && (
                  <div className="flex justify-between">
                    <span>{scheme.porcentaje_descuento_aumento < 0 ? 'Descuento:' : 'Aumento:'}</span>
                    <span className={scheme.porcentaje_descuento_aumento < 0 ? 'text-green-600' : 'text-red-600'}>
                      {Math.abs(scheme.porcentaje_descuento_aumento)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: string | null;
  m2_reales: number;
  m2_interiores: number;
  m2_exteriores: number;
  precio_lista: number;
  monto_apartado: number | null;
  monto_apartado_pagando: number | null;
  clabe_stp_tmp_apartado: string | null;
  id_entidad_relacionada_dueno: number;
  clabe_stp: string | null; // Nueva propiedad para CLABE de cuentas_cobranza
  cuenta_cobranza_id: number | null; // Nueva propiedad para ID de cuenta de cobranza
  precio_final: number | null; // Nueva propiedad para precio final de cuenta de cobranza
  es_comision_venta_efectivo?: boolean; // Nueva propiedad para indicar comisión en efectivo
  porcentaje_comision_venta?: number; // Nueva propiedad para porcentaje de comisión
  total_pagado: number; // Nueva propiedad para total pagado
  restante: number; // Nueva propiedad para monto restante
  activo: boolean;
  es_aprobado: boolean;
  apartado_pagado: boolean; // Nueva propiedad para saber si el apartado está pagado
  cuenta_sin_esquema: boolean; // Nueva propiedad para saber si la cuenta existe pero sin esquema de pago
  // Relaciones
  propietario: string;
  propietario_original: string; // Dueño original de la propiedad
  propietario_actual: string; // Propietario actual (puede ser comprador si cuenta está pagada)
  tiene_cuenta_pagada: boolean; // Indica si tiene cuenta de mantenimiento (propiedad entregada)
  es_desarrollador: boolean; // Indica si el propietario mostrado es el desarrollador del proyecto
  tiene_sozu_como_inmobiliaria: boolean; // Indica si el proyecto tiene a Sozu como inmobiliaria
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  vista: string;
  tipo_transaccion: string;
  id_tipo_transaccion: number; // ID del tipo de transacción (2 = Re-venta)
  disponibilidad: string;
  id_estatus_disponibilidad: number;
  configuracion_modelo: {
    numero_recamaras: number;
    numero_completo_banos: number;
    numero_medio_bano: number;
  };
  // Nueva propiedad para verificar si tiene ofertas
  tieneOfertas: boolean;
  tieneOfertasProductos: boolean;
  // Nuevas propiedades para estacionamientos y bodegas
  estacionamientos_count: number;
  bodegas_count: number;
  // Estado de pagos
  payment_status?: {
    apartado: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
    enganche: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
    mensualidades: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
    entrega: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
    especial: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
    cesion_derechos: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; total: number; fecha: string | null };
  } | null;
}

type ColumnKey = 
  | 'proyecto' | 'propietario' | 'edificio' | 'modelo' | 'numero_departamento'
  | 'piso' | 'vista' | 'area' | 'configuracion' | 'tipo_transaccion' | 'precio' | 'precio_m2'
  | 'estacionamientos' | 'bodegas' | 'ofertas_comerciales' | 'ofertas_productos'
  | 'esquemas_pago' | 'disponibilidad' | 'cuenta_cobranza' | 'cuenta_clabe' | 'precio_final'
  | 'pagado' | 'restante' | 'estado_pagos' | 'factura' | 'acciones';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  required: boolean;
  defaultVisible: boolean;
}

const COLUMNS_CONFIG: ColumnConfig[] = [
  { key: 'proyecto', label: 'Proyecto', required: false, defaultVisible: true },
  { key: 'propietario', label: 'Propietario', required: false, defaultVisible: true },
  { key: 'edificio', label: 'Edificio', required: false, defaultVisible: true },
  { key: 'modelo', label: 'Modelo', required: false, defaultVisible: true },
  { key: 'numero_departamento', label: 'No. Departamento', required: true, defaultVisible: true },
  { key: 'piso', label: 'Nivel', required: false, defaultVisible: false },
  { key: 'vista', label: 'Vista', required: false, defaultVisible: false },
  { key: 'area', label: 'Área', required: false, defaultVisible: true },
  { key: 'configuracion', label: 'Configuración', required: false, defaultVisible: true },
  { key: 'tipo_transaccion', label: 'Tipo de Transacción', required: false, defaultVisible: true },
  { key: 'precio', label: 'Precio', required: false, defaultVisible: true },
  { key: 'precio_m2', label: 'Precio por M2', required: false, defaultVisible: false },
  { key: 'estacionamientos', label: 'Estacionamientos', required: false, defaultVisible: true },
  { key: 'bodegas', label: 'Bodegas', required: false, defaultVisible: true },
  { key: 'ofertas_comerciales', label: 'Ofertas Comerciales', required: false, defaultVisible: false },
  { key: 'ofertas_productos', label: 'Ofertas de Productos', required: false, defaultVisible: false },
  { key: 'esquemas_pago', label: 'Esquemas de Pago', required: false, defaultVisible: false },
  { key: 'disponibilidad', label: 'Estatus de Propiedad', required: false, defaultVisible: true },
  { key: 'cuenta_cobranza', label: 'Cuenta de cobranza', required: false, defaultVisible: true },
  { key: 'cuenta_clabe', label: 'Cuenta Clabe', required: false, defaultVisible: false },
  { key: 'precio_final', label: 'Precio Final', required: false, defaultVisible: true },
  { key: 'pagado', label: 'Pagado', required: false, defaultVisible: false },
  { key: 'restante', label: 'Restante', required: false, defaultVisible: false },
  { key: 'estado_pagos', label: 'Estado de Pagos', required: false, defaultVisible: true },
  { key: 'factura', label: 'Factura', required: false, defaultVisible: false },
  { key: 'acciones', label: 'Acciones', required: true, defaultVisible: true },
];

const STORAGE_KEY = 'propiedades-visible-columns';
const ORDER_STORAGE_KEY = 'propiedades-columns-order';

// Sortable Item Component
const SortableColumnItem = ({ column, isVisible, onToggle }: { column: ColumnConfig; isVisible: boolean; onToggle: (key: ColumnKey) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-2 p-2 rounded-md border bg-background ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        id={column.key}
        checked={isVisible}
        onCheckedChange={() => onToggle(column.key)}
        disabled={column.required}
      />
      <label
        htmlFor={column.key}
        className={`text-sm flex-1 cursor-pointer ${
          column.required ? 'text-muted-foreground' : ''
        }`}
      >
        {column.label}
        {column.required && <span className="ml-1 text-xs">(obligatoria)</span>}
      </label>
    </div>
  );
};

const Propiedades = () => {
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activos");
  
  // Project access control
  const { 
    accessibleProjectIds, 
    hasUnrestrictedAccess, 
    hasNoAccess, 
    isLoading: isLoadingAccess,
    isRepresentanteEmpresaDuena,
    ownershipEntityIds 
  } = useProjectAccess();
  
  // Page permissions
  const { canCreate, canUpdate, canDelete, canGenerateOffer, isLoading: isLoadingPermissions, isSuperAdmin } = usePagePermissions('/admin/propiedades');
  
  // Activity logger
  const { registrarAprobacion, registrarEliminacion, registrarCreacion } = useActivityLogger();
  
  // Auth context for prospect ownership check
  const { profile } = useAuth();
  
  // Check if user can see all prospects or only their own
  const canSeeAllProspects = profile?.ver_todos_prospectos_compradores || isSuperAdmin;
  const currentUserPersonaId = profile?.id_persona;
  
  // Check if user can see advanced filters and deleted tab
  const canSeeAdvancedFilters = profile?.ver_filtros_avanzados_eliminados ?? true;
  
  // Helper function to check if user can access an offer
  const canAccessOffer = (offer: any) => {
    if (canSeeAllProspects) return true;
    if (!currentUserPersonaId) return false;
    // User can access if they are the owner of the lead
    return offer.id_persona_duena_lead === currentUserPersonaId;
  };
  
  // Check if user has any action permission
  const hasAnyActionPermission = canUpdate || canDelete || canGenerateOffer || isSuperAdmin;
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize search term from URL parameters
  useEffect(() => {
    const urlSearchTerm = searchParams.get('search');
    if (urlSearchTerm) {
      setInputValue(urlSearchTerm);
      setSearchTerm(urlSearchTerm);
    }
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 400);

    return () => clearTimeout(timer);
  }, [inputValue]);
  
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [selectedPropertyOffers, setSelectedPropertyOffers] = useState<any[] | null>(null);
  const [selectedPropertyProductOffers, setSelectedPropertyProductOffers] = useState<any[] | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [cambiarEstatusOfferId, setCambiarEstatusOfferId] = useState<number | null>(null);
  const [selectedPropertyForOffers, setSelectedPropertyForOffers] = useState<Property | null>(null);
  const [selectedPropertyForProductOffers, setSelectedPropertyForProductOffers] = useState<Property | null>(null);
  const [offersDialogOpen, setOffersDialogOpen] = useState(false);
  const [productOffersDialogOpen, setProductOffersDialogOpen] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<number[]>([]);
  const [availableSchemes, setAvailableSchemes] = useState<any[]>([]);
  const [downloadingOfferId, setDownloadingOfferId] = useState<number | null>(null);
  const [confirmGenerateAccountOpen, setConfirmGenerateAccountOpen] = useState(false);
  const [selectedOfferForAccount, setSelectedOfferForAccount] = useState<any | null>(null);
  const [schemeSelectionOffer, setSchemeSelectionOffer] = useState<any | null>(null);
  const [productSchemes, setProductSchemes] = useState<any[]>([]);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(false);
  const [isUpdatingScheme, setIsUpdatingScheme] = useState(false);
  
  // Estados para modales de detalle
  const [estacionamientosDialogOpen, setEstacionamientosDialogOpen] = useState(false);
  const [bodegasDialogOpen, setBodegasDialogOpen] = useState(false);
  const [selectedPropertyEstacionamientos, setSelectedPropertyEstacionamientos] = useState<any[]>([]);
  const [selectedPropertyBodegas, setSelectedPropertyBodegas] = useState<any[]>([]);
  const [selectedPropertyForDetail, setSelectedPropertyForDetail] = useState<Property | null>(null);
  
  // Filtros de selección múltiple para proyecto y modelo
  const [selectedProyectos, setSelectedProyectos] = useState<number[]>([]);
  const [selectedModelos, setSelectedModelos] = useState<number[]>([]);
  const [selectedModelosLabels, setSelectedModelosLabels] = useState<Record<number, string>>({});
  const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
  const [isModeloFilterOpen, setIsModeloFilterOpen] = useState(false);
  
  const [modeloSearchInput, setModeloSearchInput] = useState("");
  const [modeloSearchTerm, setModeloSearchTerm] = useState("");
  
  const [recamarasFilterInput, setRecamarasFilterInput] = useState<string | null>(null);
  const [recamarasFilter, setRecamarasFilter] = useState<string | null>(null);
  const [banosFilterInput, setBanosFilterInput] = useState("");
  const [banosFilter, setBanosFilter] = useState("");
  const [disponibilidadFilter, setDisponibilidadFilter] = useState<string[]>([]);
  const [tipoTransaccionFilter, setTipoTransaccionFilter] = useState<string[]>([]);
  const [bodegasFilter, setBodegasFilter] = useState("");
  const [estacionamientosFilter, setEstacionamientosFilter] = useState("");
  const [cuentaCobranzaFilter, setCuentaCobranzaFilter] = useState("");
  const [areaFilterInput, setAreaFilterInput] = useState<number[]>([0, 500]);
  const [areaFilter, setAreaFilter] = useState<number[]>([0, 500]);
  const [precioFilterInput, setPrecioFilterInput] = useState<number[]>([0, 100000000]);
  const [precioFilter, setPrecioFilter] = useState<number[]>([0, 100000000]);
  const [precioSort, setPrecioSort] = useState<'asc' | 'desc' | null>(null);

  // Column visibility and order state
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        return new Set(COLUMNS_CONFIG.filter(col => col.defaultVisible).map(col => col.key));
      }
    }
    return new Set(COLUMNS_CONFIG.filter(col => col.defaultVisible).map(col => col.key));
  });

  const [columnsOrder, setColumnsOrder] = useState<ColumnKey[]>(() => {
    const saved = localStorage.getItem(ORDER_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return COLUMNS_CONFIG.map(col => col.key);
      }
    }
    return COLUMNS_CONFIG.map(col => col.key);
  });

  // Get ordered columns config
  const orderedColumns = columnsOrder
    .map(key => COLUMNS_CONFIG.find(col => col.key === key))
    .filter((col): col is ColumnConfig => col !== undefined);

  const isColumnVisible = (key: ColumnKey) => {
    // Hide actions column if user has no action permissions
    if (key === 'acciones' && !hasAnyActionPermission) {
      return false;
    }
    return visibleColumns.has(key);
  };

  const toggleColumn = (key: ColumnKey) => {
    const column = COLUMNS_CONFIG.find(col => col.key === key);
    if (column?.required) return; // Can't toggle required columns
    
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  const selectAllColumns = () => {
    const allKeys = new Set(COLUMNS_CONFIG.map(col => col.key));
    setVisibleColumns(allKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(allKeys)));
  };

  const deselectAllColumns = () => {
    const requiredKeys = new Set(COLUMNS_CONFIG.filter(col => col.required).map(col => col.key));
    setVisibleColumns(requiredKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(requiredKeys)));
  };

  const resetToDefaults = () => {
    const defaultKeys = new Set(COLUMNS_CONFIG.filter(col => col.defaultVisible).map(col => col.key));
    const defaultOrder = COLUMNS_CONFIG.map(col => col.key);
    setVisibleColumns(defaultKeys);
    setColumnsOrder(defaultOrder);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(defaultKeys)));
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(defaultOrder));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setColumnsOrder((items) => {
        const oldIndex = items.indexOf(active.id as ColumnKey);
        const newIndex = items.indexOf(over.id as ColumnKey);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(newOrder));
        return newOrder;
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const visibleCount = visibleColumns.size;
  const totalCount = COLUMNS_CONFIG.length;
  
  // Hook reutilizable para exportación
  const { exportToExcel, isExporting } = useExportToExcel();
  
  // Verificar si hay filtros activos
  const hasActiveFilters = 
    selectedProyectos.length > 0 ||
    selectedModelos.length > 0 ||
    recamarasFilter !== null ||
    banosFilter !== "" ||
    disponibilidadFilter.length > 0 ||
    tipoTransaccionFilter.length > 0 ||
    bodegasFilter !== "" ||
    estacionamientosFilter !== "" ||
    cuentaCobranzaFilter !== "" ||
    areaFilter[0] !== 0 || areaFilter[1] !== 500 ||
    precioFilter[0] !== 0 || precioFilter[1] !== 100000000 ||
    searchTerm !== "";
  
  // Función para exportar a Excel - obtiene TODOS los datos filtrados sin paginación
  const handleExportToExcel = async () => {
    try {
      // Construir query base (sin paginación)
      let query = supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_interiores,
          m2_exteriores,
          precio_lista,
          clabe_stp_tmp_apartado,
          id_tipo_transaccion,
          edificios_modelos!propiedades_id_edificio_modelo_fkey!inner(
            edificios!edificios_modelos_id_edificio_fkey!inner(
              nombre,
              proyectos!edificios_id_proyecto_fkey!inner(id, nombre)
            ),
            modelos!edificios_modelos_id_modelo_fkey!inner(
              id,
              nombre,
              numero_recamaras,
              numero_completo_banos,
              numero_medio_bano
            )
          ),
          entidades_relacionadas(
            personas!entidades_relacionadas_id_persona_fkey(nombre_legal)
          ),
          vistas(nombre),
          estatus_disponibilidad!inner(id, nombre),
          tipos_transaccion(id, nombre),
          ofertas!ofertas_id_propiedad_fkey(
            id,
            id_producto,
            activo,
            cuentas_cobranza!fk_cuentas_cobranza_oferta(clabe_stp, id, precio_final)
          )
        `)
        .order('numero_propiedad', { ascending: true });

      // Aplicar filtros según tab activo
      if (activeTab === "activos") {
        query = query.eq('activo', true).eq('es_aprobado', true);
      } else if (activeTab === "draft") {
        query = query.eq('activo', true).eq('es_aprobado', false);
      } else {
        query = query.eq('activo', false);
      }

      // Aplicar búsqueda - buscar por proyecto, edificio, propietario, o número de propiedad
      if (searchTerm) {
        // Collect all property IDs that match the search term
        let matchingPropertyIds: number[] = [];
        let hasProjectMatch = false;
        
        // 1. Find by project name
        const { data: matchingProyectos } = await supabase
          .from('proyectos')
          .select('id')
          .ilike('nombre', `%${searchTerm}%`)
          .eq('activo', true);
        
        if (matchingProyectos && matchingProyectos.length > 0) {
          const proyectoIds = matchingProyectos.map((p: any) => p.id);
          const { data: matchingEdificios } = await supabase
            .from('edificios')
            .select('id')
            .in('id_proyecto', proyectoIds)
            .eq('activo', true);
          
          if (matchingEdificios && matchingEdificios.length > 0) {
            const edificioIds = matchingEdificios.map(e => e.id);
            const { data: matchingEdificiosModelos } = await supabase
              .from('edificios_modelos')
              .select('id')
              .in('id_edificio', edificioIds)
              .eq('activo', true);
            
            if (matchingEdificiosModelos && matchingEdificiosModelos.length > 0) {
              const edificioModeloIds = matchingEdificiosModelos.map(em => em.id);
              query = query.in('id_edificio_modelo', edificioModeloIds);
              hasProjectMatch = true;
            }
          }
        }
        
        // 2. Find by owner/propietario name (entidades_relacionadas -> personas)
        if (!hasProjectMatch) {
          const { data: matchingPropietarios } = await supabase
            .from('personas')
            .select('id')
            .ilike('nombre_legal', `%${searchTerm}%`)
            .eq('activo', true);
          
          if (matchingPropietarios && matchingPropietarios.length > 0) {
            const personaIds = matchingPropietarios.map((p: any) => p.id);
            
            // Find entidades_relacionadas for these personas (type = dueño, which is typically id_tipo_entidad = 1 or similar)
            const { data: matchingEntidades } = await supabase
              .from('entidades_relacionadas')
              .select('id')
              .in('id_persona', personaIds)
              .eq('activo', true);
            
            if (matchingEntidades && matchingEntidades.length > 0) {
              const entidadIds = matchingEntidades.map((e: any) => e.id);
              query = query.in('id_entidad_relacionada_dueno', entidadIds);
            } else {
              // No matching entidades - try direct property search
              query = query.or(`numero_propiedad.ilike.%${searchTerm}%,clabe_stp_tmp_apartado.ilike.%${searchTerm}%`);
            }
          } else {
            // No matching personas - try direct property search
            query = query.or(`numero_propiedad.ilike.%${searchTerm}%,clabe_stp_tmp_apartado.ilike.%${searchTerm}%`);
          }
        }
      }

      // Aplicar filtros de acceso
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('edificios_modelos.edificios.proyectos.id', accessibleProjectIds);
      }

      if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
        query = query.in('id_entidad_relacionada_dueno', ownershipEntityIds);
      }

      // Aplicar filtros seleccionados
      if (selectedProyectos.length > 0) {
        query = query.in('edificios_modelos.edificios.proyectos.id', selectedProyectos);
      }
      
      if (selectedModelos.length > 0) {
        query = query.in('edificios_modelos.modelos.id', selectedModelos);
      }
      
      if (recamarasFilter) {
        if (recamarasFilter === '4+') {
          query = query.gte('edificios_modelos.modelos.numero_recamaras', 4);
        } else {
          const recamaras = parseInt(recamarasFilter);
          if (!isNaN(recamaras)) {
            query = query.eq('edificios_modelos.modelos.numero_recamaras', recamaras);
          }
        }
      }
      
      if (banosFilter) {
        const banos = parseInt(banosFilter);
        if (!isNaN(banos)) {
          query = query.eq('edificios_modelos.modelos.numero_completo_banos', banos);
        }
      }
      
      if (disponibilidadFilter.length > 0) {
        query = query.in('estatus_disponibilidad.nombre', disponibilidadFilter);
      }
      
      if (tipoTransaccionFilter.length > 0) {
        // Get tipo_transaccion IDs for the filter
        const { data: tiposData } = await supabase
          .from('tipos_transaccion')
          .select('id')
          .in('nombre', tipoTransaccionFilter)
          .eq('activo', true);
        
        const tipoIds = tiposData?.map(t => t.id) || [];
        if (tipoIds.length > 0) {
          query = query.in('id_tipo_transaccion', tipoIds);
        }
      }

      // Ejecutar query - obtener hasta 5000 registros para exportación
      const { data, error } = await query.range(0, 4999);
      
      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay propiedades para exportar con los filtros actuales.",
          variant: "destructive",
        });
        return;
      }

      // Obtener IDs de propiedades para buscar estacionamientos y bodegas
      const propertyIds = data.map(p => p.id);
      
      const [estacionamientosRes, bodegasRes] = await Promise.all([
        supabase.from('estacionamientos').select('id_propiedad').in('id_propiedad', propertyIds).eq('activo', true),
        supabase.from('bodegas').select('id_propiedad').in('id_propiedad', propertyIds).eq('activo', true)
      ]);

      const estacionamientosCounts: Record<number, number> = {};
      (estacionamientosRes.data || []).forEach((e: any) => {
        estacionamientosCounts[e.id_propiedad] = (estacionamientosCounts[e.id_propiedad] || 0) + 1;
      });

      const bodegasCounts: Record<number, number> = {};
      (bodegasRes.data || []).forEach((b: any) => {
        bodegasCounts[b.id_propiedad] = (bodegasCounts[b.id_propiedad] || 0) + 1;
      });

      // Aplicar filtros locales si es necesario
      let filteredData = data;
      
      if (bodegasFilter !== "") {
        filteredData = filteredData.filter(p => {
          const count = bodegasCounts[p.id] || 0;
          return bodegasFilter === "con_bodegas" ? count > 0 : count === 0;
        });
      }
      
      if (estacionamientosFilter !== "") {
        filteredData = filteredData.filter(p => {
          const count = estacionamientosCounts[p.id] || 0;
          return estacionamientosFilter === "con_estacionamientos" ? count > 0 : count === 0;
        });
      }

      if (areaFilter[0] !== 0 || areaFilter[1] !== 500) {
        filteredData = filteredData.filter(p => {
          const m2 = (p.m2_interiores || 0) + (p.m2_exteriores || 0);
          return m2 >= areaFilter[0] && m2 <= areaFilter[1];
        });
      }

      if (precioFilter[0] !== 0 || precioFilter[1] !== 100000000) {
        filteredData = filteredData.filter(p => {
          return p.precio_lista >= precioFilter[0] && p.precio_lista <= precioFilter[1];
        });
      }

      if (cuentaCobranzaFilter !== "") {
        filteredData = filteredData.filter(p => {
          const ofertas = (p as any).ofertas || [];
          const tieneCuenta = ofertas.some((o: any) => 
            o.activo && !o.id_producto && o.cuentas_cobranza && o.cuentas_cobranza.length > 0
          );
          return cuentaCobranzaFilter === "si" ? tieneCuenta : !tieneCuenta;
        });
      }

      if (filteredData.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay propiedades para exportar con los filtros actuales.",
          variant: "destructive",
        });
        return;
      }

      // Mapear datos para exportación
      const exportData = filteredData.map((prop: any) => {
        const ofertas = prop.ofertas || [];
        const ofertaActiva = ofertas.find((o: any) => o.activo && !o.id_producto);
        const cuentaCobranza = ofertaActiva?.cuentas_cobranza?.[0];
        
        return {
          Proyecto: prop.edificios_modelos?.edificios?.proyectos?.nombre || '',
          Edificio: prop.edificios_modelos?.edificios?.nombre || '',
          Modelo: prop.edificios_modelos?.modelos?.nombre || '',
          "No. Propiedad": prop.numero_propiedad,
          Piso: prop.numero_piso || '',
          Vista: prop.vistas?.nombre || '',
          "M2 Interiores": prop.m2_interiores || 0,
          "M2 Exteriores": prop.m2_exteriores || 0,
          "M2 Reales": (prop.m2_interiores || 0) + (prop.m2_exteriores || 0),
          "Tipo de Transacción": prop.tipos_transaccion?.nombre || '',
          "Precio Lista": prop.precio_lista || 0,
          "Precio Final": cuentaCobranza?.precio_final || '',
          Disponibilidad: prop.estatus_disponibilidad?.nombre || '',
          Propietario: prop.entidades_relacionadas?.personas?.nombre_legal || '',
          "Cuenta Cobranza": cuentaCobranza?.id ? formatCuentaCobranzaId(cuentaCobranza.id) : '',
          CLABE: cuentaCobranza?.clabe_stp || prop.clabe_stp_tmp_apartado || '',
          Estacionamientos: estacionamientosCounts[prop.id] || 0,
          Bodegas: bodegasCounts[prop.id] || 0,
          Recámaras: prop.edificios_modelos?.modelos?.numero_recamaras || 0,
          "Baños Completos": prop.edificios_modelos?.modelos?.numero_completo_banos || 0,
          "Medio Baño": prop.edificios_modelos?.modelos?.numero_medio_bano || 0,
        };
      });

      await exportToExcel({
        data: exportData,
        filename: 'propiedades',
      });
    } catch (error) {
      console.error('Error exporting:', error);
      toast({
        title: "Error",
        description: "No se pudo exportar el reporte.",
        variant: "destructive",
      });
    }
  };

  // Fetch proyectos para el filtro (filtered by access)
  const { data: proyectos } = useQuery({
    queryKey: ['proyectos-filter', accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      let query = supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .not("id_tipo_uso", "in", "(9,10,11)")
        .order('nombre', { ascending: true });
      
      // Filter by accessible projects if user doesn't have unrestricted access
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('id', accessibleProjectIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !isLoadingAccess && (hasUnrestrictedAccess || accessibleProjectIds.length > 0),
  });

  // Fetch modelos para el filtro (filtrados por proyectos seleccionados o todos)
  const { data: modelos } = useQuery({
    queryKey: ['modelos-filter', selectedProyectos, modeloSearchTerm],
    queryFn: async () => {
      // Si hay proyectos seleccionados, mostrar modelos aunque no haya búsqueda
      const debeCargarModelos = selectedProyectos.length > 0 || modeloSearchTerm.trim();
      
      if (!debeCargarModelos) {
        return [];
      }

      let query = supabase
        .from('modelos')
        .select(`
          id, 
          nombre, 
          id_proyecto,
          proyectos!modelos_id_proyecto_fkey!inner(id, id_tipo_uso)
        `)
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .range(0, 99);
      
      // Si hay búsqueda, filtrar por nombre
      if (modeloSearchTerm.trim()) {
        query = query.ilike('nombre', `%${modeloSearchTerm}%`);
      }
      
      // Si hay proyectos seleccionados, filtrar modelos por esos proyectos
      if (selectedProyectos.length > 0) {
        query = query.in('id_proyecto', selectedProyectos);
      } else {
        // Si no hay proyectos seleccionados, excluir modelos de proyectos tipo productos/servicios/mantenimientos
        query = query.not('proyectos.id_tipo_uso', 'in', '(9,10,11)');
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    },
  });

  // Query para tipos de transacción (para filtro)
  const { data: tiposTransaccionOptions } = useQuery({
    queryKey: ['tipos-transaccion-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_transaccion')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Query para obtener rango dinámico de precios
  const { data: precioRange } = useQuery({
    queryKey: ['precio-range-filter', accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      let query = supabase
        .from('propiedades')
        .select('precio_lista, edificios_modelos!propiedades_id_edificio_modelo_fkey!inner(edificios!edificios_modelos_id_edificio_fkey!inner(proyectos!edificios_id_proyecto_fkey!inner(id, id_tipo_uso)))')
        .eq('activo', true)
        .eq('es_aprobado', true)
        .gt('precio_lista', 0);
      
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('edificios_modelos.edificios.proyectos.id', accessibleProjectIds);
      }

      const { data, error } = await query.order('precio_lista', { ascending: true }).limit(1);
      const { data: dataMax } = await supabase
        .from('propiedades')
        .select('precio_lista')
        .eq('activo', true)
        .eq('es_aprobado', true)
        .gt('precio_lista', 0)
        .order('precio_lista', { ascending: false })
        .limit(1);

      const minPrice = data?.[0]?.precio_lista || 0;
      const maxPrice = dataMax?.[0]?.precio_lista || 100000000;
      return { min: Math.floor(minPrice), max: Math.ceil(maxPrice) };
    },
    enabled: !isLoadingAccess,
    staleTime: 5 * 60 * 1000,
  });

  // Debounce filtros de sliders y búsqueda de modelos
  useEffect(() => {
    const timer = setTimeout(() => {
      setAreaFilter(areaFilterInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [areaFilterInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPrecioFilter(precioFilterInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [precioFilterInput]);

  // Recámaras filter is now instant (toggle buttons), no debounce needed
  useEffect(() => {
    setRecamarasFilter(recamarasFilterInput);
  }, [recamarasFilterInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBanosFilter(banosFilterInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [banosFilterInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setModeloSearchTerm(modeloSearchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [modeloSearchInput]);

  // Limpiar modelos seleccionados cuando cambian los proyectos
  useEffect(() => {
    setSelectedModelos([]);
    setSelectedModelosLabels({});
    setModeloSearchInput("");
    setModeloSearchTerm("");
  }, [selectedProyectos]);

  // Initialize price range from dynamic data
  useEffect(() => {
    if (precioRange) {
      setPrecioFilterInput([precioRange.min, precioRange.max]);
      setPrecioFilter([precioRange.min, precioRange.max]);
    }
  }, [precioRange]);
  
  // Paginación
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDraft, setCurrentPageDraft] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Función para obtener la clase CSS del badge según la disponibilidad
  const getDisponibilidadBadgeClass = (disponibilidad: string) => {
    switch (disponibilidad.toLowerCase()) {
      case 'disponible':
        return 'badge-disponible';
      case 'apartado':
        return 'badge-apartado';
      case 'vendido':
        return 'badge-vendido';
      case 'listo':
        return 'badge-listo';
      case 'en inventario':
        return 'badge-inventario';
      case 'rentado':
        return 'badge-rentado';
      case 'en escrituración':
        return 'badge-escrituracion';
      case 'entregado':
        return 'badge-entregado';
      default:
        return 'badge-inventario'; // Por defecto gris
    }
  };

  // Función para descargar PDF de oferta
  const handleDownloadOffer = async (offer: any) => {
    try {
      setDownloadingOfferId(offer.id);
      
      // Import storage service
      const { ofertaPdfStorageService } = await import('@/services/ofertaPdfStorageService');
      
      // Check if URL already exists
      const existingUrl = await ofertaPdfStorageService.getExistingUrl(offer.id);
      
      if (existingUrl) {
        // Validar que los datos críticos no hayan cambiado
        const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offer.id);
        
        if (validation.wasInvalidated) {
          // URL fue invalidada, regenerar PDF
          toast({
            title: "Regenerando PDF",
            description: "Los datos de la oferta han sido actualizados, regenerando...",
          });
        } else {
          // URL sigue siendo válida, descargar directamente
          toast({
            title: "Descargando PDF",
            description: "Descargando el PDF de la oferta...",
          });
          
          const filename = existingUrl.split('/').pop() || `oferta-${offer.id}.pdf`;
          await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
          
          toast({
            title: "PDF descargado",
            description: "El PDF se ha descargado exitosamente.",
          });
          return;
        }
      }
      
      // No hay URL o fue invalidada, generar nuevo PDF
      {
        // No URL, generate new PDF
        toast({
          title: "Generando PDF",
          description: "Preparando la descarga del PDF de la oferta...",
        });

        // Usar el propertyId guardado cuando se abrió el dialog
        const propertyIdToUse = selectedPropertyId;

        if (!propertyIdToUse) {
          throw new Error("No se pudo determinar el ID de la propiedad");
        }

        await generateOfferPDF({
          propertyId: propertyIdToUse,
          offerId: offer.id,
          propertyNumber: offer.numero_propiedad || "N/A",
          leadName: offer.lead_name || "N/A",
          leadEmail: offer.lead_email || "N/A", 
          leadPhone: offer.lead_telefono || "N/A",
          creatorEmail: offer.agent_name?.includes('@') ? offer.agent_name : "jorge.mendoza@sozu.com",
          offerOptions: {
            mostrar_piso_en_oferta: offer.mostrar_piso_en_oferta,
            mostrar_precio_m2_en_oferta: offer.mostrar_precio_m2_en_oferta,
            mostrar_seccion_efectivo_en_oferta: offer.mostrar_seccion_efectivo_en_oferta,
          }
        });

        toast({
          title: "PDF generado",
          description: "El PDF se ha generado y descargado exitosamente.",
        });
      }
    } catch (error) {
      console.error('Error generating/downloading PDF:', error);
      toast({
        title: "Error al descargar PDF",
        description: "Hubo un problema al descargar el PDF. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setDownloadingOfferId(null);
    }
  };

  // Shared data enrichment function
  const enrichPropertiesData = async (data: any[]) => {
    if (!data || data.length === 0) return [];
    
    // Get property IDs to filter queries
    const propertyIds = data.map(p => p.id);
    
    // Fetch all related data in parallel for efficiency
    const [
      estacionamientosResult,
      bodegasResult,
      edificiosModelosResult,
      entidadesResult,
      vistasResult,
      estatusResult,
      ofertasResult,
      tiposTransaccionResult
    ] = await Promise.all([
      // Parking counts - add limit to avoid 1000 default
      supabase.from('estacionamientos').select('id_propiedad').in('id_propiedad', propertyIds).eq('activo', true).limit(10000),
      // Storage counts
      supabase.from('bodegas').select('id_propiedad').in('id_propiedad', propertyIds).eq('activo', true).limit(10000),
      // Edificios, modelos, proyectos - CRITICAL: specify ALL FKs explicitly to avoid PGRST201 errors
      supabase.from('edificios_modelos')
        .select('id, id_modelo, modelos!edificios_modelos_id_modelo_fkey(nombre, numero_recamaras, numero_completo_banos, numero_medio_bano), edificios!edificios_modelos_id_edificio_fkey(nombre, id_proyecto, proyectos!edificios_id_proyecto_fkey(id, nombre))')
        .in('id', [...new Set(data.map(p => p.id_edificio_modelo).filter(Boolean))])
        .limit(10000),
      // Owner entities - CRITICAL: specify FK explicitly to avoid PGRST201 errors
      supabase.from('entidades_relacionadas')
        .select('id, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .in('id', [...new Set(data.map(p => p.id_entidad_relacionada_dueno).filter(Boolean))])
        .limit(1000),
      // Views
      supabase.from('vistas')
        .select('id, nombre')
        .in('id', [...new Set(data.map(p => p.id_vista).filter(Boolean))])
        .limit(1000),
      // Availability status
      supabase.from('estatus_disponibilidad')
        .select('id, nombre')
        .in('id', [...new Set(data.map(p => p.id_estatus_disponibilidad).filter(Boolean))])
        .limit(100),
      // Offers with cuentas
      supabase.from('ofertas')
        .select('id, id_propiedad, id_producto, activo, cuentas_cobranza!fk_cuentas_cobranza_oferta(clabe_stp, id)')
        .in('id_propiedad', propertyIds)
        .eq('activo', true)
        .limit(10000),
      // Transaction types
      supabase.from('tipos_transaccion')
        .select('id, nombre')
        .in('id', [...new Set(data.map(p => p.id_tipo_transaccion).filter(Boolean))])
        .limit(100)
    ]);

    // Create maps for quick lookup
    const estacionamientosCounts = (estacionamientosResult.data || []).reduce((acc: any, item: any) => {
      acc[item.id_propiedad] = (acc[item.id_propiedad] || 0) + 1;
      return acc;
    }, {});

    const bodegasCounts = (bodegasResult.data || []).reduce((acc: any, item: any) => {
      acc[item.id_propiedad] = (acc[item.id_propiedad] || 0) + 1;
      return acc;
    }, {});
    
    const edificiosModelosMap = (edificiosModelosResult.data || []).reduce((acc: any, em: any) => {
      acc[em.id] = em;
      return acc;
    }, {});
    
    const entidadesMap = (entidadesResult.data || []).reduce((acc: any, er: any) => {
      acc[er.id] = er;
      return acc;
    }, {});
    
    const vistasMap = (vistasResult.data || []).reduce((acc: any, v: any) => {
      acc[v.id] = v;
      return acc;
    }, {});
    
    const estatusMap = (estatusResult.data || []).reduce((acc: any, e: any) => {
      acc[e.id] = e;
      return acc;
    }, {});
    
    const tiposTransaccionMap = (tiposTransaccionResult.data || []).reduce((acc: any, t: any) => {
      acc[t.id] = t;
      return acc;
    }, {});
    
    // Group ofertas by property
    const ofertasMap = (ofertasResult.data || []).reduce((acc: any, o: any) => {
      if (!acc[o.id_propiedad]) acc[o.id_propiedad] = [];
      acc[o.id_propiedad].push(o);
      return acc;
    }, {});
    
    // Enrich each property with related data
    const enrichedData = data.map(property => ({
      ...property,
      edificios_modelos: edificiosModelosMap[property.id_edificio_modelo] || null,
      entidades_relacionadas: entidadesMap[property.id_entidad_relacionada_dueno] || null,
      vistas: vistasMap[property.id_vista] || null,
      estatus_disponibilidad: estatusMap[property.id_estatus_disponibilidad] || null,
      tipos_transaccion: tiposTransaccionMap[property.id_tipo_transaccion] || null,
      ofertas: ofertasMap[property.id] || []
    }));
    
    // Identify Reventa properties to get their previous buyer info (ID 2 = Re-venta)
    const ID_TIPO_REVENTA = 2;
    const reventaPropertyIds = enrichedData
      .filter((p: any) => p.id_tipo_transaccion === ID_TIPO_REVENTA)
      .map((p: any) => p.id);
    
    // Get inactive ofertas for Reventa properties to find previous buyers
    let reventaOfertasMap: Record<number, any> = {};
    let reventaCuentasMap: Record<number, any> = {};
    let reventaCompradoresMap: Record<number, { nombre: string; porcentaje: number }[]> = {};
    
    if (reventaPropertyIds.length > 0) {
      // Get the most recent offer for each Reventa property (regardless of active status)
      // For Re-venta, we need to show the buyer from the previous transaction
      const { data: reventaOfertas } = await supabase
        .from('ofertas')
        .select('id, id_propiedad, fecha_creacion, activo')
        .in('id_propiedad', reventaPropertyIds)
        .is('id_producto', null)
        .order('fecha_creacion', { ascending: false });
      
      // Group by property and get the most recent
      (reventaOfertas || []).forEach((oferta: any) => {
        if (!reventaOfertasMap[oferta.id_propiedad]) {
          reventaOfertasMap[oferta.id_propiedad] = oferta;
        }
      });
      
      // Get cuentas_cobranza for these ofertas (incluir inactivas ya que al poner en reventa se desactivan)
      const reventaOfertaIds = Object.values(reventaOfertasMap).map((o: any) => o.id);
      if (reventaOfertaIds.length > 0) {
        const { data: reventaCuentas } = await supabase
          .from('cuentas_cobranza')
          .select('id, id_oferta')
          .in('id_oferta', reventaOfertaIds)
          .order('fecha_creacion', { ascending: false }); // Get the most recent first
        
        // Map by id_oferta, only keeping the first (most recent) cuenta for each oferta
        (reventaCuentas || []).forEach((cuenta: any) => {
          if (!reventaCuentasMap[cuenta.id_oferta]) {
            reventaCuentasMap[cuenta.id_oferta] = cuenta;
          }
        });
        
        // Get compradores for these cuentas
        const reventaCuentaIds = (reventaCuentas || []).map((c: any) => c.id);
        if (reventaCuentaIds.length > 0) {
          const { data: reventaCompradores } = await supabase
            .from('compradores')
            .select('id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
            .in('id_cuenta_cobranza', reventaCuentaIds)
            .eq('activo', true)
            .order('porcentaje_copropiedad', { ascending: false });
          
          // Get persona names
          const reventaPersonaIds = (reventaCompradores || []).map((c: any) => c.id_persona);
          let reventaPersonasMap: Record<number, string> = {};
          if (reventaPersonaIds.length > 0) {
            const { data: personasData } = await supabase
              .from('personas')
              .select('id, nombre_legal')
              .in('id', reventaPersonaIds);
            (personasData || []).forEach((p: any) => {
              reventaPersonasMap[p.id] = p.nombre_legal || 'Sin nombre';
            });
          }
          
          // Build compradores map by cuenta_cobranza_id
          (reventaCompradores || []).forEach((c: any) => {
            if (!reventaCompradoresMap[c.id_cuenta_cobranza]) {
              reventaCompradoresMap[c.id_cuenta_cobranza] = [];
            }
            reventaCompradoresMap[c.id_cuenta_cobranza].push({
              nombre: reventaPersonasMap[c.id_persona] || 'Sin nombre',
              porcentaje: Number(c.porcentaje_copropiedad) || 0
            });
          });
        }
      }
    }
    
    // Get active cuentas_cobranza ONLY for properties on the current page (excluding Reventa)
    const ofertaIdsCurrentPage = enrichedData.flatMap((property: any) => 
      (property.ofertas || [])
        .filter((o: any) => o.activo && o.id_producto === null)
        .map((o: any) => o.id)
    ) || [];

    let activeCuentas: any[] = [];
    if (ofertaIdsCurrentPage.length > 0) {
      const { data: cuentasData } = await supabase
        .from('cuentas_cobranza')
        .select('id, clabe_stp, id_oferta, precio_final, es_comision_venta_efectivo, porcentaje_comision_venta')
        .in('id_oferta', ofertaIdsCurrentPage)
        .eq('activo', true)
        .is('id_tipo_cancelacion', null);
      activeCuentas = cuentasData || [];
    }

    const activeCuentasMap = activeCuentas.reduce((acc: any, cuenta: any) => {
      acc[cuenta.id_oferta] = cuenta;
      return acc;
    }, {});

    // Fetch compradores for all active cuentas to determine current owner
    const cuentaIdsAll = activeCuentas.map(c => c.id);
    let compradoresPorCuenta: Record<number, { nombre: string; porcentaje: number }[]> = {};
    let cuentasConMantenimiento: Set<number> = new Set(); // Track which cuentas have maintenance accounts
    
    if (cuentaIdsAll.length > 0) {
      // Fetch compradores (separate query, no join to avoid issues)
      const compradoresPromise = supabase
        .from('compradores')
        .select('id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
        .in('id_cuenta_cobranza', cuentaIdsAll)
        .eq('activo', true)
        .order('porcentaje_copropiedad', { ascending: false });

      // Fetch maintenance accounts - these have id_cuenta_cobranza_padre pointing to the sale account
      const mantenimientoPromise = supabase
        .from('cuentas_cobranza')
        .select('id_cuenta_cobranza_padre')
        .in('id_cuenta_cobranza_padre', cuentaIdsAll)
        .eq('activo', true);

      const [compradoresResult, mantenimientoResult] = await Promise.all([
        compradoresPromise,
        mantenimientoPromise
      ]);

      // Get persona IDs and fetch personas separately
      const personaIds = (compradoresResult.data || []).map((c: any) => c.id_persona);
      let personasMap: Record<number, string> = {};
      
      if (personaIds.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .in('id', personaIds);
        
        (personasData || []).forEach((p: any) => {
          personasMap[p.id] = p.nombre_legal || 'Sin nombre';
        });
      }

      (compradoresResult.data || []).forEach((c: any) => {
        if (!compradoresPorCuenta[c.id_cuenta_cobranza]) {
          compradoresPorCuenta[c.id_cuenta_cobranza] = [];
        }
        compradoresPorCuenta[c.id_cuenta_cobranza].push({
          nombre: personasMap[c.id_persona] || 'Sin nombre',
          porcentaje: Number(c.porcentaje_copropiedad) || 0
        });
      });

      // Build set of cuenta IDs that have maintenance accounts
      (mantenimientoResult.data || []).forEach((m: any) => {
        if (m.id_cuenta_cobranza_padre) {
          cuentasConMantenimiento.add(m.id_cuenta_cobranza_padre);
        }
      });
    }

    // Get payment agreements and applications for each cuenta_cobranza
    const cuentaIds = activeCuentas.map(c => c.id);
    
    // Build payment status map
    const paymentStatusMap: any = {};
    
    // Create a map to store apartado amounts per property
    const apartadoMap: any = {};
    data?.forEach((property: any) => {
      if (property.monto_apartado_pagando && property.monto_apartado_pagando > 0) {
        apartadoMap[property.id] = property.monto_apartado_pagando;
      }
    });
    
    // Create payment status structure for each cuenta
    activeCuentas.forEach(cuenta => {
      paymentStatusMap[cuenta.id] = {
        apartado: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null },
        enganche: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null },
        mensualidades: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null },
        entrega: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null },
        especial: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null },
        cesion_derechos: { status: 'no_pagado', monto: 0, monto_pagado: 0, completados: 0, total: 0, fecha: null }
      };
    });

    if (cuentaIds.length > 0) {
      // Batch queries to avoid Supabase's 1000-row limit
      const BATCH_SIZE = 30; // ~30 cuentas per batch to stay under 1000 acuerdos
      const cuentaBatches: number[][] = [];
      for (let i = 0; i < cuentaIds.length; i += BATCH_SIZE) {
        cuentaBatches.push(cuentaIds.slice(i, i + BATCH_SIZE));
      }

      // Fetch acuerdos_pago in batches
      const acuerdosPromises = cuentaBatches.map(batch =>
        supabase
          .from('acuerdos_pago')
          .select(`
            id,
            monto,
            pago_completado,
            id_concepto,
            id_cuenta_cobranza,
            fecha_pago
          `)
          .in('id_cuenta_cobranza', batch)
          .eq('activo', true)
      );
      const acuerdosResults = await Promise.all(acuerdosPromises);
      const acuerdosData = acuerdosResults.flatMap(r => r.data || []);

      // Get all aplicaciones_pago for these acuerdos WITH payment method info AND payment dates
      const acuerdoIds = acuerdosData.map(a => a.id);
      
      let aplicacionesMap: any = {};
      let pagosPorMetodo: any = {};
      if (acuerdoIds.length > 0) {
        // Batch aplicaciones_pago queries as well
        const ACUERDO_BATCH_SIZE = 100;
        const acuerdoBatches: number[][] = [];
        for (let i = 0; i < acuerdoIds.length; i += ACUERDO_BATCH_SIZE) {
          acuerdoBatches.push(acuerdoIds.slice(i, i + ACUERDO_BATCH_SIZE));
        }

        const aplicacionesPromises = acuerdoBatches.map(batch =>
          supabase
            .from('aplicaciones_pago')
            .select(`
              id_acuerdo_pago,
              monto,
              pagos!fk_aplicaciones_pago_pago!inner(id_metodos_pago, fecha_pago)
            `)
            .in('id_acuerdo_pago', batch)
            .eq('activo', true)
        );
        const aplicacionesResults = await Promise.all(aplicacionesPromises);
        const aplicacionesData = aplicacionesResults.flatMap(r => r.data || []);

        aplicacionesMap = (aplicacionesData || []).reduce((acc: any, app: any) => {
          if (!acc[app.id_acuerdo_pago]) {
            acc[app.id_acuerdo_pago] = [];
          }
          acc[app.id_acuerdo_pago].push(app);
          return acc;
        }, {});
        
        // Build map of payment methods used per acuerdo
        (aplicacionesData || []).forEach((app: any) => {
          if (!pagosPorMetodo[app.id_acuerdo_pago]) {
            pagosPorMetodo[app.id_acuerdo_pago] = {};
          }
          
          const idMetodoPago = app.pagos?.id_metodos_pago;
          if (!pagosPorMetodo[app.id_acuerdo_pago][idMetodoPago]) {
            pagosPorMetodo[app.id_acuerdo_pago][idMetodoPago] = 0;
          }
          pagosPorMetodo[app.id_acuerdo_pago][idMetodoPago] += Number(app.monto) || 0;
        });
      }

      // Group acuerdos by cuenta and concepto
      const acuerdosPorCuentaConcepto: any = {};
      
      (acuerdosData || []).forEach((acuerdo: any) => {
        // Skip if payment status map doesn't have this cuenta
        if (!paymentStatusMap[acuerdo.id_cuenta_cobranza]) {
          return;
        }
        
        const aplicaciones = aplicacionesMap[acuerdo.id] || [];
        const montoPagado = aplicaciones.reduce((sum: number, app: any) => sum + (Number(app.monto) || 0), 0);
        
        // Check if any payment was made with "Cesión de derechos" method (ID 8)
        const metodosUsados = pagosPorMetodo[acuerdo.id] || {};
        const tieneCesionDerechos = !!metodosUsados[8];

        let conceptoKey: 'apartado' | 'mensualidades' | 'enganche' | 'entrega' | 'especial' | 'cesion_derechos';
        
        // Map concept IDs to keys - Apartado(1), Enganche(2), Contraentrega(3), Especial(4), Parcialidad(5), Cesión de derechos(6)
        if (acuerdo.id_concepto === 1) conceptoKey = 'apartado';
        else if (acuerdo.id_concepto === 2) {
          // Enganche - Check if payment method is Cesión de derechos (ID 8)
          if (tieneCesionDerechos) {
            conceptoKey = 'cesion_derechos';
          } else {
            conceptoKey = 'enganche';
          }
        }
        else if (acuerdo.id_concepto === 3) conceptoKey = 'entrega';
        else if (acuerdo.id_concepto === 4) conceptoKey = 'especial';
        else if (acuerdo.id_concepto === 5) conceptoKey = 'mensualidades';
        else if (acuerdo.id_concepto === 6) conceptoKey = 'cesion_derechos';
        else return;

        // Group acuerdos for later processing
        const groupKey = `${acuerdo.id_cuenta_cobranza}_${conceptoKey}`;
        if (!acuerdosPorCuentaConcepto[groupKey]) {
          acuerdosPorCuentaConcepto[groupKey] = [];
        }
        acuerdosPorCuentaConcepto[groupKey].push({
          ...acuerdo,
          montoPagado,
          conceptoKey
        });

        // Acumular montos totales y pagados por concepto
        paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].monto += Number(acuerdo.monto) || 0;
        paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].monto_pagado += montoPagado;
        paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].total += 1;
        
        // Store the most recent fecha_pago from actual payments (pagos table)
        aplicaciones.forEach((app: any) => {
          const fechaPago = app.pagos?.fecha_pago;
          if (fechaPago) {
            if (!paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].fecha || 
                fechaPago > paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].fecha) {
              paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].fecha = fechaPago;
            }
          }
        });
        
        if (acuerdo.pago_completado) {
          paymentStatusMap[acuerdo.id_cuenta_cobranza][conceptoKey].completados += 1;
        }
      });
      
      // Determine final status based on completados vs total
      Object.keys(acuerdosPorCuentaConcepto).forEach(groupKey => {
        const acuerdos = acuerdosPorCuentaConcepto[groupKey];
        if (acuerdos.length === 0) return;
        
        const primeracuerdo = acuerdos[0];
        const cuentaId = primeracuerdo.id_cuenta_cobranza;
        const conceptoKey = primeracuerdo.conceptoKey;
        
        if (!paymentStatusMap[cuentaId]) {
          return;
        }
        
        const info = paymentStatusMap[cuentaId][conceptoKey];
        const todosCompletados = info.completados === info.total && info.total > 0;
        const algunoPagado = acuerdos.some((a: any) => a.montoPagado > 0);
        
        if (todosCompletados) {
          info.status = 'pagado';
        } else if (algunoPagado || info.completados > 0) {
          info.status = 'en_proceso';
        } else {
          info.status = 'no_pagado';
        }
      });
    }

    // Transform the data with counts
    const transformedData = enrichedData?.map((property: any) => {
      // Get clabe_stp from ACTIVE cuentas_cobranza if available (only property offers, not products)
      const cuentaCobranzaData = property.ofertas
        ?.filter((oferta: any) => oferta.id_producto === null)
        ?.map((oferta: any) => activeCuentasMap[oferta.id])
        .find((cuenta: any) => cuenta !== undefined);
      
      // Get es_comision_venta_efectivo and porcentaje_comision_venta
      const esComisionEfectivo = cuentaCobranzaData?.es_comision_venta_efectivo || false;
      const porcentajeComision = cuentaCobranzaData?.porcentaje_comision_venta || 0;
      
      let paymentStatus = cuentaCobranzaData?.id && paymentStatusMap[cuentaCobranzaData.id] 
        ? paymentStatusMap[cuentaCobranzaData.id] 
        : null;
      
      // Add apartado amount to enganche if it exists
      if (paymentStatus && paymentStatus.enganche && property.monto_apartado_pagando && property.monto_apartado_pagando > 0) {
        paymentStatus.enganche.monto_pagado += Number(property.monto_apartado_pagando) || 0;
        
        // Recalculate enganche status considering apartado ONLY if there are actual acuerdos
        if (paymentStatus.enganche.total > 0) {
          if (paymentStatus.enganche.monto_pagado >= paymentStatus.enganche.monto && paymentStatus.enganche.monto > 0) {
            paymentStatus.enganche.status = 'pagado';
          } else if (paymentStatus.enganche.monto_pagado > 0) {
            paymentStatus.enganche.status = 'en_proceso';
          }
        }
      }
      
      // Calculate total pagado and restante
      const precio_final = cuentaCobranzaData?.precio_final || 0;
      const total_pagado = paymentStatus ? (
        (paymentStatus.apartado?.monto_pagado || 0) +
        (paymentStatus.enganche?.monto_pagado || 0) +
        (paymentStatus.mensualidades?.monto_pagado || 0) +
        (paymentStatus.entrega?.monto_pagado || 0) +
        (paymentStatus.especial?.monto_pagado || 0) +
        (paymentStatus.cesion_derechos?.monto_pagado || 0)
      ) : 0;
      // Calculate restante and eliminate -0
      let restante = precio_final - total_pagado;
      restante = +restante.toFixed(2);
      if (Math.abs(restante) < 0.01) restante = 0;
      
      // Determinar si la cuenta existe pero no tiene acuerdos (esquema no seleccionado)
      const cuentaSinEsquema = cuentaCobranzaData?.id && (!paymentStatus || 
        (paymentStatus.apartado?.total === 0 && 
         paymentStatus.enganche?.total === 0 && 
         paymentStatus.mensualidades?.total === 0 && 
         paymentStatus.entrega?.total === 0 && 
         paymentStatus.especial?.total === 0 && 
         paymentStatus.cesion_derechos?.total === 0));

      // Obtener el desarrollador del proyecto
      const desarrolladorProyecto = property.edificios_modelos?.edificios?.proyectos?.entidades_relacionadas
        ?.find((er: any) => er.id_tipo_entidad === 3)?.personas?.nombre_legal || null;

      // Determinar qué mostrar en propietario
      const propietarioNombre = property.entidades_relacionadas?.personas?.nombre_legal;
      let propietarioDisplay = 'Sin propietario';
      let esDarrollador = false;

      if (propietarioNombre) {
        propietarioDisplay = propietarioNombre;
        esDarrollador = false;
      } else if (desarrolladorProyecto) {
        propietarioDisplay = desarrolladorProyecto;
        esDarrollador = true;
      }

      return {
        id: property.id,
        numero_propiedad: property.numero_propiedad,
        numero_piso: property.numero_piso,
        m2_reales: Number(property.m2_interiores || 0) + Number(property.m2_exteriores || 0),
        m2_interiores: Number(property.m2_interiores || 0),
        m2_exteriores: Number(property.m2_exteriores || 0),
        precio_lista: Number(property.precio_lista || 0),
        monto_apartado: property.monto_apartado,
        monto_apartado_pagando: property.monto_apartado_pagando,
        clabe_stp_tmp_apartado: property.clabe_stp_tmp_apartado,
        id_entidad_relacionada_dueno: property.id_entidad_relacionada_dueno,
        clabe_stp: cuentaCobranzaData?.clabe_stp || property.clabe_stp_tmp_apartado,
        cuenta_cobranza_id: cuentaCobranzaData?.id || null,
        precio_final: precio_final > 0 ? precio_final : null,
        es_comision_venta_efectivo: esComisionEfectivo,
        porcentaje_comision_venta: porcentajeComision,
        total_pagado,
        restante,
        activo: property.activo,
        es_aprobado: property.es_aprobado,
        apartado_pagado: (paymentStatus?.apartado?.status === 'pagado') || 
                         (paymentStatus?.enganche?.status === 'pagado') ||
                         (paymentStatus?.especial?.status === 'pagado') ||
                         (paymentStatus?.cesion_derechos?.monto_pagado > 0),
        cuenta_sin_esquema: cuentaSinEsquema,
        // Determinar propietario actual basado en estatus (9, 7, 8, 10 muestran comprador) o cuenta de mantenimiento
        propietario: (() => {
          const esReventa = property.id_tipo_transaccion === ID_TIPO_REVENTA;
          const estatusId = property.estatus_disponibilidad?.id || property.id_estatus_disponibilidad;
          // Estatus que muestran al comprador: Pagada completamente(9), Escrituración(7), Entregado(8), Asignado(10)
          const estatusQueMuestranComprador = [9, 7, 8, 10];
          
          // Para Reventa, obtener el comprador de la última oferta inactiva
          if (esReventa) {
            const reventaOferta = reventaOfertasMap[property.id];
            if (reventaOferta) {
              const reventaCuenta = reventaCuentasMap[reventaOferta.id];
              if (reventaCuenta) {
                const compradores = reventaCompradoresMap[reventaCuenta.id];
                if (compradores && compradores.length > 0) {
                  return compradores[0].nombre + (compradores.length > 1 ? ` (+${compradores.length - 1})` : '');
                }
              }
            }
            return propietarioDisplay;
          }
          
          if (estatusQueMuestranComprador.includes(estatusId) && cuentaCobranzaData?.id && compradoresPorCuenta[cuentaCobranzaData.id]?.length > 0) {
            const compradores = compradoresPorCuenta[cuentaCobranzaData.id];
            if (compradores.length === 1) {
              return compradores[0].nombre;
            }
            return compradores[0].nombre + (compradores.length > 1 ? ` (+${compradores.length - 1})` : '');
          }
          return propietarioDisplay;
        })(),
        propietario_original: propietarioDisplay,
        propietario_actual: (() => {
          const esReventa = property.id_tipo_transaccion === ID_TIPO_REVENTA;
          
          // Para Reventa, obtener el comprador de la última oferta inactiva
          if (esReventa) {
            const reventaOferta = reventaOfertasMap[property.id];
            if (reventaOferta) {
              const reventaCuenta = reventaCuentasMap[reventaOferta.id];
              if (reventaCuenta) {
                const compradores = reventaCompradoresMap[reventaCuenta.id];
                if (compradores && compradores.length > 0) {
                  return compradores[0].nombre + (compradores.length > 1 ? ` (+${compradores.length - 1})` : '');
                }
              }
            }
            return propietarioDisplay;
          }
          
          // Si la cuenta tiene cuenta de mantenimiento asociada, el propietario actual son los compradores
          const tieneCuentaMantenimiento = cuentaCobranzaData?.id && cuentasConMantenimiento.has(cuentaCobranzaData.id);
          const estatusId = property.estatus_disponibilidad?.id || property.id_estatus_disponibilidad;
          // Estatus que muestran al comprador: Pagada completamente(9), Escrituración(7), Entregado(8), Asignado(10)
          const estatusQueMuestranComprador = [9, 7, 8, 10];
          
          if ((tieneCuentaMantenimiento || estatusQueMuestranComprador.includes(estatusId)) && cuentaCobranzaData?.id && compradoresPorCuenta[cuentaCobranzaData.id]?.length > 0) {
            const compradores = compradoresPorCuenta[cuentaCobranzaData.id];
            if (compradores.length === 1) {
              return compradores[0].nombre;
            }
            // Multiple buyers - show primary buyer
            return compradores[0].nombre + (compradores.length > 1 ? ` (+${compradores.length - 1})` : '');
          }
          return propietarioDisplay;
        })(),
        tiene_cuenta_pagada: cuentaCobranzaData?.id ? cuentasConMantenimiento.has(cuentaCobranzaData.id) : false,
        es_desarrollador: esDarrollador,
        proyecto: property.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto',
        proyecto_id: property.edificios_modelos?.edificios?.proyectos?.id || 0,
        edificio: property.edificios_modelos?.edificios?.nombre || 'Sin edificio',
        modelo: property.edificios_modelos?.modelos?.nombre || 'Sin modelo',
        vista: property.vistas?.nombre || 'Sin vista',
        tipo_transaccion: property.tipos_transaccion?.nombre || '-',
        id_tipo_transaccion: property.id_tipo_transaccion || 0,
        disponibilidad: property.estatus_disponibilidad?.nombre || property.disponibilidad || 'Sin estatus',
        id_estatus_disponibilidad: property.estatus_disponibilidad?.id || property.id_estatus_disponibilidad || 0,
        // Para Reventa, no mostrar ofertas activas (ya fueron desactivadas)
        tieneOfertas: property.id_tipo_transaccion === ID_TIPO_REVENTA ? false : (property.ofertas && property.ofertas.some((o: any) => o.activo && o.id_producto === null)),
        tieneOfertasProductos: property.id_tipo_transaccion === ID_TIPO_REVENTA ? false : (property.ofertas && property.ofertas.some((o: any) => o.activo && o.id_producto !== null)),
        estacionamientos_count: estacionamientosCounts[property.id] || 0,
        bodegas_count: bodegasCounts[property.id] || 0,
        payment_status: paymentStatus,
        configuracion_modelo: {
          numero_recamaras: property.edificios_modelos?.modelos?.numero_recamaras || 0,
          numero_completo_banos: property.edificios_modelos?.modelos?.numero_completo_banos || 0,
          numero_medio_bano: property.edificios_modelos?.modelos?.numero_medio_bano || 0,
        },
        tiene_sozu_como_inmobiliaria: false // This will be overridden in fetchEnrichedProperties
      };
    }) || [];
    
    return transformedData;
  };

  // Query to fetch allowed availability status IDs for current user's role
  const { data: allowedEstatusIds } = useQuery({
    queryKey: ['allowed-estatus-ids', profile?.rol_id, isSuperAdmin],
    queryFn: async () => {
      if (isSuperAdmin) return null; // Super Admin sees all
      if (!profile?.rol_id) return [];
      
      const { data, error } = await supabase
        .from('roles_estatus_disponibilidad')
        .select('id_estatus_disponibilidad')
        .eq('id_rol', profile.rol_id)
        .eq('activo', true);
      
      if (error) throw error;
      return data?.map((r: any) => r.id_estatus_disponibilidad) || [];
    },
    enabled: !!profile?.rol_id,
  });

  // Pre-fetch property IDs that belong to accessible projects (for non-super-admin users)
  const { data: accessiblePropertyIds } = useQuery({
    queryKey: ['accessible-property-ids', accessibleProjectIds, hasUnrestrictedAccess, ownershipEntityIds, isRepresentanteEmpresaDuena],
    queryFn: async () => {
      // Super admin or unrestricted access - no need to pre-filter
      if (hasUnrestrictedAccess) return null;
      
      // No accessible projects - return empty array
      if (accessibleProjectIds.length === 0) return [];
      
      // Get edificios that belong to accessible projects
      const { data: edificiosData } = await supabase
        .from('edificios')
        .select('id')
        .in('id_proyecto', accessibleProjectIds)
        .eq('activo', true);
      
      if (!edificiosData || edificiosData.length === 0) return [];
      
      const edificioIds = edificiosData.map(e => e.id);
      
      // Get edificios_modelos for these edificios
      const { data: edificiosModelosData } = await supabase
        .from('edificios_modelos')
        .select('id')
        .in('id_edificio', edificioIds)
        .eq('activo', true);
      
      if (!edificiosModelosData || edificiosModelosData.length === 0) return [];
      
      const edificioModeloIds = edificiosModelosData.map(em => em.id);
      
      // Get property IDs with these edificio_modelo IDs
      let propQuery = supabase
        .from('propiedades')
        .select('id')
        .in('id_edificio_modelo', edificioModeloIds)
        .eq('activo', true)
        .eq('es_aprobado', true);
      
      // Also apply ownership filter if rep empresa dueña
      if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
        propQuery = propQuery.in('id_entidad_relacionada_dueno', ownershipEntityIds);
      }
      
      const { data: propsData } = await propQuery;
      
      return propsData?.map(p => p.id) || [];
    },
    enabled: !hasUnrestrictedAccess && accessibleProjectIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Separate queries for each tab with server-side pagination
  const { data: propiedadesActivasData, isLoading: loadingActivos, refetch: refetchActivos } = useQuery({
    queryKey: ['properties-activos', currentPageActive, searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, tipoTransaccionFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter, areaFilter, precioFilter, precioSort, accessibleProjectIds, hasUnrestrictedAccess, allowedEstatusIds, isRepresentanteEmpresaDuena, ownershipEntityIds, accessiblePropertyIds],
    queryFn: async () => {
      try {
        const from = (currentPageActive - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        // Early return if no accessible properties for restricted users
        if (!hasUnrestrictedAccess && accessiblePropertyIds !== null && accessiblePropertyIds.length === 0) {
          return { items: [], count: 0, totalPages: 0 };
        }

        let query = supabase
          .from('propiedades')
          .select(`
            id,
            numero_propiedad,
            numero_piso,
            m2_interiores,
            m2_exteriores,
            precio_lista,
            monto_apartado,
            monto_apartado_pagando,
            clabe_stp_tmp_apartado,
            id_entidad_relacionada_dueno,
            id_estatus_disponibilidad,
            id_tipo_transaccion,
            activo,
            es_aprobado,
            id_edificio_modelo,
            id_vista
          `, { count: 'exact' })
          .eq('activo', true)
          .eq('es_aprobado', true);

        // Apply pre-computed property ID filter for restricted users
        if (!hasUnrestrictedAccess && accessiblePropertyIds && accessiblePropertyIds.length > 0) {
          query = query.in('id', accessiblePropertyIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
          // For rep empresa dueña with unrestricted access, still filter by ownership
          query = query.in('id_entidad_relacionada_dueno', ownershipEntityIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length === 0) {
          return { items: [], count: 0, totalPages: 0 };
        }

        // Apply filters on server-side
        if (searchTerm) {
          // Find property IDs that have cuentas_cobranza with matching clabe_stp
          const { data: matchingCuentas } = await supabase
            .from('cuentas_cobranza')
            .select('id_oferta, ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .ilike('clabe_stp', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propertyIdsFromCuentas = matchingCuentas?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [];
          
          // Find edificio_modelo IDs by project name
          const { data: matchingProyectos } = await supabase
            .from('proyectos')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const proyectoIds = matchingProyectos?.map((p: any) => p.id) || [];
          
          // Find edificio_modelo IDs by building name
          const { data: matchingEdificios } = await supabase
            .from('edificios')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const edificioIds = matchingEdificios?.map((e: any) => e.id) || [];
          
          // Get edificio_modelo IDs for matching projects and buildings
          let edificioModeloIdsFromSearch: number[] = [];
          if (proyectoIds.length > 0 || edificioIds.length > 0) {
            let emQuery = supabase.from('edificios').select('id').eq('activo', true);
            if (proyectoIds.length > 0) {
              emQuery = emQuery.in('id_proyecto', proyectoIds);
            }
            const { data: edificiosFromProjects } = await emQuery;
            const allEdificioIds = [...new Set([...edificioIds, ...(edificiosFromProjects?.map(e => e.id) || [])])];
            
            if (allEdificioIds.length > 0) {
              const { data: matchingEMs } = await supabase
                .from('edificios_modelos')
                .select('id')
                .in('id_edificio', allEdificioIds)
                .eq('activo', true);
              edificioModeloIdsFromSearch = matchingEMs?.map(em => em.id) || [];
            }
          }
          
          // Find property IDs by owner name (propietario)
          const { data: matchingPropietarios } = await supabase
            .from('entidades_relacionadas')
            .select('id, personas!entidades_relacionadas_id_persona_fkey!inner(nombre_legal)')
            .ilike('personas.nombre_legal', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propietarioEntityIds = matchingPropietarios?.map((p: any) => p.id) || [];
          
          // Build OR query including all search criteria
          let orConditions = [`numero_propiedad.ilike.%${searchTerm}%`, `clabe_stp_tmp_apartado.ilike.%${searchTerm}%`];
          
          if (propertyIdsFromCuentas.length > 0) {
            orConditions.push(`id.in.(${propertyIdsFromCuentas.join(',')})`);
          }
          
          if (edificioModeloIdsFromSearch.length > 0) {
            orConditions.push(`id_edificio_modelo.in.(${edificioModeloIdsFromSearch.join(',')})`);
          }
          
          if (propietarioEntityIds.length > 0) {
            orConditions.push(`id_entidad_relacionada_dueno.in.(${propietarioEntityIds.join(',')})`);
          }
          
          query = query.or(orConditions.join(','));
        }
        
        // Note: Project access and ownership filters already applied early (lines 1424-1437)
        
        // Pre-compute edificio_modelo IDs for project/model/recamaras/banos filters
        if (selectedProyectos.length > 0 || selectedModelos.length > 0 || recamarasFilter || banosFilter) {
          // Step 1: Get edificio IDs from selected projects
          let edificioIdsForFilter: number[] = [];
          if (selectedProyectos.length > 0) {
            const { data: edificiosFromProjects } = await supabase
              .from('edificios')
              .select('id')
              .in('id_proyecto', selectedProyectos)
              .eq('activo', true);
            edificioIdsForFilter = edificiosFromProjects?.map(e => e.id) || [];
            if (edificioIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
          }
          
          // Step 2: Build modelo filter query
          let modeloQuery = supabase.from('modelos').select('id').eq('activo', true);
          if (selectedModelos.length > 0) {
            modeloQuery = modeloQuery.in('id', selectedModelos);
          }
          if (recamarasFilter) {
            if (recamarasFilter === '4+') {
              modeloQuery = modeloQuery.gte('numero_recamaras', 4);
            } else {
              const recamaras = parseInt(recamarasFilter);
              if (!isNaN(recamaras)) {
                modeloQuery = modeloQuery.eq('numero_recamaras', recamaras);
              }
            }
          }
          if (banosFilter) {
            const banos = parseInt(banosFilter);
            if (!isNaN(banos)) {
              modeloQuery = modeloQuery.eq('numero_completo_banos', banos);
            }
          }
          
          const { data: matchingModelos } = await modeloQuery;
          const modeloIdsForFilter = matchingModelos?.map(m => m.id) || [];
          
          // Step 3: Get edificios_modelos that match both filters
          let emQuery = supabase.from('edificios_modelos').select('id').eq('activo', true);
          if (edificioIdsForFilter.length > 0) {
            emQuery = emQuery.in('id_edificio', edificioIdsForFilter);
          }
          if (selectedModelos.length > 0 || recamarasFilter || banosFilter) {
            if (modeloIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
            emQuery = emQuery.in('id_modelo', modeloIdsForFilter);
          }
          
          const { data: matchingEMs } = await emQuery;
          const emIdsForFilter = matchingEMs?.map(em => em.id) || [];
          
          if (emIdsForFilter.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          query = query.in('id_edificio_modelo', emIdsForFilter);
        }
        
        if (disponibilidadFilter.length > 0) {
          // Convert filter names to IDs for direct filtering
          const selectedIds = availabilityOptions?.filter(opt => disponibilidadFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (selectedIds.length > 0) {
            query = query.in('id_estatus_disponibilidad', selectedIds);
          }
        } else if (!isSuperAdmin && allowedEstatusIds && allowedEstatusIds.length > 0) {
          // Apply role-based status filter using IDs directly
          query = query.in('id_estatus_disponibilidad', allowedEstatusIds);
        }
        // Note: If allowedEstatusIds is empty or null, no status filter is applied (show all)
        
        // Filter by tipo de transaccion
        if (tipoTransaccionFilter.length > 0) {
          const tipoIds = tiposTransaccionOptions?.filter(opt => tipoTransaccionFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (tipoIds.length > 0) {
            query = query.in('id_tipo_transaccion', tipoIds);
          }
        }

        // PRE-FILTER: If cuentaCobranzaFilter is set, get property IDs with/without cuentas first
        let propertyIdsWithCuentas: number[] = [];
        if (cuentaCobranzaFilter !== "") {
          const { data: propCuentasData } = await supabase
            .from('cuentas_cobranza')
            .select('ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .eq('activo', true)
            .is('ofertas.id_producto', null); // Only property accounts
          
          propertyIdsWithCuentas = [...new Set(propCuentasData?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [])];
          
          if (cuentaCobranzaFilter === "si") {
            if (propertyIdsWithCuentas.length === 0) {
              return { properties: [], count: 0, filteredCount: 0 };
            }
            query = query.in('id', propertyIdsWithCuentas);
          } else if (cuentaCobranzaFilter === "no" && propertyIdsWithCuentas.length > 0) {
            // For 'no', we need to exclude these IDs - but Supabase has limits on NOT IN
            // We'll handle this in local filtering for now
          }
        }

        // Determine if we need full fetch for local filtering
        const needsFullFetch =
          bodegasFilter !== "" ||
          estacionamientosFilter !== "" ||
          (cuentaCobranzaFilter === "no" && propertyIdsWithCuentas.length > 0) || // Need local filter for "no"
          areaFilter[0] !== 0 ||
          areaFilter[1] !== 500 ||
          precioFilter[0] !== 0 ||
          precioFilter[1] !== 100000000 ||
          precioSort !== null;

        let enrichedData;
        let totalCount;

        if (needsFullFetch) {
          // Fetch up to 1000 records for local filtering
          const { data, error } = await query.range(0, 999);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // Apply all client-side filters
          const filtered = dataWithSozu.filter(property => {
            const matchesBodegas = bodegasFilter === "" || 
              (bodegasFilter === "con_bodegas" && property.bodegas_count > 0) ||
              (bodegasFilter === "sin_bodegas" && property.bodegas_count === 0);
            const matchesEstacionamientos = estacionamientosFilter === "" || 
              (estacionamientosFilter === "con_estacionamientos" && property.estacionamientos_count > 0) ||
              (estacionamientosFilter === "sin_estacionamientos" && property.estacionamientos_count === 0);
            const matchesCuentaCobranza = cuentaCobranzaFilter === "" ||
              (cuentaCobranzaFilter === "si" && property.cuenta_cobranza_id !== null) ||
              (cuentaCobranzaFilter === "no" && property.cuenta_cobranza_id === null);
            const matchesArea = property.m2_reales >= areaFilter[0] && property.m2_reales <= areaFilter[1];
            const matchesPrecio = property.precio_lista >= precioFilter[0] && property.precio_lista <= precioFilter[1];
            
            return matchesBodegas && matchesEstacionamientos && matchesCuentaCobranza && matchesArea && matchesPrecio;
          });

          // Apply sorting if active
          let sortedFiltered = filtered;
          if (precioSort) {
            sortedFiltered = [...filtered].sort((a, b) => {
              const precioA = a.precio_lista || 0;
              const precioB = b.precio_lista || 0;
              return precioSort === 'asc' ? precioA - precioB : precioB - precioA;
            });
          }

          // Apply local pagination
          const paginatedData = sortedFiltered.slice(from, from + itemsPerPage);
          totalCount = sortedFiltered.length;

          return { properties: paginatedData, count: totalCount, filteredCount: sortedFiltered.length };
        } else {
          // Use server-side pagination for better performance
          const { data, error, count } = await query.range(from, to);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // When needsFullFetch is false, filters are at defaults, no client-side filtering needed
          // Use server count directly since no additional filtering is applied
          return { properties: dataWithSozu, count: count || 0, filteredCount: count || 0 };
        }
      } catch (error) {
        console.error('Error fetching active properties:', error);
        return { properties: [], count: 0 };
      }
    },
    enabled: !isLoadingAccess && (hasUnrestrictedAccess || accessiblePropertyIds !== undefined),
  });

  const { data: propiedadesDraftData, isLoading: loadingDraft, refetch: refetchDraft } = useQuery({
    queryKey: ['properties-draft', currentPageDraft, searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, tipoTransaccionFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter, areaFilter, precioFilter, precioSort, accessibleProjectIds, hasUnrestrictedAccess, allowedEstatusIds, isRepresentanteEmpresaDuena, ownershipEntityIds, accessiblePropertyIds],
    queryFn: async () => {
      try {
        const from = (currentPageDraft - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        // For draft we need to get property IDs separately since es_aprobado = false
        let draftPropertyIds: number[] | null = null;
        if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
          // Get edificios that belong to accessible projects
          const { data: edificiosData } = await supabase
            .from('edificios')
            .select('id')
            .in('id_proyecto', accessibleProjectIds)
            .eq('activo', true);
          
          if (!edificiosData || edificiosData.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          const edificioIds = edificiosData.map(e => e.id);
          
          // Get edificios_modelos for these edificios
          const { data: edificiosModelosData } = await supabase
            .from('edificios_modelos')
            .select('id')
            .in('id_edificio', edificioIds)
            .eq('activo', true);
          
          if (!edificiosModelosData || edificiosModelosData.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          const edificioModeloIds = edificiosModelosData.map(em => em.id);
          
          // Get draft property IDs
          let propQuery = supabase
            .from('propiedades')
            .select('id')
            .in('id_edificio_modelo', edificioModeloIds)
            .eq('activo', true)
            .eq('es_aprobado', false);
          
          if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
            propQuery = propQuery.in('id_entidad_relacionada_dueno', ownershipEntityIds);
          }
          
          const { data: propsData } = await propQuery;
          draftPropertyIds = propsData?.map(p => p.id) || [];
          
          if (draftPropertyIds.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
        }

        let query = supabase
          .from('propiedades')
          .select(`
            id,
            numero_propiedad,
            numero_piso,
            m2_interiores,
            m2_exteriores,
            precio_lista,
            monto_apartado,
            monto_apartado_pagando,
            clabe_stp_tmp_apartado,
            id_entidad_relacionada_dueno,
            id_estatus_disponibilidad,
            id_tipo_transaccion,
            activo,
            es_aprobado,
            id_edificio_modelo,
            id_vista
          `, { count: 'exact' })
          .eq('activo', true)
          .eq('es_aprobado', false);

        // Apply pre-computed property ID filter for restricted users
        if (draftPropertyIds && draftPropertyIds.length > 0) {
          query = query.in('id', draftPropertyIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
          query = query.in('id_entidad_relacionada_dueno', ownershipEntityIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length === 0) {
          return { items: [], count: 0, totalPages: 0 };
        }

        // Apply filters on server-side
        if (searchTerm) {
          // Find property IDs that have cuentas_cobranza with matching clabe_stp
          const { data: matchingCuentas } = await supabase
            .from('cuentas_cobranza')
            .select('id_oferta, ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .ilike('clabe_stp', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propertyIdsFromCuentas = matchingCuentas?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [];
          
          // Find edificio_modelo IDs by project name
          const { data: matchingProyectos } = await supabase
            .from('proyectos')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const proyectoIds = matchingProyectos?.map((p: any) => p.id) || [];
          
          // Find edificio_modelo IDs by building name
          const { data: matchingEdificios } = await supabase
            .from('edificios')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const edificioIds = matchingEdificios?.map((e: any) => e.id) || [];
          
          // Get edificio_modelo IDs for matching projects and buildings
          let edificioModeloIdsFromSearch: number[] = [];
          if (proyectoIds.length > 0 || edificioIds.length > 0) {
            let emQuery = supabase.from('edificios').select('id').eq('activo', true);
            if (proyectoIds.length > 0) {
              emQuery = emQuery.in('id_proyecto', proyectoIds);
            }
            const { data: edificiosFromProjects } = await emQuery;
            const allEdificioIds = [...new Set([...edificioIds, ...(edificiosFromProjects?.map(e => e.id) || [])])];
            
            if (allEdificioIds.length > 0) {
              const { data: matchingEMs } = await supabase
                .from('edificios_modelos')
                .select('id')
                .in('id_edificio', allEdificioIds)
                .eq('activo', true);
              edificioModeloIdsFromSearch = matchingEMs?.map(em => em.id) || [];
            }
          }
          
          // Find property IDs by owner name (propietario)
          const { data: matchingPropietarios } = await supabase
            .from('entidades_relacionadas')
            .select('id, personas!entidades_relacionadas_id_persona_fkey!inner(nombre_legal)')
            .ilike('personas.nombre_legal', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propietarioEntityIds = matchingPropietarios?.map((p: any) => p.id) || [];
          
          // Build OR query including all search criteria
          let orConditions = [`numero_propiedad.ilike.%${searchTerm}%`, `clabe_stp_tmp_apartado.ilike.%${searchTerm}%`];
          
          if (propertyIdsFromCuentas.length > 0) {
            orConditions.push(`id.in.(${propertyIdsFromCuentas.join(',')})`);
          }
          
          if (edificioModeloIdsFromSearch.length > 0) {
            orConditions.push(`id_edificio_modelo.in.(${edificioModeloIdsFromSearch.join(',')})`);
          }
          
          if (propietarioEntityIds.length > 0) {
            orConditions.push(`id_entidad_relacionada_dueno.in.(${propietarioEntityIds.join(',')})`);
          }
          
          query = query.or(orConditions.join(','));
        }
        
        // Note: Project access and ownership filters already applied early
        
        // Pre-compute edificio_modelo IDs for project/model/recamaras/banos filters
        if (selectedProyectos.length > 0 || selectedModelos.length > 0 || recamarasFilter || banosFilter) {
          // Step 1: Get edificio IDs from selected projects
          let edificioIdsForFilter: number[] = [];
          if (selectedProyectos.length > 0) {
            const { data: edificiosFromProjects } = await supabase
              .from('edificios')
              .select('id')
              .in('id_proyecto', selectedProyectos)
              .eq('activo', true);
            edificioIdsForFilter = edificiosFromProjects?.map(e => e.id) || [];
            if (edificioIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
          }
          
          // Step 2: Build modelo filter query
          let modeloQuery = supabase.from('modelos').select('id').eq('activo', true);
          if (selectedModelos.length > 0) {
            modeloQuery = modeloQuery.in('id', selectedModelos);
          }
          if (recamarasFilter) {
            if (recamarasFilter === '4+') {
              modeloQuery = modeloQuery.gte('numero_recamaras', 4);
            } else {
              const recamaras = parseInt(recamarasFilter);
              if (!isNaN(recamaras)) {
                modeloQuery = modeloQuery.eq('numero_recamaras', recamaras);
              }
            }
          }
          if (banosFilter) {
            const banos = parseInt(banosFilter);
            if (!isNaN(banos)) {
              modeloQuery = modeloQuery.eq('numero_completo_banos', banos);
            }
          }
          
          const { data: matchingModelos } = await modeloQuery;
          const modeloIdsForFilter = matchingModelos?.map(m => m.id) || [];
          
          // Step 3: Get edificios_modelos that match both filters
          let emQuery = supabase.from('edificios_modelos').select('id').eq('activo', true);
          if (edificioIdsForFilter.length > 0) {
            emQuery = emQuery.in('id_edificio', edificioIdsForFilter);
          }
          if (selectedModelos.length > 0 || recamarasFilter || banosFilter) {
            if (modeloIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
            emQuery = emQuery.in('id_modelo', modeloIdsForFilter);
          }
          
          const { data: matchingEMs } = await emQuery;
          const emIdsForFilter = matchingEMs?.map(em => em.id) || [];
          
          if (emIdsForFilter.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          query = query.in('id_edificio_modelo', emIdsForFilter);
        }
        
        if (disponibilidadFilter.length > 0) {
          // Convert filter names to IDs for direct filtering
          const selectedIds = availabilityOptions?.filter(opt => disponibilidadFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (selectedIds.length > 0) {
            query = query.in('id_estatus_disponibilidad', selectedIds);
          }
        } else if (!isSuperAdmin && allowedEstatusIds && allowedEstatusIds.length > 0) {
          query = query.in('id_estatus_disponibilidad', allowedEstatusIds);
        }
        // Note: If allowedEstatusIds is empty or null, no status filter is applied (show all)
        
        // Filter by tipo de transaccion
        if (tipoTransaccionFilter.length > 0) {
          const tipoIds = tiposTransaccionOptions?.filter(opt => tipoTransaccionFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (tipoIds.length > 0) {
            query = query.in('id_tipo_transaccion', tipoIds);
          }
        }

        // PRE-FILTER: If cuentaCobranzaFilter is set, get property IDs with/without cuentas first
        let propertyIdsWithCuentas: number[] = [];
        if (cuentaCobranzaFilter !== "") {
          const { data: propCuentasData } = await supabase
            .from('cuentas_cobranza')
            .select('ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .eq('activo', true)
            .is('ofertas.id_producto', null); // Only property accounts
          
          propertyIdsWithCuentas = [...new Set(propCuentasData?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [])];
          
          if (cuentaCobranzaFilter === "si") {
            if (propertyIdsWithCuentas.length === 0) {
              return { properties: [], count: 0, filteredCount: 0 };
            }
            query = query.in('id', propertyIdsWithCuentas);
          }
        }

        // Determine if we need full fetch for local filtering
        const needsFullFetch =
          bodegasFilter !== "" ||
          estacionamientosFilter !== "" ||
          (cuentaCobranzaFilter === "no" && propertyIdsWithCuentas.length > 0) ||
          areaFilter[0] !== 0 ||
          areaFilter[1] !== 500 ||
          precioFilter[0] !== 0 ||
          precioFilter[1] !== 100000000 ||
          precioSort !== null;

        let enrichedData;
        let totalCount;

        if (needsFullFetch) {
          // Fetch up to 1000 records for local filtering
          const { data, error } = await query.range(0, 999);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // Apply all client-side filters
          const filtered = dataWithSozu.filter(property => {
            const matchesBodegas = bodegasFilter === "" || 
              (bodegasFilter === "con_bodegas" && property.bodegas_count > 0) ||
              (bodegasFilter === "sin_bodegas" && property.bodegas_count === 0);
            const matchesEstacionamientos = estacionamientosFilter === "" || 
              (estacionamientosFilter === "con_estacionamientos" && property.estacionamientos_count > 0) ||
              (estacionamientosFilter === "sin_estacionamientos" && property.estacionamientos_count === 0);
            const matchesCuentaCobranza = cuentaCobranzaFilter === "" ||
              (cuentaCobranzaFilter === "si" && property.cuenta_cobranza_id !== null) ||
              (cuentaCobranzaFilter === "no" && property.cuenta_cobranza_id === null);
            const matchesArea = property.m2_reales >= areaFilter[0] && property.m2_reales <= areaFilter[1];
            const matchesPrecio = property.precio_lista >= precioFilter[0] && property.precio_lista <= precioFilter[1];
            
            return matchesBodegas && matchesEstacionamientos && matchesCuentaCobranza && matchesArea && matchesPrecio;
          });

          // Apply sorting if active
          let sortedFiltered = filtered;
          if (precioSort) {
            sortedFiltered = [...filtered].sort((a, b) => {
              const precioA = a.precio_lista || 0;
              const precioB = b.precio_lista || 0;
              return precioSort === 'asc' ? precioA - precioB : precioB - precioA;
            });
          }

          // Apply local pagination
          const paginatedData = sortedFiltered.slice(from, from + itemsPerPage);
          totalCount = sortedFiltered.length;

          return { properties: paginatedData, count: totalCount, filteredCount: sortedFiltered.length };
        } else {
          // Use server-side pagination for better performance
          const { data, error, count } = await query.range(from, to);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // When needsFullFetch is false, filters are at defaults, no client-side filtering needed
          // Use server count directly since no additional filtering is applied
          return { properties: dataWithSozu, count: count || 0, filteredCount: count || 0 };
        }
      } catch (error) {
        console.error('Error fetching draft properties:', error);
        return { properties: [], count: 0 };
      }
    },
    enabled: !isLoadingAccess && !isLoadingPermissions && (canUpdate || isSuperAdmin),
  });

  const { data: propiedadesEliminadasData, isLoading: loadingEliminados, refetch: refetchEliminados } = useQuery({
    queryKey: ['properties-eliminados', currentPageDeleted, searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, tipoTransaccionFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter, areaFilter, precioFilter, precioSort, accessibleProjectIds, hasUnrestrictedAccess, allowedEstatusIds, isRepresentanteEmpresaDuena, ownershipEntityIds, accessiblePropertyIds],
    queryFn: async () => {
      try {
        const from = (currentPageDeleted - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        // For eliminados we need to get property IDs separately since activo = false
        let deletedPropertyIds: number[] | null = null;
        if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
          // Get edificios that belong to accessible projects
          const { data: edificiosData } = await supabase
            .from('edificios')
            .select('id')
            .in('id_proyecto', accessibleProjectIds)
            .eq('activo', true);
          
          if (!edificiosData || edificiosData.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          const edificioIds = edificiosData.map(e => e.id);
          
          // Get edificios_modelos for these edificios
          const { data: edificiosModelosData } = await supabase
            .from('edificios_modelos')
            .select('id')
            .in('id_edificio', edificioIds)
            .eq('activo', true);
          
          if (!edificiosModelosData || edificiosModelosData.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          const edificioModeloIds = edificiosModelosData.map(em => em.id);
          
          // Get deleted property IDs
          let propQuery = supabase
            .from('propiedades')
            .select('id')
            .in('id_edificio_modelo', edificioModeloIds)
            .eq('activo', false)
            .eq('es_aprobado', false);
          
          if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
            propQuery = propQuery.in('id_entidad_relacionada_dueno', ownershipEntityIds);
          }
          
          const { data: propsData } = await propQuery;
          deletedPropertyIds = propsData?.map(p => p.id) || [];
          
          if (deletedPropertyIds.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
        }

        let query = supabase
          .from('propiedades')
          .select(`
            id,
            numero_propiedad,
            numero_piso,
            m2_interiores,
            m2_exteriores,
            precio_lista,
            monto_apartado,
            monto_apartado_pagando,
            clabe_stp_tmp_apartado,
            id_entidad_relacionada_dueno,
            id_estatus_disponibilidad,
            id_tipo_transaccion,
            activo,
            es_aprobado,
            id_edificio_modelo,
            id_vista
          `, { count: 'exact' })
          .eq('activo', false)
          .eq('es_aprobado', false);

        // Apply pre-computed property ID filter for restricted users
        if (deletedPropertyIds && deletedPropertyIds.length > 0) {
          query = query.in('id', deletedPropertyIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length > 0) {
          query = query.in('id_entidad_relacionada_dueno', ownershipEntityIds);
        } else if (isRepresentanteEmpresaDuena && ownershipEntityIds.length === 0) {
          return { items: [], count: 0, totalPages: 0 };
        }

        // Apply filters on server-side
        if (searchTerm) {
          // Find property IDs that have cuentas_cobranza with matching clabe_stp
          const { data: matchingCuentas } = await supabase
            .from('cuentas_cobranza')
            .select('id_oferta, ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .ilike('clabe_stp', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propertyIdsFromCuentas = matchingCuentas?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [];
          
          // Find edificio_modelo IDs by project name
          const { data: matchingProyectos } = await supabase
            .from('proyectos')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const proyectoIds = matchingProyectos?.map((p: any) => p.id) || [];
          
          // Find edificio_modelo IDs by building name
          const { data: matchingEdificios } = await supabase
            .from('edificios')
            .select('id')
            .ilike('nombre', `%${searchTerm}%`)
            .eq('activo', true);
          
          const edificioIds = matchingEdificios?.map((e: any) => e.id) || [];
          
          // Get edificio_modelo IDs for matching projects and buildings
          let edificioModeloIdsFromSearch: number[] = [];
          if (proyectoIds.length > 0 || edificioIds.length > 0) {
            let emQuery = supabase.from('edificios').select('id').eq('activo', true);
            if (proyectoIds.length > 0) {
              emQuery = emQuery.in('id_proyecto', proyectoIds);
            }
            const { data: edificiosFromProjects } = await emQuery;
            const allEdificioIds = [...new Set([...edificioIds, ...(edificiosFromProjects?.map(e => e.id) || [])])];
            
            if (allEdificioIds.length > 0) {
              const { data: matchingEMs } = await supabase
                .from('edificios_modelos')
                .select('id')
                .in('id_edificio', allEdificioIds)
                .eq('activo', true);
              edificioModeloIdsFromSearch = matchingEMs?.map(em => em.id) || [];
            }
          }
          
          // Find property IDs by owner name (propietario)
          const { data: matchingPropietarios } = await supabase
            .from('entidades_relacionadas')
            .select('id, personas!entidades_relacionadas_id_persona_fkey!inner(nombre_legal)')
            .ilike('personas.nombre_legal', `%${searchTerm}%`)
            .eq('activo', true);
          
          const propietarioEntityIds = matchingPropietarios?.map((p: any) => p.id) || [];
          
          // Build OR query including all search criteria
          let orConditions = [`numero_propiedad.ilike.%${searchTerm}%`, `clabe_stp_tmp_apartado.ilike.%${searchTerm}%`];
          
          if (propertyIdsFromCuentas.length > 0) {
            orConditions.push(`id.in.(${propertyIdsFromCuentas.join(',')})`);
          }
          
          if (edificioModeloIdsFromSearch.length > 0) {
            orConditions.push(`id_edificio_modelo.in.(${edificioModeloIdsFromSearch.join(',')})`);
          }
          
          if (propietarioEntityIds.length > 0) {
            orConditions.push(`id_entidad_relacionada_dueno.in.(${propietarioEntityIds.join(',')})`);
          }
          
          query = query.or(orConditions.join(','));
        }
        
        // Note: Project access and ownership filters already applied early
        
        // Pre-compute edificio_modelo IDs for project/model/recamaras/banos filters
        if (selectedProyectos.length > 0 || selectedModelos.length > 0 || recamarasFilter || banosFilter) {
          // Step 1: Get edificio IDs from selected projects
          let edificioIdsForFilter: number[] = [];
          if (selectedProyectos.length > 0) {
            const { data: edificiosFromProjects } = await supabase
              .from('edificios')
              .select('id')
              .in('id_proyecto', selectedProyectos)
              .eq('activo', true);
            edificioIdsForFilter = edificiosFromProjects?.map(e => e.id) || [];
            if (edificioIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
          }
          
          // Step 2: Build modelo filter query
          let modeloQuery = supabase.from('modelos').select('id').eq('activo', true);
          if (selectedModelos.length > 0) {
            modeloQuery = modeloQuery.in('id', selectedModelos);
          }
          if (recamarasFilter) {
            if (recamarasFilter === '4+') {
              modeloQuery = modeloQuery.gte('numero_recamaras', 4);
            } else {
              const recamaras = parseInt(recamarasFilter);
              if (!isNaN(recamaras)) {
                modeloQuery = modeloQuery.eq('numero_recamaras', recamaras);
              }
            }
          }
          if (banosFilter) {
            const banos = parseInt(banosFilter);
            if (!isNaN(banos)) {
              modeloQuery = modeloQuery.eq('numero_completo_banos', banos);
            }
          }
          
          const { data: matchingModelos } = await modeloQuery;
          const modeloIdsForFilter = matchingModelos?.map(m => m.id) || [];
          
          // Step 3: Get edificios_modelos that match both filters
          let emQuery = supabase.from('edificios_modelos').select('id').eq('activo', true);
          if (edificioIdsForFilter.length > 0) {
            emQuery = emQuery.in('id_edificio', edificioIdsForFilter);
          }
          if (selectedModelos.length > 0 || recamarasFilter || banosFilter) {
            if (modeloIdsForFilter.length === 0) {
              return { items: [], count: 0, totalPages: 0 };
            }
            emQuery = emQuery.in('id_modelo', modeloIdsForFilter);
          }
          
          const { data: matchingEMs } = await emQuery;
          const emIdsForFilter = matchingEMs?.map(em => em.id) || [];
          
          if (emIdsForFilter.length === 0) {
            return { items: [], count: 0, totalPages: 0 };
          }
          
          query = query.in('id_edificio_modelo', emIdsForFilter);
        }
        
        if (disponibilidadFilter.length > 0) {
          // Convert filter names to IDs for direct filtering
          const selectedIds = availabilityOptions?.filter(opt => disponibilidadFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (selectedIds.length > 0) {
            query = query.in('id_estatus_disponibilidad', selectedIds);
          }
        } else if (!isSuperAdmin && allowedEstatusIds && allowedEstatusIds.length > 0) {
          query = query.in('id_estatus_disponibilidad', allowedEstatusIds);
        }
        // Note: If allowedEstatusIds is empty or null, no status filter is applied (show all)
        
        // Filter by tipo de transaccion
        if (tipoTransaccionFilter.length > 0) {
          const tipoIds = tiposTransaccionOptions?.filter(opt => tipoTransaccionFilter.includes(opt.nombre)).map(opt => opt.id) || [];
          if (tipoIds.length > 0) {
            query = query.in('id_tipo_transaccion', tipoIds);
          }
        }

        // PRE-FILTER: If cuentaCobranzaFilter is set, get property IDs with/without cuentas first
        let propertyIdsWithCuentas: number[] = [];
        if (cuentaCobranzaFilter !== "") {
          const { data: propCuentasData } = await supabase
            .from('cuentas_cobranza')
            .select('ofertas!fk_cuentas_cobranza_oferta!inner(id_propiedad)')
            .eq('activo', true)
            .is('ofertas.id_producto', null); // Only property accounts
          
          propertyIdsWithCuentas = [...new Set(propCuentasData?.map((c: any) => c.ofertas?.id_propiedad).filter(Boolean) || [])];
          
          if (cuentaCobranzaFilter === "si") {
            if (propertyIdsWithCuentas.length === 0) {
              return { properties: [], count: 0, filteredCount: 0 };
            }
            query = query.in('id', propertyIdsWithCuentas);
          }
        }

        // Determine if we need full fetch for local filtering
        const needsFullFetch =
          bodegasFilter !== "" ||
          estacionamientosFilter !== "" ||
          (cuentaCobranzaFilter === "no" && propertyIdsWithCuentas.length > 0) ||
          areaFilter[0] !== 0 ||
          areaFilter[1] !== 500 ||
          precioFilter[0] !== 0 ||
          precioFilter[1] !== 100000000 ||
          precioSort !== null;

        let enrichedData;
        let totalCount;

        if (needsFullFetch) {
          // Fetch up to 1000 records for local filtering
          const { data, error } = await query.range(0, 999);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // Apply all client-side filters
          const filtered = dataWithSozu.filter(property => {
            const matchesBodegas = bodegasFilter === "" || 
              (bodegasFilter === "con_bodegas" && property.bodegas_count > 0) ||
              (bodegasFilter === "sin_bodegas" && property.bodegas_count === 0);
            const matchesEstacionamientos = estacionamientosFilter === "" || 
              (estacionamientosFilter === "con_estacionamientos" && property.estacionamientos_count > 0) ||
              (estacionamientosFilter === "sin_estacionamientos" && property.estacionamientos_count === 0);
            const matchesCuentaCobranza = cuentaCobranzaFilter === "" ||
              (cuentaCobranzaFilter === "si" && property.cuenta_cobranza_id !== null) ||
              (cuentaCobranzaFilter === "no" && property.cuenta_cobranza_id === null);
            const matchesArea = property.m2_reales >= areaFilter[0] && property.m2_reales <= areaFilter[1];
            const matchesPrecio = property.precio_lista >= precioFilter[0] && property.precio_lista <= precioFilter[1];
            
            return matchesBodegas && matchesEstacionamientos && matchesCuentaCobranza && matchesArea && matchesPrecio;
          });

          // Apply sorting if active
          let sortedFiltered = filtered;
          if (precioSort) {
            sortedFiltered = [...filtered].sort((a, b) => {
              const precioA = a.precio_lista || 0;
              const precioB = b.precio_lista || 0;
              return precioSort === 'asc' ? precioA - precioB : precioB - precioA;
            });
          }

          // Apply local pagination
          const paginatedData = sortedFiltered.slice(from, from + itemsPerPage);
          totalCount = sortedFiltered.length;

          return { properties: paginatedData, count: totalCount, filteredCount: sortedFiltered.length };
        } else {
          // Use server-side pagination for better performance
          const { data, error, count } = await query.range(from, to);
          
          if (error) throw error;

          enrichedData = await enrichPropertiesData(data || []);
          
          // Check which projects have "Real Estate Ventures" (Sozu) as Inmobiliaria
          const projectIds = [...new Set(enrichedData.map((p: any) => p.proyecto_id).filter(Boolean))] as number[];
          const projectsWithSozu = new Set<number>();
          
          if (projectIds.length > 0) {
            const { data: sozuEntities } = await supabase
              .from('entidades_relacionadas')
              .select('id_proyecto, id_persona, tipos_entidad!inner(id)')
              .in('id_proyecto', projectIds)
              .eq('tipos_entidad.id', 5) // 5 = Inmobiliaria
              .eq('activo', true);
            
            if (sozuEntities) {
              const personaIds = [...new Set(sozuEntities.map((e: any) => e.id_persona))];
              const { data: sozuPersonas } = await supabase
                .from('personas')
                .select('id')
                .in('id', personaIds)
                .ilike('nombre_legal', '%Real Estate Ventures%')
                .eq('activo', true);
              
              if (sozuPersonas && sozuPersonas.length > 0) {
                const sozuPersonaIds = new Set(sozuPersonas.map((p: any) => p.id));
                sozuEntities.forEach((entity: any) => {
                  if (sozuPersonaIds.has(entity.id_persona)) {
                    projectsWithSozu.add(entity.id_proyecto);
                  }
                });
              }
            }
          }
          
          // Add tiene_sozu_como_inmobiliaria flag to each property
          const dataWithSozu = enrichedData.map((property: any) => ({
            ...property,
            tiene_sozu_como_inmobiliaria: projectsWithSozu.has(property.proyecto_id)
          }));
          
          // When needsFullFetch is false, filters are at defaults, no client-side filtering needed
          // Use server count directly since no additional filtering is applied
          return { properties: dataWithSozu, count: count || 0, filteredCount: count || 0 };
        }
      } catch (error) {
        console.error('Error fetching deleted properties:', error);
        return { properties: [], count: 0 };
      }
    },
    enabled: !isLoadingAccess && !isLoadingPermissions && canSeeAdvancedFilters,
  });

  const activeProperties = propiedadesActivasData?.properties || [];
  const totalActivosCount = propiedadesActivasData?.count || 0;
  const filteredActivosCount = propiedadesActivasData?.filteredCount ?? totalActivosCount;
  const draftProperties = propiedadesDraftData?.properties || [];
  const totalDraftCount = propiedadesDraftData?.count || 0;
  const filteredDraftCount = propiedadesDraftData?.filteredCount ?? totalDraftCount;
  const inactiveProperties = propiedadesEliminadasData?.properties || [];
  const totalEliminadosCount = propiedadesEliminadasData?.count || 0;
  const filteredEliminadosCount = propiedadesEliminadasData?.filteredCount ?? totalEliminadosCount;

  // Ya no necesitamos ordenar aquí porque el ordenamiento se aplica dentro de las queries
  const sortedActiveProperties = activeProperties;
  const sortedDraftProperties = draftProperties;
  const sortedInactiveProperties = inactiveProperties;

  const isLoading = activeTab === "activos" ? loadingActivos : activeTab === "draft" ? loadingDraft : loadingEliminados;

  // Maintain focus on search input after re-render
  useEffect(() => {
    if (inputValue && searchInputRef.current && !propiedadesActivasData && !propiedadesDraftData && !propiedadesEliminadasData) {
      searchInputRef.current.focus();
    }
  }, [propiedadesActivasData, propiedadesDraftData, propiedadesEliminadasData, inputValue]);

  // Reset pages when filters change
  useEffect(() => {
    setCurrentPageActive(1);
  }, [searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter]);

  useEffect(() => {
    setCurrentPageDraft(1);
  }, [searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter]);

  useEffect(() => {
    setCurrentPageDeleted(1);
  }, [searchTerm, selectedProyectos, selectedModelos, recamarasFilter, banosFilter, disponibilidadFilter, bodegasFilter, estacionamientosFilter, cuentaCobranzaFilter]);

  const { data: availabilityOptions } = useQuery({
    queryKey: ['availability-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Filter availability options based on role permissions
  const filteredAvailabilityOptions = availabilityOptions?.filter(option => {
    if (isSuperAdmin || allowedEstatusIds === null) return true;
    return allowedEstatusIds?.includes(option.id);
  }) || [];

  // Función para obtener ofertas de una propiedad específica
  const fetchPropertyOffers = async (propertyId: number) => {
    // Use the new database function to get offers with agent information
    const { data: offersData, error } = await supabase
      .rpc('get_offers_with_agent' as any, { property_id: propertyId });
    
    if (error) {
      console.error('Error fetching offers:', error);
      throw error;
    }

    // For each offer that has a cuenta_clabe_stp, get the cuenta_cobranza ID and fetch lead RFC
    const enrichedOffers = await Promise.all((offersData || []).map(async (offer: any) => {
      let enrichedOffer = { ...offer };
      
      // Get offer display options from ofertas table
      try {
        const { data: offerData, error: offerError } = await supabase
          .from('ofertas')
          .select('mostrar_piso_en_oferta, mostrar_precio_m2_en_oferta, mostrar_seccion_efectivo_en_oferta, id_estatus_aprobacion, estatus_aprobacion!ofertas_id_estatus_aprobacion_fkey(nombre)')
          .eq('id', offer.id)
          .single();
        
        if (!offerError && offerData) {
          enrichedOffer.mostrar_piso_en_oferta = offerData.mostrar_piso_en_oferta;
          enrichedOffer.mostrar_precio_m2_en_oferta = offerData.mostrar_precio_m2_en_oferta;
          enrichedOffer.mostrar_seccion_efectivo_en_oferta = offerData.mostrar_seccion_efectivo_en_oferta;
          enrichedOffer.id_estatus_aprobacion = offerData.id_estatus_aprobacion;
          enrichedOffer.estatus_aprobacion_nombre = (offerData as any).estatus_aprobacion?.nombre || null;
        }
      } catch (err) {
        console.warn('Error fetching display options for offer:', offer.id);
      }
      
      // Get cuenta_cobranza ID and status if available
      if (offer.cuenta_clabe_stp) {
        try {
          const { data: cuentaData, error: cuentaError } = await supabase
            .from('cuentas_cobranza')
            .select('id, activo')
            .eq('clabe_stp', offer.cuenta_clabe_stp)
            .single();
          
          if (!cuentaError && cuentaData) {
            enrichedOffer.cuenta_cobranza_id = cuentaData.id;
            enrichedOffer.cuenta_activo = cuentaData.activo;
          }
        } catch (err) {
          console.warn('Error fetching cuenta_cobranza ID for offer:', offer.id);
        }
      }
      
      // Get lead RFC from personas table
      if (offer.id_persona_lead) {
        try {
          const { data: personaData, error: personaError } = await supabase
            .from('personas')
            .select('rfc')
            .eq('id', offer.id_persona_lead)
            .single();
          
          if (!personaError && personaData) {
            enrichedOffer.lead_rfc = personaData.rfc;
          }
        } catch (err) {
          console.warn('Error fetching RFC for lead:', offer.id_persona_lead);
        }
      }
      
      // Get payment scheme info if esquema is selected
      if (offer.esquema_id) {
        try {
          const { data: schemeData, error: schemeError } = await supabase
            .from('esquemas_pago')
            .select('porcentaje_enganche, porcentaje_mensualidades, numero_mensualidades, porcentaje_entrega, porcentaje_descuento_aumento')
            .eq('id', offer.esquema_id)
            .single();
          
          if (!schemeError && schemeData) {
            enrichedOffer.esquema_porcentaje_enganche = schemeData.porcentaje_enganche;
            enrichedOffer.esquema_porcentaje_mensualidades = schemeData.porcentaje_mensualidades;
            enrichedOffer.esquema_numero_mensualidades = schemeData.numero_mensualidades;
            enrichedOffer.esquema_porcentaje_entrega = schemeData.porcentaje_entrega;
            enrichedOffer.porcentaje_descuento_aumento = schemeData.porcentaje_descuento_aumento;
          }
        } catch (err) {
          console.warn('Error fetching payment scheme for offer:', offer.id);
        }
      }
      
      return enrichedOffer;
    }));

    return enrichedOffers;
  };

  // Función para obtener ofertas de productos de una propiedad específica
  const fetchPropertyProductOffers = async (propertyId: number) => {
    const { data: offersData, error } = await supabase
      .from('ofertas')
      .select(`
        id,
        fecha_generacion,
        activo,
        id_persona_lead,
        email_creador,
        id_esquema_pago_seleccionado,
        id_producto,
        clabe_stp_tmp_producto,
        id_estatus_aprobacion,
        estatus_aprobacion!ofertas_id_estatus_aprobacion_fkey(nombre),
        productos_servicios!ofertas_id_producto_fkey(
          nombre, 
          precio_lista,
          id_categoria,
          categorias_producto!fk_prodserv_categoria(tiene_metraje)
        ),
        esquemas_pago!ofertas_id_esquema_pago_seleccionado_fkey(
          nombre,
          porcentaje_descuento_aumento,
          porcentaje_enganche,
          porcentaje_mensualidades,
          numero_mensualidades,
          porcentaje_entrega
        )
      `)
      .eq('id_propiedad', propertyId)
      .not('id_producto', 'is', null)
      .eq('activo', true)
      .order('fecha_generacion', { ascending: false });
    
    if (error) {
      console.error('Error fetching product offers:', error);
      throw error;
    }

    // Enrich offers with additional data
    const enrichedOffers = await Promise.all((offersData || []).map(async (offer: any) => {
      const producto = offer.productos_servicios;
      const tiene_metraje = producto?.categorias_producto?.tiene_metraje || false;
      
      // If product has metraje, get it from bodegas or estacionamientos
      let product_metraje = 0;
      if (tiene_metraje && offer.id_producto) {
        // Try to get metraje from bodegas
        const { data: bodegaData } = await supabase
          .from('bodegas')
          .select('m2')
          .eq('id_producto', offer.id_producto)
          .eq('id_propiedad', propertyId)
          .eq('activo', true)
          .maybeSingle();
        
        if (bodegaData?.m2) {
          product_metraje = bodegaData.m2;
        } else {
          // Try estacionamientos
          const { data: estacionamientoData } = await supabase
            .from('estacionamientos')
            .select('m2')
            .eq('id_producto', offer.id_producto)
            .eq('id_propiedad', propertyId)
            .eq('activo', true)
            .maybeSingle();
          
          if (estacionamientoData?.m2) {
            product_metraje = estacionamientoData.m2;
          }
        }
      }
      
      let enrichedOffer = {
        ...offer,
        product_name: producto?.nombre || 'N/A',
        product_precio_lista: producto?.precio_lista || 0,
        tiene_metraje: tiene_metraje,
        product_metraje: product_metraje,
        esquema_nombre: offer.esquemas_pago?.nombre || null,
        porcentaje_descuento_aumento: offer.esquemas_pago?.porcentaje_descuento_aumento || 0,
        esquema_porcentaje_enganche: offer.esquemas_pago?.porcentaje_enganche || 0,
        esquema_porcentaje_mensualidades: offer.esquemas_pago?.porcentaje_mensualidades || 0,
        esquema_numero_mensualidades: offer.esquemas_pago?.numero_mensualidades || 0,
        esquema_porcentaje_entrega: offer.esquemas_pago?.porcentaje_entrega || 0,
      };
      
      // Get cuenta_cobranza if available
      const { data: cuentaData } = await supabase
        .from('cuentas_cobranza')
        .select('id, activo, clabe_stp, precio_final')
        .eq('id_oferta', offer.id)
        .eq('activo', true)
        .maybeSingle();
      
      if (cuentaData) {
        enrichedOffer.cuenta_cobranza_id = cuentaData.id;
        enrichedOffer.cuenta_activo = cuentaData.activo;
        enrichedOffer.cuenta_clabe_stp = cuentaData.clabe_stp;
        enrichedOffer.cuenta_precio_final = cuentaData.precio_final;
      }
      
      // Get lead info and id_persona_duena_lead
      if (offer.id_persona_lead) {
        // First get basic persona info
        const { data: personaData } = await supabase
          .from('personas')
          .select('nombre_legal, email, telefono, rfc')
          .eq('id', offer.id_persona_lead)
          .maybeSingle();
        
        if (personaData) {
          enrichedOffer.lead_name = personaData.nombre_legal;
          enrichedOffer.lead_email = personaData.email;
          enrichedOffer.lead_telefono = personaData.telefono;
          enrichedOffer.lead_rfc = personaData.rfc;
        }
        
        // Get id_persona_duena_lead from entidades_relacionadas
        const { data: erData } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona_duena_lead')
          .eq('id_persona', offer.id_persona_lead)
          .in('id_tipo_entidad', [2, 7]) // Comprador o Prospecto
          .eq('activo', true)
          .maybeSingle();
        
        if (erData) {
          enrichedOffer.id_persona_duena_lead = erData.id_persona_duena_lead;
        }
      }
      
      // Get payment scheme info
      if (offer.id_esquema_pago_seleccionado) {
        const { data: schemeData } = await supabase
          .from('esquemas_pago')
          .select('nombre, es_manual, porcentaje_descuento_aumento, porcentaje_enganche, porcentaje_mensualidades, numero_mensualidades, porcentaje_entrega')
          .eq('id', offer.id_esquema_pago_seleccionado)
          .maybeSingle();
        
        if (schemeData) {
          enrichedOffer.esquema_nombre = schemeData.nombre;
          enrichedOffer.esquema_es_manual = schemeData.es_manual;
          enrichedOffer.porcentaje_descuento_aumento = schemeData.porcentaje_descuento_aumento;
          enrichedOffer.esquema_porcentaje_enganche = schemeData.porcentaje_enganche;
          enrichedOffer.esquema_porcentaje_mensualidades = schemeData.porcentaje_mensualidades;
          enrichedOffer.esquema_numero_mensualidades = schemeData.numero_mensualidades;
          enrichedOffer.esquema_porcentaje_entrega = schemeData.porcentaje_entrega;
        }
      }
      
      // Get product price and name if this is a product offer
      if (offer.id_producto) {
        const { data: productData } = await supabase
          .from('productos_servicios')
          .select('precio_lista, nombre')
          .eq('id', offer.id_producto)
          .maybeSingle();
        
        if (productData) {
          enrichedOffer.product_precio_lista = productData.precio_lista;
          enrichedOffer.product_name = productData.nombre;
        }
      }
      
      return enrichedOffer;
    }));

    return enrichedOffers;
  };

  // Función para obtener esquemas de pago disponibles para un proyecto
  const fetchAvailableSchemes = async (projectId: number) => {
    const { data, error } = await supabase
      .from('esquemas_pago')
      .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
      .eq('id_proyecto', projectId)
      .eq('es_manual', false)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching schemes:', error);
      return [];
    }

    return data || [];
  };

  // Función para obtener estacionamientos de una propiedad
  const fetchPropertyEstacionamientos = async (propertyId: number) => {
    const { data, error } = await supabase
      .from('estacionamientos')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre),
        productos_servicios!estacionamientos_id_producto_fkey(precio_lista)
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching estacionamientos:', error);
      return [];
    }

    return (data || []).map((item: any) => {
      const precioM2 = item.productos_servicios?.precio_lista ?? null;
      // precio_final = m2 * precio_m2 (si m2=0, resultado es 0)
      const precioFinal = precioM2 !== null ? Number(item.m2 || 0) * Number(precioM2) : null;
      return {
        id: item.id,
        nombre: item.nombre,
        tipo_nombre: item.tipos_estacionamiento?.nombre || 'N/A',
        m2: item.m2,
        ubicacion: item.ubicacion,
        precio_m2: precioM2,
        precio_final: precioFinal
      };
    });
  };

  // Función para obtener bodegas de una propiedad
  const fetchPropertyBodegas = async (propertyId: number) => {
    const { data, error } = await supabase
      .from('bodegas')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        productos_servicios!bodegas_id_producto_fkey(precio_lista)
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching bodegas:', error);
      return [];
    }

    return (data || []).map((item: any) => {
      const precioM2 = item.productos_servicios?.precio_lista ?? null;
      const precioFinal = precioM2 !== null && item.m2 ? Number(item.m2) * Number(precioM2) : null;
      return {
        id: item.id,
        nombre: item.nombre,
        m2: item.m2,
        ubicacion: item.ubicacion,
        precio_m2: precioM2,
        precio_final: precioFinal
      };
    });
  };

  const handleViewOffers = async (property: Property) => {
    if (!property.tieneOfertas) return;
    
    try {
      const [offers, schemes] = await Promise.all([
        fetchPropertyOffers(property.id),
        fetchAvailableSchemes(property.proyecto_id)
      ]);
      setSelectedPropertyOffers(offers);
      setSelectedPropertyId(property.id);
      setSelectedPropertyForOffers(property); // Guardar la propiedad completa
      setAvailableSchemes(schemes);
      setOffersDialogOpen(true);
    } catch (error) {
      console.error('Error fetching offers:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las ofertas",
        variant: "destructive",
      });
    }
  };

  const handleViewProductOffers = async (property: Property) => {
    if (!property.tieneOfertasProductos) return;
    
    try {
      const offers = await fetchPropertyProductOffers(property.id);
      setSelectedPropertyProductOffers(offers);
      setSelectedPropertyId(property.id);
      setSelectedPropertyForProductOffers(property);
      setProductOffersDialogOpen(true);
    } catch (error) {
      console.error('Error fetching product offers:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las ofertas de productos",
        variant: "destructive",
      });
    }
  };

  const handleViewEstacionamientos = async (property: Property) => {
    if (property.estacionamientos_count === 0) return;
    
    try {
      const estacionamientos = await fetchPropertyEstacionamientos(property.id);
      setSelectedPropertyEstacionamientos(estacionamientos);
      setSelectedPropertyForDetail(property);
      setEstacionamientosDialogOpen(true);
    } catch (error) {
      console.error('Error fetching estacionamientos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los estacionamientos",
        variant: "destructive",
      });
    }
  };

  const handleViewBodegas = async (property: Property) => {
    if (property.bodegas_count === 0) return;
    
    try {
      const bodegas = await fetchPropertyBodegas(property.id);
      setSelectedPropertyBodegas(bodegas);
      setSelectedPropertyForDetail(property);
      setBodegasDialogOpen(true);
    } catch (error) {
      console.error('Error fetching bodegas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las bodegas",
        variant: "destructive",
      });
    }
  };

  const handleSchemeSelection = async (offerId: number, schemeId: number) => {
    try {
      const { error } = await supabase
        .from('ofertas')
        .update({ id_esquema_pago_seleccionado: schemeId })
        .eq('id', offerId);

      if (error) {
        throw error;
      }

      toast({
        title: "Éxito",
        description: "Esquema de pago actualizado correctamente",
      });

      // Refresh the offers data
      if (selectedPropertyId) {
        const updatedOffers = await fetchPropertyOffers(selectedPropertyId);
        setSelectedPropertyOffers(updatedOffers);
      }

      // Check if this offer has a collection account and make webhook call
      const currentOffer = selectedPropertyOffers?.find(offer => offer.id === offerId);
      if (currentOffer?.cuenta_cobranza_id && currentOffer?.cuenta_es_aprobado) {
        try {
          const webhookResponse = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              siguiente_accion: "genera_acuerdo_para_cuenta_cobranza",
              id_oferta: offerId,
              id_propiedad: selectedPropertyId,
              id: currentOffer.cuenta_cobranza_id,
              clabe_stp: currentOffer.cuenta_clabe_stp || '',
              rfc_curp_ordenante: currentOffer?.lead_rfc || '',
              environment: ENVIRONMENT
            }),
          });

          if (webhookResponse.ok) {
            toast({
              title: "Acuerdo generado",
              description: "Se ha generado el acuerdo de pago para la cuenta de cobranza",
            });
          } else {
            console.error('Webhook response not ok:', webhookResponse.status);
          }
        } catch (webhookError) {
          console.error('Error calling webhook:', webhookError);
          // Don't show error toast to user as the main operation was successful
        }
      }

    } catch (error) {
      console.error('Error updating payment scheme:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el esquema de pago",
        variant: "destructive",
      });
    }
  };

  const handleGenerateCollectionAccount = async (offerId: number, propertyId: number) => {
    try {
      // Find the specific offer to get id_persona_lead
      const currentOffer = selectedPropertyOffers?.find(offer => offer.id === offerId) || 
                          selectedPropertyProductOffers?.find(offer => offer.id === offerId);
      
      if (!currentOffer) {
        throw new Error('No se encontró la oferta');
      }

      console.log('📋 Oferta encontrada:', currentOffer);

      // Determine if this is a product offer
      const isProductOffer = !!currentOffer.id_producto;
      
      // Get property details to get id_entidad_relacionada_dueno
      const allProperties = [...sortedActiveProperties, ...sortedDraftProperties, ...sortedInactiveProperties];
      const property = allProperties?.find(p => p.id === propertyId);
      const id_er_dueno = property?.id_entidad_relacionada_dueno;

      // Get precio_lista
      let precio_lista = 0;
      if (isProductOffer) {
        let precio_base = currentOffer.product_precio_lista || 0;
        
        // If product has metraje, multiply by the metraje
        if (currentOffer.tiene_metraje && currentOffer.product_metraje) {
          console.log('📐 Producto con metraje:', currentOffer.product_metraje, 'm2');
          console.log('💲 Precio por m2:', precio_base);
          precio_base = precio_base * currentOffer.product_metraje;
          console.log('💰 Precio calculado (precio_m2 × metraje):', precio_base);
        }
        
        precio_lista = precio_base;
      } else {
        precio_lista = property?.precio_lista || 0;
      }

      console.log('💰 Precio lista:', precio_lista);

      // Get porcentaje_descuento_aumento from payment scheme
      const porcentaje_descuento_aumento = currentOffer.porcentaje_descuento_aumento || 0;
      
      console.log('📊 Porcentaje descuento/aumento:', porcentaje_descuento_aumento);

      // Calculate precio_final
      const precio_final = precio_lista * (1 + porcentaje_descuento_aumento / 100);
      
      console.log('💵 Precio final calculado:', precio_final);
      
      // Get payment scheme data
      let esquema_data = {
        porcentaje_enganche: 0,
        porcentaje_mensualidades: 0,
        numero_mensualidades: 0,
        porcentaje_entrega: 0
      };

      if (isProductOffer) {
        // For product offers, use data already loaded from the query
        esquema_data = {
          porcentaje_enganche: currentOffer.esquema_porcentaje_enganche || 0,
          porcentaje_mensualidades: currentOffer.esquema_porcentaje_mensualidades || 0,
          numero_mensualidades: currentOffer.esquema_numero_mensualidades || 0,
          porcentaje_entrega: currentOffer.esquema_porcentaje_entrega || 0
        };
      } else {
        // For property offers, use data from currentOffer
        esquema_data = {
          porcentaje_enganche: currentOffer.esquema_porcentaje_enganche || 0,
          porcentaje_mensualidades: currentOffer.esquema_porcentaje_mensualidades || 0,
          numero_mensualidades: currentOffer.esquema_numero_mensualidades || 0,
          porcentaje_entrega: currentOffer.esquema_porcentaje_entrega || 0
        };
      }
      
      console.log('📋 Datos esquema:', esquema_data);
      
      // Calculate montos
      const monto_apartado = selectedPropertyForOffers?.monto_apartado || selectedPropertyForProductOffers?.monto_apartado || 0;
      const monto_enganche = precio_final * (esquema_data.porcentaje_enganche / 100);
      const monto_mensualidades = precio_final * (esquema_data.porcentaje_mensualidades / 100);
      const monto_entrega = precio_final * (esquema_data.porcentaje_entrega / 100);
      
      console.log('💸 Montos calculados:', {
        monto_enganche,
        monto_mensualidades,
        monto_entrega
      });
      
      // Build request body based on offer type
      let requestBody: any;
      
      if (isProductOffer) {
        // Body for product offers
        requestBody = {
          siguiente_accion: 'genera_cuenta_cobranza_producto_manual_por_oferta',
          id_oferta: offerId,
          id_propiedad: propertyId,
          id_persona_lead: currentOffer.id_persona_lead,
          clabe_stp: currentOffer.clabe_stp_tmp_producto || '',
          precio_final: precio_final,
          datos_propiedad: {
            porcentaje_enganche: esquema_data.porcentaje_enganche,
            monto_enganche: monto_enganche,
            porcentaje_mensualidades: esquema_data.porcentaje_mensualidades,
            monto_mensualidades: monto_mensualidades,
            numero_mensualidades: esquema_data.numero_mensualidades,
            porcentaje_entrega: esquema_data.porcentaje_entrega,
            monto_entrega: monto_entrega
          }
        };
      } else {
        // Body for property offers
        requestBody = {
          siguiente_accion: 'genera_cuenta_cobranza_manual_por_oferta',
          id_oferta: offerId,
          id_propiedad: propertyId,
          id_persona_lead: currentOffer.id_persona_lead,
          monto_apartado_pagando: monto_apartado,
          clabe_stp: selectedPropertyForOffers?.clabe_stp_tmp_apartado || '',
          rfc_curp_ordenante: currentOffer.lead_rfc || '',
          id_er_dueno: id_er_dueno,
          precio_final: precio_final,
          datos_propiedad: {
            porcentaje_enganche: esquema_data.porcentaje_enganche,
            monto_apartado: monto_apartado,
            monto_enganche: monto_enganche,
            porcentaje_mensualidades: esquema_data.porcentaje_mensualidades,
            monto_mensualidades: monto_mensualidades,
            numero_mensualidades: esquema_data.numero_mensualidades,
            porcentaje_entrega: esquema_data.porcentaje_entrega,
            monto_entrega: monto_entrega
          }
        };
      }
      
      console.log('🚀 Generando cuenta de cobranza:', requestBody);
      
      const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...requestBody,
          environment: ENVIRONMENT
        }),
      });

      if (!response.ok) {
        throw new Error('Error al generar cuenta de cobranza');
      }

      const responseData = await response.json().catch(() => ({}));

      // Si es oferta de propiedad (no producto), actualizar estatus a "Apartado" (4)
      if (!isProductOffer && propertyId) {
        const { error: updateError } = await supabase
          .from('propiedades')
          .update({ 
            id_estatus_disponibilidad: 4, // Apartado
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id', propertyId);

        if (updateError) {
          console.error('Error actualizando estatus de propiedad:', updateError);
        } else {
          console.log('✅ Propiedad actualizada a estatus Apartado (4)');
        }
      }

      // Registrar en log de actividad
      await registrarCreacion(
        'cuenta_cobranza',
        {
          id_oferta: offerId,
          id_propiedad: propertyId,
          id_persona_lead: currentOffer.id_persona_lead,
          precio_final: precio_final,
          tipo: isProductOffer ? 'producto' : 'propiedad',
          respuesta_servidor: responseData,
        },
        'generar_cuenta_cobranza_manual'
      );

      toast({
        title: "Éxito",
        description: "Cuenta de cobranza generada correctamente",
      });
      
      // Close confirmation dialog
      setConfirmGenerateAccountOpen(false);
      setSelectedOfferForAccount(null);
    } catch (error: any) {
      console.error('Error generating collection account:', error);
      
      // Registrar error en log de actividad
      await registrarCreacion(
        'cuenta_cobranza',
        {
          id_oferta: offerId,
          id_propiedad: propertyId,
        },
        'generar_cuenta_cobranza_manual',
        'error',
        error.message
      );

      toast({
        title: "Error",
        description: "No se pudo generar la cuenta de cobranza",
        variant: "destructive",
      });
      return; // Exit early on error
    }

    // Refresh data outside main try-catch to avoid false error logs
    try {
      if (selectedPropertyId) {
        const updatedOffers = await fetchPropertyOffers(selectedPropertyId);
        setSelectedPropertyOffers(updatedOffers);
        const updatedProductOffers = await fetchPropertyProductOffers(selectedPropertyId);
        setSelectedPropertyProductOffers(updatedProductOffers);
      }
      refetchActivos();
    } catch (refetchError) {
      console.error('Error refreshing data after account creation:', refetchError);
      // Don't show error toast or log - the main operation succeeded
    }
  };

  // Calculate pagination (use filtered counts when client-side filters are active)
  const hasClientSideFilters =
    bodegasFilter !== "" ||
    estacionamientosFilter !== "" ||
    cuentaCobranzaFilter !== "" ||
    areaFilter[0] !== 0 ||
    areaFilter[1] !== 500 ||
    precioFilter[0] !== 0 ||
    precioFilter[1] !== 100000000;

  const totalActivePage = Math.ceil((hasClientSideFilters ? filteredActivosCount : totalActivosCount) / itemsPerPage);
  const totalDraftPage = Math.ceil((hasClientSideFilters ? filteredDraftCount : totalDraftCount) / itemsPerPage);
  const totalInactivePage = Math.ceil((hasClientSideFilters ? filteredEliminadosCount : totalEliminadosCount) / itemsPerPage);

  const handleDelete = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false, es_aprobado: false })
        .eq('id', propertyId);

      if (error) throw error;

      // Registrar eliminación en log de actividades
      await registrarEliminacion('propiedades', {
        id_propiedad: propertyId,
        tipo: 'individual'
      }, 'eliminar_propiedad');

      toast({
        title: "Propiedad eliminada",
        description: "La propiedad se ha marcado como inactiva correctamente.",
      });

      refetchActivos();
      refetchDraft();
      refetchEliminados();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: true, es_aprobado: false })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad restaurada",
        description: "La propiedad se ha reactivado correctamente y está en Draft.",
      });

      refetchActivos();
      refetchDraft();
      refetchEliminados();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo restaurar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .eq('id', propertyId);

      if (error) throw error;

      // Registrar aprobación en log de actividades
      await registrarAprobacion('propiedades', {
        id_propiedad: propertyId,
        tipo: 'individual'
      }, 'aprobar_propiedad');

      toast({
        title: "Propiedad aprobada",
        description: "La propiedad se ha aprobado correctamente.",
      });

      refetchActivos();
      refetchDraft();
      refetchEliminados();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo aprobar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleBulkApprove = async () => {
    if (selectedProperties.length === 0) return;

    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .in('id', selectedProperties);

      if (error) throw error;

      // Registrar aprobación masiva en log de actividades
      await registrarAprobacion('propiedades', {
        ids_propiedades: selectedProperties,
        cantidad: selectedProperties.length,
        tipo: 'masivo'
      }, 'aprobar_propiedades_masivo');

      toast({
        title: "Propiedades aprobadas",
        description: `${selectedProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      refetchActivos();
      refetchDraft();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron aprobar las propiedades seleccionadas.",
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProperties.length === 0) return;

    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false, es_aprobado: false })
        .in('id', selectedProperties);

      if (error) throw error;

      // Registrar eliminación masiva en log de actividades
      await registrarEliminacion('propiedades', {
        ids_propiedades: selectedProperties,
        cantidad: selectedProperties.length
      }, 'eliminar_propiedades_masivo');

      toast({
        title: "Propiedades eliminadas",
        description: `${selectedProperties.length} propiedades han sido eliminadas correctamente.`,
      });

      setSelectedProperties([]);
      refetchActivos();
      refetchDraft();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron eliminar las propiedades seleccionadas.",
        variant: "destructive",
      });
    }
  };

  const handleApproveAllVisible = async () => {
    if (draftProperties.length === 0) return;

    try {
      const propertyIds = sortedDraftProperties.map(p => p.id);
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .in('id', propertyIds);

      if (error) throw error;

      // Registrar aprobación masiva en log de actividades
      await registrarAprobacion('propiedades', {
        ids_propiedades: propertyIds,
        cantidad: propertyIds.length,
        tipo: 'todas_visibles'
      }, 'aprobar_propiedades_todas_visibles');

      toast({
        title: "Propiedades aprobadas",
        description: `${sortedDraftProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      refetchActivos();
      refetchDraft();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron aprobar todas las propiedades visibles.",
        variant: "destructive",
      });
    }
  };

  const handleSelectProperty = (propertyId: number) => {
    setSelectedProperties(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = (properties: Property[]) => {
    const currentTabProperties = properties.map(p => p.id);
    const allSelected = currentTabProperties.every(id => selectedProperties.includes(id));
    
    if (allSelected) {
      setSelectedProperties(prev => prev.filter(id => !currentTabProperties.includes(id)));
    } else {
      setSelectedProperties(prev => [...new Set([...prev, ...currentTabProperties])]);
    }
  };

  const formatCurrency = (amount: number) => {
    // Eliminate -0 before formatting
    let value = +amount.toFixed(2);
    if (Math.abs(value) < 0.01) value = 0;
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(value);
  };

  const formatConfiguracion = (config: Property['configuracion_modelo']) => {
    return (
      <div className="text-sm">
        <div>{config.numero_recamaras} rec,</div>
        <div>{config.numero_completo_banos} baños,</div>
        <div>{config.numero_medio_bano} 1/2 baños</div>
      </div>
    );
  };

  const formatPrecioPorM2 = (precio: number, m2Interiores: number, m2Exteriores: number) => {
    const totalM2 = (m2Interiores || 0) + (m2Exteriores || 0);
    if (totalM2 === 0) return 'N/A';
    return formatCurrency(precio / totalM2);
  };

  const handlePropertyAdded = () => {
    refetchActivos();
    refetchDraft();
    setCurrentPageActive(1);
    setCurrentPageDraft(1);
  };

  // Helper function to generate pagination items with ellipsis
  const getPaginationItems = (currentPage: number, totalPages: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7; // Maximum number of page buttons to show
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      return Array.from({ length: totalPages }, (_, i) => i + 1);
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

    return (
      <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {getPaginationItems(currentPage, totalPages).map((item, index) => (
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    onClick={() => onPageChange(item as number)}
                    isActive={currentPage === item}
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            ))}
            <PaginationItem>
              <PaginationNext 
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  const renderPropertiesTable = (propertiesToRender: Property[], tabType: string) => (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {tabType === "draft" && (
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={propertiesToRender.length > 0 && propertiesToRender.every(p => selectedProperties.includes(p.id))}
                    onChange={() => handleSelectAll(propertiesToRender)}
                    className="rounded"
                  />
                </TableHead>
              )}
              {orderedColumns.map((column) => 
                isColumnVisible(column.key) && <TableHead key={column.key}>{column.label}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
          {propertiesToRender.length === 0 ? (
              <TableRow>
              <TableCell colSpan={visibleCount + (tabType === "draft" ? 1 : 0)} className="text-center py-6">
                  {searchTerm || selectedProyectos.length > 0 || selectedModelos.length > 0 || recamarasFilter || banosFilter || disponibilidadFilter.length > 0 || bodegasFilter || estacionamientosFilter || cuentaCobranzaFilter
                    ? "No se encontraron resultados." 
                    : tabType === "eliminados"
                      ? "No hay propiedades eliminadas." 
                      : tabType === "draft"
                        ? "No hay propiedades en draft."
                        : "No hay propiedades activas."
                  }
                </TableCell>
              </TableRow>
            ) : (
              propertiesToRender.map((property) => (
                <TableRow 
                  key={property.id} 
                  className={`
                    ${tabType === "eliminados" ? "opacity-60" : ""}
                    ${property.id_estatus_disponibilidad === 11 ? "bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50" : ""}
                  `}
                >
                  {tabType === "draft" && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedProperties.includes(property.id)}
                        onChange={() => handleSelectProperty(property.id)}
                        className="rounded"
                      />
                    </TableCell>
                  )}
                  {orderedColumns.map((column) => {
                    if (!isColumnVisible(column.key)) return null;
                    
                    switch (column.key) {
                      case 'proyecto':
                        return <TableCell key={column.key} className="font-medium">{property.proyecto}</TableCell>;
                      
                      case 'propietario':
                        // Check if property is Reventa (ID 2), has maintenance account (has been transferred to buyer) OR specific status
                        const esReventa = property.id_tipo_transaccion === 2;
                        // Solo mostrar comprador si el estatus es: 9 (Pagada completamente), 7 (Escrituración), 8 (Entregado), 10 (Asignado)
                        const estatusParaMostrarComprador = [9, 7, 8, 10];
                        // Para Reventa, siempre mostrar propietario_actual (comprador anterior) si existe y es diferente al desarrollador
                        // Mostrar comprador si es Reventa (con comprador anterior) O tiene cuenta de mantenimiento O si está en estatus Asignado (10)
                        const mostrarComoComprador = (esReventa && property.propietario_actual && property.propietario_actual !== property.propietario_original) || 
                          ((property.tiene_cuenta_pagada || property.id_estatus_disponibilidad === 10) && 
                          estatusParaMostrarComprador.includes(property.id_estatus_disponibilidad) &&
                          property.propietario_actual && property.propietario_actual !== property.propietario_original);
                        return (
                          <TableCell key={column.key}>
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                {/* Si es Reventa O tiene cuenta de mantenimiento O estatus Asignado, mostrar nombre del comprador */}
                                {mostrarComoComprador ? (
                                  <>
                                    <span className="font-medium">{property.propietario_actual || property.propietario}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {esReventa ? "(Propietario anterior)" : "(Comprador)"}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {/* Solo mostrar dueño original */}
                                    <span>{property.propietario_original}</span>
                                    {property.es_desarrollador && (
                                      <span className="text-muted-foreground text-xs">(Desarrollador)</span>
                                    )}
                                  </>
                                )}
                              </div>
                              {(mostrarComoComprador || esReventa) && (
                                <OwnerHistoryDialog
                                  propertyId={property.id}
                                  numeroPropiedad={property.numero_propiedad}
                                  propietarioOriginal={property.propietario_original}
                                  esPropietarioActualComprador={mostrarComoComprador}
                                  idEstatusDisponibilidad={property.id_estatus_disponibilidad}
                                  idTipoTransaccion={property.id_tipo_transaccion}
                                  nombreTipoTransaccion={property.tipo_transaccion}
                                />
                              )}
                            </div>
                          </TableCell>
                        );
                      
                      case 'edificio':
                        return <TableCell key={column.key}>{property.edificio}</TableCell>;
                      
                      case 'modelo':
                        return (
                          <TableCell key={column.key}>
                            <Badge variant="outline">{property.modelo}</Badge>
                          </TableCell>
                        );
                      
                      case 'numero_departamento':
                        return <TableCell key={column.key}>{property.numero_propiedad}</TableCell>;
                      
                      case 'piso':
                        return <TableCell key={column.key}>{property.numero_piso}</TableCell>;
                      
                      case 'vista':
                        return <TableCell key={column.key}>{property.vista}</TableCell>;
                      
                      case 'area':
                        return (
                          <TableCell key={column.key}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span>{((property.m2_interiores || 0) + (property.m2_exteriores || 0)).toFixed(2)} m²</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Home className="h-3 w-3" />
                                <span>M2 interiores: {(property.m2_interiores || 0).toFixed(2)} m²</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Home className="h-3 w-3" />
                                <span>M2 exteriores: {(property.m2_exteriores || 0).toFixed(2)} m²</span>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        );
                      
                      case 'configuracion':
                        return <TableCell key={column.key} className="text-sm">{formatConfiguracion(property.configuracion_modelo)}</TableCell>;
                      
                      case 'tipo_transaccion':
                        return (
                          <TableCell key={column.key}>
                            <Badge variant="outline">{property.tipo_transaccion}</Badge>
                          </TableCell>
                        );
                      
                      case 'precio':
                        // Para Reventa (ID 2), siempre mostrar precio_lista
                        const precioReventa = property.id_tipo_transaccion === 2;
                        return (
                          <TableCell key={column.key}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            {precioReventa ? (
                              <span>{formatCurrency(property.precio_lista)}</span>
                            ) : property.precio_final ? (
                              <span>{formatCurrency(property.precio_final)}</span>
                            ) : (
                              <span>{formatCurrency(property.precio_lista)}</span>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{precioReventa ? 'Precio de lista (Reventa)' : property.precio_final ? 'Precio final' : 'Precio de lista'}</p>
                          </TooltipContent>
                        </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        );
                      
                      case 'precio_m2':
                        // Para Reventa (ID 2), usar precio_lista en lugar de precio_final
                        const precioParaM2 = property.id_tipo_transaccion === 2 
                          ? property.precio_lista 
                          : (property.precio_final || property.precio_lista);
                        return (
                          <TableCell key={column.key}>
                            {formatPrecioPorM2(
                              precioParaM2,
                              property.m2_interiores,
                              property.m2_exteriores
                            )}
                          </TableCell>
                        );
                      
                      case 'estacionamientos':
                        return (
                          <TableCell key={column.key}>
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => handleViewEstacionamientos(property)}
                       disabled={property.estacionamientos_count === 0}
                       className="p-0 h-auto font-normal"
                     >
                       <Badge 
                         variant={property.estacionamientos_count > 0 ? "default" : "outline"}
                         className={property.estacionamientos_count > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                       >
                         {property.estacionamientos_count > 0 ? property.estacionamientos_count : "No"}
                         {property.estacionamientos_count > 0 && <Car className="ml-1 h-3 w-3" />}
                            </Badge>
                          </Button>
                          </TableCell>
                        );
                      
                      case 'bodegas':
                        return (
                          <TableCell key={column.key}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewBodegas(property)}
                        disabled={property.bodegas_count === 0}
                        className="p-0 h-auto font-normal"
                      >
                        <Badge 
                          variant={property.bodegas_count > 0 ? "default" : "outline"}
                          className={property.bodegas_count > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                        >
                          {property.bodegas_count > 0 ? property.bodegas_count : "No"}
                          {property.bodegas_count > 0 && <Warehouse className="ml-1 h-3 w-3" />}
                            </Badge>
                          </Button>
                          </TableCell>
                        );
                      
                      case 'ofertas_comerciales':
                        return (
                          <TableCell key={column.key}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewOffers(property)}
                        disabled={!property.tieneOfertas}
                        className="p-0 h-auto font-normal"
                      >
                        <Badge 
                          variant={property.tieneOfertas ? "default" : "outline"}
                          className={property.tieneOfertas ? "cursor-pointer hover:bg-primary/80" : ""}
                        >
                          {property.tieneOfertas ? "Sí" : "No"}
                          {property.tieneOfertas && <Eye className="ml-1 h-3 w-3" />}
                            </Badge>
                          </Button>
                          </TableCell>
                        );
                      
                      case 'ofertas_productos':
                        // Para Reventa (ID 2), siempre mostrar N/A
                        const esReventaProductos = property.id_tipo_transaccion === 2;
                        // Show product offers when property has existing offers OR is at least Apartado (id_estatus_disponibilidad > 3)
                        const canShowProductOffers = !esReventaProductos && (property.id_estatus_disponibilidad > 3 || property.tieneOfertasProductos);
                        return (
                          <TableCell key={column.key}>
                            {esReventaProductos ? (
                              <Badge variant="outline" className="text-muted-foreground">N/A</Badge>
                            ) : canShowProductOffers ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewProductOffers(property)}
                                disabled={!property.tieneOfertasProductos}
                                className="p-0 h-auto font-normal"
                              >
                                <Badge 
                                  variant={property.tieneOfertasProductos ? "default" : "outline"}
                                  className={property.tieneOfertasProductos ? "cursor-pointer hover:bg-primary/80" : ""}
                                >
                                  {property.tieneOfertasProductos ? "Sí" : "No"}
                                  {property.tieneOfertasProductos && <ShoppingCart className="ml-1 h-3 w-3" />}
                                </Badge>
                              </Button>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-muted-foreground">
                                      <Lock className="h-3 w-3 mr-1" />
                                      N/A
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Disponible después de apartar la propiedad</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                        );
                      
                      case 'esquemas_pago':
                        return (
                          <TableCell key={column.key}>
                            <EsquemasPagoCell projectId={property.proyecto_id} />
                          </TableCell>
                        );
                      
                      case 'disponibilidad':
                        return (
                          <TableCell key={column.key}>
                            <span className={getDisponibilidadBadgeClass(property.disponibilidad)}>{property.disponibilidad}</span>
                          </TableCell>
                        );
                      
                      case 'cuenta_cobranza':
                        return (
                          <TableCell key={column.key}>
                      {/* No mostrar cuenta de cobranza para propiedades en Reventa (ID 2) */}
                      {property.id_tipo_transaccion === 2 ? (
                        <Badge variant="outline" className="text-muted-foreground">N/A</Badge>
                      ) : property.cuenta_cobranza_id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"  
                            size="sm"
                            onClick={() => navigate(`/admin/cuentas-cobranza/${property.cuenta_cobranza_id}/detalle`)}
                            className="h-6 px-2 text-xs font-semibold cursor-pointer hover:bg-accent"
                          >
                          {formatCuentaCobranzaId(property.cuenta_cobranza_id, 'Propiedad')}
                          </Button>
                          {property.cuenta_sin_esquema && property.id_estatus_disponibilidad !== 10 ? (
                            <TooltipProvider>
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
                            </TooltipProvider>
                          ) : !property.apartado_pagado && property.id_estatus_disponibilidad !== 10 ? (
                            <TooltipProvider>
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
                            </TooltipProvider>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">N/A</Badge>
                          {property.disponibilidad?.toLowerCase() === 'apartado' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 h-6 w-6 p-0 flex items-center justify-center">
                                    <AlertCircle className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="font-semibold">⚠️ Cuenta no generada</p>
                                  <p className="text-sm">Esta propiedad ya se apartó pero no se generó la cuenta porque el RFC de quien pagó no coincide con el registrado</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                            </div>
                          )}
                          </TableCell>
                        );
                      
                      case 'cuenta_clabe':
                        return (
                          <TableCell key={column.key}
                      className="font-mono text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        // No copiar CLABE para propiedades en Reventa
                        if (property.clabe_stp && property.tipo_transaccion !== "Re-venta") {
                          navigator.clipboard.writeText(property.clabe_stp);
                          toast({
                            title: "CLABE copiada",
                            description: "La cuenta CLABE se copió al portapapeles",
                          });
                        }
                      }}
                    >
                            {/* No mostrar CLABE para propiedades en Reventa */}
                            {property.tipo_transaccion === "Re-venta" ? 'N/A' : (property.clabe_stp || 'Sin CLABE')}
                          </TableCell>
                        );
                      
                      case 'precio_final':
                        // Para Reventa, no mostrar precio_final de cuenta de cobranza
                        const esPropiedadReventa = property.tipo_transaccion === "Re-venta";
                        return (
                          <TableCell key={column.key} className="text-right font-semibold">
                     {esPropiedadReventa ? '-' : property.precio_final ? (
                       <div className="flex items-center justify-end gap-2">
                         <span>{formatCurrency(property.precio_final)}</span>
                          {(() => {
                            // Ajustar precio_final si hay comisión en efectivo usando fórmula inversa
                            let precioFinalAjustado = property.precio_final;
                            if (property.es_comision_venta_efectivo && property.porcentaje_comision_venta) {
                              // Recalcular precio antes de aplicar la comisión
                              precioFinalAjustado = property.precio_final / (1 - property.porcentaje_comision_venta / 100);
                            }
                            
                            const difference = precioFinalAjustado - property.precio_lista;
                           const tolerance = 10.0; // Tolerancia para redondeo
                           
                           return (
                             <>
                               {difference > tolerance ? (
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger>
                                       <TrendingUp className="h-4 w-4 text-orange-600" />
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>Precio final mayor a precio de lista</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                               ) : difference < -tolerance ? (
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger>
                                       <TrendingDown className="h-4 w-4 text-green-600" />
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>Precio final menor a precio de lista</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                               ) : (
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger>
                                       <Equal className="h-4 w-4 text-blue-600" />
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>Precio final igual a precio de lista</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                               )}
                               {property.es_comision_venta_efectivo && (
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger>
                                       <Banknote className="h-4 w-4 text-yellow-600" />
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>Comisión pagada en efectivo ({property.porcentaje_comision_venta?.toFixed(2)}%)</p>
                                       <p className="text-xs mt-1">Precio antes de comisión: {formatCurrency(precioFinalAjustado)}</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                               )}
                             </>
                           );
                         })()}
                            </div>
                          ) : '-'}
                          </TableCell>
                        );
                      
                      case 'pagado':
                        // Para Reventa, no mostrar pagado de cuenta de cobranza anterior
                        return (
                          <TableCell key={column.key} className="text-right">
                            {property.tipo_transaccion === "Re-venta" ? '-' : property.cuenta_cobranza_id ? formatCurrency(property.total_pagado) : '-'}
                          </TableCell>
                        );
                      
                      case 'restante':
                        // Para Reventa, no mostrar restante de cuenta de cobranza anterior
                        return (
                          <TableCell key={column.key} className="text-right">
                      {property.tipo_transaccion === "Re-venta" ? '-' : property.cuenta_cobranza_id ? (
                        <span className={property.restante > 0 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                          {formatCurrency(property.restante)}
                            </span>
                          ) : '-'}
                          </TableCell>
                        );
                      
                      case 'estado_pagos':
                        // Para Reventa, no mostrar estado de pagos de cuenta de cobranza anterior
                        return (
                          <TableCell key={column.key}>
                       {property.tipo_transaccion === "Re-venta" ? (
                         <Badge variant="outline" className="text-xs">N/A</Badge>
                       ) : property.payment_status ? (
                         <div className="flex gap-1 items-center">
                           {/* Sort payment icons by date */}
                           {(() => {
                             const paymentTypes: Array<{
                               key: 'apartado' | 'enganche' | 'mensualidades' | 'entrega' | 'especial' | 'cesion_derechos';
                               label: string;
                               icon: typeof FileText;
                             }> = [
                               { key: 'apartado', label: 'Apartado', icon: FileText },
                               { key: 'enganche', label: 'Enganche', icon: DollarSign },
                               { key: 'mensualidades', label: 'Parcialidades', icon: Calendar },
                               { key: 'entrega', label: 'Contraentrega', icon: Home },
                               { key: 'especial', label: 'Especial', icon: Zap },
                               { key: 'cesion_derechos', label: 'Cesión de derechos', icon: ArrowRightLeft },
                             ];

                             // Sort by date: null dates go last
                             const sortedPaymentTypes = paymentTypes
                               .map(type => ({
                                 ...type,
                                 fecha: property.payment_status?.[type.key]?.fecha || null,
                                 monto: property.payment_status?.[type.key]?.monto || 0
                               }))
                               .sort((a, b) => {
                                 if (a.fecha === null && b.fecha === null) return 0;
                                 if (a.fecha === null) return 1;
                                 if (b.fecha === null) return -1;
                                 return a.fecha.localeCompare(b.fecha);
                               });

                             return sortedPaymentTypes.map((type) => {
                               const IconComponent = type.icon;
                               const paymentInfo = property.payment_status?.[type.key];
                               
                               return (
                                  <Tooltip key={type.key}>
                                    <TooltipTrigger asChild>
                                      <div className={`p-1 rounded-md ${
                                        paymentInfo?.status === 'pagado' 
                                          ? 'bg-[hsl(var(--pago-pagado))]' 
                                          : paymentInfo?.status === 'en_proceso'
                                          ? 'bg-[hsl(var(--pago-en-proceso))]'
                                          : (paymentInfo?.total || 0) > 0
                                          ? 'bg-[hsl(var(--pago-no-pagado))]'
                                          : 'border-2 border-muted'
                                      }`}>
                                        <IconComponent className={`h-3 w-3 ${
                                          (paymentInfo?.total || 0) > 0 ? 'text-white' : 'text-muted-foreground'
                                        }`} />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-sm">
                                        <p className="font-semibold">{type.label}</p>
                                        {(paymentInfo?.total || 0) > 0 ? (
                                         <>
                                           <p>Monto: ${(paymentInfo?.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                           <p>Pagado: ${(paymentInfo?.monto_pagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                           {type.fecha && <p className="text-xs text-muted-foreground mt-1">Ultima fecha de pago: {new Date(type.fecha).toLocaleDateString('es-MX')}</p>}
                                         </>
                                       ) : (
                                         <p>No aplica</p>
                                       )}
                                     </div>
                                   </TooltipContent>
                                 </Tooltip>
                               );
                             });
                           })()}
                         </div>
                            ) : (
                              <Badge variant="outline" className="text-xs">N/A</Badge>
                            )}
                          </TableCell>
                        );
                      
                      case 'factura':
                        return (
                          <TableCell key={column.key}>
                            <FacturaCell propertyId={property.id} />
                          </TableCell>
                        );
                      
                      case 'acciones':
                        return (
                          <TableCell key={column.key}>
                    {tabType === "eliminados" ? (
                      (canUpdate || isSuperAdmin) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(property.id)}
                          className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                        >
                          Restaurar
                        </Button>
                      )
                    ) : tabType === "draft" ? (
                      <div className="flex space-x-2">
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(property.id)}
                            className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                          >
                            Aprobar
                          </Button>
                        )}
                        {(canUpdate || isSuperAdmin) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setEditingProperty(property)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Editar propiedad</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                      disabled={property.tieneOfertas || property.id_estatus_disponibilidad === 11}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Eliminar propiedad?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        ¿Estás seguro de que deseas eliminar la propiedad {property.numero_propiedad}? Esta acción se puede revertir posteriormente.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(property.id)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Eliminar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {property.id_estatus_disponibilidad === 11 
                                  ? "No se puede eliminar una propiedad en estatus En demanda" 
                                  : property.tieneOfertas 
                                    ? "No se puede eliminar una propiedad con ofertas asociadas" 
                                    : "Eliminar propiedad"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                     ) : (
                       <div className="flex space-x-2">
                          {/* Botón de Reventa para propiedades Asignado (10) o Entregado (8) */}
                          {(canUpdate || isSuperAdmin) && (property.id_estatus_disponibilidad === 10 || property.id_estatus_disponibilidad === 8) && (
                            <ReventaDialog
                              propertyId={property.id}
                              propertyNumber={property.numero_propiedad}
                              currentPrecioFinal={property.precio_final}
                              currentPrecioLista={property.precio_lista}
                              currentMontoApartado={property.monto_apartado}
                            />
                          )}
                          {/* Generar oferta para propiedades Disponible - si es Reventa, forzar modo manual */}
                          {(canGenerateOffer || isSuperAdmin) && property.disponibilidad === "Disponible" && property.tiene_sozu_como_inmobiliaria && (
                            <NewOfferDialog 
                              propertyId={property.id} 
                              propertyNumber={property.numero_propiedad}
                              forceManualMode={property.tipo_transaccion === "Re-venta"}
                            />
                          )}
                          {/* No mostrar botón de generar oferta de productos para propiedades en Reventa */}
                          {(canGenerateOffer || isSuperAdmin) && property.tipo_transaccion !== "Re-venta" && (property.disponibilidad === "Disponible" ||
                            property.disponibilidad === "Apartado" || 
                            property.disponibilidad === "Vendido" || 
                            property.disponibilidad === "Pagada completamente" ||
                            property.disponibilidad === "En escrituración" ||
                            property.disponibilidad === "Entregado" ||
                            property.disponibilidad === "Asignado") && (
                            <NewProductOfferDialog 
                              propertyId={property.id}
                              property={property}
                            />
                          )}
                          {(canUpdate || isSuperAdmin) && property.disponibilidad === "Inventario" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AsignarPropiedadDialog 
                                  propertyId={property.id}
                                  propertyNumber={property.numero_propiedad}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Agregar a fideicomiso</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {(canUpdate || isSuperAdmin) && (
                            <Tooltip>
                             <TooltipTrigger asChild>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 className="h-8 w-8 p-0"
                                 onClick={() => setEditingProperty(property)}
                               >
                                 <Edit className="h-4 w-4" />
                               </Button>
                             </TooltipTrigger>
                             <TooltipContent>
                               <p>Editar propiedad</p>
                             </TooltipContent>
                           </Tooltip>
                          )}
                          {(canDelete || isSuperAdmin) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                        disabled={property.tieneOfertas || property.id_estatus_disponibilidad === 11}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar propiedad?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          ¿Estás seguro de que deseas eliminar la propiedad {property.numero_propiedad}? Esta acción se puede revertir posteriormente.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(property.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Eliminar
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {property.id_estatus_disponibilidad === 11 
                                    ? "No se puede eliminar una propiedad en estatus En demanda" 
                                    : property.tieneOfertas 
                                      ? "No se puede eliminar una propiedad con ofertas asociadas" 
                                      : "Eliminar propiedad"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                      </div>
                    )}
                  </TableCell>
                );
              
              default:
                return null;
            }
          })}
        </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando propiedades...</div>
      </div>
    );
  }

  // Show no access message if user has no projects assigned
  if (hasNoAccess) {
    return <NoProjectAccess />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            Gestiona el inventario de propiedades del sistema
          </p>
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            activeTab === "activos" ? filteredActivosCount > 0 :
            activeTab === "draft" ? filteredDraftCount > 0 :
            filteredEliminadosCount > 0
          ) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleExportToExcel}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar Excel
            </Button>
          )}
          {(canCreate || isSuperAdmin) && (
            <>
              <Button
                onClick={() => setBulkUploadOpen(true)}
                variant="outline"
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Carga Masiva
              </Button>
              <NewPropertyDialog onPropertyAdded={handlePropertyAdded} />
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Propiedades</CardTitle>
          <div className="space-y-4">
            {/* Búsqueda general */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de propiedad, propietario, proyecto, edificio, modelo o CLABE..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-8"
              />
            </div>
            
            {/* Filtros específicos */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">Desarrollo</label>
                <Popover open={isProjectFilterOpen} onOpenChange={setIsProjectFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isProjectFilterOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedProyectos.length === 0 ? (
                        "Seleccionar desarrollo..."
                      ) : selectedProyectos.length === 1 ? (
                        proyectos?.find(p => p.id === selectedProyectos[0])?.nombre
                      ) : (
                        `${selectedProyectos.length} desarrollos seleccionados`
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar desarrollo..." />
                      <CommandEmpty>No se encontraron desarrollos.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {proyectos?.map((proyecto) => (
                          <CommandItem
                            key={proyecto.id}
                            onSelect={() => {
                              setSelectedProyectos(prev => 
                                prev.includes(proyecto.id)
                                  ? prev.filter(id => id !== proyecto.id)
                                  : [...prev, proyecto.id]
                              );
                              // Reset modelo filter when changing projects
                              setSelectedModelos([]);
                            }}
                            className="cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedProyectos.includes(proyecto.id)}
                              className="mr-2"
                            />
                            <span>{proyecto.nombre}</span>
                            <Check
                              className={cn(
                                "ml-auto h-4 w-4",
                                selectedProyectos.includes(proyecto.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {selectedProyectos.length > 0 && (
                        <div className="border-t p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSelectedProyectos([]);
                              setSelectedModelos([]);
                              setSelectedModelosLabels({});
                              setModeloSearchInput("");
                              setModeloSearchTerm("");
                            }}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Limpiar filtros
                          </Button>
                        </div>
                      )}
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedProyectos.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Modelo</label>
                <Popover open={isModeloFilterOpen} onOpenChange={setIsModeloFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isModeloFilterOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedModelos.length === 0 ? (
                        "Seleccionar modelos..."
                      ) : selectedModelos.length === 1 ? (
                        selectedModelosLabels[selectedModelos[0]] ?? "1 modelo seleccionado"
                      ) : (
                        `${selectedModelos.length} modelos seleccionados`
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Buscar modelo..."
                        value={modeloSearchInput}
                        onValueChange={setModeloSearchInput}
                      />
                      <CommandEmpty>
                        {selectedProyectos.length > 0 
                          ? "No se encontraron modelos." 
                          : (modeloSearchTerm ? "No se encontraron modelos." : "Selecciona un desarrollo o escribe para buscar modelos.")
                        }
                      </CommandEmpty>
                      <CommandList>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {modelos?.map((modelo) => (
                            <CommandItem
                              key={modelo.id}
                              value={modelo.nombre}
                              onSelect={() => {
                                const isSelected = selectedModelos.includes(modelo.id);
                                setSelectedModelos(prev =>
                                  isSelected
                                    ? prev.filter(id => id !== modelo.id)
                                    : [...prev, modelo.id]
                                );
                                setSelectedModelosLabels(prevLabels => {
                                  const updated = { ...prevLabels };
                                  if (isSelected) {
                                    delete updated[modelo.id];
                                  } else {
                                    updated[modelo.id] = modelo.nombre;
                                  }
                                  return updated;
                                });
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedModelos.includes(modelo.id)}
                                className="mr-2"
                              />
                              <span>{modelo.nombre}</span>
                              <Check
                                className={cn(
                                  "ml-auto h-4 w-4",
                                  selectedModelos.includes(modelo.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                      {selectedModelos.length > 0 && (
                        <div className="border-t p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSelectedModelos([]);
                              setSelectedModelosLabels({});
                              setModeloSearchInput("");
                              setModeloSearchTerm("");
                            }}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Limpiar filtros
                          </Button>
                        </div>
                      )}
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              )}
              {canSeeAdvancedFilters && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Recámaras</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, '4+'].map((val) => {
                        const strVal = String(val);
                        const isActive = recamarasFilterInput === strVal;
                        return (
                          <Button
                            key={strVal}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            className={cn("min-w-[40px]", isActive && "bg-primary text-primary-foreground")}
                            onClick={() => setRecamarasFilterInput(isActive ? null : strVal)}
                          >
                            {strVal}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Baños</label>
                    <Input
                      placeholder="Ej: 1, 2..."
                      value={banosFilterInput}
                      onChange={(e) => setBanosFilterInput(e.target.value)}
                    />
                  </div>
                </>
              )}
              {canSeeAdvancedFilters && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Estatus de Propiedad</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {disponibilidadFilter.length === 0 
                          ? "Filtrar por estatus..." 
                          : `${disponibilidadFilter.length} seleccionado${disponibilidadFilter.length > 1 ? 's' : ''}`
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar estatus..." />
                        <CommandEmpty>No se encontró estatus.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {filteredAvailabilityOptions?.map((option) => (
                            <CommandItem
                              key={option.id}
                              onSelect={() => {
                                setDisponibilidadFilter(prev => 
                                  prev.includes(option.nombre)
                                    ? prev.filter(item => item !== option.nombre)
                                    : [...prev, option.nombre]
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox
                                checked={disponibilidadFilter.includes(option.nombre)}
                                className="mr-2"
                              />
                              {option.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {disponibilidadFilter.length > 0 && (
                          <div className="border-t p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDisponibilidadFilter([])}
                              className="w-full justify-center"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Limpiar selección
                            </Button>
                          </div>
                        )}
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {canSeeAdvancedFilters && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Tipo de Transacción</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {tipoTransaccionFilter.length === 0 
                          ? "Filtrar por tipo..." 
                          : `${tipoTransaccionFilter.length} seleccionado${tipoTransaccionFilter.length > 1 ? 's' : ''}`
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar tipo..." />
                        <CommandEmpty>No se encontró tipo.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {tiposTransaccionOptions?.map((option) => (
                            <CommandItem
                              key={option.id}
                              onSelect={() => {
                                setTipoTransaccionFilter(prev => 
                                  prev.includes(option.nombre)
                                    ? prev.filter(item => item !== option.nombre)
                                    : [...prev, option.nombre]
                                );
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox
                                checked={tipoTransaccionFilter.includes(option.nombre)}
                                className="mr-2"
                              />
                              {option.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        {tipoTransaccionFilter.length > 0 && (
                          <div className="border-t p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTipoTransaccionFilter([])}
                              className="w-full justify-center"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Limpiar selección
                            </Button>
                          </div>
                        )}
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {canSeeAdvancedFilters && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Con bodega</label>
                    <Switch
                      checked={bodegasFilter === "con_bodegas"}
                      onCheckedChange={(checked) => setBodegasFilter(checked ? "con_bodegas" : "")}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Con estacionamiento</label>
                    <Switch
                      checked={estacionamientosFilter === "con_estacionamientos"}
                      onCheckedChange={(checked) => setEstacionamientosFilter(checked ? "con_estacionamientos" : "")}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tiene Cuenta de Cobranza</label>
                    <Select value={cuentaCobranzaFilter} onValueChange={setCuentaCobranzaFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filtrar por cuenta..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">Sí</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {canSeeAdvancedFilters && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Área (m²)</label>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        type="text"
                        value={areaFilterInput[0]}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            setAreaFilterInput([0, areaFilterInput[1]]);
                          } else {
                            setAreaFilterInput([Number(val), areaFilterInput[1]]);
                          }
                        }}
                        onBlur={(e) => {
                          let val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                          val = Math.max(0, Math.min(500, val));
                          setAreaFilterInput([val, Math.max(val, areaFilterInput[1])]);
                        }}
                        className="w-20 h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <Input
                        type="text"
                        value={areaFilterInput[1]}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            setAreaFilterInput([areaFilterInput[0], 500]);
                          } else {
                            setAreaFilterInput([areaFilterInput[0], Number(val)]);
                          }
                        }}
                        onBlur={(e) => {
                          let val = Number(e.target.value.replace(/[^0-9]/g, '')) || 500;
                          val = Math.max(0, Math.min(500, val));
                          setAreaFilterInput([Math.min(areaFilterInput[0], val), val]);
                        }}
                        className="w-20 h-8 text-xs"
                      />
                    </div>
                    <Slider
                      min={0}
                      max={500}
                      step={1}
                      value={areaFilterInput}
                      onValueChange={setAreaFilterInput}
                      className="mt-1"
                    />
                  </div>
                  <div className="min-w-[200px]">
                    <label className="text-sm font-medium mb-2 block whitespace-nowrap">Rango de precio</label>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        type="text"
                        value={`$${precioFilterInput[0].toLocaleString('es-MX')}`}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            setPrecioFilterInput([precioRange?.min ?? 0, precioFilterInput[1]]);
                          } else {
                            setPrecioFilterInput([Number(val), precioFilterInput[1]]);
                          }
                        }}
                        onBlur={(e) => {
                          const maxVal = precioRange?.max ?? 100000000;
                          let val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                          val = Math.max(0, Math.min(maxVal, val));
                          setPrecioFilterInput([val, Math.max(val, precioFilterInput[1])]);
                        }}
                        className="w-32 h-8 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <Input
                        type="text"
                        value={`$${precioFilterInput[1].toLocaleString('es-MX')}`}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            setPrecioFilterInput([precioFilterInput[0], precioRange?.max ?? 100000000]);
                          } else {
                            setPrecioFilterInput([precioFilterInput[0], Number(val)]);
                          }
                        }}
                        onBlur={(e) => {
                          const maxVal = precioRange?.max ?? 100000000;
                          let val = Number(e.target.value.replace(/[^0-9]/g, '')) || maxVal;
                          val = Math.max(0, Math.min(maxVal, val));
                          setPrecioFilterInput([Math.min(precioFilterInput[0], val), val]);
                        }}
                        className="w-32 h-8 text-xs"
                      />
                    </div>
                    <Slider
                      min={precioRange?.min ?? 0}
                      max={precioRange?.max ?? 100000000}
                      step={100000}
                      value={precioFilterInput}
                      onValueChange={setPrecioFilterInput}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>
            
            {/* Botón para limpiar filtros, ordenar por precio y configurar columnas */}
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate('/admin/prospectos')}
              >
                <Users className="h-4 w-4" />
                Prospectos
              </Button>
              <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const newSort = precioSort === 'asc' ? 'desc' : precioSort === 'desc' ? null : 'asc';
                  setPrecioSort(newSort);
                }}
                className="gap-2"
              >
                <DollarSign className="h-4 w-4" />
                Ordenar
                {precioSort === 'asc' && <TrendingUp className="h-4 w-4" />}
                {precioSort === 'desc' && <TrendingDown className="h-4 w-4" />}
                {!precioSort && <ArrowRightLeft className="h-4 w-4" />}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => {
                  setInputValue("");
                  setSearchTerm("");
                  setSelectedProyectos([]);
                  setSelectedModelos([]);
                  setSelectedModelosLabels({});
                  setModeloSearchInput("");
                  setModeloSearchTerm("");
                  setRecamarasFilterInput(null);
                  setRecamarasFilter(null);
                  setBanosFilterInput("");
                  setBanosFilter("");
                  setDisponibilidadFilter([]);
                  setTipoTransaccionFilter([]);
                  setBodegasFilter("");
                  setEstacionamientosFilter("");
                  setCuentaCobranzaFilter("");
                  setAreaFilterInput([0, 500]);
                  setAreaFilter([0, 500]);
                  setPrecioFilterInput([precioRange?.min ?? 0, precioRange?.max ?? 100000000]);
                  setPrecioFilter([precioRange?.min ?? 0, precioRange?.max ?? 100000000]);
                  setSelectedProperties([]);
                  setPrecioSort(null);
                }}
              >
                Limpiar Filtros
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    Columnas ({visibleCount}/{totalCount})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Columnas visibles</h4>
                      <span className="text-xs text-muted-foreground">
                        {visibleCount} de {totalCount}
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllColumns}
                        className="flex-1 text-xs"
                      >
                        Todas
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={deselectAllColumns}
                        className="flex-1 text-xs"
                      >
                        Mínimas
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground px-1 mb-1">
                      Arrastra para reordenar
                    </div>

                    <div className="max-h-[400px] overflow-y-auto space-y-1.5 border rounded-md p-3">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={columnsOrder}
                          strategy={verticalListSortingStrategy}
                        >
                          {orderedColumns.map((column) => (
                            <SortableColumnItem
                              key={column.key}
                              column={column}
                              isVisible={isColumnVisible(column.key)}
                              onToggle={toggleColumn}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={resetToDefaults}
                      className="w-full text-xs"
                    >
                      Restaurar predeterminadas
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`grid w-full ${
              canSeeAdvancedFilters 
                ? ((canUpdate || isSuperAdmin) ? 'grid-cols-3' : 'grid-cols-2')
                : ((canUpdate || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1')
            }`}>
              <TabsTrigger value="activos">
                Activos ({filteredActivosCount})
              </TabsTrigger>
              {(canUpdate || isSuperAdmin) && (
                <TabsTrigger value="draft">
                  Draft ({filteredDraftCount})
                </TabsTrigger>
              )}
              {canSeeAdvancedFilters && (
                <TabsTrigger value="eliminados">
                  Eliminados ({filteredEliminadosCount})
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="activos" className="mt-4">
              {renderPropertiesTable(sortedActiveProperties, "activos")}
              {renderPagination(currentPageActive, totalActivePage, setCurrentPageActive)}
            </TabsContent>

            <TabsContent value="draft" className="mt-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {sortedDraftProperties.length > 0 && (
                  <Button onClick={handleApproveAllVisible} variant="default" className="bg-green-600 hover:bg-green-700">
                    Aprobar Todas las Visibles ({sortedDraftProperties.length})
                  </Button>
                )}
                {selectedProperties.length > 0 && (
                  <>
                    <Button onClick={handleBulkApprove} variant="outline">
                      Aprobar Seleccionadas ({selectedProperties.length})
                    </Button>
                    <Button onClick={handleBulkDelete} variant="destructive">
                      Eliminar Seleccionadas ({selectedProperties.length})
                    </Button>
                  </>
                )}
              </div>
              {renderPropertiesTable(sortedDraftProperties, "draft")}
              {renderPagination(currentPageDraft, totalDraftPage, setCurrentPageDraft)}
            </TabsContent>

            {canSeeAdvancedFilters && (
              <TabsContent value="eliminados" className="mt-4">
                {renderPropertiesTable(sortedInactiveProperties, "eliminados")}
                {renderPagination(currentPageDeleted, totalInactivePage, setCurrentPageDeleted)}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <BulkUploadPropertiesDialog 
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          refetchActivos();
          refetchDraft();
          setCurrentPageActive(1);
          setCurrentPageDraft(1);
          toast({
            title: "Éxito", 
            description: "Las propiedades se han cargado correctamente.",
          });
        }}
      />

      {editingProperty && (
        <EditPropertyDialog
          property={{
            id: editingProperty.id,
            numero_propiedad: editingProperty.numero_propiedad,
            numero_piso: editingProperty.numero_piso,
            m2_interiores: editingProperty.m2_interiores,
            m2_exteriores: editingProperty.m2_exteriores,
            precio_lista: editingProperty.precio_lista,
            clabe_stp_tmp_apartado: editingProperty.clabe_stp_tmp_apartado,
            propietario: editingProperty.propietario,
            proyecto: editingProperty.proyecto,
            edificio: editingProperty.edificio,
            modelo: editingProperty.modelo,
            vista: editingProperty.vista,
            disponibilidad: editingProperty.disponibilidad,
            activo: editingProperty.activo,
            es_aprobado: editingProperty.es_aprobado,
            configuracion_modelo: editingProperty.configuracion_modelo,
            tieneOfertas: editingProperty.tieneOfertas
          }}
          onClose={() => setEditingProperty(null)}
          onSuccess={() => {
            setEditingProperty(null);
            refetchActivos();
            refetchDraft();
            refetchEliminados();
          }}
        />
      )}

      {/* Dialog para mostrar ofertas */}
      <Dialog open={offersDialogOpen} onOpenChange={setOffersDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ofertas para propiedad {selectedPropertyForOffers?.numero_propiedad} de {selectedPropertyForOffers?.proyecto}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPropertyOffers && selectedPropertyOffers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Fecha</TableHead>
                     <TableHead>Esquema de Pago</TableHead>
                     <TableHead>Estatus Aprob.</TableHead>
                     <TableHead>Cuenta de Cobranza</TableHead>
                     <TableHead>Descarga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                     {(() => {
                      // Check if there's any active account with payment scheme selected
                      const hasActiveAccountWithScheme = selectedPropertyOffers.some((offer: any) => 
                        offer.cuenta_clabe_stp && offer.cuenta_activo && offer.esquema_id
                      );
                      
                      return selectedPropertyOffers.map((offer: any, index: number) => {
                        const hasAccount = !!offer.cuenta_clabe_stp;
                        const isAccountActive = hasAccount && offer.cuenta_activo;
                        const isAccountCancelled = hasAccount && !offer.cuenta_activo;
                       const hasPaymentScheme = !!offer.esquema_id;
                       
                       // Check if user can access this offer
                       const userCanAccessOffer = canAccessOffer(offer);
                       
                       // Determine row color based on status
                       let rowClassName = "";
                       if (!userCanAccessOffer) {
                         // Gray with lock for offers the user cannot access
                         rowClassName = "border-l-4 border-l-gray-400 bg-gray-100/50 dark:bg-gray-800/50 opacity-70";
                       } else if (isAccountActive && hasPaymentScheme) {
                         // Green: Active account WITH payment scheme selected
                         rowClassName = "border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20";
                       } else if (isAccountActive && !hasPaymentScheme) {
                         // Blue: Active account WITHOUT payment scheme selected
                         rowClassName = "border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20";
                       } else if (isAccountCancelled) {
                         // Orange: Cancelled account
                         rowClassName = "border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20";
                       }
                       
                       return (
                         <TableRow 
                           key={offer.id}
                           className={rowClassName}
                         >
                           <TableCell className="font-medium">
                             {!userCanAccessOffer ? (
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <div className="flex items-center gap-2 text-muted-foreground">
                                     <Lock className="h-4 w-4" />
                                     <span>O-{String(offer.id).padStart(6, '0')}</span>
                                   </div>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>No tienes acceso a esta oferta - El prospecto no te pertenece</p>
                                 </TooltipContent>
                               </Tooltip>
                             ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                   <Button
                                     variant="link"
                                     size="sm"
                                      onClick={async () => {
                                        const isCreditCardEnabled = !hasAccount && !hasActiveAccountWithScheme && selectedPropertyForOffers?.disponibilidad === 'Apartado' && offer.esquema_id;
                                         if (!hasAccount && !hasActiveAccountWithScheme && offer.esquema_id && !isCreditCardEnabled) {
                                           // Load the specific scheme if not already loaded
                                           if (!availableSchemes.find(s => s.id === offer.esquema_id)) {
                                             const { data: schemeData } = await supabase
                                               .from('esquemas_pago')
                                               .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
                                               .eq('id', offer.esquema_id)
                                               .eq('es_manual', false)
                                               .single();
                                            
                                            if (schemeData) {
                                              setAvailableSchemes([...availableSchemes, schemeData]);
                                            }
                                          }
                                          setSelectedOfferForAccount({ ...offer, propertyId: selectedPropertyForOffers!.id, isProductOffer: false });
                                          setConfirmGenerateAccountOpen(true);
                                        }
                                      }}
                                     disabled={
                                       isAccountCancelled ||
                                       hasAccount || 
                                       !offer.esquema_id || 
                                       hasActiveAccountWithScheme || 
                                       (!hasAccount && !hasActiveAccountWithScheme && selectedPropertyForOffers?.disponibilidad === 'Apartado' && offer.esquema_id)
                                     }
                                     className="p-0 h-auto font-semibold"
                                   >
                                     O-{String(offer.id).padStart(6, '0')}
                                   </Button>
                                </TooltipTrigger>
                                 <TooltipContent>
                                   <p>
                                     {isAccountCancelled 
                                       ? "Cuenta cancelada - No se puede generar nueva cuenta"
                                       : hasAccount
                                       ? "Esta oferta ya tiene cuenta de cobranza"
                                       : hasActiveAccountWithScheme
                                       ? "Ya existe cuenta activa con esquema - No se pueden generar más cuentas"
                                       : "Generar cuenta de cobranza manualmente"
                                     }
                                   </p>
                                 </TooltipContent>
                              </Tooltip>
                             )}
                           </TableCell>
                          <TableCell>
                            {(offer.agent_name || 'AGENTE POR DEFINIR').toUpperCase()}
                          </TableCell>
                          <TableCell>
                            {!userCanAccessOffer ? (
                              <span className="text-muted-foreground">---</span>
                            ) : (
                              (offer.lead_name || 'N/A').toUpperCase()
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(offer.fecha_generacion).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                              {(offer.esquema_es_manual || hasPaymentScheme) ? (
                               <Badge 
                                 variant="outline" 
                                 className={`font-medium ${
                                   offer.esquema_id
                                     ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700" 
                                     : "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
                                 }`}
                               >
                                 {offer.esquema_nombre || availableSchemes.find(s => s.id === offer.esquema_id)?.nombre || `ID: ${offer.esquema_id}`}
                               </Badge>
                             ) : (
                                <Select 
                                  value={offer.esquema_id ? offer.esquema_id.toString() : ""}
                                  disabled={
                                    // Disable if user can't access this offer
                                    !userCanAccessOffer ||
                                    // Disable if this offer has active account WITH scheme
                                    (isAccountActive && hasPaymentScheme) ||
                                    // Disable if this offer has cancelled account
                                    isAccountCancelled ||
                                    // Disable if there's another offer with active account WITH scheme
                                    (hasActiveAccountWithScheme && !(isAccountActive && !hasPaymentScheme))
                                  }
                                  onValueChange={(value) => handleSchemeSelection(offer.id, parseInt(value))}
                                >
                                  <SelectTrigger className="w-48">
                                   <SelectValue placeholder={
                                     !userCanAccessOffer
                                       ? "Sin acceso"
                                       : isAccountActive && hasPaymentScheme
                                       ? "Esquema ya seleccionado"
                                       : isAccountActive && !hasPaymentScheme
                                       ? "Seleccionar esquema de pago"
                                       : isAccountCancelled
                                       ? "Cuenta cancelada"
                                       : hasActiveAccountWithScheme
                                       ? "Esquema deshabilitado - Cuenta activa"
                                       : "Seleccionar esquema de pago"
                                   } />
                                 </SelectTrigger>
                                <SelectContent className="bg-background border z-50">
                                  {availableSchemes.map((scheme) => (
                                    <SelectItem key={scheme.id} value={scheme.id.toString()}>
                                      {scheme.nombre}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {offer.esquema_id && offer.id_estatus_aprobacion ? (() => {
                              const estatusColors: Record<number, string> = {
                                1: "bg-yellow-100 text-yellow-800 border-yellow-300",
                                2: "bg-green-100 text-green-800 border-green-300",
                                3: "bg-red-100 text-red-800 border-red-300",
                                4: "bg-blue-100 text-blue-800 border-blue-300",
                              };
                              if (offer.id_estatus_aprobacion === 1) {
                                return (
                                  <Badge 
                                    variant="outline" 
                                    className={`${estatusColors[1]} cursor-pointer hover:opacity-80`}
                                    onClick={() => setCambiarEstatusOfferId(offer.id)}
                                  >
                                    {offer.estatus_aprobacion_nombre || 'Aprobación pendiente'} ✎
                                  </Badge>
                                );
                              }
                              return (
                                <Badge variant="outline" className={estatusColors[offer.id_estatus_aprobacion] || ""}>
                                  {offer.estatus_aprobacion_nombre || `ID: ${offer.id_estatus_aprobacion}`}
                                </Badge>
                              );
                            })() : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasAccount ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`font-mono text-xs ${
                                      isAccountActive 
                                        ? "text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/50" 
                                        : "text-orange-700 bg-orange-100 hover:bg-orange-200 dark:text-orange-300 dark:bg-orange-900/50"
                                    }`}
                                    onClick={() => navigate(`/admin/cuentas-cobranza/${offer.cuenta_cobranza_id}/detalle`)}
                                  >
                                    {formatCuentaCobranzaId(offer.cuenta_cobranza_id, 'Propiedad')}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isAccountActive ? 'Activa' : 'Cancelada'} - Click para ver detalle</p>
                                </TooltipContent>
                              </Tooltip>
                             ) : (
                               <div className="flex flex-col gap-2">
                                 <span className="text-muted-foreground text-sm">Sin cuenta</span>
                                 {selectedPropertyForOffers?.disponibilidad === 'Apartado' && (
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         onClick={() => handleGenerateCollectionAccount(offer.id, selectedPropertyForOffers.id)}
                                         disabled={!offer.esquema_id}
                                         className="h-8 w-8 p-0"
                                       >
                                         <CreditCard className="h-4 w-4" />
                                       </Button>
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       <p>
                                         {!offer.esquema_id 
                                           ? "Selecciona un esquema de pago para habilitar" 
                                           : "Generar cuenta de cobranza para esta oferta"
                                         }
                                       </p>
                                     </TooltipContent>
                                   </Tooltip>
                                 )}
                               </div>
                             )}
                          </TableCell>
                           <TableCell>
                             {!userCanAccessOffer ? (
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button
                                     variant="outline"
                                     size="icon"
                                     disabled
                                   >
                                     <Lock className="h-4 w-4 text-muted-foreground" />
                                   </Button>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>No tienes acceso a descargar esta oferta</p>
                                 </TooltipContent>
                               </Tooltip>
                             ) : (
                               <Button
                                 variant="outline"
                                 size="icon"
                                 onClick={() => handleDownloadOffer(offer)}
                                 disabled={downloadingOfferId === offer.id}
                               >
                                 {downloadingOfferId === offer.id ? (
                                   <Loader2 className="h-4 w-4 animate-spin" />
                                 ) : (
                                   <Download className="h-4 w-4" />
                                 )}
                               </Button>
                             )}
                           </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron ofertas para esta propiedad
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para mostrar ofertas de productos */}
      <Dialog open={productOffersDialogOpen} onOpenChange={setProductOffersDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ofertas de Productos para propiedad {selectedPropertyForProductOffers?.numero_propiedad} de {selectedPropertyForProductOffers?.proyecto}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPropertyProductOffers && selectedPropertyProductOffers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Producto/Servicio</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Fecha</TableHead>
                     <TableHead>Esquema de Pago</TableHead>
                     <TableHead>Estatus Aprob.</TableHead>
                     <TableHead>CLABE</TableHead>
                     <TableHead>Cuenta de Cobranza</TableHead>
                     <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Check if there's any active account WITH payment scheme among product offers
                    const hasActiveAccountWithScheme = selectedPropertyProductOffers.some((offer: any) => 
                      offer.cuenta_cobranza_id && offer.cuenta_activo && offer.id_esquema_pago_seleccionado
                    );
                    
                    return selectedPropertyProductOffers.map((offer: any) => {
                      const hasAccount = !!offer.cuenta_cobranza_id;
                      const isAccountActive = hasAccount && offer.cuenta_activo;
                      const isAccountCancelled = hasAccount && !offer.cuenta_activo;
                      
                      // Check if user can access this offer
                      const userCanAccessOffer = canAccessOffer(offer);
                      
                      // Check if there's an active account for THIS SPECIFIC product (from another offer)
                      const hasActiveAccountForThisProduct = selectedPropertyProductOffers.some((o: any) => 
                        o.id_producto === offer.id_producto && 
                        o.id !== offer.id && // Not the current offer
                        o.cuenta_cobranza_id && 
                        o.cuenta_activo && 
                        o.id_esquema_pago_seleccionado
                      );
                      
                      // Row className based on access
                      const rowClassName = !userCanAccessOffer 
                        ? "border-l-4 border-l-gray-400 bg-gray-100/50 dark:bg-gray-800/50 opacity-70" 
                        : "";
                      
                      return (
                         <TableRow key={offer.id} className={rowClassName}>
                         <TableCell className="font-medium">
                          {!userCanAccessOffer ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Lock className="h-4 w-4" />
                                  <span>OP-{String(offer.id).padStart(6, '0')}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>No tienes acceso a esta oferta - El prospecto no te pertenece</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <Button
                                 variant="link"
                                 size="sm"
                                 disabled={isAccountActive || hasActiveAccountForThisProduct}
                                 onClick={async () => {
                                   // Si tiene cuenta de cobranza, navegar a ella
                                   if (hasAccount) {
                                     navigate(`/admin/cuentas-cobranza/${offer.cuenta_cobranza_id}/detalle`);
                                     return;
                                   }
                                   
                                   // Si no tiene esquema, mostrar mensaje
                                   if (!offer.id_esquema_pago_seleccionado) {
                                     toast({
                                       title: "Sin esquema de pago",
                                       description: "Esta oferta no tiene un esquema de pago asignado",
                                       variant: "default",
                                     });
                                     return;
                                   }
                                   
                                   // Si hay otra cuenta activa para este mismo producto, no permitir generar
                                   if (hasActiveAccountForThisProduct) {
                                     toast({
                                       title: "No disponible",
                                       description: `Ya existe una cuenta activa para este mismo producto (${offer.product_name}). Solo puede haber una cuenta activa por producto.`,
                                       variant: "default",
                                     });
                                     return;
                                   }
                                   
                                   // Si tiene esquema y no hay otra cuenta activa para este producto, ofrecer generarla
                                    if (!hasActiveAccountForThisProduct && offer.id_esquema_pago_seleccionado) {
                                      // Load the specific scheme if not already loaded
                                      if (!availableSchemes.find(s => s.id === offer.id_esquema_pago_seleccionado)) {
                                        const { data: schemeData } = await supabase
                                          .from('esquemas_pago')
                                          .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
                                          .eq('id', offer.id_esquema_pago_seleccionado)
                                          .eq('es_manual', false)
                                          .maybeSingle();
                                       
                                       if (schemeData) {
                                         setAvailableSchemes([...availableSchemes, schemeData]);
                                       }
                                     }
                                     setSelectedOfferForAccount({ ...offer, propertyId: selectedPropertyForProductOffers!.id, isProductOffer: true });
                                     setConfirmGenerateAccountOpen(true);
                                   }
                                 }}
                                 className="p-0 h-auto font-semibold hover:underline"
                               >
                                 OP-{String(offer.id).padStart(6, '0')}
                               </Button>
                             </TooltipTrigger>
                             <TooltipContent>
                               <p>
                                 {isAccountActive
                                   ? 'Cuenta de cobranza ya generada'
                                   : hasAccount 
                                     ? 'Ver detalle de cuenta de cobranza'
                                     : isAccountCancelled
                                     ? 'Cuenta cancelada - No se puede generar nueva cuenta'
                                     : !offer.id_esquema_pago_seleccionado
                                     ? 'Sin esquema de pago - Selecciona uno primero'
                                     : hasActiveAccountForThisProduct
                                     ? `Ya existe cuenta activa para ${offer.product_name} - Solo una cuenta por producto`
                                     : 'Generar cuenta de cobranza'
                                 }
                               </p>
                             </TooltipContent>
                           </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          {(offer.product_name || 'N/A').toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {!userCanAccessOffer ? (
                            <span className="text-muted-foreground">---</span>
                          ) : (
                            (offer.lead_name || 'N/A').toUpperCase()
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(offer.fecha_generacion).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {offer.id_esquema_pago_seleccionado ? (
                            <Badge 
                              variant="outline" 
                              className="font-medium bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700"
                            >
                              {offer.esquema_nombre || 'Sin nombre'}
                            </Badge>
                          ) : (
                            <Select
                              value=""
                              onValueChange={async (schemeId) => {
                                if (!schemeId) return;
                                try {
                                  setIsUpdatingScheme(true);
                                  
                                  // Get the product owner entity for CLABE generation
                                  const { data: productData, error: productError } = await supabase
                                    .from('productos_servicios')
                                    .select('id_entidad_relacionada_dueno')
                                    .eq('id', offer.id_producto)
                                    .single();
                                  
                                  if (productError) throw productError;
                                  
                                   // Get or reuse CLABE from existing offers without account
                                   const { getOrCreateProductClabe, clearSourceOfferClabes } = await import('@/utils/clabeReuseUtils');
                                   const clabeResult = await getOrCreateProductClabe(
                                     selectedPropertyForProductOffers!.id,
                                     offer.id_producto!,
                                     productData.id_entidad_relacionada_dueno
                                   );
                                   
                                   // Update offer with scheme and CLABE
                                   const { error: updateError } = await supabase
                                     .from('ofertas')
                                     .update({
                                       id_esquema_pago_seleccionado: parseInt(schemeId),
                                       clabe_stp_tmp_producto: clabeResult.clabe
                                     })
                                     .eq('id', offer.id);
                                   
                                   if (updateError) throw updateError;
                                   
                                   // Limpiar CLABEs de ofertas fuente SOLO después de actualizar exitosamente
                                   if (clabeResult.sourceOfferIds.length > 0) {
                                     await clearSourceOfferClabes(clabeResult.sourceOfferIds);
                                   }
                                  
                                  toast({
                                    title: "Esquema asignado",
                                    description: `Se asignó el esquema y se generó la CLABE`,
                                  });
                                  
                                  // Refresh product offers using the main function
                                  if (selectedPropertyForProductOffers) {
                                    const updatedOffers = await fetchPropertyProductOffers(selectedPropertyForProductOffers.id);
                                    setSelectedPropertyProductOffers(updatedOffers);
                                  }
                                } catch (error) {
                                  console.error('Error updating scheme:', error);
                                  toast({
                                    title: "Error",
                                    description: "No se pudo asignar el esquema de pago",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setIsUpdatingScheme(false);
                                }
                              }}
                              onOpenChange={async (open) => {
                                if (open && offer.id_producto) {
                                  setSchemeSelectionOffer(offer);
                                  setIsLoadingSchemes(true);
                                  const { data, error } = await supabase
                                    .from('esquemas_pago')
                                    .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
                                    .eq('id_producto', offer.id_producto)
                                    .eq('activo', true)
                                    .eq('es_manual', false)
                                    .order('nombre');
                                  if (!error && data) {
                                    setProductSchemes(data);
                                  }
                                  setIsLoadingSchemes(false);
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/70">
                                <SelectValue placeholder="Sin esquema" />
                              </SelectTrigger>
                              <SelectContent className="z-[200] bg-popover border shadow-lg">
                                {isLoadingSchemes ? (
                                  <div className="p-4 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    <span className="text-sm">Cargando...</span>
                                  </div>
                                ) : productSchemes.length === 0 ? (
                                  <div className="p-4 text-center text-sm text-muted-foreground">
                                    No hay esquemas disponibles
                                  </div>
                                ) : (
                                  productSchemes.map((scheme) => (
                                    <SelectItem key={scheme.id} value={scheme.id.toString()}>
                                      <div>
                                        <div className="font-medium">{scheme.nombre}</div>
                                        <div className="text-xs text-muted-foreground">
                                          Eng: {scheme.porcentaje_enganche}% • Mens: {scheme.porcentaje_mensualidades}% • Ent: {scheme.porcentaje_entrega}%
                                        </div>
                                      </div>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {offer.id_esquema_pago_seleccionado && offer.id_estatus_aprobacion ? (() => {
                            const estatusColors: Record<number, string> = {
                              1: "bg-yellow-100 text-yellow-800 border-yellow-300",
                              2: "bg-green-100 text-green-800 border-green-300",
                              3: "bg-red-100 text-red-800 border-red-300",
                              4: "bg-blue-100 text-blue-800 border-blue-300",
                            };
                            if (offer.id_estatus_aprobacion === 1) {
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={`${estatusColors[1]} cursor-pointer hover:opacity-80`}
                                  onClick={() => setCambiarEstatusOfferId(offer.id)}
                                >
                                  {(offer as any).estatus_aprobacion?.nombre || 'Aprobación pendiente'} ✎
                                </Badge>
                              );
                            }
                            return (
                              <Badge variant="outline" className={estatusColors[offer.id_estatus_aprobacion] || ""}>
                                {(offer as any).estatus_aprobacion?.nombre || `ID: ${offer.id_estatus_aprobacion}`}
                              </Badge>
                            );
                          })() : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasAccount && offer.cuenta_clabe_stp ? (
                            <div 
                              className="text-xs font-mono text-foreground cursor-pointer hover:text-primary transition-colors"
                              onClick={() => {
                                navigator.clipboard.writeText(offer.cuenta_clabe_stp!);
                                toast({
                                  title: "CLABE copiada",
                                  description: "La CLABE se ha copiado al portapapeles",
                                });
                              }}
                              title="Click para copiar"
                            >
                              {offer.cuenta_clabe_stp}
                            </div>
                          ) : offer.clabe_stp_tmp_producto ? (
                            <div 
                              className="text-xs font-mono text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                              onClick={() => {
                                navigator.clipboard.writeText(offer.clabe_stp_tmp_producto!);
                                toast({
                                  title: "CLABE copiada",
                                  description: "La CLABE se ha copiado al portapapeles",
                                });
                              }}
                              title="Click para copiar"
                            >
                              {offer.clabe_stp_tmp_producto}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasAccount ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`font-mono text-xs ${
                                    isAccountActive 
                                      ? "text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/50" 
                                      : "text-orange-700 bg-orange-100 hover:bg-orange-200 dark:text-orange-300 dark:bg-orange-900/50"
                                  }`}
                                  onClick={() => navigate(`/admin/cuentas-cobranza/${offer.cuenta_cobranza_id}/detalle`)}
                                >
                                  {formatCuentaCobranzaId(offer.cuenta_cobranza_id, 'Producto')}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{isAccountActive ? 'Activa' : 'Cancelada'} - Click para ver detalle</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sin cuenta</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={downloadingOfferId === offer.id}
                            onClick={async () => {
                              try {
                                setDownloadingOfferId(offer.id);
                                
                                const { ofertaPdfStorageService } = await import('@/services/ofertaPdfStorageService');
                                
                                // Verificar si ya existe URL guardada
                                const existingUrl = await ofertaPdfStorageService.getExistingUrl(offer.id);
                                
                                if (existingUrl) {
                                  // Validar que los datos críticos no hayan cambiado
                                  const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offer.id);
                                  
                                  if (!validation.wasInvalidated) {
                                    // URL válida, descargar directamente
                                    toast({
                                      title: "Descargando PDF",
                                      description: "Descargando el PDF de la oferta...",
                                    });
                                    const filename = existingUrl.split('/').pop() || `oferta-producto-${offer.id}.pdf`;
                                    await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
                                    toast({
                                      title: "PDF descargado",
                                      description: "La oferta se ha descargado exitosamente",
                                    });
                                    return;
                                  }
                                  
                                  toast({
                                    title: "Regenerando PDF",
                                    description: "Los datos han cambiado, regenerando...",
                                  });
                                }
                                
                                // No hay URL o fue invalidada, generar nuevo PDF
                                const { generateOfferPDF } = await import('@/services/htmlToPdfService');
                                
                                await generateOfferPDF({
                                  propertyId: selectedPropertyForProductOffers!.id,
                                  offerId: offer.id,
                                  propertyNumber: selectedPropertyForProductOffers!.numero_propiedad,
                                  leadName: offer.lead_name || 'N/A',
                                  leadEmail: offer.lead_email || 'N/A',
                                  leadPhone: offer.lead_telefono || 'N/A',
                                  creatorEmail: offer.email_creador || 'N/A',
                                  isProductOffer: true,
                                  productId: offer.id_producto
                                });

                                toast({
                                  title: "PDF generado",
                                  description: "La oferta se ha descargado exitosamente",
                                });
                              } catch (error) {
                                console.error('Error generating PDF:', error);
                                toast({
                                  title: "Error",
                                  description: "No se pudo generar el PDF de la oferta",
                                  variant: "destructive",
                                });
                              } finally {
                                setDownloadingOfferId(null);
                              }
                            }}
                          >
                            {downloadingOfferId === offer.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron ofertas de productos para esta propiedad
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modals para detalles - movidos desde renderPagination para que siempre estén disponibles */}
      <EstacionamientosDetailDialog
        open={estacionamientosDialogOpen}
        onClose={() => setEstacionamientosDialogOpen(false)}
        estacionamientos={selectedPropertyEstacionamientos}
        propertyNumber={selectedPropertyForDetail?.numero_propiedad || ""}
      />
      
      <BodegasDetailDialog
        open={bodegasDialogOpen}
        onClose={() => setBodegasDialogOpen(false)}
        bodegas={selectedPropertyBodegas}
        propertyNumber={selectedPropertyForDetail?.numero_propiedad || ""}
      />

      {/* Modal de confirmación para generar cuenta de cobranza */}
      <TooltipProvider>
        <AlertDialog open={confirmGenerateAccountOpen} onOpenChange={setConfirmGenerateAccountOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar generación de cuenta de cobranza</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                {selectedOfferForAccount && (
                  <div className="space-y-3 pt-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="font-medium text-foreground">Folio:</div>
                      <div>
                        {selectedOfferForAccount.isProductOffer 
                          ? `OP-${String(selectedOfferForAccount.id).padStart(6, '0')}`
                          : `O-${String(selectedOfferForAccount.id).padStart(6, '0')}`
                        }
                      </div>
                      
                      <div className="font-medium text-foreground">
                        {selectedOfferForAccount.isProductOffer 
                          ? 'Producto/Servicio:'
                          : 'Agente:'
                        }
                      </div>
                      <div>
                        {selectedOfferForAccount.isProductOffer 
                          ? (selectedOfferForAccount.product_name || 'N/A').toUpperCase()
                          : (selectedOfferForAccount.agent_name || 'AGENTE POR DEFINIR').toUpperCase()
                        }
                      </div>
                      
                      <div className="font-medium text-foreground">Comprador:</div>
                      <div>{(selectedOfferForAccount.lead_name || 'N/A').toUpperCase()}</div>
                      
                      <div className="font-medium text-foreground">Fecha:</div>
                      <div>{new Date(selectedOfferForAccount.fecha_generacion).toLocaleDateString()}</div>
                      
                      <div className="font-medium text-foreground">Esquema de pago:</div>
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">
                          {selectedOfferForAccount.esquema_nombre || 
                           availableSchemes.find(s => s.id === (selectedOfferForAccount.isProductOffer ? selectedOfferForAccount.id_esquema_pago_seleccionado : selectedOfferForAccount.esquema_id))?.nombre || 
                           `ID: ${selectedOfferForAccount.isProductOffer ? selectedOfferForAccount.id_esquema_pago_seleccionado : selectedOfferForAccount.esquema_id}`}
                        </div>
                        {(() => {
                          const schemeId = selectedOfferForAccount.isProductOffer 
                            ? selectedOfferForAccount.id_esquema_pago_seleccionado 
                            : selectedOfferForAccount.esquema_id;
                          const scheme = availableSchemes.find(s => s.id === schemeId);
                          if (scheme) {
                            return (
                              <div className="flex flex-wrap gap-2 text-xs">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 text-muted-foreground cursor-help">
                                      <DollarSign className="h-3 w-3" />
                                      {scheme.porcentaje_enganche}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Enganche</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 text-muted-foreground cursor-help">
                                      <Calendar className="h-3 w-3" />
                                      {scheme.porcentaje_mensualidades}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Mensualidades</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 text-muted-foreground cursor-help">
                                      <Home className="h-3 w-3" />
                                      {scheme.porcentaje_entrega}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Contra entrega</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    
                    <div className="mt-4 p-3 bg-muted rounded-md">
                      <p className="text-sm text-foreground">
                        ¿Está seguro que desea generar una cuenta de cobranza para esta oferta?
                      </p>
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setConfirmGenerateAccountOpen(false);
                setSelectedOfferForAccount(null);
              }}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedOfferForAccount) {
                    handleGenerateCollectionAccount(selectedOfferForAccount.id, selectedOfferForAccount.propertyId);
                  }
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>

      <CambiarEstatusAprobacionDialog
        open={!!cambiarEstatusOfferId}
        onOpenChange={(open) => { if (!open) setCambiarEstatusOfferId(null); }}
        offerId={cambiarEstatusOfferId || 0}
        onSuccess={async () => {
          if (selectedPropertyId) {
            const updatedOffers = await fetchPropertyOffers(selectedPropertyId);
            setSelectedPropertyOffers(updatedOffers);
            const updatedProductOffers = await fetchPropertyProductOffers(selectedPropertyId);
            setSelectedPropertyProductOffers(updatedProductOffers);
          }
          refetchActivos();
        }}
      />
      </div>
    </TooltipProvider>
  );
};

export default Propiedades;