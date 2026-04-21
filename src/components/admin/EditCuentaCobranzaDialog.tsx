import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PropertyProgressTimeline } from './PropertyProgressTimeline';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Edit, Trash2, Plus, HeartHandshake, FileText, ExternalLink, CheckCircle, Banknote } from 'lucide-react';
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from '@/lib/config';
import { isFiscalDataComplete } from '@/utils/fiscalDataValidation';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCuentaCobranzaId, formatOfertaId } from "@/utils/cuentaCobranzaUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PersonForm } from './PersonForm';
import { DocumentsTab } from './DocumentsTab';
import { ConfirmEscrituraDialog } from './ConfirmEscrituraDialog';
import { FacturasTab } from './FacturasTab';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface Comprador {
  porcentaje_copropiedad: number;
  personas?: {
    id: number;
    nombre_legal: string;
    rfc?: string;
    curp?: string;
    email: string;
    telefono?: string;
    tipo_persona: string;
    id_estado_civil?: number;
    id_conyuge?: number;
    conyuge?: {
      id: number;
      nombre_legal: string;
      rfc?: string;
      curp?: string;
      email: string;
    } | null;
  };
}

interface CuentaCobranza {
  id: number;
  precio_final: number;
  porcentaje_comision_venta?: number;
}

interface Persona {
  id: number;
  nombre_legal: string;
  rfc?: string;
  curp?: string;
  email: string;
  telefono?: string;
  tipo_persona: string;
}

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago?: string;
  id_concepto: number;
  concepto_nombre?: string;
  pago_completado: boolean;
  monto_pagado: number;
}

interface EsquemaPago {
  id: number;
  nombre: string;
  porcentaje_enganche: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  numero_mensualidades: number;
}

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function SortableItem({ id, children, disabled = false }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id,
    disabled 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: disabled ? 0.6 : 1,
  };

  // Create modified listeners that prevent event propagation on edit elements
  const modifiedListeners = !disabled ? {
    ...listeners,
    onPointerDown: (e: any) => {
      // Don't start drag if clicking on buttons or inputs
      if (e.target.closest('button') || e.target.closest('input')) {
        return;
      }
      listeners?.onPointerDown?.(e);
    }
  } : {};

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...modifiedListeners}
      className={disabled ? 'cursor-not-allowed' : 'cursor-grab'}
    >
      {children}
    </TableRow>
  );
}

const ReadOnlyBanner = ({ isEnDemanda = false }: { isEnDemanda?: boolean }) => (
  <div className={`mb-4 p-3 rounded-lg border ${
    isEnDemanda 
      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" 
      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
  }`}>
    <div className="flex items-center gap-2">
      <CheckCircle className={`h-5 w-5 ${isEnDemanda ? "text-amber-600" : "text-green-600"}`} />
      <span className={`font-medium ${
        isEnDemanda 
          ? "text-amber-700 dark:text-amber-300" 
          : "text-green-700 dark:text-green-300"
      }`}>
        {isEnDemanda 
          ? "Propiedad en demanda - Todos los campos son de solo lectura hasta que termine el juicio"
          : "Propiedad entregada - Esta sección es de solo lectura"
        }
      </span>
    </div>
  </div>
);

interface EditCuentaCobranzaDialogProps {
  cuenta: CuentaCobranza;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditCuentaCobranzaDialog({ cuenta, onClose, onUpdate }: EditCuentaCobranzaDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canUpdate: canUpdateCuenta, isSuperAdmin } = usePagePermissions('/admin/cuentas-cobranza');
  const { registrarActualizacion, registrarEliminacion } = useActivityLogger();
  const [activeTab, setActiveTab] = useState('propiedad');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [acuerdos, setAcuerdos] = useState<AcuerdoPago[]>([]);
  const [selectedEsquema, setSelectedEsquema] = useState('');
  const [editingAcuerdo, setEditingAcuerdo] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<Date | undefined>(undefined);
  const [editingAmount, setEditingAmount] = useState<number | null>(null);
  const [editingMonto, setEditingMonto] = useState<string>('');
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [buyerToDelete, setBuyerToDelete] = useState<{ id: number; name: string; conyugeId?: number; conyugeName?: string } | null>(null);
  const [selectedNotario, setSelectedNotario] = useState<string>('');
  const [deleteAcuerdoDialogOpen, setDeleteAcuerdoDialogOpen] = useState(false);
  const [acuerdoToDelete, setAcuerdoToDelete] = useState<{ id: number; concepto: string; monto: number } | null>(null);
  const [tipoCuenta, setTipoCuenta] = useState<'Propiedad' | 'Producto' | 'Servicio'>('Propiedad');
  const [productoServicioInfo, setProductoServicioInfo] = useState<any>(null);
  const [ofertaProductoData, setOfertaProductoData] = useState<{ id_producto: number | null; id_propiedad: number | null }>({ id_producto: null, id_propiedad: null });
  const [fechaCompra, setFechaCompra] = useState<Date | undefined>(undefined);
  const [valorUma, setValorUma] = useState<string>('');
  const [selectedConyugeForBuyer, setSelectedConyugeForBuyer] = useState<{ buyerPersonaId: number | null; conyugePersonaId: number | null }>({ buyerPersonaId: null, conyugePersonaId: null });
  
  // Estados para campos de escritura
  const [claveCatastral, setClaveCatastral] = useState<string>('');
  const [numeroEscritura, setNumeroEscritura] = useState<string>('');
  const [libro, setLibro] = useState<string>('');
  const [hoja, setHoja] = useState<string>('');
  const [fechaEscritura, setFechaEscritura] = useState<Date | undefined>(undefined);
  const [numeroUnidadPrivativa, setNumeroUnidadPrivativa] = useState<string>('');
  
  // Estados para modal de confirmación
  const [showConfirmEscrituraDialog, setShowConfirmEscrituraDialog] = useState(false);
  const [pendingNumeroEscritura, setPendingNumeroEscritura] = useState<string>('');
  const [shouldGenerateInvoice, setShouldGenerateInvoice] = useState(false);
  const [isCuentaFullyPaid, setIsCuentaFullyPaid] = useState(false);
  
  // Estados para comisiones
  const [porcentajeComision, setPorcentajeComision] = useState<number>(0);
  const [ivaIncluido, setIvaIncluido] = useState<boolean>(false);
  const [searchUsuario, setSearchUsuario] = useState('');
  const [selectedUsuario, setSelectedUsuario] = useState<any>(null);
  const [porcentajeComisionista, setPorcentajeComisionista] = useState<string>('');
  const [esComisionEfectivo, setEsComisionEfectivo] = useState<boolean>(false);
  const [showComisionEfectivoDialog, setShowComisionEfectivoDialog] = useState(false);

  // Estados para edición del precio final
  const [isEditingPrecioFinal, setIsEditingPrecioFinal] = useState(false);
  const [editingPrecioFinal, setEditingPrecioFinal] = useState<string>('');
  const [showPrecioFinalConfirmDialog, setShowPrecioFinalConfirmDialog] = useState(false);

  // Estados para edición de comprador
  const [isEditBuyerDialogOpen, setIsEditBuyerDialogOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<any>(null);
  const [pendingPrecioFinalChange, setPendingPrecioFinalChange] = useState<{
    newPrecio: number;
    difference: number;
    lastAcuerdoId: number;
    lastAcuerdoMonto: number;
    lastAcuerdoPendiente: number;
    lastAcuerdoConcepto: string;
  } | null>(null);

  const handleNavigateToCompradores = (rfc?: string) => {
    if (rfc) {
      // Navigate to compradores page with search filter (not rfc filter)
      navigate(`/admin/compradores?search=${encodeURIComponent(rfc)}`);
    } else {
      navigate('/admin/compradores');
    }
  };

  // Sensors should be empty when in read-only mode
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get cuenta details - usa query key diferente para evitar colisiones con la página padre
  const { data: cuentaDetalle } = useQuery({
    queryKey: ["cuenta_detalle_modal", cuenta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cuentas_cobranza')
        .select('*')
        .eq('id', cuenta.id)
        .single();
      return data;
    }
  });

  // Get sum of actual payments to calculate restante
  const { data: sumaPagosReal } = useQuery({
    queryKey: ["suma_pagos_real_modal", cuenta.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos')
        .select('monto')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);
      
      if (error) throw error;
      return data?.reduce((sum, p) => sum + Number(p.monto), 0) || 0;
    },
    staleTime: 30000,
  });

  // Calculate restante based on real payments
  const restanteCalculado = useMemo(() => {
    if (cuentaDetalle?.precio_final === undefined || sumaPagosReal === undefined) return undefined;
    return Math.max(0, Number(cuentaDetalle.precio_final) - sumaPagosReal);
  }, [cuentaDetalle?.precio_final, sumaPagosReal]);

  // Initialize comisión states when cuentaDetalle loads
  useEffect(() => {
    if (cuentaDetalle) {
      setPorcentajeComision(cuentaDetalle.porcentaje_comision_venta || 0);
      setIvaIncluido((cuentaDetalle as any).iva_incluido || false);
      setEsComisionEfectivo((cuentaDetalle as any).es_comision_venta_efectivo || false);
    }
  }, [cuentaDetalle]);

  // Query separada para determinar tipo de cuenta (siempre se sincroniza vía useEffect, incluso con caché).
  const { data: ofertaTipoData } = useQuery({
    queryKey: ["oferta_tipo_cuenta", cuentaDetalle?.id_oferta],
    queryFn: async () => {
      if (!cuentaDetalle?.id_oferta) return null;
      const { data } = await supabase
        .from('ofertas')
        .select(`
          id_propiedad,
          id_producto,
          productos_servicios!ofertas_id_producto_fkey(
            id,
            nombre,
            descripcion,
            precio_lista,
            id_categoria,
            categorias_producto!productos_servicios_id_categoria_fkey(nombre, tiene_metraje)
          )
        `)
        .eq('id', cuentaDetalle.id_oferta)
        .single();
      return data;
    },
    enabled: !!cuentaDetalle?.id_oferta,
  });

  // Sincroniza tipoCuenta y datos relacionados desde la data de la query (funciona también con caché en re-aperturas del modal).
  useEffect(() => {
    if (!ofertaTipoData) {
      setTipoCuenta('Propiedad');
      setProductoServicioInfo(null);
      setOfertaProductoData({ id_producto: null, id_propiedad: null });
      return;
    }
    if (ofertaTipoData.id_producto && ofertaTipoData.productos_servicios) {
      const categoriaNombre = (ofertaTipoData.productos_servicios as any).categorias_producto?.nombre?.toLowerCase();
      setTipoCuenta(categoriaNombre === 'servicios' ? 'Servicio' : 'Producto');
      setProductoServicioInfo(ofertaTipoData.productos_servicios);
      setOfertaProductoData({ id_producto: ofertaTipoData.id_producto, id_propiedad: ofertaTipoData.id_propiedad });
    } else {
      setTipoCuenta('Propiedad');
      setProductoServicioInfo(null);
      setOfertaProductoData({ id_producto: null, id_propiedad: ofertaTipoData.id_propiedad ?? null });
    }
  }, [ofertaTipoData]);

  // Get property details
  const { data: propiedadDetalle } = useQuery({
    queryKey: ["propiedad_detalle", ofertaTipoData?.id_propiedad],
    queryFn: async () => {
      if (!ofertaTipoData?.id_propiedad) return null;
      const { data } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_interiores,
          m2_exteriores,
          precio_lista,
          descripcion,
          id_entidad_relacionada_dueno,
          id_edificio_modelo,
          edificios_modelos!propiedades_id_edificio_modelo_fkey(
            edificios!edificios_modelos_id_edificio_fkey(
              nombre,
              proyectos!edificios_id_proyecto_fkey(
                nombre,
                direccion
              )
            )
          )
        `)
        .eq('id', ofertaTipoData.id_propiedad)
        .single();
      return data;
    },
    enabled: !!ofertaTipoData?.id_propiedad
  });

  // Get property's cuenta cobranza data (notario and escritura fields) for product accounts
  const { data: propiedadCuentaData } = useQuery({
    queryKey: ["propiedad_cuenta_data", propiedadDetalle?.id, tipoCuenta],
    queryFn: async () => {
      if (!propiedadDetalle?.id || tipoCuenta !== 'Producto') return null;
      
      // First, get ofertas for this property
      const { data: ofertasData } = await supabase
        .from('ofertas')
        .select('id')
        .eq('id_propiedad', propiedadDetalle.id)
        .is('id_producto', null); // Only property offers, not product offers
      
      if (!ofertasData || ofertasData.length === 0) return null;
      
      const ofertaIds = ofertasData.map(o => o.id);
      
      // Get cuenta_cobranza with notario and escritura data from the property
      const { data } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id_notario,
          clave_catastral,
          numero_escritura,
          libro,
          hoja,
          fecha_escritura,
          numero_unidad_privativa
        `)
        .in('id_oferta', ofertaIds)
        .not('id_notario', 'is', null)
        .order('fecha_actualizacion', { ascending: false })
        .limit(1)
        .maybeSingle();

      return data;
    },
    enabled: !!propiedadDetalle?.id && tipoCuenta === 'Producto'
  });

  // Get bodega or estacionamiento details for product accounts
  const { data: bodegaEstacionamientoData } = useQuery({
    queryKey: ["bodega_estacionamiento_data", ofertaProductoData.id_producto, ofertaProductoData.id_propiedad, productoServicioInfo?.categorias_producto?.nombre],
    queryFn: async () => {
      if (!ofertaProductoData.id_producto || !ofertaProductoData.id_propiedad) return null;
      
      const categoriaNombre = productoServicioInfo?.categorias_producto?.nombre?.toLowerCase();
      
      if (categoriaNombre === 'bodega') {
        const { data } = await supabase
          .from('bodegas')
          .select('id, nombre, m2, ubicacion')
          .eq('id_producto', ofertaProductoData.id_producto)
          .eq('id_propiedad', ofertaProductoData.id_propiedad)
          .eq('activo', true)
          .maybeSingle();
        
        return data ? { ...data, tipo: 'bodega' } : null;
      } else if (categoriaNombre === 'estacionamiento') {
        const { data } = await supabase
          .from('estacionamientos')
          .select('id, nombre, m2, ubicacion')
          .eq('id_producto', ofertaProductoData.id_producto)
          .eq('id_propiedad', ofertaProductoData.id_propiedad)
          .eq('activo', true)
          .maybeSingle();
        
        return data ? { ...data, tipo: 'estacionamiento' } : null;
      }
      
      return null;
    },
    enabled: !!ofertaProductoData.id_producto && !!ofertaProductoData.id_propiedad && tipoCuenta === 'Producto'
  });

  const { data: vendedorDetalle } = useQuery({
    queryKey: ["vendedor_detalle", propiedadDetalle?.id_entidad_relacionada_dueno],
    queryFn: async () => {
      if (!propiedadDetalle?.id_entidad_relacionada_dueno) return null;
      
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select(`
          facturar,
          nombre_api_key_draft,
          personas!entidades_relacionadas_id_persona_fkey(*)
        `)
        .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
        .single();

      return data;
    },
    enabled: !!propiedadDetalle?.id_entidad_relacionada_dueno
  });

  // Query para obtener estatus de la propiedad
  const { data: estatusPropiedad } = useQuery({
    queryKey: ["estatus_propiedad", propiedadDetalle?.id],
    queryFn: async () => {
      if (!propiedadDetalle?.id) return null;
      
      const { data, error } = await supabase
        .from('propiedades')
        .select('id_estatus_disponibilidad')
        .eq('id', propiedadDetalle.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!propiedadDetalle?.id
  });

  // Determinar si está en modo solo lectura
  // Determinar si está en modo solo lectura (Entregado=8 o En Demanda=11)
  const isReadOnly = estatusPropiedad?.id_estatus_disponibilidad === 8 || estatusPropiedad?.id_estatus_disponibilidad === 11;
  const isEnDemanda = estatusPropiedad?.id_estatus_disponibilidad === 11;

  // Check if vendedor should generate invoice
  useEffect(() => {
    console.log('🔍 [EditCuentaCobranzaDialog] vendedorDetalle:', vendedorDetalle);
    console.log('🔍 [EditCuentaCobranzaDialog] facturar:', vendedorDetalle?.facturar);
    
    if (vendedorDetalle) {
      const shouldGenerate = vendedorDetalle.facturar === true;
      console.log('🔍 [EditCuentaCobranzaDialog] Actualizando shouldGenerateInvoice a:', shouldGenerate);
      setShouldGenerateInvoice(shouldGenerate);
    } else {
      console.log('⚠️ [EditCuentaCobranzaDialog] vendedorDetalle es undefined/null');
    }
  }, [vendedorDetalle]);

  // Log when dialog opens
  useEffect(() => {
    if (cuenta) {
      console.log('🚀 [EditCuentaCobranzaDialog] Diálogo abierto para cuenta:', cuenta.id);
      console.log('🚀 [EditCuentaCobranzaDialog] shouldGenerateInvoice inicial:', shouldGenerateInvoice);
    }
  }, [cuenta?.id]);

  // Get legal representative details for persona moral
  const { data: representanteLegal } = useQuery({
    queryKey: ["representante_legal", vendedorDetalle?.personas?.id_entidad_relacionada_rep_leg],
    queryFn: async () => {
      if (!vendedorDetalle?.personas?.id_entidad_relacionada_rep_leg) return null;
      
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select(`
          personas!entidades_relacionadas_id_persona_fkey(*)
        `)
        .eq('id', vendedorDetalle.personas.id_entidad_relacionada_rep_leg)
        .single();

      return data;
    },
    enabled: !!vendedorDetalle?.personas?.id_entidad_relacionada_rep_leg
  });

  // Get first buyer (primer comprador) for billing data
  const { data: primerComprador } = useQuery({
    queryKey: ["primer_comprador", cuenta.id],
    queryFn: async () => {
      if (!cuenta.id) return null;
      
      const { data } = await supabase
        .from('compradores')
        .select(`
          personas!compradores_id_persona_fkey(*)
        `)
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: true })
        .limit(1)
        .maybeSingle();

      return data;
    },
    enabled: !!cuenta.id
  });

  // Get estacionamientos details with precio and cuenta_cobranza
  const { data: estacionamientosDetalle } = useQuery({
    queryKey: ["estacionamientos_detalle_cc", propiedadDetalle?.id],
    queryFn: async () => {
      if (!propiedadDetalle?.id) return [];
      
      const { data: estacionamientos } = await supabase
        .from('estacionamientos')
        .select(`
          id,
          nombre,
          m2,
          ubicacion,
          es_incluido,
          id_tipo,
          id_producto,
          tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre),
          productos_servicios!estacionamientos_id_producto_fkey(precio_lista)
        `)
        .eq('id_propiedad', propiedadDetalle.id)
        .eq('activo', true);

      if (!estacionamientos) return [];

      // Check for cuenta_cobranza for each estacionamiento
      const enrichedData = await Promise.all(estacionamientos.map(async (est) => {
        // Look for an oferta that has this producto and this propiedad
        const { data: ofertaData } = await supabase
          .from('ofertas')
          .select('id')
          .eq('id_producto', est.id_producto)
          .eq('id_propiedad', propiedadDetalle.id)
          .eq('activo', true)
          .maybeSingle();

        let cuentaCobranzaId = null;
        if (ofertaData?.id) {
          const { data: ccData } = await supabase
            .from('cuentas_cobranza')
            .select('id')
            .eq('id_oferta', ofertaData.id)
            .eq('activo', true)
            .maybeSingle();
          cuentaCobranzaId = ccData?.id || null;
        }

        const precioM2 = est.productos_servicios?.precio_lista ?? null;
        const precioFinal = precioM2 !== null ? Number(est.m2 || 0) * Number(precioM2) : null;

        return {
          ...est,
          precio_m2: precioM2,
          precio_final: precioFinal,
          cuenta_cobranza_id: cuentaCobranzaId
        };
      }));

      return enrichedData;
    },
    enabled: !!propiedadDetalle?.id
  });

  // Get bodegas details with precio and cuenta_cobranza
  const { data: bodegasDetalle } = useQuery({
    queryKey: ["bodegas_detalle_cc", propiedadDetalle?.id],
    queryFn: async () => {
      if (!propiedadDetalle?.id) return [];
      
      const { data: bodegas } = await supabase
        .from('bodegas')
        .select(`
          id,
          nombre,
          m2,
          ubicacion,
          es_incluido,
          id_producto,
          productos_servicios!bodegas_id_producto_fkey(precio_lista)
        `)
        .eq('id_propiedad', propiedadDetalle.id)
        .eq('activo', true);

      if (!bodegas) return [];

      // Check for cuenta_cobranza for each bodega
      const enrichedData = await Promise.all(bodegas.map(async (bod) => {
        // Look for an oferta that has this producto and this propiedad
        const { data: ofertaData } = await supabase
          .from('ofertas')
          .select('id')
          .eq('id_producto', bod.id_producto)
          .eq('id_propiedad', propiedadDetalle.id)
          .eq('activo', true)
          .maybeSingle();

        let cuentaCobranzaId = null;
        if (ofertaData?.id) {
          const { data: ccData } = await supabase
            .from('cuentas_cobranza')
            .select('id')
            .eq('id_oferta', ofertaData.id)
            .eq('activo', true)
            .maybeSingle();
          cuentaCobranzaId = ccData?.id || null;
        }

        const precioM2 = bod.productos_servicios?.precio_lista ?? null;
        const precioFinal = precioM2 !== null ? Number(bod.m2 || 0) * Number(precioM2) : null;

        return {
          ...bod,
          precio_m2: precioM2,
          precio_final: precioFinal,
          cuenta_cobranza_id: cuentaCobranzaId
        };
      }));

      return enrichedData;
    },
    enabled: !!propiedadDetalle?.id
  });

  // Get existing buyers
  const { data: compradoresExistentes, refetch: refetchCompradores, isLoading: isLoadingCompradores } = useQuery({
    queryKey: ["compradores_existentes", cuenta.id],
    queryFn: async () => {
      // First get compradores with fiscal data
      const { data: compradoresData, error: compradoresError } = await supabase
        .from('compradores')
        .select(`
          porcentaje_copropiedad,
          id_persona,
          personas!compradores_id_persona_fkey(
            id,
            nombre_legal,
            rfc,
            curp,
            email,
            telefono,
            tipo_persona,
            id_estado_civil,
            id_conyuge,
            regimen,
            uso_cfdi,
            direccion_calle,
            direccion_num_ext,
            direccion_num_int,
            direccion_colonia,
            direccion_codigo_postal,
            direccion_id_pais,
            direccion_id_estado,
            direccion_id_municipio,
            direccion_fiscal_calle,
            direccion_fiscal_num_ext,
            direccion_fiscal_num_int,
            direccion_fiscal_colonia,
            direccion_fiscal_codigo_postal,
            direccion_fiscal_id_pais,
            direccion_fiscal_id_estado,
            direccion_fiscal_id_municipio,
            direccion_fiscal_id_pais,
            direccion_fiscal_id_estado,
            direccion_fiscal_id_municipio
          )
        `)
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);

      if (compradoresError) {
        console.error('Error fetching compradores:', compradoresError);
        return [];
      }

      console.log('Compradores fetched for cuenta', cuenta.id, ':', compradoresData);

      // If no compradores, return empty array
      if (!compradoresData || compradoresData.length === 0) {
        return [];
      }

      // Now fetch conyuge data separately for those who have id_conyuge
      const conyugeIds = compradoresData
        .map(c => c.personas?.id_conyuge)
        .filter((id): id is number => id != null);

      let conyugesMap: Record<number, any> = {};
      
      if (conyugeIds.length > 0) {
        const { data: conyugesData } = await supabase
          .from('personas')
          .select('id, nombre_legal, rfc, curp, email')
          .in('id', conyugeIds);

        if (conyugesData) {
          conyugesMap = conyugesData.reduce((acc, conyuge) => {
            acc[conyuge.id] = conyuge;
            return acc;
          }, {} as Record<number, any>);
        }
      }

      // Combine the data
      const compradoresWithConyuge = compradoresData.map(comprador => ({
        ...comprador,
        personas: comprador.personas ? {
          ...comprador.personas,
          conyuge: comprador.personas.id_conyuge ? conyugesMap[comprador.personas.id_conyuge] : null
        } : undefined
      }));

      console.log('Compradores with conyuge data:', compradoresWithConyuge);
      
      return compradoresWithConyuge;
    }
  });

  // Get selected payment scheme for this offer
  const { data: selectedPaymentScheme } = useQuery({
    queryKey: ["selected_payment_scheme", cuentaDetalle?.id_oferta],
    queryFn: async () => {
      if (!cuentaDetalle?.id_oferta) return null;
      
      const { data: offerData } = await supabase
        .from('ofertas')
        .select('id_esquema_pago_seleccionado')
        .eq('id', cuentaDetalle.id_oferta)
        .single();

      if (!offerData?.id_esquema_pago_seleccionado) return null;

      const { data: schemeData } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id', offerData.id_esquema_pago_seleccionado)
        .single();

      return schemeData;
    },
    enabled: !!cuentaDetalle?.id_oferta
  });

  // Get payment agreements - usa query key diferente para evitar colisiones con la página padre
  const { data: acuerdosPago } = useQuery({
    queryKey: ["acuerdos_pago_modal", cuenta.id],
    queryFn: async () => {
      // Use raw query to avoid TypeScript type issues
      const { data: acuerdos, error } = await supabase
        .from('acuerdos_pago')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) {
        console.error('Error fetching acuerdos_pago:', error);
        throw error;
      }

      if (!acuerdos || acuerdos.length === 0) return [];

      // Get conceptos de pago
      const conceptoIds = [...new Set(acuerdos.map((a: any) => a.id_concepto))];
      const { data: conceptos } = await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds);

      // Get aplicaciones de pago for each acuerdo
      const acuerdoIds = acuerdos.map((a: any) => a.id);
      const { data: aplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select(`
          id,
          monto,
          id_acuerdo_pago
        `)
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      return acuerdos.map((acuerdo: any) => {
        const concepto = conceptos?.find(c => c.id === acuerdo.id_concepto);
        const acuerdoAplicaciones = aplicaciones?.filter(a => a.id_acuerdo_pago === acuerdo.id) || [];
        
        // Calculate total paid amount from aplicaciones
        const totalAplicado = acuerdoAplicaciones.reduce((sum, app) => sum + app.monto, 0);
        
        return {
          id: acuerdo.id,
          orden: acuerdo.orden,
          monto: acuerdo.monto,
          fecha_pago: acuerdo.fecha_pago,
          id_concepto: acuerdo.id_concepto,
          concepto_nombre: concepto?.nombre || 'Sin concepto',
          pago_completado: acuerdo.pago_completado, // Use the database field directly
          monto_pagado: totalAplicado
        };
      });
    }
  });

  // Calculate current payment plan details from acuerdos
  const currentPaymentPlan = acuerdosPago && cuentaDetalle ? (() => {
    const apartado = acuerdosPago.find((a: any) => a.concepto_nombre?.toLowerCase() === 'apartado');
    const enganche = acuerdosPago.find((a: any) => a.concepto_nombre?.toLowerCase() === 'enganche');
    const parcialidades = acuerdosPago.filter((a: any) => a.concepto_nombre?.toLowerCase() === 'parcialidad');
    const contraentrega = acuerdosPago.find((a: any) => a.concepto_nombre?.toLowerCase() === 'pago a contra entrega');
    // Include pagos especiales
    const pagosEspeciales = acuerdosPago.filter((a: any) => a.concepto_nombre?.toLowerCase() === 'pago especial');

    if (!cuentaDetalle.precio_final) return null;

    const totalEnganche = (apartado?.monto || 0) + (enganche?.monto || 0);
    const totalParcialidades = parcialidades.reduce((sum: number, p: any) => sum + p.monto, 0);
    const totalContraentrega = contraentrega?.monto || 0;
    const totalPagosEspeciales = pagosEspeciales.reduce((sum: number, p: any) => sum + p.monto, 0);

    return {
      porcentaje_enganche: Number(((totalEnganche / cuentaDetalle.precio_final) * 100).toFixed(2)),
      porcentaje_mensualidades: Number(((totalParcialidades / cuentaDetalle.precio_final) * 100).toFixed(2)),
      porcentaje_entrega: Number(((totalContraentrega / cuentaDetalle.precio_final) * 100).toFixed(2)),
      numero_mensualidades: parcialidades.length,
      // Montos reales de los acuerdos
      monto_enganche: totalEnganche,
      monto_mensualidades: totalParcialidades,
      monto_entrega: totalContraentrega,
      // Pagos especiales
      monto_pagos_especiales: totalPagosEspeciales,
      numero_pagos_especiales: pagosEspeciales.length,
      porcentaje_pagos_especiales: Number(((totalPagosEspeciales / cuentaDetalle.precio_final) * 100).toFixed(2))
    };
  })() : null;

  // Check if payment plan has been modified
  const isPaymentPlanModified = selectedPaymentScheme && currentPaymentPlan ? (
    Math.abs(selectedPaymentScheme.porcentaje_enganche - currentPaymentPlan.porcentaje_enganche) > 0.01 ||
    Math.abs(selectedPaymentScheme.porcentaje_mensualidades - currentPaymentPlan.porcentaje_mensualidades) > 0.01 ||
    Math.abs(selectedPaymentScheme.porcentaje_entrega - currentPaymentPlan.porcentaje_entrega) > 0.01 ||
    selectedPaymentScheme.numero_mensualidades !== currentPaymentPlan.numero_mensualidades
  ) : false;

  // Calculate if cuenta has pending payments and get last pending acuerdo
  const hasPendingPayments = useMemo(() => {
    return acuerdos?.some(a => !a.pago_completado) || false;
  }, [acuerdos]);

  // Get the last acuerdo (pago a contra entrega or the last one by orden)
  const lastAcuerdo = useMemo(() => {
    if (!acuerdos || acuerdos.length === 0) return null;
    
    // First, try to find "Pago a contra entrega" that is not fully paid
    const contraEntrega = acuerdos.find(a => 
      a.concepto_nombre?.toLowerCase() === 'pago a contra entrega' && !a.pago_completado
    );
    if (contraEntrega) return contraEntrega;
    
    // Otherwise, get the last pending acuerdo by orden
    const pendingAcuerdos = acuerdos.filter(a => !a.pago_completado);
    if (pendingAcuerdos.length > 0) {
      return pendingAcuerdos.reduce((max, a) => a.orden > max.orden ? a : max, pendingAcuerdos[0]);
    }
    
    return null;
  }, [acuerdos]);

  // Check if user can edit precio final - for both Producto and Propiedad accounts
  const canEditPrecioFinal = (canUpdateCuenta || isSuperAdmin) && hasPendingPayments && !isReadOnly;

  // Get payment schemes
  const { data: esquemasPago } = useQuery({
    queryKey: ["esquemas_pago"],
    queryFn: async () => {
      if (!propiedadDetalle) return [];
      
      const { data: entidad } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
        .single();
        
      if (!entidad?.id_proyecto) return [];

      const { data } = await supabase
        .from('esquemas_pago')
        .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
        .eq('id_proyecto', entidad.id_proyecto)
        .eq('es_manual', false)
        .eq('activo', true)
        .order('orden', { ascending: true });

      return data || [];
    },
    enabled: !!propiedadDetalle
  });

  // Get inmobiliaria name for the project (Type 5 = Inmobiliaria)
  const { data: inmobiliariaProyecto } = useQuery({
    queryKey: ["inmobiliaria_proyecto_comision", propiedadDetalle?.id_entidad_relacionada_dueno],
    queryFn: async () => {
      if (!propiedadDetalle?.id_entidad_relacionada_dueno) return null;
      
      const { data: entidad } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
        .single();
        
      if (!entidad?.id_proyecto) return null;

      const { data: inmobiliaria } = await supabase
        .from('entidades_relacionadas')
        .select('personas!entidades_relacionadas_id_persona_fkey(nombre_comercial, nombre_legal)')
        .eq('id_proyecto', entidad.id_proyecto)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .single();

      const persona = inmobiliaria?.personas as any;
      return persona?.nombre_comercial || persona?.nombre_legal || null;
    },
    enabled: !!propiedadDetalle?.id_entidad_relacionada_dueno
  });

  // Get notarios
  const { data: notarios } = useQuery({
    queryKey: ["notarios"],
    queryFn: async () => {
      const { data } = await supabase
        .from('notarios')
        .select('id, nombre, notaria, direccion, email, telefono')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      return data || [];
    }
  });

  // Check if there are any facturas for this cuenta
  const { data: hasFacturas } = useQuery({
    queryKey: ["has_facturas", cuenta.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('id, tipos_documento!documentos_id_tipo_documento_fkey(nombre)')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);

      if (error) {
        console.error('Error checking facturas:', error);
        return false;
      }

      // Check if any document is a factura
      const hasInvoice = data?.some(doc => 
        doc.tipos_documento?.nombre?.toLowerCase().includes('factura')
      );

      return hasInvoice || false;
    },
    enabled: !!cuenta.id
  });

  // Search for persons (buyers/leads) - search by name, RFC, CURP, email
  const { data: personasBusqueda } = useQuery({
    queryKey: ["personas_busqueda", searchTerm, compradoresExistentes?.map(c => c.personas?.id)],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      
      // Get existing buyer IDs to exclude them
      const existingBuyerIds = compradoresExistentes?.map(c => c.personas?.id).filter(Boolean) || [];
      
      const { data } = await supabase
        .from('personas')
        .select('id, nombre_legal, rfc, curp, email, telefono, tipo_persona')
        .or(`nombre_legal.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%,curp.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .eq('activo', true)
        .not('id', 'in', existingBuyerIds.length > 0 ? `(${existingBuyerIds.join(',')})` : '(0)')
        .limit(10);

      return data || [];
    },
    enabled: searchTerm.length >= 2
  });

  useEffect(() => {
    if (acuerdosPago) {
      setAcuerdos(acuerdosPago);
    }
  }, [acuerdosPago]);

  // Calculate if cuenta is fully paid
  useEffect(() => {
    if (acuerdosPago && acuerdosPago.length > 0) {
      const totalAcordado = acuerdosPago.reduce((sum: number, a: any) => sum + (a.monto || 0), 0);
      const totalPagado = acuerdosPago.reduce((sum: number, a: any) => sum + (a.monto_pagado || 0), 0);
      setIsCuentaFullyPaid(totalPagado >= totalAcordado && totalAcordado > 0);
    } else {
      setIsCuentaFullyPaid(false);
    }
  }, [acuerdosPago]);

  // Update selectedNotario and escritura fields when cuentaDetalle or propiedadCuentaData is loaded
  useEffect(() => {
    // For product accounts, use data from property's cuenta_cobranza if available
    const sourceData = (tipoCuenta === 'Producto' && propiedadCuentaData) ? propiedadCuentaData : cuentaDetalle;
    
    if (sourceData?.id_notario) {
      setSelectedNotario(sourceData.id_notario.toString());
    }
    if (sourceData) {
      setClaveCatastral(sourceData.clave_catastral || '');
      setNumeroEscritura(sourceData.numero_escritura || '');
      setLibro(sourceData.libro || '');
      setHoja(sourceData.hoja || '');
      setNumeroUnidadPrivativa(sourceData.numero_unidad_privativa || '');
      if (sourceData.fecha_escritura) {
        // Parse date string as local date to avoid timezone issues
        const [year, month, day] = sourceData.fecha_escritura.split('-').map(Number);
        setFechaEscritura(new Date(year, month - 1, day));
      }
    }
  }, [cuentaDetalle, propiedadCuentaData, tipoCuenta]);

  // Initialize fechaCompra from cuentaDetalle
  useEffect(() => {
    if (cuentaDetalle?.fecha_compra) {
      // Parse date string as local date to avoid timezone issues
      const [year, month, day] = cuentaDetalle.fecha_compra.split('-').map(Number);
      setFechaCompra(new Date(year, month - 1, day));
    }
  }, [cuentaDetalle]);

  // Initialize valorUma from cuentaDetalle
  useEffect(() => {
    if (cuentaDetalle?.valor_uma !== undefined && cuentaDetalle?.valor_uma !== null) {
      setValorUma(String(cuentaDetalle.valor_uma));
    }
  }, [cuentaDetalle]);

  // Mutation to update fecha_compra
  const updateFechaCompraMutation = useMutation({
    mutationFn: async (newDate: Date) => {
      // Format date as YYYY-MM-DD using local timezone
      const year = newDate.getFullYear();
      const month = String(newDate.getMonth() + 1).padStart(2, '0');
      const day = String(newDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update({ fecha_compra: formattedDate })
        .eq('id', cuenta.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fecha de compra actualizada exitosamente");
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating fecha_compra:", error);
      toast.error("Error al actualizar la fecha de compra");
    }
  });

  const updateValorUmaMutation = useMutation({
    mutationFn: async (newValorUma: number) => {
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update({ valor_uma: newValorUma })
        .eq('id', cuenta.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valor de la UMA actualizado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating valor_uma:", error);
      toast.error("Error al actualizar el valor de la UMA");
    }
  });

  const totalPorcentajes = compradoresExistentes?.reduce((sum, c) => sum + (c.porcentaje_copropiedad || 0), 0) || 0;
  const porcentajeDisponible = 100 - totalPorcentajes;
  const isMultipleBuyers = compradoresExistentes && compradoresExistentes.length > 1;
  const isValidTotal = Math.abs(totalPorcentajes - 100) < 0.01; // Allow for small floating point differences

  // Mutation to update buyer percentage
  const updateBuyerPercentageMutation = useMutation({
    mutationFn: async ({ buyerId, newPercentage }: { buyerId: number; newPercentage: number }) => {
      const { error } = await supabase
        .from('compradores')
        .update({ porcentaje_copropiedad: newPercentage })
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('id_persona', buyerId)
        .eq('activo', true);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refetchCompradores();
    },
    onError: (error) => {
      console.error("Error updating buyer percentage:", error);
      toast.error("Error al actualizar el porcentaje: " + (error as Error).message);
    }
  });

  // Mutation to delete buyer
  const deleteBuyerMutation = useMutation({
    mutationFn: async (params: { personaId: number; conyugeId?: number }) => {
      // Delete the main buyer
      const { error: deleteError } = await supabase
        .from('compradores')
        .delete()
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('id_persona', params.personaId);
      
      if (deleteError) throw deleteError;

      // If there's a spouse, delete them too
      if (params.conyugeId) {
        const { error: deleteConyugeError } = await supabase
          .from('compradores')
          .delete()
          .eq('id_cuenta_cobranza', cuenta.id)
          .eq('id_persona', params.conyugeId);
        
        if (deleteConyugeError) throw deleteConyugeError;
      }

      // Get remaining buyers after deletion
      const { data: remainingBuyers, error: fetchError } = await supabase
        .from('compradores')
        .select('id_persona')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);

      if (fetchError) throw fetchError;

      // If there are remaining buyers, redistribute percentages equally
      if (remainingBuyers && remainingBuyers.length > 0) {
        const newPercentage = 100 / remainingBuyers.length;
        
        // Update all remaining buyers with equal percentage
        const { error: updateError } = await supabase
          .from('compradores')
          .update({ porcentaje_copropiedad: newPercentage })
          .eq('id_cuenta_cobranza', cuenta.id)
          .eq('activo', true);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      const deletedNames = buyerToDelete?.conyugeId && buyerToDelete.conyugeName
        ? `${buyerToDelete.name} y ${buyerToDelete.conyugeName}`
        : buyerToDelete?.name;
      toast.success(`Comprador${buyerToDelete?.conyugeId ? 'es' : ''} ${deletedNames} eliminado${buyerToDelete?.conyugeId ? 's' : ''} y porcentajes redistribuidos exitosamente`);
      refetchCompradores();
      setDeleteDialogOpen(false);
      setBuyerToDelete(null);
    },
    onError: (error) => {
      console.error("Error deleting buyer:", error);
      toast.error("Error al eliminar comprador: " + (error as Error).message);
    }
  });

  // Mutation para actualizar comprador
  const updateBuyerMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingBuyer?.id);
      
      if (updateError) throw updateError;
      
      // Actualizar representante legal
      if (representativeId !== undefined) {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingBuyer?.id);
          
        if (repError) throw repError;
      }

      // Si se actualizó el id_conyuge, sincronizar cuentas de compradores
      if (cleanPersonData.id_conyuge !== undefined && editingBuyer?.id) {
        const { error: syncError } = await supabase
          .rpc('sync_conyuge_compradores', {
            p_id_persona: editingBuyer.id
          });
        
        if (syncError) {
          console.error('Error al sincronizar cónyuge en compradores:', syncError);
          throw new Error(`Error al sincronizar compradores: ${syncError.message}`);
        }
      }
    },
    onSuccess: () => {
      refetchCompradores();
      setIsEditBuyerDialogOpen(false);
      setEditingBuyer(null);
      toast.success("Comprador actualizado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar el comprador: ${error.message}`);
    },
  });

  const handleEditBuyer = async (personaId: number) => {
    // Fetch full persona data for editing
    const { data: personaData, error } = await supabase
      .from('personas')
      .select('*')
      .eq('id', personaId)
      .single();
    
    if (error) {
      toast.error('Error al cargar datos del comprador');
      return;
    }
    
    setEditingBuyer(personaData);
    setIsEditBuyerDialogOpen(true);
  };

  const handleDeleteBuyer = (personaId: number, nombreComprador: string) => {
    // Find the comprador to check for spouse
    const comprador = compradoresExistentes?.find(c => c.personas?.id === personaId);
    const conyugeId = comprador?.personas?.id_conyuge;
    const conyugeName = conyugeId 
      ? comprador?.personas?.conyuge && typeof comprador.personas.conyuge === 'object' && 'nombre_legal' in comprador.personas.conyuge
        ? comprador.personas.conyuge.nombre_legal
        : undefined
      : undefined;
    
    setBuyerToDelete({ 
      id: personaId, 
      name: nombreComprador,
      conyugeId,
      conyugeName
    });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteBuyer = () => {
    if (buyerToDelete) {
      deleteBuyerMutation.mutate({ 
        personaId: buyerToDelete.id,
        conyugeId: buyerToDelete.conyugeId
      });
    }
  };

  const handlePercentageChange = (buyerId: number, newValue: string) => {
    const newPercentage = parseFloat(newValue) || 0;
    if (newPercentage >= 0 && newPercentage <= 100) {
      updateBuyerPercentageMutation.mutate({ buyerId, newPercentage });
    }
  };

  const handleTabChange = (newTab: string) => {
    if (activeTab === 'compradores' && !isValidTotal) {
      toast.error("Los porcentajes de copropiedad deben sumar exactamente 100% antes de cambiar de pestaña");
      return;
    }
    setActiveTab(newTab);
  };

  const handleCloseModal = () => {
    if (activeTab === 'compradores' && !isValidTotal) {
      toast.error("Los porcentajes de copropiedad deben sumar exactamente 100% antes de cerrar");
      return;
    }
    onClose();
  };
  const addCompradorMutation = useMutation({
    mutationFn: async ({ personaId, updateEstadoCivilTo }: { personaId: number; updateEstadoCivilTo?: number }) => {
      console.log('Adding buyer with personaId:', personaId, typeof personaId);
      
      // Validate personaId
      if (!personaId || typeof personaId !== 'number' || isNaN(personaId)) {
        throw new Error('ID de persona inválido');
      }

      // Update estado civil if specified (for spouse)
      if (updateEstadoCivilTo) {
        const { error: updateEstadoCivilError } = await supabase
          .from('personas')
          .update({ id_estado_civil: updateEstadoCivilTo })
          .eq('id', personaId);

        if (updateEstadoCivilError) {
          console.error("Error updating estado civil:", updateEstadoCivilError);
          throw updateEstadoCivilError;
        }
      }

      // Get the project ID from the entidad relacionada dueno
      if (propiedadDetalle?.id_entidad_relacionada_dueno) {
        const { data: entidadData } = await supabase
          .from('entidades_relacionadas')
          .select('id_proyecto')
          .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
          .single();
          
        const projectId = entidadData?.id_proyecto;
        
        if (projectId) {
          // Check if person exists in entidades_relacionadas with id_tipo_entidad=7
          const { data: existingRelation } = await supabase
            .from("entidades_relacionadas")
            .select("id")
            .eq("id_persona", personaId)
            .eq("id_tipo_entidad", 7)
            .eq("activo", true)
            .maybeSingle();

          if (!existingRelation) {
            // Create new relation in entidades_relacionadas with id_tipo_entidad=2
            const relationData = {
              id_persona: personaId,
              id_proyecto: null, // Set to null for buyers as requested
              id_tipo_entidad: 2,
              id_estatus_persona: 3,
              activo: true
            };

            console.log('Creating entidades_relacionadas with data:', relationData);
            const { error: relationError } = await supabase
              .from("entidades_relacionadas")
              .insert(relationData);

            if (relationError) {
              console.error("Error creating entidades_relacionadas:", relationError);
              throw relationError;
            }
          }
        }
      }

      // Calculate the new percentage for equal distribution
      const currentBuyersCount = compradoresExistentes?.length || 0;
      const newBuyersCount = currentBuyersCount + 1;
      const newPercentage = 100 / newBuyersCount;

      // First, add the new buyer
      const compradorData = {
        id_cuenta_cobranza: cuenta.id,
        id_persona: personaId,
        porcentaje_copropiedad: newPercentage,
        activo: true
      };
      
      console.log('Creating comprador with data:', compradorData);
      const { error: insertError } = await supabase
        .from('compradores')
        .insert(compradorData);
      
      if (insertError) {
        console.error("Error creating comprador:", insertError);
        throw insertError;
      }

      // Then update all existing buyers with the new percentage
      if (compradoresExistentes && compradoresExistentes.length > 0) {
        for (const comprador of compradoresExistentes) {
          const { error: updateError } = await supabase
            .from('compradores')
            .update({ porcentaje_copropiedad: newPercentage })
            .eq('id_cuenta_cobranza', cuenta.id)
            .eq('id_persona', comprador.personas?.id)
            .eq('activo', true);
          
          if (updateError) {
            console.error("Error updating buyer percentage:", updateError);
          }
        }
      }
    },
    onSuccess: async () => {
      console.log('Buyer added successfully, setting tab to compradores');
      toast.success("Comprador agregado exitosamente. Puedes agregar más compradores.");
      refetchCompradores();
      // Don't call onUpdate() to prevent modal from closing
      setSelectedPersona(null);
      setSelectedConyugeForBuyer({ buyerPersonaId: null, conyugePersonaId: null });
      // Ensure we stay in "compradores" tab after successful addition
      console.log('Current activeTab before setting:', activeTab);
      setActiveTab('compradores');
      console.log('Tab set to compradores');
      // Note: Client user creation is now handled automatically by database trigger
    },
    onError: (error) => {
      console.error("Error adding buyer:", error);
      toast.error("Error al agregar comprador: " + (error as Error).message);
    }
  });

  // Mutation to create payment agreement
  const createAcuerdoMutation = useMutation({
    mutationFn: async (esquemaId: number) => {
      if (!cuentaDetalle) throw new Error('Cuenta no encontrada');
      
      // 1. Actualizar el esquema de pago seleccionado en la oferta
      const { error: updateError } = await supabase
        .from('ofertas')
        .update({ id_esquema_pago_seleccionado: esquemaId })
        .eq('id', cuentaDetalle.id_oferta);
      
      if (updateError) throw updateError;
      
      // 2. Obtener datos necesarios para el webhook
      const { data: ofertaData, error: ofertaError } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          id_producto,
          id_persona_lead,
          personas!ofertas_id_persona_lead_fkey(rfc, curp)
        `)
        .eq('id', cuentaDetalle.id_oferta)
        .single();
      
      if (ofertaError || !ofertaData) throw new Error('No se pudo obtener la oferta');
      
      // 3. Determinar RFC/CURP del ordenante
      const rfc_curp_ordenante = ofertaData.personas?.rfc || ofertaData.personas?.curp || '';
      
      // 4. Llamar al webhook
      const webhookResponse = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      body: JSON.stringify({
        siguiente_accion: "genera_acuerdo_para_cuenta_cobranza",
        id_oferta: ofertaData.id,
        id_propiedad: ofertaData.id_propiedad || null,
        id_cuenta_cobranza: cuentaDetalle.id,
        clabe_stp: cuentaDetalle.clabe_stp || '',
        rfc_curp_ordenante: rfc_curp_ordenante,
        environment: ENVIRONMENT
      }),
      });
      
      if (!webhookResponse.ok) {
        throw new Error(`Error en webhook: ${webhookResponse.statusText}`);
      }
      
      const result = await webhookResponse.json();
      return result;
    },
    onSuccess: () => {
      toast.success("Acuerdo de pago creado y pagos aplicados exitosamente");
      setSelectedEsquema('');
      
      // Invalidar queries para refrescar datos
      queryClient.invalidateQueries({ queryKey: ['acuerdos_pago', cuenta.id] });
      queryClient.invalidateQueries({ queryKey: ['cuenta_detalle_modal', cuenta.id] });
      queryClient.invalidateQueries({ queryKey: ['selected_payment_scheme'] });
    },
    onError: (error: Error) => {
      console.error('Error creating acuerdo:', error);
      toast.error(error.message || "Error al crear acuerdo de pago");
    }
  });

  const handleAddComprador = () => {
    if (!selectedPersona) {
      toast.error("No se ha seleccionado ninguna persona");
      return;
    }

    if (!selectedPersona.id || typeof selectedPersona.id !== 'number') {
      toast.error("ID de persona inválido");
      return;
    }

    console.log('handleAddComprador called with selectedPersona:', selectedPersona);
    console.log('Current activeTab before mutation:', activeTab);
    addCompradorMutation.mutate({ 
      personaId: selectedPersona.id
    });
    console.log('Mutation triggered from handleAddComprador');
  };

  const handleCreateAcuerdo = () => {
    if (!selectedEsquema) return;
    createAcuerdoMutation.mutate(parseInt(selectedEsquema));
  };

  // Query for comisionistas
  const { data: comisionistas, refetch: refetchComisionistas } = useQuery({
    queryKey: ["comisionistas", cuenta.id],
    queryFn: async () => {
      const { data: comisionistasData } = await supabase
        .from('comisionistas')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);
      
      if (!comisionistasData || comisionistasData.length === 0) return [];
      
      // Get unique emails from comisionistas
      const emails = comisionistasData.map(c => c.email_usuario);
      
      // Fetch usuarios data
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('email, nombre')
        .in('email', emails);
      
      // Create a map for quick lookup from usuarios
      const usuariosMap = new Map(usuariosData?.map(u => [u.email, { nombre: u.nombre, esInmobiliaria: false }]) || []);
      
      // Find emails not in usuarios and fetch from personas (inmobiliarias)
      const emailsNotInUsuarios = emails.filter(email => !usuariosMap.has(email));
      
      if (emailsNotInUsuarios.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInUsuarios)
          .eq('activo', true);
        
        // Add personas to the map
        personasData?.forEach(p => {
          usuariosMap.set(p.email, { 
            nombre: p.nombre_legal, 
            esInmobiliaria: p.tipo_persona === 'pm' 
          });
        });
      }
      
      // Merge data
      const mergedData = comisionistasData.map(c => ({
        ...c,
        usuarios: usuariosMap.get(c.email_usuario) || null
      }));
      
      return mergedData;
    }
  });

  // Query for searching usuarios
  // Query for searching usuarios - includes Super Admin (1), Admin Proyecto (2), Agente Inmobiliario (3), Agente Interno (9), Admin Data (10)
  const { data: usuarios } = useQuery({
    queryKey: ["usuarios_search", searchUsuario],
    queryFn: async () => {
      if (!searchUsuario || searchUsuario.length < 2) return [];
      
      // Get existing comisionistas emails
      const existingEmails = comisionistas?.map(c => c.email_usuario) || [];
      
      // Filter by es_rol_interno = true to include all internal roles automatically
      const { data } = await supabase
        .from('usuarios')
        .select('email, nombre, roles!inner(es_rol_interno)')
        .eq('roles.es_rol_interno', true)
        .or(`email.ilike.%${searchUsuario}%,nombre.ilike.%${searchUsuario}%`)
        .not('email', 'in', existingEmails.length > 0 ? `(${existingEmails.map(e => `"${e}"`).join(',')})` : '("")')
        .limit(10);
      
      return data || [];
    },
    enabled: searchUsuario.length >= 2
  });

  // Query for searching inmobiliarias (personas morales - tipo_persona = 'pm')
  const { data: inmobiliarias } = useQuery({
    queryKey: ["inmobiliarias_search", searchUsuario],
    queryFn: async (): Promise<Array<{ email: string; nombre: string; esInmobiliaria: boolean }>> => {
      if (!searchUsuario || searchUsuario.length < 2) return [];
      
      // Get existing comisionistas emails
      const existingEmails = comisionistas?.map(c => c.email_usuario) || [];
      
      const { data } = await supabase
        .from('personas')
        .select('id, nombre_legal, email, rfc')
        .eq('tipo_persona', 'pm') // Persona Moral (Inmobiliaria/Empresa)
        .eq('activo', true)
        .or(`email.ilike.%${searchUsuario}%,nombre_legal.ilike.%${searchUsuario}%`)
        .limit(20);
      
      // Filter out existing comisionistas
      const filtered = (data || []).filter((p: { email: string }) => !existingEmails.includes(p.email));
      
      // Transform to match usuario format
      return filtered.map((p: { email: string; nombre_legal: string }) => ({
        email: p.email,
        nombre: p.nombre_legal,
        esInmobiliaria: true
      }));
    },
    enabled: searchUsuario.length >= 2
  });

  // Combine usuarios and inmobiliarias for display
  const combinedSearchResults = useMemo(() => {
    const allResults: Array<{ email: string; nombre: string; esInmobiliaria?: boolean }> = [];
    if (usuarios) allResults.push(...usuarios.map(u => ({ ...u, esInmobiliaria: false })));
    if (inmobiliarias) allResults.push(...inmobiliarias);
    return allResults;
  }, [usuarios, inmobiliarias]);

  // Mutation to update comisión data
  const updateComisionMutation = useMutation({
    mutationFn: async ({ porcentaje, ivaIncluido, esComisionEfectivo }: { porcentaje: number; ivaIncluido: boolean; esComisionEfectivo?: boolean }) => {
      const updateData: any = { 
        porcentaje_comision_venta: porcentaje,
        iva_incluido: ivaIncluido
      };
      
      if (esComisionEfectivo !== undefined) {
        updateData.es_comision_venta_efectivo = esComisionEfectivo;
      }
      
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update(updateData)
        .eq('id', cuenta.id);
      
      if (error) throw error;
      return { porcentaje, ivaIncluido };
    },
    onSuccess: (_, variables) => {
      toast.success("Información de comisión actualizada");
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
      
      // Log de actividad
      const cambios: Record<string, unknown> = {};
      const anteriores: Record<string, unknown> = {};
      if (variables.porcentaje !== (cuentaDetalle?.porcentaje_comision_venta || 0)) {
        anteriores.porcentaje_comision_venta = cuentaDetalle?.porcentaje_comision_venta || 0;
        cambios.porcentaje_comision_venta = variables.porcentaje;
      }
      if (variables.ivaIncluido !== ((cuentaDetalle as any)?.iva_incluido || false)) {
        anteriores.iva_incluido = (cuentaDetalle as any)?.iva_incluido || false;
        cambios.iva_incluido = variables.ivaIncluido;
      }
      if (Object.keys(cambios).length > 0) {
        registrarActualizacion(
          'cuentas_cobranza',
          { id_cuenta: cuenta.id, ...anteriores },
          { id_cuenta: cuenta.id, ...cambios },
          'actualizar_comision_cuenta_cobranza'
        );
      }
    },
    onError: (error) => {
      console.error("Error updating comisión:", error);
      toast.error("Error al actualizar la comisión");
    }
  });

  // Mutation to add comisionista
  const addComisionistaMutation = useMutation({
    mutationFn: async ({ email, porcentaje }: { email: string; porcentaje: number }) => {
      // First, check if there's an inactive comisionista for this cuenta and email
      const { data: existingComisionista } = await supabase
        .from('comisionistas')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('email_usuario', email)
        .eq('activo', false)
        .maybeSingle();

      if (existingComisionista) {
        // Reactivate existing comisionista
        const { error } = await supabase
          .from('comisionistas')
          .update({
            activo: true,
            porcentaje_comision: porcentaje
          })
          .eq('id_cuenta_cobranza', cuenta.id)
          .eq('email_usuario', email);
        
        if (error) throw error;
      } else {
        // Insert new comisionista
        const { error } = await supabase
          .from('comisionistas')
          .insert({
            id_cuenta_cobranza: cuenta.id,
            email_usuario: email,
            porcentaje_comision: porcentaje,
            activo: true
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Comisionista agregado exitosamente");
      refetchComisionistas();
      setSearchUsuario('');
      setSelectedUsuario(null);
      setPorcentajeComisionista('');
    },
    onError: (error) => {
      console.error("Error adding comisionista:", error);
      toast.error("Error al agregar comisionista");
    }
  });

  // Mutation to delete comisionista
  const deleteComisionistaMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from('comisionistas')
        .update({ activo: false })
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('email_usuario', email);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comisionista eliminado exitosamente");
      refetchComisionistas();
    },
    onError: (error) => {
      console.error("Error deleting comisionista:", error);
      toast.error("Error al eliminar comisionista");
    }
  });

  // Calculate total comisionistas percentage
  const totalPorcentajeComisionistas = comisionistas?.reduce((sum, c) => sum + (c.porcentaje_comision || 0), 0) || 0;

  // Calculate if enganche is fully paid
  // Check if factura comisión Sozu has been generated (not draft)
  const hasFacturaComisionSozu = !!(cuentaDetalle as any)?.url_factura_comision && (cuentaDetalle as any)?.es_draft_factura_comision === false;

  // Super Admin can edit porcentaje even after enganche paid, as long as factura hasn't been generated
  const canSuperAdminEditComision = isSuperAdmin && !hasFacturaComisionSozu;

  const isEnganchePagado = acuerdosPago ? (() => {
    const apartado = acuerdosPago.find((a: any) => a.concepto_nombre?.toLowerCase() === 'apartado');
    const enganche = acuerdosPago.find((a: any) => a.concepto_nombre?.toLowerCase() === 'enganche');
    
    const montoApartado = apartado?.monto || 0;
    const montoPagadoApartado = apartado?.monto_pagado || 0;
    const montoEnganche = enganche?.monto || 0;
    const montoPagadoEnganche = enganche?.monto_pagado || 0;
    
    const totalEnganche = montoApartado + montoEnganche;
    const totalPagadoEnganche = montoPagadoApartado + montoPagadoEnganche;
    
    return totalPagadoEnganche >= totalEnganche && totalEnganche > 0;
  })() : false;

  // El bloqueo por enganche pagado solo aplica a cuentas de Propiedad.
  // Las cuentas de Producto / Servicio NO se bloquean por enganche pagado.
  // Doble verificación: tipoCuenta debe ser 'Propiedad' Y la oferta NO debe tener id_producto.
  const esCuentaDeProducto = tipoCuenta !== 'Propiedad' || !!ofertaProductoData.id_producto;
  const aplicaBloqueoComisionPorEnganche = isEnganchePagado && !esCuentaDeProducto;
  const isComisionLockedByEnganche = aplicaBloqueoComisionPorEnganche && !canSuperAdminEditComision;

  // Handle adding comisionista
  const handleAddComisionista = () => {
    if (!selectedUsuario) {
      toast.error("Debes seleccionar un usuario");
      return;
    }

    const porcentaje = parseFloat(porcentajeComisionista);
    if (isNaN(porcentaje) || porcentaje <= 0) {
      toast.error("El porcentaje debe ser mayor a 0");
      return;
    }

    // Validate that total doesn't exceed porcentaje_comision_venta
    if (totalPorcentajeComisionistas + porcentaje > porcentajeComision) {
      toast.error(`La suma de porcentajes de comisionistas (${(totalPorcentajeComisionistas + porcentaje).toFixed(2)}%) excede el porcentaje de comisión de venta (${porcentajeComision}%)`);
      return;
    }

    addComisionistaMutation.mutate({ 
      email: selectedUsuario.email, 
      porcentaje 
    });
  };

  // Handle porcentaje comision change
  const handlePorcentajeComisionChange = (value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setPorcentajeComision(0);
      return;
    }

    if (numValue < 4) {
      toast.error("El porcentaje mínimo es 4%");
      setPorcentajeComision(4);
      return;
    }

    if (numValue > 100) {
      toast.error("El porcentaje máximo es 100%");
      setPorcentajeComision(100);
      return;
    }

    setPorcentajeComision(numValue);
  };

  // Handle blur to save comision data
  const handleComisionBlur = () => {
    if (porcentajeComision !== (cuentaDetalle?.porcentaje_comision_venta || 0) || 
        ivaIncluido !== ((cuentaDetalle as any)?.iva_incluido || false)) {
      updateComisionMutation.mutate({ porcentaje: porcentajeComision, ivaIncluido });
    }
  };

  // Handle comision efectivo confirmation
  const handleComisionEfectivoConfirm = async () => {
    try {
      // Obtener precio_final actual (que ya incluye el ajuste del esquema de pago)
      if (!cuentaDetalle?.precio_final) {
        toast.error("No se puede calcular la comisión: precio final no disponible");
        return;
      }

      // ✅ CORRECTO: Calcular el monto de comisión sobre precio_final (que ya tiene el ajuste del esquema)
      const montoComision = (cuentaDetalle.precio_final * porcentajeComision) / 100;
      const nuevoPrecioFinal = cuentaDetalle.precio_final - montoComision;

      // 1. Actualizar precio_final en cuentas_cobranza
      const { error: errorPrecio } = await supabase
        .from('cuentas_cobranza')
        .update({ 
          precio_final: nuevoPrecioFinal,
          es_comision_venta_efectivo: true,
          iva_incluido: false,
          porcentaje_comision_venta: porcentajeComision
        })
        .eq('id', cuenta.id);
      
      if (errorPrecio) throw errorPrecio;

      // 2. Actualizar monto del acuerdo de pago de enganche (id_concepto=2)
      const { data: acuerdoEnganche, error: errorGetEnganche } = await supabase
        .from('acuerdos_pago')
        .select('id, monto')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('id_concepto', 2)
        .eq('activo', true)
        .single();
      
      if (errorGetEnganche) throw errorGetEnganche;

      if (acuerdoEnganche) {
        const nuevoMontoEnganche = acuerdoEnganche.monto - montoComision;
        
        const { error: errorUpdateEnganche } = await supabase
          .from('acuerdos_pago')
          .update({ monto: nuevoMontoEnganche })
          .eq('id', acuerdoEnganche.id);
        
        if (errorUpdateEnganche) throw errorUpdateEnganche;
      }

      // Actualizar estado local
      setEsComisionEfectivo(true);
      setIvaIncluido(false);
      
      // Invalidar queries para refrescar datos
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
      
      toast.success(`Comisión en efectivo aplicada. Descuento: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(montoComision)}`);
      setShowComisionEfectivoDialog(false);
    } catch (error) {
      console.error('Error applying comision efectivo:', error);
      toast.error("Error al aplicar comisión en efectivo");
    }
  };

  // Mutation to update payment agreement amount
  const updateAmountMutation = useMutation({
    mutationFn: async ({ id, monto }: { id: number; monto: number }) => {
      console.log('Amount mutation called with:', { id, monto });
      
      // Get the current payment amount and applied amount
      const { data: currentPayment, error: getCurrentError } = await supabase
        .from('acuerdos_pago')
        .select('monto, orden')
        .eq('id', id)
        .single();
      
      if (getCurrentError) throw getCurrentError;
      if (!currentPayment) throw new Error('Pago no encontrado');
      
      // Check if payment has applied amounts 
      const { data: aplicaciones, error: getAplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .select('monto')
        .eq('id_acuerdo_pago', id)
        .eq('activo', true);
      
      if (getAplicacionesError) throw getAplicacionesError;
      
      const totalAplicado = aplicaciones?.reduce((sum, app) => sum + app.monto, 0) || 0;
      
      // Validate that new amount is not less than applied amount
      if (monto < totalAplicado) {
        throw new Error(`El monto no puede ser menor a lo ya aplicado ($${totalAplicado.toLocaleString()})`);
      }

      // Calculate the difference (positive = increase, negative = decrease)
      const diferencia = monto - currentPayment.monto;
      
      // Get all payments to find the last one and second to last
      const { data: allPayments, error: getAllPaymentsError } = await supabase
        .from('acuerdos_pago')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });
      
      if (getAllPaymentsError) throw getAllPaymentsError;

      // Find the last payment (highest order)
      const lastPayment = allPayments?.reduce((prev, current) => 
        (current.orden > prev.orden) ? current : prev
      );
      
      // Find the second to last payment
      const secondToLastPayment = allPayments?.filter(p => p.id !== lastPayment?.id)
        .reduce((prev, current) => (current.orden > prev.orden) ? current : prev, allPayments[0]);

      // Check if we're editing the last payment
      if (lastPayment && lastPayment.id === id) {
        // Special logic for last payment
        if (diferencia > 0) {
          throw new Error('No se puede aumentar el monto del último pago');
        }
        
        if (diferencia < 0 && secondToLastPayment) {
          // Update the last payment with the new amount
          const { error: updateLastError } = await supabase
            .from('acuerdos_pago')
            .update({ monto })
            .eq('id', id);
          
          if (updateLastError) throw updateLastError;
          
          // Add the absolute difference to the second to last payment
          const adjustmentAmount = Math.abs(diferencia);
          const { error: updatePrecedingError } = await supabase
            .from('acuerdos_pago')
            .update({ monto: secondToLastPayment.monto + adjustmentAmount })
            .eq('id', secondToLastPayment.id);
          
          if (updatePrecedingError) throw updatePrecedingError;
          
          return { 
            id, 
            monto, 
            diferencia, 
            lastPaymentUpdated: true, 
            precedingPaymentUpdated: true,
            precedingPaymentNewAmount: secondToLastPayment.monto + adjustmentAmount
          };
        } else {
          // Just update the last payment (no change or no second to last payment)
          const { error: updateLastError } = await supabase
            .from('acuerdos_pago')
            .update({ monto })
            .eq('id', id);
          
          if (updateLastError) throw updateLastError;
          
          return { id, monto, diferencia, lastPaymentUpdated: true };
        }
      } else {
        // Original logic for non-last payments
        // Update the current payment amount
        const { error: updateCurrentError } = await supabase
          .from('acuerdos_pago')
          .update({ monto })
          .eq('id', id);
        
        if (updateCurrentError) throw updateCurrentError;

        // Adjust the last payment amount (if it's different from current payment)
        if (lastPayment && lastPayment.id !== id && diferencia !== 0) {
          const newLastPaymentAmount = lastPayment.monto - diferencia; // Inverse of the difference
          
          // Validate that the last payment amount doesn't go negative
          if (newLastPaymentAmount < 0) {
            throw new Error(`No se puede ajustar el último pago. El monto quedaría negativo.`);
          }

          const { error: updateLastPaymentError } = await supabase
            .from('acuerdos_pago')
            .update({ monto: newLastPaymentAmount })
            .eq('id', lastPayment.id);
          
          if (updateLastPaymentError) throw updateLastPaymentError;
        }
      }

      return { id, monto, diferencia, lastPaymentUpdated: lastPayment?.id !== id };
    },
    onSuccess: async (data, variables) => {
      console.log('Amount update successful:', data);
      
      // Log the update
      await registrarActualizacion(
        'acuerdo_pago',
        { id: variables.id, monto: data?.diferencia ? variables.monto - data.diferencia : null },
        { id: variables.id, monto: variables.monto, id_cuenta_cobranza: cuenta.id },
        'actualizar_monto_acuerdo'
      );
      
      toast.success("Monto actualizado exitosamente");
      setEditingAmount(null);
      setEditingMonto('');
      // Invalidate and refetch the acuerdos_pago query
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
      // Also invalidate the main cuenta query to refresh all data
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
    },
    onError: (error, variables) => {
      console.error("Error updating amount:", error);
      toast.error("Error al actualizar el monto: " + (error as Error).message);
      setEditingAmount(null);
      setEditingMonto('');
    }
  });
  const updateAcuerdoMutation = useMutation({
    mutationFn: async ({ id, fecha_pago }: { id: number; fecha_pago: Date | null }) => {
      console.log('Date mutation called with:', { id, fecha_pago });
      // Fix timezone issue by using proper date formatting
      const dateString = fecha_pago ? 
        `${fecha_pago.getFullYear()}-${String(fecha_pago.getMonth() + 1).padStart(2, '0')}-${String(fecha_pago.getDate()).padStart(2, '0')}` : 
        null;
      console.log('Formatted date string:', dateString);
      
      const { data, error } = await supabase
        .from('acuerdos_pago')
        .update({ fecha_pago: dateString })
        .eq('id', id)
        .select();
      
      console.log('Date update result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data, variables) => {
      console.log('Date update successful:', data);
      
      // Log the update
      await registrarActualizacion(
        'acuerdo_pago',
        { id: variables.id, fecha_pago: null },
        { id: variables.id, fecha_pago: variables.fecha_pago?.toISOString().split('T')[0], id_cuenta_cobranza: cuenta.id },
        'actualizar_fecha_acuerdo'
      );
      
      toast.success("Fecha actualizada exitosamente");
      setEditingAcuerdo(null);
      setEditingDate(undefined);
      // Invalidate and refetch the acuerdos_pago query
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
    },
    onError: (error, variables) => {
      console.error("Error updating date:", error);
      toast.error("Error al actualizar la fecha: " + (error as Error).message);
      setEditingAcuerdo(null);
      setEditingDate(undefined);
    }
  });

  // Mutation to update payment agreement order
  const updateOrderMutation = useMutation({
    mutationFn: async (updatedAcuerdos: AcuerdoPago[]) => {
      const updates = updatedAcuerdos.map((acuerdo, index) => ({
        id: acuerdo.id,
        orden: index + 1
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('acuerdos_pago')
          .update({ orden: update.orden })
          .eq('id', update.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Orden actualizado");
    }
  });

  // Mutation to update notario
  const updateNotarioMutation = useMutation({
    mutationFn: async (notarioId: number | null) => {
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update({ id_notario: notarioId })
        .eq('id', cuenta.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notario actualizado exitosamente");
      // Refetch the cuenta data to update the UI
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating notario:", error);
      toast.error("Error al actualizar el notario");
    }
  });

  // Mutation to update escritura fields
  const updateEscrituraMutation = useMutation({
    mutationFn: async (fields: {
      clave_catastral?: string;
      numero_escritura?: string;
      libro?: string;
      hoja?: string;
      fecha_escritura?: string | null;
      numero_unidad_privativa?: string;
    }) => {
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update(fields)
        .eq('id', cuenta.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos de escritura actualizados");
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating escritura fields:", error);
      toast.error("Error al actualizar los datos de escritura");
    }
  });

  // Mutation to update precio final
  const updatePrecioFinalMutation = useMutation({
    mutationFn: async ({ newPrecio, lastAcuerdoId, difference }: { newPrecio: number; lastAcuerdoId: number; difference: number }) => {
      // First update the precio_final in cuentas_cobranza
      const { error: updateCuentaError } = await supabase
        .from('cuentas_cobranza')
        .update({ precio_final: newPrecio })
        .eq('id', cuenta.id);
      
      if (updateCuentaError) throw updateCuentaError;

      // Then update the last acuerdo's monto
      const { data: lastAcuerdoData, error: getAcuerdoError } = await supabase
        .from('acuerdos_pago')
        .select('monto')
        .eq('id', lastAcuerdoId)
        .single();
      
      if (getAcuerdoError) throw getAcuerdoError;

      const newMonto = (lastAcuerdoData?.monto || 0) + difference;
      
      const { error: updateAcuerdoError } = await supabase
        .from('acuerdos_pago')
        .update({ monto: newMonto })
        .eq('id', lastAcuerdoId);
      
      if (updateAcuerdoError) throw updateAcuerdoError;

      return { newPrecio, newMonto };
    },
    onSuccess: () => {
      toast.success("Precio final actualizado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle_modal", cuenta.id] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
      setShowPrecioFinalConfirmDialog(false);
      setPendingPrecioFinalChange(null);
      setIsEditingPrecioFinal(false);
      setEditingPrecioFinal('');
      // Don't call onUpdate() here to keep the modal open
    },
    onError: (error) => {
      console.error("Error updating precio final:", error);
      toast.error("Error al actualizar el precio final");
    }
  });

  // Handler for precio final edit
  const handlePrecioFinalEdit = () => {
    if (cuentaDetalle?.precio_final == null || !lastAcuerdo) {
      toast.error("No se puede editar el precio final: no hay datos suficientes");
      return;
    }

    const newPrecio = parseFloat(editingPrecioFinal);
    if (isNaN(newPrecio) || newPrecio <= 0) {
      toast.error("Por favor ingrese un precio válido");
      return;
    }

    // Calculate difference against the actual sum of active acuerdos (not the stored precio_final which may be stale/zero)
    const sumaAcuerdosActivos = acuerdosPago?.reduce((sum: number, a: any) => sum + (a.monto || 0), 0) || 0;
    const difference = newPrecio - sumaAcuerdosActivos;
    
    // Use a small epsilon to handle floating point precision issues
    // This allows changes as small as 0.01 (1 cent)
    if (Math.abs(difference) < 0.001) {
      // No change (essentially zero difference accounting for floating point)
      setIsEditingPrecioFinal(false);
      setEditingPrecioFinal('');
      return;
    }

    // Calculate the pending amount in the last acuerdo
    const lastAcuerdoPendiente = lastAcuerdo.monto - (lastAcuerdo.monto_pagado || 0);

    // If decreasing
    if (difference < 0) {
      const decreaseAmount = Math.abs(difference);
      
      // Cannot decrease more than what's pending in the last acuerdo
      if (decreaseAmount > lastAcuerdoPendiente) {
        toast.error(`No se puede disminuir más de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(lastAcuerdoPendiente)} (monto pendiente del último pago)`);
        return;
      }
    }

    // Show confirmation dialog
    setPendingPrecioFinalChange({
      newPrecio,
      difference,
      lastAcuerdoId: lastAcuerdo.id,
      lastAcuerdoMonto: lastAcuerdo.monto,
      lastAcuerdoPendiente,
      lastAcuerdoConcepto: lastAcuerdo.concepto_nombre || 'Último pago'
    });
    setShowPrecioFinalConfirmDialog(true);
  };

  // Mutation to delete payment agreement
  const deleteAcuerdoMutation = useMutation({
    mutationFn: async (acuerdoId: number) => {
      // First, get the amount of the payment being deleted
      const { data: paymentToDelete, error: getPaymentError } = await supabase
        .from('acuerdos_pago')
        .select('monto, orden')
        .eq('id', acuerdoId)
        .single();
      
      if (getPaymentError) throw getPaymentError;
      if (!paymentToDelete) throw new Error('Payment not found');

      // Get all payments for this account to find the last one
      const { data: allPayments, error: getAllPaymentsError } = await supabase
        .from('acuerdos_pago')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });
      
      if (getAllPaymentsError) throw getAllPaymentsError;

      // Find the last payment (highest order)
      const lastPayment = allPayments?.reduce((prev, current) => 
        (current.orden > prev.orden) ? current : prev
      );

      // Delete associated aplicaciones_pago first
      const { error: deleteAplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .delete()
        .eq('id_acuerdo_pago', acuerdoId);
      
      if (deleteAplicacionesError) throw deleteAplicacionesError;

      // Then delete the acuerdo_pago
      const { error: deleteAcuerdoError } = await supabase
        .from('acuerdos_pago')
        .delete()
        .eq('id', acuerdoId);
      
      if (deleteAcuerdoError) throw deleteAcuerdoError;

      // Add the deleted payment amount to the last payment (if it's not the same payment being deleted)
      if (lastPayment && lastPayment.id !== acuerdoId) {
        const { error: updateLastPaymentError } = await supabase
          .from('acuerdos_pago')
          .update({ 
            monto: lastPayment.monto + paymentToDelete.monto 
          })
          .eq('id', lastPayment.id);
        
        if (updateLastPaymentError) throw updateLastPaymentError;
      }

      // Get remaining acuerdos to reorder them
      const { data: remainingAcuerdos, error: fetchError } = await supabase
        .from('acuerdos_pago')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });
      
      if (fetchError) throw fetchError;

      // Update order of remaining payments
      if (remainingAcuerdos && remainingAcuerdos.length > 0) {
        for (let i = 0; i < remainingAcuerdos.length; i++) {
          const { error: updateOrderError } = await supabase
            .from('acuerdos_pago')
            .update({ orden: i + 1 })
            .eq('id', remainingAcuerdos[i].id);
          
          if (updateOrderError) throw updateOrderError;
        }
      }
      
      return remainingAcuerdos;
    },
    onSuccess: async (remainingAcuerdos) => {
      // Log the deletion
      if (acuerdoToDelete) {
        await registrarEliminacion(
          'acuerdo_pago',
          { 
            id: acuerdoToDelete.id, 
            concepto: acuerdoToDelete.concepto, 
            monto: acuerdoToDelete.monto,
            id_cuenta_cobranza: cuenta.id 
          },
          'eliminar_acuerdo_pago'
        );
      }
      
      toast.success("Pago eliminado exitosamente");
      
      // Refresh acuerdos data and recalculate dates
      await queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
      
      // Get fresh data after invalidation and recalculate dates
      if (remainingAcuerdos && remainingAcuerdos.length > 0) {
        setTimeout(async () => {
          // Refetch the data
          await queryClient.refetchQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
          
          // Get the updated acuerdos from the query cache
          const freshAcuerdos = queryClient.getQueryData<any[]>(["acuerdos_pago", cuenta.id]);
          
          if (freshAcuerdos && Array.isArray(freshAcuerdos)) {
            console.log("Recalculating dates for remaining payments:", freshAcuerdos.length);
            await updatePaymentDatesAfterReorder(freshAcuerdos);
          }
        }, 300);
      }
      
      setDeleteAcuerdoDialogOpen(false);
      setAcuerdoToDelete(null);
    },
    onError: (error) => {
      console.error("Error deleting acuerdo:", error);
      toast.error("Error al eliminar el pago: " + (error as Error).message);
    }
  });

  const handleAmountUpdate = (acuerdoId: number, monto: number) => {
    console.log('Updating amount for acuerdo:', acuerdoId, 'to:', monto);
    updateAmountMutation.mutate({ id: acuerdoId, monto });
  };

  const handleDateUpdate = (acuerdoId: number, fecha: Date | undefined) => {
    if (fecha) {
      console.log('Updating date for acuerdo:', acuerdoId, 'to:', fecha);
      
      // Find the current agreement and its position
      const currentAcuerdoIndex = acuerdos.findIndex(a => a.id === acuerdoId);
      const currentAcuerdo = acuerdos[currentAcuerdoIndex];
      
      // Check if it's a Parcialidad and update subsequent Parcialidades and Entrega payments
      if (currentAcuerdo?.concepto_nombre?.toLowerCase().includes('parcialidad')) {
        // Update the current agreement date
        updateAcuerdoMutation.mutate({ id: acuerdoId, fecha_pago: fecha });
        
        // Update subsequent Parcialidades and Entrega payments with incremental months
        for (let i = currentAcuerdoIndex + 1; i < acuerdos.length; i++) {
          const nextAcuerdo = acuerdos[i];
          if (nextAcuerdo.concepto_nombre?.toLowerCase().includes('parcialidad') || nextAcuerdo.id_concepto === 3) {
            const monthsToAdd = i - currentAcuerdoIndex;
            
            // Get the target day from the original date
            const targetDay = fecha.getDate();
            const originalMonth = fecha.getMonth();
            const originalYear = fecha.getFullYear();
            
            // Calculate the new month and year
            let newMonth = originalMonth + monthsToAdd;
            let newYear = originalYear;
            
            // Handle year rollover
            while (newMonth > 11) {
              newMonth -= 12;
              newYear++;
            }
            
            // Get the maximum days in the target month
            const daysInTargetMonth = new Date(newYear, newMonth + 1, 0).getDate();
            
            // Determine the final day (handle cases like Feb 30 -> Feb 28/29)
            let finalDay = targetDay;
            if (targetDay > daysInTargetMonth) {
              finalDay = daysInTargetMonth;
            }
            
            // Create the new date correctly
            const nextDate = new Date(newYear, newMonth, finalDay);
            
            const conceptType = nextAcuerdo.concepto_nombre?.toLowerCase().includes('parcialidad') ? 'Parcialidad' : 'Entrega';
            console.log(`Updating subsequent ${conceptType} ${nextAcuerdo.id} with date:`, nextDate, `(target day: ${targetDay}, final day: ${finalDay}, days in month: ${daysInTargetMonth})`);
            updateAcuerdoMutation.mutate({ id: nextAcuerdo.id, fecha_pago: nextDate });
          }
        }
      } else if (currentAcuerdo?.id_concepto === 3) { // Entrega payments
        // Update the current agreement date
        updateAcuerdoMutation.mutate({ id: acuerdoId, fecha_pago: fecha });
        
        // Update subsequent Entrega payments with incremental months
        for (let i = currentAcuerdoIndex + 1; i < acuerdos.length; i++) {
          const nextAcuerdo = acuerdos[i];
          if (nextAcuerdo.id_concepto === 3) { // Also Entrega
            const monthsToAdd = i - currentAcuerdoIndex;
            
            // Get the target day from the original date
            const targetDay = fecha.getDate();
            const originalMonth = fecha.getMonth();
            const originalYear = fecha.getFullYear();
            
            // Calculate the new month and year
            let newMonth = originalMonth + monthsToAdd;
            let newYear = originalYear;
            
            // Handle year rollover
            while (newMonth > 11) {
              newMonth -= 12;
              newYear++;
            }
            
            // Get the maximum days in the target month
            const daysInTargetMonth = new Date(newYear, newMonth + 1, 0).getDate();
            
            // Determine the final day (handle cases like Feb 30 -> Feb 28/29)
            let finalDay = targetDay;
            if (targetDay > daysInTargetMonth) {
              finalDay = daysInTargetMonth;
            }
            
            // Create the new date correctly
            const nextDate = new Date(newYear, newMonth, finalDay);
            
            console.log(`Updating subsequent Entrega ${nextAcuerdo.id} with date:`, nextDate, `(target day: ${targetDay}, final day: ${finalDay}, days in month: ${daysInTargetMonth})`);
            updateAcuerdoMutation.mutate({ id: nextAcuerdo.id, fecha_pago: nextDate });
          }
        }
      } else {
        // For other agreement types, just update the single date
        updateAcuerdoMutation.mutate({ id: acuerdoId, fecha_pago: fecha });
      }
    }
  };

  const handleNotarioChange = (value: string) => {
    setSelectedNotario(value);
    const notarioId = parseInt(value);
    updateNotarioMutation.mutate(notarioId);
  };

  const handleDeleteAcuerdo = (acuerdoId: number, conceptoNombre: string, monto: number) => {
    setAcuerdoToDelete({ id: acuerdoId, concepto: conceptoNombre, monto });
    setDeleteAcuerdoDialogOpen(true);
  };

  const confirmDeleteAcuerdo = () => {
    if (acuerdoToDelete) {
      deleteAcuerdoMutation.mutate(acuerdoToDelete.id);
    }
  };

  // Update payment dates after deletion to fill the gap
  const updatePaymentDatesAfterReorder = async (reorderedAcuerdos: any[]) => {
    console.log("Starting date recalculation after deletion...");
    
    // Sort acuerdos by orden to ensure correct sequence
    const sortedAcuerdos = [...reorderedAcuerdos].sort((a, b) => a.orden - b.orden);
    
    // Find all payments that have dates and are not completed
    const paymentsWithDates = sortedAcuerdos.filter(acuerdo => 
      acuerdo.fecha_pago && !acuerdo.pago_completado
    );
    
    if (paymentsWithDates.length < 2) {
      console.log("Not enough payments with dates to recalculate");
      return;
    }
    
    // Calculate new dates: each payment should be one month after the previous one
    const updates: { id: number; newDate: Date }[] = [];
    
    for (let i = 1; i < paymentsWithDates.length; i++) {
      const currentPayment = paymentsWithDates[i];
      const previousPayment = paymentsWithDates[i - 1];
      
      // Skip if payment is completed
      if (currentPayment.pago_completado) continue;
      
      // Calculate the new date: previous payment date + 1 month
      const previousDate = new Date(previousPayment.fecha_pago);
      const targetDay = previousDate.getDate();
      const newMonth = previousDate.getMonth() + 1;
      const newYear = previousDate.getFullYear() + Math.floor(newMonth / 12);
      const actualMonth = newMonth % 12;
      
      // Handle month overflow (e.g., January 31 -> February 28/29)
      const daysInTargetMonth = new Date(newYear, actualMonth + 1, 0).getDate();
      const finalDay = Math.min(targetDay, daysInTargetMonth);
      
      const newDate = new Date(newYear, actualMonth, finalDay);
      
      // Only update if the date is different
      const currentDate = new Date(currentPayment.fecha_pago);
      if (currentDate.getTime() !== newDate.getTime()) {
        updates.push({ id: currentPayment.id, newDate });
        console.log(`Will update payment ${currentPayment.id} from ${currentDate.toLocaleDateString()} to ${newDate.toLocaleDateString()}`);
      }
    }
    
    // Apply all updates
    if (updates.length > 0) {
      console.log(`Updating ${updates.length} payment dates...`);
      
      for (const update of updates) {
        try {
          const { error } = await supabase
            .from('acuerdos_pago')
            .update({ fecha_pago: update.newDate.toISOString().split('T')[0] })
            .eq('id', update.id);
          
          if (error) {
            console.error(`Error updating payment ${update.id}:`, error);
          } else {
            console.log(`Successfully updated payment ${update.id}`);
          }
        } catch (error) {
          console.error(`Exception updating payment ${update.id}:`, error);
        }
      }
      
      // Refresh the data after updates
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
      }, 200);
    } else {
      console.log("No date updates needed");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = acuerdos.findIndex(item => item.id.toString() === active.id);
      const newIndex = acuerdos.findIndex(item => item.id.toString() === over?.id);

      // Don't allow moving completed payments
      const activeItem = acuerdos[oldIndex];
      const overItem = acuerdos[newIndex];
      
      if (activeItem?.pago_completado || overItem?.pago_completado) {
        toast.error("No se pueden mover pagos completados");
        return;
      }

      // Don't allow moving payments that have partial payments (monto_pagado > 0)
      if (activeItem?.monto_pagado > 0 || overItem?.monto_pagado > 0) {
        toast.error("No se pueden mover pagos que tienen montos aplicados");
        return;
      }

      // Validate payment order by concept type
      // Order should be: Apartado (1) → Enganche (2) → Parcialidades (5) → Contra entrega (3)
      const conceptOrder = [1, 2, 5, 3]; // Apartado, Enganche, Parcialidad, Contra entrega
      
      // Get concept priorities for validation
      const activeConceptPriority = conceptOrder.indexOf(activeItem?.id_concepto);
      const overConceptPriority = conceptOrder.indexOf(overItem?.id_concepto);
      
      // Check if the move would violate the concept order
      if (activeConceptPriority !== -1 && overConceptPriority !== -1) {
        // If moving to a position with a different concept type
        if (activeItem?.id_concepto !== overItem?.id_concepto) {
          // Check if the active concept can go before the over concept
          if (activeConceptPriority > overConceptPriority && newIndex < oldIndex) {
            // Moving a lower priority concept before a higher priority one
            const conceptNames = {
              1: 'Apartado',
              2: 'Enganche', 
              5: 'Parcialidad',
              3: 'Contra entrega'
            };
            toast.error(`${conceptNames[activeItem.id_concepto]} no puede ir antes de ${conceptNames[overItem.id_concepto]}`);
            return;
          }
          
          // Check if the active concept can go after the over concept
          if (activeConceptPriority < overConceptPriority && newIndex > oldIndex) {
            // Moving a higher priority concept after a lower priority one
            const conceptNames = {
              1: 'Apartado',
              2: 'Enganche',
              5: 'Parcialidad', 
              3: 'Contra entrega'
            };
            toast.error(`${conceptNames[activeItem.id_concepto]} no puede ir después de ${conceptNames[overItem.id_concepto]}`);
            return;
          }
        }
      }

      const newAcuerdos = arrayMove(acuerdos, oldIndex, newIndex);
      setAcuerdos(newAcuerdos);
      updateOrderMutation.mutate(newAcuerdos);
      
      // Update payment dates after reordering to maintain chronological order
      updatePaymentDatesAfterReorder(newAcuerdos);
    }
  };

  const getPersonTypeLabel = (tipo: string) => {
    return tipo === 'pf' ? 'Persona Física' : tipo === 'pm' ? 'Persona Moral' : tipo;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[1325px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3">
            <DialogTitle className="flex items-center gap-2">
              <span>Editar Cuenta de Cobranza - {formatCuentaCobranzaId(cuenta.id, tipoCuenta)}</span>
              {cuentaDetalle?.collection_id && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs">
                        {cuentaDetalle.collection_id}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">Cuenta anterior: {cuentaDetalle.collection_id}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </DialogTitle>
            
            {/* Timeline de progreso - solo para cuentas de Propiedad */}
            {tipoCuenta === 'Propiedad' && propiedadDetalle && estatusPropiedad && (
              <PropertyProgressTimeline 
                cuentaId={cuenta.id}
                propiedadId={propiedadDetalle.id}
                estatusActual={estatusPropiedad.id_estatus_disponibilidad}
                restante={restanteCalculado}
                cuentaDetalle={cuentaDetalle}
              />
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className={`grid w-full ${tipoCuenta === 'Propiedad' ? (hasFacturas ? 'grid-cols-8' : 'grid-cols-7') : 'grid-cols-6'}`}>
            <TabsTrigger value="propiedad">Datos de la Propiedad</TabsTrigger>
            {(tipoCuenta === 'Producto' || tipoCuenta === 'Servicio') && (
              <TabsTrigger value="producto">Detalles {tipoCuenta}</TabsTrigger>
            )}
            <TabsTrigger value="vendedor">Datos del Vendedor</TabsTrigger>
            <TabsTrigger value="compradores">Datos del Comprador</TabsTrigger>
            {tipoCuenta === 'Propiedad' && (
              <TabsTrigger value="escrituracion">Datos de escrituración</TabsTrigger>
            )}
            {tipoCuenta === 'Propiedad' && (
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
            )}
            {tipoCuenta === 'Propiedad' && hasFacturas && (
              <TabsTrigger value="facturas">Facturas</TabsTrigger>
            )}
            <TabsTrigger value="acuerdo">Acuerdo de Pago</TabsTrigger>
            <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
          </TabsList>

          <TabsContent value="propiedad" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
            <Card>
              <CardHeader>
                <CardTitle>Información de la Propiedad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {propiedadDetalle ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Proyecto</Label>
                        <Input value={propiedadDetalle.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto'} readOnly />
                      </div>
                      <div>
                        <Label>Edificio</Label>
                        <Input value={propiedadDetalle.edificios_modelos?.edificios?.nombre || 'Sin edificio'} readOnly />
                      </div>
                      <div>
                        <Label>Número de Propiedad</Label>
                        <Input value={propiedadDetalle.numero_propiedad || ''} readOnly />
                      </div>
                      <div>
                        <Label>Nivel</Label>
                        <Input value={propiedadDetalle.numero_piso || ''} readOnly />
                      </div>
                      <div>
                        <Label>Metros Cuadrados</Label>
                        <Input value={`${((propiedadDetalle.m2_interiores || 0) + (propiedadDetalle.m2_exteriores || 0)).toFixed(2)} m²`} readOnly />
                      </div>
                      <div>
                        <Label>Precio de Lista</Label>
                        <Input value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(propiedadDetalle.precio_lista || 0)} readOnly />
                      </div>
                      <div className="col-span-2">
                        <Label>Descripción</Label>
                        <Textarea value={propiedadDetalle.descripcion || 'Sin descripción'} readOnly />
                      </div>
                    </div>

                    {/* Estacionamientos Section */}
                    {estacionamientosDetalle && estacionamientosDetalle.length > 0 && (
                      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium text-foreground mb-4">Estacionamientos</h4>
                        <div className="grid gap-3">
                          {estacionamientosDetalle.map((estacionamiento) => (
                            <div key={estacionamiento.id} className="p-3 bg-background rounded border">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">Nombre</p>
                                  <p className="font-medium">{estacionamiento.nombre}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Tipo</p>
                                  <p className="font-medium">{estacionamiento.tipos_estacionamiento?.nombre || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">M²</p>
                                  <p className="font-medium">{estacionamiento.m2} m²</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Ubicación</p>
                                  <p className="font-medium">{estacionamiento.ubicacion || 'No especificada'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Precio por M²</p>
                                  <p className="font-medium">
                                    {estacionamiento.precio_m2 !== null 
                                      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(estacionamiento.precio_m2)
                                      : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Precio Final</p>
                                  <p className="font-medium">
                                    {estacionamiento.precio_final !== null 
                                      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(estacionamiento.precio_final)
                                      : 'N/A'}
                                  </p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-sm text-muted-foreground">Forma de adquisición:</p>
                                  {estacionamiento.cuenta_cobranza_id ? (
                                    <Badge 
                                      variant="secondary" 
                                      className="mt-1 cursor-pointer hover:bg-secondary/80"
                                      onClick={() => {
                                        navigator.clipboard.writeText(formatCuentaCobranzaId(estacionamiento.cuenta_cobranza_id, 'Producto'));
                                        toast.success('ID de cuenta copiado al portapapeles');
                                      }}
                                    >
                                      Cuenta: {formatCuentaCobranzaId(estacionamiento.cuenta_cobranza_id, 'Producto')}
                                    </Badge>
                                  ) : estacionamiento.precio_final === 0 ? (
                                    <Badge variant="default" className="mt-1 bg-green-600">
                                      Incluido con el departamento
                                    </Badge>
                                  ) : (
                                    <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                      Aún no se adquiere. Costo: {estacionamiento.precio_final !== null 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(estacionamiento.precio_final)
                                        : 'N/A'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bodegas Section */}
                    {bodegasDetalle && bodegasDetalle.length > 0 && (
                      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium text-foreground mb-4">Bodegas</h4>
                        <div className="grid gap-3">
                          {bodegasDetalle.map((bodega) => (
                            <div key={bodega.id} className="p-3 bg-background rounded border">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">Nombre</p>
                                  <p className="font-medium">{bodega.nombre}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">M²</p>
                                  <p className="font-medium">{bodega.m2} m²</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Ubicación</p>
                                  <p className="font-medium">{bodega.ubicacion || 'No especificada'}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Precio por M²</p>
                                  <p className="font-medium">
                                    {bodega.precio_m2 !== null 
                                      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(bodega.precio_m2)
                                      : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Precio Final</p>
                                  <p className="font-medium">
                                    {bodega.precio_final !== null 
                                      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(bodega.precio_final)
                                      : 'N/A'}
                                  </p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-sm text-muted-foreground">Forma de adquisición:</p>
                                  {bodega.cuenta_cobranza_id ? (
                                    <Badge 
                                      variant="secondary" 
                                      className="mt-1 cursor-pointer hover:bg-secondary/80"
                                      onClick={() => {
                                        navigator.clipboard.writeText(formatCuentaCobranzaId(bodega.cuenta_cobranza_id, 'Producto'));
                                        toast.success('ID de cuenta copiado al portapapeles');
                                      }}
                                    >
                                      Cuenta: {formatCuentaCobranzaId(bodega.cuenta_cobranza_id, 'Producto')}
                                    </Badge>
                                  ) : bodega.precio_final === 0 ? (
                                    <Badge variant="default" className="mt-1 bg-green-600">
                                      Incluido con el departamento
                                    </Badge>
                                  ) : (
                                    <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                      Aún no se adquiere. Costo: {bodega.precio_final !== null 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(bodega.precio_final)
                                        : 'N/A'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">Cargando información de la propiedad...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* New tab for Product/Service details */}
          {(tipoCuenta === 'Producto' || tipoCuenta === 'Servicio') && productoServicioInfo && (
            <TabsContent value="producto" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Detalles del {tipoCuenta}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nombre</Label>
                      <Input 
                        value={bodegaEstacionamientoData?.nombre || productoServicioInfo.nombre || ''} 
                        readOnly 
                      />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Input value={productoServicioInfo.categorias_producto?.nombre || ''} readOnly />
                    </div>
                    {bodegaEstacionamientoData ? (
                      <>
                        <div>
                          <Label>Precio por M²</Label>
                          <Input 
                            value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(productoServicioInfo.precio_lista || 0)} 
                            readOnly 
                          />
                        </div>
                        <div>
                          <Label>Metraje</Label>
                          <Input 
                            value={bodegaEstacionamientoData.m2 ? `${Number(bodegaEstacionamientoData.m2).toFixed(2)} m²` : 'N/A'} 
                            readOnly 
                          />
                        </div>
                        <div>
                          <Label>Precio Final</Label>
                          <Input 
                            value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                              (productoServicioInfo.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0)
                            )} 
                            readOnly 
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <Label>Precio de Lista</Label>
                        <Input 
                          value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cuentaDetalle?.precio_final || 0)} 
                          readOnly 
                        />
                      </div>
                    )}
                    <div className="col-span-2">
                      <Label>Descripción</Label>
                      <Textarea 
                        value={productoServicioInfo.descripcion || 'Sin descripción'} 
                        readOnly 
                        rows={4}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="vendedor" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Información del Vendedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 {vendedorDetalle?.personas ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nombre Legal</Label>
                      <Input value={vendedorDetalle.personas.nombre_legal || ''} readOnly />
                    </div>
                    <div>
                      <Label>RFC</Label>
                      <Input value={vendedorDetalle.personas.rfc || ''} readOnly />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={vendedorDetalle.personas.email || ''} readOnly />
                    </div>
                    <div>
                      <Label>Teléfono</Label>
                      <Input value={vendedorDetalle.personas.telefono || ''} readOnly />
                    </div>
                    <div>
                      <Label>Tipo de Persona</Label>
                      <Input value={getPersonTypeLabel(vendedorDetalle.personas.tipo_persona || '')} readOnly />
                    </div>
                    
                    {/* Campos adicionales para Persona Moral */}
                    {vendedorDetalle.personas.tipo_persona === 'pm' && (
                      <>
                        {vendedorDetalle.personas.nombre_comercial && (
                          <div>
                            <Label>Nombre Comercial</Label>
                            <Input value={vendedorDetalle.personas.nombre_comercial} readOnly />
                          </div>
                        )}
                        {representanteLegal && (
                          <div>
                            <Label>Representante Legal</Label>
                            <Input value={representanteLegal.personas?.nombre_legal || ''} readOnly />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">Cargando información del vendedor...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compradores" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Compradores</CardTitle>
                      {/* Check if any compradores are spouses */}
                      {compradoresExistentes && compradoresExistentes.length >= 2 && compradoresExistentes.some((comprador) => {
                        const spouseId = comprador.personas?.id_conyuge;
                        return spouseId && compradoresExistentes.some(c => c.personas?.id === spouseId);
                      }) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HeartHandshake className="h-5 w-5 text-pink-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Hay compradores cónyuges</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Total asignado: {totalPorcentajes.toFixed(2)}%
                      {!isValidTotal && (
                        <span className="text-destructive ml-2 font-medium">
                          ¡Debe sumar exactamente 100%!
                        </span>
                      )}
                    </p>
                  </div>
                  <Button 
                    onClick={() => setShowPersonForm(true)}
                    disabled={isReadOnly}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Comprador
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {compradoresExistentes && compradoresExistentes.length > 0 ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Nombre</TableHead>
                          <TableHead className="font-semibold">RFC</TableHead>
                          <TableHead className="font-semibold">Email</TableHead>
                          <TableHead className="font-semibold">Tipo</TableHead>
                          <TableHead className="font-semibold">Datos Fiscales</TableHead>
                          <TableHead className="font-semibold">Porcentaje (%)</TableHead>
                          <TableHead className="font-semibold text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {compradoresExistentes.map((comprador, index) => {
                            // Estado civil 2 = Casado(a) bienes mancomunados
                            const esCasadoMancomunados = comprador.personas?.id_estado_civil === 2;
                            const datosFiscalesCompletos = isFiscalDataComplete(comprador.personas);
                            
                            return (
                            <React.Fragment key={index}>
                           <TableRow className="hover:bg-muted/30 transition-colors">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="link"
                                    className="p-0 h-auto font-medium hover:underline"
                                    onClick={() => handleNavigateToCompradores(comprador.personas?.rfc || undefined)}
                                  >
                                    {comprador.personas?.nombre_legal}
                                  </Button>
                                  {esCasadoMancomunados && comprador.personas?.id_conyuge && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <HeartHandshake className="h-4 w-4 text-pink-500 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="font-medium">
                                            Cónyuge: {comprador.personas.conyuge && typeof comprador.personas.conyuge === 'object' && 'nombre_legal' in comprador.personas.conyuge 
                                              ? comprador.personas.conyuge.nombre_legal 
                                              : 'Sin asignar'}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {comprador.personas?.rfc || 'N/A'}
                              </TableCell>
                             <TableCell className="text-muted-foreground">
                               {comprador.personas?.email || 'N/A'}
                             </TableCell>
                             <TableCell className="text-muted-foreground">
                               {getPersonTypeLabel(comprador.personas?.tipo_persona || '')}
                             </TableCell>
                             <TableCell>
                               <Badge variant={datosFiscalesCompletos ? "default" : "destructive"} className="text-xs">
                                 {datosFiscalesCompletos ? "Completa" : "Incompleta"}
                               </Badge>
                             </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={comprador.porcentaje_copropiedad.toFixed(2)}
                                  onChange={(e) => handlePercentageChange(comprador.personas?.id || 0, e.target.value)}
                                  className="w-20 h-8 text-sm"
                                  disabled={updateBuyerPercentageMutation.isPending || isReadOnly}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleEditBuyer(comprador.personas?.id || 0)}
                                    disabled={isReadOnly}
                                    className="hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleDeleteBuyer(comprador.personas?.id || 0, comprador.personas?.nombre_legal || '')}
                                    disabled={deleteBuyerMutation.isPending || isReadOnly}
                                    className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                           </TableRow>
                           
                            {/* Selector de cónyuge para compradores casados por bienes mancomunados */}
                            {esCasadoMancomunados && (() => {
                              const conyugeData = comprador.personas?.conyuge;
                              const tieneConyugeAsignado = comprador.personas?.id_conyuge && 
                                                          conyugeData && 
                                                          typeof conyugeData === 'object' && 
                                                          !Array.isArray(conyugeData) &&
                                                          'nombre_legal' in conyugeData;
                              
                              // Check if spouse is already added as comprador
                              const conyugeYaAgregado = compradoresExistentes?.some(c => c.personas?.id === comprador.personas?.id_conyuge);
                              
                              return (
                                <>
                                  {tieneConyugeAsignado && !conyugeYaAgregado && (
                                    <TableRow className="bg-blue-50 dark:bg-blue-950/20">
                                      <TableCell colSpan={6}>
                                        <div className="p-3">
                                          <div className="bg-background p-3 rounded border">
                                            <div className="flex justify-between items-start">
                                              <div className="flex-1">
                                                <p className="font-medium text-sm">
                                                  {(conyugeData as { nombre_legal: string; rfc?: string; email: string }).nombre_legal}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                  {(conyugeData as { nombre_legal: string; rfc?: string; email: string }).rfc && `RFC: ${(conyugeData as { nombre_legal: string; rfc?: string; email: string }).rfc} | `}
                                                  {(conyugeData as { nombre_legal: string; rfc?: string; email: string }).email}
                                                </p>
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                  <p>• Se agregará como comprador automáticamente</p>
                                                  <p>• Los porcentajes se redistribuirán equitativamente</p>
                                                </div>
                                              </div>
                                              <Button
                                                size="sm"
                                                onClick={() => {
                                                  if (comprador.personas?.id_conyuge) {
                                                    addCompradorMutation.mutate({ 
                                                      personaId: comprador.personas.id_conyuge
                                                    });
                                                  }
                                                }}
                                                disabled={addCompradorMutation.isPending || isReadOnly}
                                              >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Agregar Cónyuge
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                  
                                  {!tieneConyugeAsignado && (
                                    <TableRow className="bg-yellow-50 dark:bg-yellow-950/20">
                                      <TableCell colSpan={6}>
                                        <div className="p-3">
                                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                            ⚠️ Este comprador no tiene un cónyuge asignado. Ve a la vista de Compradores para asignar el cónyuge.
                                          </p>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </>
                              );
                            })()}
                            </React.Fragment>
                           );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay compradores registrados
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Buscar Persona para Agregar como Comprador</Label>
                  </div>
                  
                  <Input
                    placeholder="Buscar por nombre, RFC, CURP o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={isReadOnly}
                  />

                  {!isReadOnly && personasBusqueda && personasBusqueda.length > 0 && (
                    <div className="mt-2 border rounded max-h-48 overflow-y-auto">
                      {personasBusqueda.map((persona) => (
                        <div
                          key={persona.id}
                          className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                          onClick={() => {
                            setSelectedPersona(persona);
                            setSearchTerm('');
                          }}
                        >
                          <p className="font-medium">{persona.nombre_legal}</p>
                          <p className="text-sm text-muted-foreground">
                            {persona.rfc && `RFC: ${persona.rfc}`}
                            {persona.curp && `${persona.rfc ? ' | ' : ''}CURP: ${persona.curp}`}
                            {` | Email: ${persona.email}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isReadOnly && selectedPersona && (
                    <div className="p-4 border rounded bg-muted">
                      <p className="font-medium mb-2">Persona Seleccionada:</p>
                      <p>{selectedPersona.nombre_legal}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedPersona.rfc && `RFC: ${selectedPersona.rfc}`}
                        {selectedPersona.curp && `${selectedPersona.rfc ? ' | ' : ''}CURP: ${selectedPersona.curp}`}
                        {` | Email: ${selectedPersona.email}`}
                      </p>
                      
                      <div className="mt-4 text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                        <p>
                          Al agregar este comprador, el porcentaje de propiedad se distribuirá automáticamente 
                          entre todos los compradores ({((compradoresExistentes?.length || 0) + 1)} compradores = {(100 / ((compradoresExistentes?.length || 0) + 1)).toFixed(2)}% cada uno).
                        </p>
                      </div>
                      
                      <div className="mt-4">
                      <Button
                        onClick={handleAddComprador}
                        disabled={addCompradorMutation.isPending || isReadOnly}
                        className="w-full"
                      >
                          Agregar Comprador
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {tipoCuenta === 'Propiedad' && (
            <TabsContent value="escrituracion" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
              <Card>
                <CardHeader>
                  <CardTitle>Datos de escrituración</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Notario asignado</Label>
                      <Combobox
                        value={selectedNotario}
                        onValueChange={handleNotarioChange}
                        options={notarios?.map((notario) => ({
                          value: notario.id.toString(),
                          label: `${notario.nombre} - ${notario.notaria}`
                        })) || []}
                        placeholder="Seleccionar notario"
                        searchPlaceholder="Buscar notario..."
                        emptyText="No se encontraron notarios"
                        disabled={isReadOnly}
                      />
                    </div>

                    {/* Campos de escritura - solo visibles cuando hay notario seleccionado */}
                    {selectedNotario && (
                      <>
                        <div>
                          <Label>Clave Catastral</Label>
                          <Input 
                            value={claveCatastral} 
                            onChange={(e) => setClaveCatastral(e.target.value)}
                            onBlur={() => updateEscrituraMutation.mutate({ clave_catastral: claveCatastral })}
                            placeholder="Ingrese clave catastral"
                            disabled={isReadOnly}
                          />
                        </div>
                        <div>
                          <Label>Libro</Label>
                          <Input 
                            value={libro} 
                            onChange={(e) => setLibro(e.target.value)}
                            onBlur={() => updateEscrituraMutation.mutate({ libro: libro })}
                            placeholder="Ingrese libro"
                            disabled={isReadOnly}
                          />
                        </div>
                        <div>
                          <Label>Hoja</Label>
                          <Input 
                            value={hoja} 
                            onChange={(e) => setHoja(e.target.value)}
                            onBlur={() => updateEscrituraMutation.mutate({ hoja: hoja })}
                            placeholder="Ingrese hoja"
                            disabled={isReadOnly}
                          />
                        </div>
                        <div>
                          <Label>Fecha de Escritura</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                                disabled={isReadOnly}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {fechaEscritura ? format(fechaEscritura, "PPP", { locale: es }) : "Seleccionar fecha"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={fechaEscritura}
                                onSelect={(date) => {
                                  setFechaEscritura(date);
                                  updateEscrituraMutation.mutate({ 
                                    fecha_escritura: date ? format(date, 'yyyy-MM-dd') : null 
                                  });
                                }}
                                initialFocus
                                className="pointer-events-auto"
                                disabled={isReadOnly}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <Label>Número de Unidad Privativa</Label>
                          <Input 
                            value={numeroUnidadPrivativa} 
                            onChange={(e) => setNumeroUnidadPrivativa(e.target.value)}
                            onBlur={() => updateEscrituraMutation.mutate({ numero_unidad_privativa: numeroUnidadPrivativa })}
                            placeholder="Ingrese número de unidad privativa"
                            disabled={isReadOnly}
                          />
                        </div>
                        <div>
                          <Label>Número de Escritura</Label>
                          <div className="relative">
                            <Input 
                              value={numeroEscritura} 
                              onChange={(e) => setNumeroEscritura(e.target.value)}
                              onBlur={() => {
                                const newValue = numeroEscritura?.trim();
                                const shouldGenerate = shouldGenerateInvoice || vendedorDetalle?.facturar === true;
                                
                                console.log('📝 [onBlur numero_escritura] newValue:', newValue);
                                console.log('📝 [onBlur numero_escritura] currentValue:', cuentaDetalle?.numero_escritura);
                                console.log('📝 [onBlur numero_escritura] shouldGenerate:', shouldGenerate);
                                console.log('📝 [onBlur numero_escritura] shouldGenerateInvoice:', shouldGenerateInvoice);
                                console.log('📝 [onBlur numero_escritura] vendedorDetalle?.facturar:', vendedorDetalle?.facturar);
                                
                                if (newValue && newValue !== cuentaDetalle?.numero_escritura) {
                                  // Si ya existe factura generada, guardar directamente sin confirmación
                                  if (hasFacturas) {
                                    setNumeroEscritura(newValue);
                                    updateEscrituraMutation.mutate({ numero_escritura: newValue });
                                  }
                                  // Si el vendedor NO factura, solo guardar sin confirmación
                                  else if (!shouldGenerate) {
                                    setNumeroEscritura(newValue);
                                    updateEscrituraMutation.mutate({ numero_escritura: newValue });
                                  } else {
                                    // Si factura y NO existe factura, mostrar dialog de confirmación
                                    setPendingNumeroEscritura(newValue);
                                    setShowConfirmEscrituraDialog(true);
                                  }
                                }
                              }}
                              placeholder="Ingrese número de escritura"
                              className={((shouldGenerateInvoice || vendedorDetalle?.facturar === true) && !hasFacturas) ? "border-amber-500 focus:border-amber-600 focus:ring-amber-600" : ""}
                              disabled={isReadOnly}
                            />
                            {((shouldGenerateInvoice || vendedorDetalle?.facturar === true) && !hasFacturas) && (
                              <div className="absolute -top-2 -right-2 h-4 w-4 bg-amber-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">!</span>
                              </div>
                            )}
                          </div>
                          {((shouldGenerateInvoice || vendedorDetalle?.facturar === true) && !hasFacturas) && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              Para guardar click aquí
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Nueva pestaña: Datos de facturación - OCULTA */}
          {false && (
            <TabsContent value="facturacion" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Datos de facturación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {primerComprador?.personas ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>RFC</Label>
                      <Input 
                        value={primerComprador.personas.rfc || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.rfc ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Régimen Fiscal</Label>
                      <Input 
                        value={primerComprador.personas.regimen || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.regimen ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Uso del CFDI</Label>
                      <Input 
                        value={primerComprador.personas.uso_cfdi || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.uso_cfdi ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Razón Social / Nombre Legal</Label>
                      <Input 
                        value={primerComprador.personas.nombre_legal || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.nombre_legal ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <h4 className="font-semibold text-sm mb-3 mt-2">Dirección Fiscal</h4>
                    </div>
                    
                    <div>
                      <Label>Calle</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_calle || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_calle ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Número Exterior</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_num_ext || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_num_ext ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Número Interior</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_num_int || 'Opcional'} 
                        readOnly 
                        className="bg-muted" 
                      />
                    </div>
                    <div>
                      <Label>Colonia/Barrio</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_colonia || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_colonia ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Código Postal</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_codigo_postal || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_codigo_postal ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_id_estado ? 'Ver en sistema' : 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_id_estado ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>Municipio</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_id_municipio ? 'Ver en sistema' : 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_id_municipio ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>
                    <div>
                      <Label>País</Label>
                      <Input 
                        value={primerComprador.personas.direccion_fiscal_id_pais || 'No registrado'} 
                        readOnly 
                        className={`${!primerComprador.personas.direccion_fiscal_id_pais ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted'}`} 
                      />
                    </div>

                    <div className="col-span-2 mt-4 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <strong>Nota:</strong> Estos datos corresponden al primer comprador registrado en esta cuenta. 
                        Para modificarlos, edite el perfil del comprador en la sección correspondiente.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No se encontraron datos de facturación del comprador
                  </div>
                )}
              </CardContent>
            </Card>
            </TabsContent>
          )}

          {/* Documentos Tab - Only for properties */}
          {tipoCuenta === 'Propiedad' && (
            <TabsContent value="documentos" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Documentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cuenta?.id ? (
                    <DocumentsTab
                      entityId={cuenta.id}
                      entityType="cuenta_cobranza"
                      shouldAutoGenerateInvoice={shouldGenerateInvoice}
                      isReadOnly={isReadOnly}
                      canEditStatus={canUpdateCuenta || isSuperAdmin}
                      compradores={compradoresExistentes?.map(c => ({
                        id_persona: c.personas?.id || 0, 
                        nombre_legal: c.personas?.nombre_legal || '' 
                      })) || []}
                      propiedadId={propiedadDetalle?.id}
                      onDocumentAdded={() => {
                        toast.success("Documento agregado correctamente");
                      }}
                      onGenerateFinalInvoice={async (idPersona: number, idDocumento: number) => {
                        try {
                          // Obtener api_key del dueño
                          const apiKey = vendedorDetalle?.nombre_api_key_draft;
                          
                          // Filtrar solo el comprador seleccionado
                          const compradorSeleccionado = compradoresExistentes?.find(c => c.personas?.id === idPersona);
                          
                          if (!compradorSeleccionado) {
                            throw new Error('Comprador no encontrado');
                          }
                          
                          // Obtener nombres de país, estado y municipio
                          let paisNombre = '';
                          let estadoNombre = '';
                          let municipioNombre = '';

                          if (compradorSeleccionado.personas?.direccion_fiscal_id_pais) {
                            const { data: paisData } = await supabase
                              .from('paises')
                              .select('nombre')
                              .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_pais)
                              .single();
                            paisNombre = paisData?.nombre || '';
                          }

                          if (compradorSeleccionado.personas?.direccion_fiscal_id_estado) {
                            const { data: estadoData } = await supabase
                              .from('estados_mx')
                              .select('nombre')
                              .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_estado)
                              .single();
                            estadoNombre = estadoData?.nombre || '';
                          }

                          if (compradorSeleccionado.personas?.direccion_fiscal_id_municipio) {
                            const { data: municipioData } = await supabase
                              .from('municipios_mx')
                              .select('nombre')
                              .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_municipio)
                              .single();
                            municipioNombre = municipioData?.nombre || '';
                          }

                          const compradorData = {
                            id_persona: compradorSeleccionado.personas?.id,
                            nombre_completo: compradorSeleccionado.personas?.nombre_legal?.trim() || '',
                            rfc: compradorSeleccionado.personas?.rfc?.trim() || '',
                            regimen: compradorSeleccionado.personas?.regimen?.trim() || '',
                            uso_cfdi: compradorSeleccionado.personas?.uso_cfdi?.trim() || '',
                            email: compradorSeleccionado.personas?.email?.trim() || '',
                            telefono: compradorSeleccionado.personas?.telefono?.trim() || '',
                            porcentaje_propiedad: compradorSeleccionado.porcentaje_copropiedad,
                            direccion_calle: compradorSeleccionado.personas?.direccion_calle?.trim() || '',
                            direccion_num_ext: compradorSeleccionado.personas?.direccion_num_ext?.trim() || '',
                            direccion_num_int: compradorSeleccionado.personas?.direccion_num_int?.trim() || '',
                            direccion_fiscal: {
                              calle: compradorSeleccionado.personas?.direccion_fiscal_calle?.trim() || '',
                              numero_exterior: compradorSeleccionado.personas?.direccion_fiscal_num_ext?.trim() || '',
                              numero_interior: compradorSeleccionado.personas?.direccion_fiscal_num_int?.trim() || '',
                              colonia: compradorSeleccionado.personas?.direccion_fiscal_colonia?.trim() || '',
                              codigo_postal: compradorSeleccionado.personas?.direccion_fiscal_codigo_postal?.trim() || '',
                              municipio: municipioNombre.trim(),
                              estado: estadoNombre.trim(),
                              pais: paisNombre.trim()
                            }
                          };
                          
                          // Obtener dirección del proyecto
                          let direccionProyecto = '';
                          if (propiedadDetalle?.id_edificio_modelo) {
                            const { data: edificioModelo } = await supabase
                              .from('edificios_modelos')
                              .select(`
                                edificios!edificios_modelos_id_edificio_fkey(
                                  proyectos!edificios_id_proyecto_fkey(direccion)
                                )
                              `)
                              .eq('id', propiedadDetalle.id_edificio_modelo)
                              .single();
                            
                            direccionProyecto = (edificioModelo as any)?.edificios?.proyectos?.direccion || '';
                          }
                          
                          // Construir payload
                          const payload = {
                            api_key: apiKey,
                            environment: ENVIRONMENT,
                            tipo_factura: "propiedad",
                            id_propiedad: propiedadDetalle?.id,
                            id_cuenta_cobranza: cuentaDetalle?.id,
                            id_documento: idDocumento,
                            propiedad: propiedadDetalle ? {
                              numero_propiedad: propiedadDetalle.numero_propiedad,
                              metraje_escriturable: (propiedadDetalle.m2_interiores || 0) + (propiedadDetalle.m2_exteriores || 0),
                              direccion: direccionProyecto,
                              precio_final: cuentaDetalle?.precio_final,
                              piso: propiedadDetalle.numero_piso
                            } : null,
                            estacionamientos: estacionamientosDetalle?.map(est => ({
                              nombre: est.nombre,
                              m2: est.m2,
                              ubicacion: est.ubicacion,
                              es_incluido: est.es_incluido,
                              tipo_estacionamiento: est.tipos_estacionamiento?.nombre || ''
                            })) || [],
                            bodegas: bodegasDetalle?.map(bod => ({
                              nombre: bod.nombre,
                              m2: bod.m2,
                              ubicacion: bod.ubicacion,
                              es_incluido: bod.es_incluido
                            })) || [],
                            escrituracion: {
                              clave_catastral: claveCatastral,
                              libro,
                              hoja,
                              fecha_escritura: fechaEscritura ? format(fechaEscritura, 'yyyy-MM-dd') : null,
                              numero_unidad_privativa: numeroUnidadPrivativa,
                              numero_escritura: numeroEscritura,
                              notario: (() => {
                                const notario = notarios?.find(n => n.id.toString() === selectedNotario);
                                return notario ? {
                                  nombre: notario.nombre?.trim() || '',
                                  notaria: notario.notaria?.trim() || '',
                                  direccion: notario.direccion?.trim() || '',
                                  email: notario.email?.trim() || '',
                                  telefono: notario.telefono?.trim() || ''
                                } : null;
                              })()
                            },
                            compradores: [compradorData]
                          };
                          
                          // Llamar al endpoint
                          const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/generaFactura`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(payload)
                          });
                          
                          if (!response.ok) {
                            const errorData = await response.json().catch(() => null);
                            const errorMessage = errorData?.message || errorData?.error || `Error ${response.status}: ${response.statusText}`;
                            throw new Error(errorMessage);
                          }
                          
                          const result = await response.json();
                          console.log('✅ Factura definitiva generada:', result);
                          toast.success('Factura definitiva generada exitosamente');
                        } catch (error) {
                          console.error('❌ Error generando factura definitiva:', error);
                          
                          let errorTitle = 'Error al generar la factura definitiva';
                          let errorDescription = '';
                          
                          if (error instanceof Error) {
                            if (error.message.includes('404')) {
                              errorTitle = 'Servicio no disponible';
                              errorDescription = 'El servicio de facturación no está disponible (404)';
                            } else if (error.message.includes('500')) {
                              errorTitle = 'Error del servidor';
                              errorDescription = 'Error interno del servidor de facturación (500)';
                            } else if (error.message.includes('timeout') || error.message.includes('network')) {
                              errorTitle = 'Error de conexión';
                              errorDescription = 'No se pudo conectar con el servicio de facturación';
                            } else if (error.message !== 'Error al generar factura') {
                              errorTitle = 'Error de validación';
                              errorDescription = error.message;
                            }
                          }
                          
                          toast.error(errorTitle, {
                            description: errorDescription,
                            duration: 8000,
                          });
                        }
                      }}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No se puede cargar la sección de documentos sin una cuenta de cobranza
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Facturas Tab - Only for properties with facturas */}
          {tipoCuenta === 'Propiedad' && hasFacturas && (
            <TabsContent value="facturas" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
              <FacturasTab
                cuentaCobranzaId={cuenta.id}
                compradores={compradoresExistentes?.map(c => ({ 
                  id_persona: c.personas?.id || 0, 
                  nombre_legal: c.personas?.nombre_legal || '',
                  rfc: c.personas?.rfc
                })) || []}
                propiedadId={propiedadDetalle?.id}
                apiKeyDraft={vendedorDetalle?.nombre_api_key_draft || undefined}
                duenoPuedeFacturar={vendedorDetalle?.facturar === true}
                isReadOnly={isReadOnly}
                onGenerateFinalInvoice={async (idPersona: number, idDocumento: number) => {
                  try {
                    // Obtener api_key del dueño
                    const apiKey = vendedorDetalle?.nombre_api_key_draft;
                    
                    // Filtrar solo el comprador seleccionado
                    const compradorSeleccionado = compradoresExistentes?.find(c => c.personas?.id === idPersona);
                    
                    if (!compradorSeleccionado) {
                      throw new Error('Comprador no encontrado');
                    }
                    
                    // Obtener nombres de país, estado y municipio
                    let paisNombre = '';
                    let estadoNombre = '';
                    let municipioNombre = '';

                    if (compradorSeleccionado.personas?.direccion_fiscal_id_pais) {
                      const { data: paisData } = await supabase
                        .from('paises')
                        .select('nombre')
                        .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_pais)
                        .single();
                      paisNombre = paisData?.nombre || '';
                    }

                    if (compradorSeleccionado.personas?.direccion_fiscal_id_estado) {
                      const { data: estadoData } = await supabase
                        .from('estados_mx')
                        .select('nombre')
                        .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_estado)
                        .single();
                      estadoNombre = estadoData?.nombre || '';
                    }

                    if (compradorSeleccionado.personas?.direccion_fiscal_id_municipio) {
                      const { data: municipioData } = await supabase
                        .from('municipios_mx')
                        .select('nombre')
                        .eq('id', compradorSeleccionado.personas.direccion_fiscal_id_municipio)
                        .single();
                      municipioNombre = municipioData?.nombre || '';
                    }

                    const compradorData = {
                      id_persona: compradorSeleccionado.personas?.id,
                      nombre_completo: compradorSeleccionado.personas?.nombre_legal?.trim() || '',
                      rfc: compradorSeleccionado.personas?.rfc?.trim() || '',
                      regimen: compradorSeleccionado.personas?.regimen?.trim() || '',
                      uso_cfdi: compradorSeleccionado.personas?.uso_cfdi?.trim() || '',
                      email: compradorSeleccionado.personas?.email?.trim() || '',
                      telefono: compradorSeleccionado.personas?.telefono?.trim() || '',
                      porcentaje_propiedad: compradorSeleccionado.porcentaje_copropiedad,
                      direccion_calle: compradorSeleccionado.personas?.direccion_calle?.trim() || '',
                      direccion_num_ext: compradorSeleccionado.personas?.direccion_num_ext?.trim() || '',
                      direccion_num_int: compradorSeleccionado.personas?.direccion_num_int?.trim() || '',
                      direccion_fiscal: {
                        calle: compradorSeleccionado.personas?.direccion_fiscal_calle?.trim() || '',
                        numero_exterior: compradorSeleccionado.personas?.direccion_fiscal_num_ext?.trim() || '',
                        numero_interior: compradorSeleccionado.personas?.direccion_fiscal_num_int?.trim() || '',
                        colonia: compradorSeleccionado.personas?.direccion_fiscal_colonia?.trim() || '',
                        codigo_postal: compradorSeleccionado.personas?.direccion_fiscal_codigo_postal?.trim() || '',
                        municipio: municipioNombre.trim(),
                        estado: estadoNombre.trim(),
                        pais: paisNombre.trim()
                      }
                    };
                    
                    // Obtener dirección del proyecto
                    let direccionProyecto = '';
                    if (propiedadDetalle?.id_edificio_modelo) {
                      const { data: edificioModelo } = await supabase
                        .from('edificios_modelos')
                        .select(`
                          edificios!edificios_modelos_id_edificio_fkey(
                            proyectos!edificios_id_proyecto_fkey(direccion)
                          )
                        `)
                        .eq('id', propiedadDetalle.id_edificio_modelo)
                        .single();
                      
                      direccionProyecto = (edificioModelo as any)?.edificios?.proyectos?.direccion || '';
                    }
                    
                    // Construir payload
                    const payload = {
                      api_key: apiKey,
                      environment: ENVIRONMENT,
                      tipo_factura: "propiedad",
                      id_propiedad: propiedadDetalle?.id,
                      id_cuenta_cobranza: cuentaDetalle?.id,
                      id_documento: idDocumento,
                      propiedad: propiedadDetalle ? {
                        numero_propiedad: propiedadDetalle.numero_propiedad,
                        metraje_escriturable: (propiedadDetalle.m2_interiores || 0) + (propiedadDetalle.m2_exteriores || 0),
                        direccion: direccionProyecto,
                        precio_final: cuentaDetalle?.precio_final,
                        piso: propiedadDetalle.numero_piso
                      } : null,
                      estacionamientos: estacionamientosDetalle?.map(est => ({
                        nombre: est.nombre,
                        m2: est.m2,
                        ubicacion: est.ubicacion,
                        es_incluido: est.es_incluido,
                        tipo_estacionamiento: est.tipos_estacionamiento?.nombre || ''
                      })) || [],
                      bodegas: bodegasDetalle?.map(bod => ({
                        nombre: bod.nombre,
                        m2: bod.m2,
                        ubicacion: bod.ubicacion,
                        es_incluido: bod.es_incluido
                      })) || [],
                      escrituracion: {
                        clave_catastral: claveCatastral,
                        libro,
                        hoja,
                        fecha_escritura: fechaEscritura ? format(fechaEscritura, 'yyyy-MM-dd') : null,
                        numero_unidad_privativa: numeroUnidadPrivativa,
                        numero_escritura: numeroEscritura,
                        notario: (() => {
                          const notario = notarios?.find(n => n.id.toString() === selectedNotario);
                          return notario ? {
                            nombre: notario.nombre?.trim() || '',
                            notaria: notario.notaria?.trim() || '',
                            direccion: notario.direccion?.trim() || '',
                            email: notario.email?.trim() || '',
                            telefono: notario.telefono?.trim() || ''
                          } : null;
                        })()
                      },
                      compradores: [compradorData]
                    };
                    
                    // Llamar al endpoint
                    const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/generaFactura`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(payload)
                    });
                    
                    if (!response.ok) {
                      throw new Error('Error al generar factura');
                    }
                    
                    toast.success('Factura definitiva generada exitosamente');
                  } catch (error) {
                    console.error('Error generando factura:', error);
                    toast.error('Error al generar la factura definitiva');
                  }
                }}
              />
            </TabsContent>
          )}

          <TabsContent value="acuerdo" className="space-y-4">
{isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
            <Card>
              <CardContent className="pt-6">
                {/* Purchase and UMA Information Section */}
                <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="fecha-compra" className="font-medium text-foreground mb-2 block">Fecha de Compra</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            disabled={isReadOnly}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {fechaCompra ? format(fechaCompra, 'dd/MM/yyyy', { locale: es }) : "Seleccionar fecha"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={fechaCompra}
                            onSelect={(date) => {
                              if (date) {
                                setFechaCompra(date);
                                updateFechaCompraMutation.mutate(date);
                              }
                            }}
                            initialFocus
                            locale={es}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {tipoCuenta === 'Propiedad' && (
                      <div>
                        <Label className="font-medium text-foreground mb-1">Valor de la UMA</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={valorUma}
                            onChange={(e) => setValorUma(e.target.value)}
                            onBlur={() => {
                              const numValue = parseFloat(valorUma);
                              if (!isNaN(numValue) && numValue >= 0) {
                                updateValorUmaMutation.mutate(numValue);
                              }
                            }}
                            disabled={isReadOnly}
                            className="w-32"
                            placeholder="0.00"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Unidad de Medida y Actualización vigente
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Acuerdo de Pago Title */}
                <div className="mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">Acuerdo de Pago</h3>
                    {esComisionEfectivo && cuentaDetalle && porcentajeComision > 0 && (() => {
                      const precioLista = tipoCuenta === 'Propiedad' ? propiedadDetalle?.precio_lista : productoServicioInfo?.precio_lista;
                      const montoComision = precioLista ? precioLista * (porcentajeComision / 100) : 0;
                      return (
                        <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200">
                          💰 Comisión en efectivo: -{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(montoComision)}
                        </Badge>
                      );
                    })()}
                  </div>
                  {esComisionEfectivo && (
                    <p className="text-xs text-muted-foreground mt-1">
                      El monto de la comisión fue descontado del precio final y del enganche
                    </p>
                  )}
                </div>

                {/* Selected Payment Scheme Information */}
                {selectedPaymentScheme && cuentaDetalle?.id_oferta && (
                  <Card className="mb-6">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">Plan de pagos:</span>
                          <Badge 
                            variant={isPaymentPlanModified ? "outline" : "secondary"}
                            className={isPaymentPlanModified ? "bg-green-100 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-300" : ""}
                          >
                            {formatOfertaId(cuentaDetalle.id_oferta)} - {selectedPaymentScheme.nombre}
                            {isPaymentPlanModified && " modificado"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>

                      {!isPaymentPlanModified ? (
                        // Original unchanged plan - show current database values
                        <div>
                          {/* Price Summary Section */}
                          <div className="mb-6 p-4 bg-muted/20 rounded-lg">
                            <div className={`grid grid-cols-1 gap-4 ${
                              (() => {
                                const precioListaCalculado = tipoCuenta === 'Propiedad' 
                                  ? propiedadDetalle?.precio_lista 
                                  : (bodegaEstacionamientoData 
                                      ? (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0)
                                      : productoServicioInfo?.precio_lista);
                                return precioListaCalculado && cuentaDetalle?.precio_final && 
                                  cuentaDetalle.precio_final !== precioListaCalculado;
                              })()
                                ? 'md:grid-cols-3' 
                                : 'md:grid-cols-2'
                            }`}>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Precio de Lista</h4>
                                <p className="text-sm text-muted-foreground">
                                  {(() => {
                                    if (tipoCuenta === 'Propiedad') {
                                      return propiedadDetalle?.precio_lista 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(propiedadDetalle.precio_lista)
                                        : 'No definido';
                                    } else if (bodegaEstacionamientoData) {
                                      const precioCalculado = (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0);
                                      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(precioCalculado);
                                    } else {
                                      return productoServicioInfo?.precio_lista 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(productoServicioInfo.precio_lista)
                                        : 'No definido';
                                    }
                                  })()}
                                </p>
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Precio Final</h4>
                                <div className="flex items-center gap-2">
                                  {isEditingPrecioFinal ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editingPrecioFinal}
                                        onChange={(e) => setEditingPrecioFinal(e.target.value)}
                                        className="w-40 h-8"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handlePrecioFinalEdit();
                                          if (e.key === 'Escape') {
                                            setIsEditingPrecioFinal(false);
                                            setEditingPrecioFinal('');
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="h-8"
                                        onClick={handlePrecioFinalEdit}
                                      >
                                        Guardar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() => {
                                          setIsEditingPrecioFinal(false);
                                          setEditingPrecioFinal('');
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-sm font-semibold text-foreground">
                                        {cuentaDetalle?.precio_final ? 
                                          new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cuentaDetalle.precio_final) : 
                                          'No definido'
                                        }
                                      </p>
                                      {canEditPrecioFinal && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={() => {
                                            setEditingPrecioFinal(cuentaDetalle?.precio_final?.toString() || '');
                                            setIsEditingPrecioFinal(true);
                                          }}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {!isEditingPrecioFinal && esComisionEfectivo && porcentajeComision > 0 && (() => {
                                    // Calcular precio antes de comisión usando fórmula inversa
                                    const precioAntesComision = cuentaDetalle?.precio_final 
                                      ? cuentaDetalle.precio_final / (1 - porcentajeComision / 100) 
                                      : 0;
                                    const montoComision = precioAntesComision - (cuentaDetalle?.precio_final || 0);
                                    return (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Banknote className="h-4 w-4 text-yellow-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Comisión pagada en efectivo ({porcentajeComision.toFixed(2)}%)</p>
                                            <p className="text-xs mt-1">Precio antes de comisión: {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(precioAntesComision)}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                              </div>
                              {(() => {
                                const precioLista = tipoCuenta === 'Propiedad' 
                                  ? propiedadDetalle?.precio_lista 
                                  : (bodegaEstacionamientoData 
                                      ? (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0)
                                      : productoServicioInfo?.precio_lista);
                                
                                if (!precioLista || !cuentaDetalle?.precio_final) return null;
                                
                                // Ajustar precio_final si hay comisión en efectivo usando fórmula inversa
                                let precioFinalAjustado = cuentaDetalle.precio_final;
                                if (esComisionEfectivo && porcentajeComision > 0) {
                                  // Recalcular precio antes de aplicar la comisión
                                  precioFinalAjustado = cuentaDetalle.precio_final / (1 - porcentajeComision / 100);
                                }
                                
                                const difference = precioFinalAjustado - precioLista;
                                
                                // Usar tolerancia para evitar problemas de redondeo
                                const tolerance = 10.0;
                                
                                // Si la diferencia es menor a la tolerancia, no mostrar ahorro/interés
                                if (Math.abs(difference) < tolerance) {
                                  return null;
                                }
                                
                                const percentage = (difference / precioLista) * 100;
                                
                                return (
                                  <div>
                                    <h4 className="font-medium text-foreground mb-1">
                                      {difference < 0 ? 'Ahorro' : 'Interés'}
                                    </h4>
                                    <p className={`text-sm font-semibold ${
                                      difference < 0 
                                        ? 'text-green-600 bg-green-100 px-2 py-1 rounded-md' 
                                        : 'text-orange-600'
                                    }`}>
                                      {difference > 0 
                                        ? `+${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(difference)} (+${percentage.toFixed(2)}%)`
                                        : `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(difference)} (${percentage.toFixed(2)}%)`
                                      }
                                    </p>
                                  </div>
                                );
                            })()}
                          </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <h4 className="font-medium text-foreground mb-1">Nombre del Plan</h4>
                            <p className="text-sm text-muted-foreground">{selectedPaymentScheme.nombre}</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground mb-1">Enganche</h4>
                            <p className="text-sm text-muted-foreground">{currentPaymentPlan?.porcentaje_enganche?.toFixed(2)}%</p>
                            {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_enganche !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                  currentPaymentPlan.monto_enganche
                                )}
                              </p>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground mb-1">Mensualidades</h4>
                            <p className="text-sm text-muted-foreground">
                              {currentPaymentPlan?.numero_mensualidades} pagos de {currentPaymentPlan?.porcentaje_mensualidades?.toFixed(2)}%
                            </p>
                            {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_mensualidades !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                  currentPaymentPlan.monto_mensualidades
                                )}
                              </p>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground mb-1">Entrega</h4>
                            <p className="text-sm text-muted-foreground">{currentPaymentPlan?.porcentaje_entrega?.toFixed(2)}%</p>
                            {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_entrega !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                  currentPaymentPlan.monto_entrega
                                )}
                              </p>
                            )}
                          </div>
                         </div>
                        </div>
                      ) : (
                        // Modified plan - show both original (disabled) and current
                        <div className="space-y-4">
                          {/* Price Summary Section */}
                          <div className="mb-4 p-4 bg-muted/20 rounded-lg">
                            <div className={`grid grid-cols-1 gap-4 ${
                              (() => {
                                const precioListaCalculado = tipoCuenta === 'Propiedad' 
                                  ? propiedadDetalle?.precio_lista 
                                  : (bodegaEstacionamientoData 
                                      ? (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0)
                                      : productoServicioInfo?.precio_lista);
                                return precioListaCalculado && cuentaDetalle?.precio_final && 
                                  cuentaDetalle.precio_final !== precioListaCalculado;
                              })()
                                ? 'md:grid-cols-3' 
                                : 'md:grid-cols-2'
                            }`}>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Precio de Lista</h4>
                                <p className="text-sm text-muted-foreground">
                                  {(() => {
                                    if (tipoCuenta === 'Propiedad') {
                                      return propiedadDetalle?.precio_lista 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(propiedadDetalle.precio_lista)
                                        : 'No definido';
                                    } else if (bodegaEstacionamientoData) {
                                      const precioCalculado = (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0);
                                      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(precioCalculado);
                                    } else {
                                      return productoServicioInfo?.precio_lista 
                                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(productoServicioInfo.precio_lista)
                                        : 'No definido';
                                    }
                                  })()}
                                </p>
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Precio Final</h4>
                                <div className="flex items-center gap-2">
                                  {isEditingPrecioFinal ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editingPrecioFinal}
                                        onChange={(e) => setEditingPrecioFinal(e.target.value)}
                                        className="w-40 h-8"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handlePrecioFinalEdit();
                                          if (e.key === 'Escape') {
                                            setIsEditingPrecioFinal(false);
                                            setEditingPrecioFinal('');
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="default"
                                        className="h-8"
                                        onClick={handlePrecioFinalEdit}
                                      >
                                        Guardar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() => {
                                          setIsEditingPrecioFinal(false);
                                          setEditingPrecioFinal('');
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-sm font-semibold text-foreground">
                                        {cuentaDetalle?.precio_final ? 
                                          new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cuentaDetalle.precio_final) : 
                                          'No definido'
                                        }
                                      </p>
                                      {canEditPrecioFinal && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={() => {
                                            setEditingPrecioFinal(cuentaDetalle?.precio_final?.toString() || '');
                                            setIsEditingPrecioFinal(true);
                                          }}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              {(() => {
                                const precioLista = tipoCuenta === 'Propiedad' 
                                  ? propiedadDetalle?.precio_lista 
                                  : (bodegaEstacionamientoData 
                                      ? (productoServicioInfo?.precio_lista || 0) * (bodegaEstacionamientoData.m2 || 0)
                                      : productoServicioInfo?.precio_lista);
                                
                                if (!precioLista || !cuentaDetalle?.precio_final) return null;
                                
                                // Ajustar precio_final si hay comisión en efectivo usando fórmula inversa
                                let precioFinalAjustado = cuentaDetalle.precio_final;
                                if (esComisionEfectivo && porcentajeComision > 0) {
                                  // Recalcular precio antes de aplicar la comisión
                                  precioFinalAjustado = cuentaDetalle.precio_final / (1 - porcentajeComision / 100);
                                }
                                
                                const difference = precioFinalAjustado - precioLista;
                                
                                // Usar tolerancia para evitar problemas de redondeo
                                const tolerance = 10.0;
                                
                                // Si la diferencia es menor a la tolerancia, no mostrar
                                if (Math.abs(difference) < tolerance) {
                                  return null;
                                }
                                
                                const percentage = (difference / precioLista) * 100;
                                
                                return (
                                  <div>
                                    <h4 className="font-medium text-foreground mb-1">
                                      {difference < 0 ? 'Ahorro' : 'Interés'}
                                    </h4>
                                    <p className={`text-sm font-semibold ${
                                      difference < 0 
                                        ? 'text-green-600 bg-green-100 px-2 py-1 rounded-md' 
                                        : 'text-orange-600'
                                    }`}>
                                      {(() => {
                                      if (difference > 0) {
                                        return `+${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(difference)} (+${percentage.toFixed(2)}%)`;
                                      } else if (difference < 0) {
                                        return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(difference)} (${percentage.toFixed(2)}%)`;
                                      }
                                    })()}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                          </div>

                          {/* Original Plan - Disabled */}
                          <div className="opacity-50 pointer-events-none border rounded p-3 bg-muted/20">
                            <label className="text-xs text-muted-foreground mb-2 block">Plan Original</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Nombre del Plan</h4>
                                <p className="text-sm text-muted-foreground">{selectedPaymentScheme.nombre}</p>
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Enganche</h4>
                                <p className="text-sm text-muted-foreground">{selectedPaymentScheme.porcentaje_enganche?.toFixed(2)}%</p>
                                {propiedadDetalle?.precio_lista && (
                                  <p className="text-xs text-muted-foreground">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      (propiedadDetalle.precio_lista * selectedPaymentScheme.porcentaje_enganche) / 100
                                    )}
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Mensualidades</h4>
                                <p className="text-sm text-muted-foreground">
                                  {selectedPaymentScheme.numero_mensualidades} pagos de {selectedPaymentScheme.porcentaje_mensualidades?.toFixed(2)}%
                                </p>
                                {propiedadDetalle?.precio_lista && (
                                  <p className="text-xs text-muted-foreground">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      (propiedadDetalle.precio_lista * selectedPaymentScheme.porcentaje_mensualidades) / 100
                                    )}
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Entrega</h4>
                                <p className="text-sm text-muted-foreground">{selectedPaymentScheme.porcentaje_entrega?.toFixed(2)}%</p>
                                {propiedadDetalle?.precio_lista && (
                                  <p className="text-xs text-muted-foreground">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      (propiedadDetalle.precio_lista * selectedPaymentScheme.porcentaje_entrega) / 100
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Modified Plan - Active */}
                          <div className="border-2 border-primary rounded p-3">
                            <label className="text-xs text-primary font-semibold mb-2 block">Plan Modificado</label>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Nombre del Plan</h4>
                                <p className="text-sm font-semibold">{selectedPaymentScheme.nombre} modificado</p>
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Enganche</h4>
                                <p className="text-sm font-semibold">{currentPaymentPlan?.porcentaje_enganche?.toFixed(2)}%</p>
                                {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_enganche !== undefined && (
                                  <p className="text-xs font-medium text-primary">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      currentPaymentPlan.monto_enganche
                                    )}
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Mensualidades</h4>
                                <p className="text-sm font-semibold">
                                  {currentPaymentPlan?.numero_mensualidades} pagos de {currentPaymentPlan?.porcentaje_mensualidades?.toFixed(2)}%
                                </p>
                                {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_mensualidades !== undefined && (
                                  <p className="text-xs font-medium text-primary">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      currentPaymentPlan.monto_mensualidades
                                    )}
                                  </p>
                                )}
                              </div>
                              {/* Pagos Especiales - only show if there are any */}
                              {currentPaymentPlan?.numero_pagos_especiales && currentPaymentPlan.numero_pagos_especiales > 0 && (
                                <div>
                                  <h4 className="font-medium text-foreground mb-1">Pagos Especiales</h4>
                                  <p className="text-sm font-semibold">
                                    {currentPaymentPlan.numero_pagos_especiales} pago(s) de {currentPaymentPlan.porcentaje_pagos_especiales?.toFixed(2)}%
                                  </p>
                                  {cuentaDetalle?.precio_final && currentPaymentPlan.monto_pagos_especiales !== undefined && (
                                    <p className="text-xs font-medium text-primary">
                                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                        currentPaymentPlan.monto_pagos_especiales
                                      )}
                                    </p>
                                  )}
                                </div>
                              )}
                              <div>
                                <h4 className="font-medium text-foreground mb-1">Entrega</h4>
                                <p className="text-sm font-semibold">{currentPaymentPlan?.porcentaje_entrega?.toFixed(2)}%</p>
                                {cuentaDetalle?.precio_final && currentPaymentPlan?.monto_entrega !== undefined && (
                                  <p className="text-xs font-medium text-primary">
                                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                      currentPaymentPlan.monto_entrega
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {acuerdos && acuerdos.length > 0 ? (
                  <DndContext
                    sensors={isReadOnly ? [] : sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                     <Table>
                       <TableHeader>
                           <TableRow>
                             <TableHead>Concepto</TableHead>
                             <TableHead>Fecha de Pago</TableHead>
                             <TableHead>Monto</TableHead>
                             <TableHead>Porcentaje</TableHead>
                             <TableHead>Pagado</TableHead>
                             <TableHead>Estatus</TableHead>
                             <TableHead>Acciones</TableHead>
                           </TableRow>
                        </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={acuerdos.map(a => a.id.toString())}
                          strategy={verticalListSortingStrategy}
                        >
                           {acuerdos.map((acuerdo, index) => (
                               <SortableItem 
                                 key={acuerdo.id} 
                                 id={acuerdo.id.toString()}
                                 disabled={isReadOnly || acuerdo.pago_completado}
                               >
                                <TableCell>{acuerdo.concepto_nombre}</TableCell>
                                  <TableCell>
                                     {editingAcuerdo === acuerdo.id ? (
                                        <Input
                                          type="date"
                                          value={editingDate ? 
                                            `${editingDate.getFullYear()}-${String(editingDate.getMonth() + 1).padStart(2, '0')}-${String(editingDate.getDate()).padStart(2, '0')}` : 
                                            (acuerdo.fecha_pago || '')
                                          }
                                          onChange={(e) => {
                                            console.log('Date input changed:', e.target.value);
                                            // Create date object using the exact date value without timezone conversion
                                            const selectedDate = e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined;
                                            setEditingDate(selectedDate);
                                          }}
                                         className="w-40"
                                         onBlur={() => {
                                           console.log('Date input blur, editingDate:', editingDate);
                                           if (editingDate) {
                                             handleDateUpdate(acuerdo.id, editingDate);
                                           } else {
                                             setEditingAcuerdo(null);
                                             setEditingDate(undefined);
                                           }
                                         }}
                                         onKeyDown={(e) => {
                                           if (e.key === 'Enter') {
                                             console.log('Enter pressed, editingDate:', editingDate);
                                             if (editingDate) {
                                               handleDateUpdate(acuerdo.id, editingDate);
                                             }
                                           }
                                           if (e.key === 'Escape') {
                                             console.log('Escape pressed');
                                             setEditingAcuerdo(null);
                                             setEditingDate(undefined);
                                           }
                                         }}
                                         autoFocus
                                       />
                                     ) : (
                                       <div className="flex items-center gap-2">
                                         <span>
                                           {acuerdo.fecha_pago ? (() => {
                                             const dateStr = acuerdo.fecha_pago;
                                             const [year, month, day] = dateStr.split('-');
                                             return `${day}/${month}/${year}`;
                                           })() : 'Sin fecha'}
                                         </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('Date edit button clicked for acuerdo:', acuerdo.id, 'pago_completado:', acuerdo.pago_completado);
                              setEditingAcuerdo(acuerdo.id);
                              // Create date from the stored date string to avoid timezone issues
                              setEditingDate(acuerdo.fecha_pago ? new Date(acuerdo.fecha_pago + 'T00:00:00') : undefined);
                            }}
                           disabled={acuerdo.pago_completado || isReadOnly}
                         >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                <TableCell>
                                  {editingAmount === acuerdo.id ? (
                                     <Input
                                       type="number"
                                       step="0.01"
                                       value={editingMonto}
                                       onChange={(e) => {
                                         console.log('Amount input changed:', e.target.value);
                                         setEditingMonto(e.target.value);
                                       }}
                                       className="w-32"
                                       onBlur={() => {
                                         console.log('Amount input blur, editingMonto:', editingMonto);
                                         const monto = parseFloat(editingMonto);
                                         if (!isNaN(monto) && monto > 0) {
                                           handleAmountUpdate(acuerdo.id, monto);
                                         } else {
                                           setEditingAmount(null);
                                           setEditingMonto('');
                                         }
                                       }}
                                       onKeyDown={(e) => {
                                         if (e.key === 'Enter') {
                                           console.log('Enter pressed on amount, editingMonto:', editingMonto);
                                           const monto = parseFloat(editingMonto);
                                           if (!isNaN(monto) && monto > 0) {
                                             handleAmountUpdate(acuerdo.id, monto);
                                           }
                                         }
                                         if (e.key === 'Escape') {
                                           console.log('Escape pressed on amount');
                                           setEditingAmount(null);
                                           setEditingMonto('');
                                         }
                                       }}
                                       autoFocus
                                     />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span>
                                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(acuerdo.monto)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          console.log('Amount edit button clicked for acuerdo:', acuerdo.id, 'pago_completado:', acuerdo.pago_completado);
                                          setEditingAmount(acuerdo.id);
                                          setEditingMonto(acuerdo.monto.toString());
                                        }}
                                        disabled={acuerdo.pago_completado || isReadOnly}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{cuentaDetalle?.precio_final ? ((acuerdo.monto / cuentaDetalle.precio_final) * 100).toFixed(2) : 0}%</TableCell>
                                <TableCell>
                                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(acuerdo.monto_pagado || 0)}
                                </TableCell>
                                 <TableCell>
                                   <div className="flex items-center justify-center">
                                     {acuerdo.pago_completado ? (
                                       <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-medium">
                                         Pagado
                                       </span>
                                     ) : (
                                       <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-full text-xs font-medium">
                                         Pendiente
                                       </span>
                                     )}
                                   </div>
                                 </TableCell>
                                 <TableCell>
                                   <div className="flex items-center justify-center">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleDeleteAcuerdo(acuerdo.id, acuerdo.concepto_nombre, acuerdo.monto);
                                        }}
                                        disabled={deleteAcuerdoMutation.isPending || (acuerdo.monto_pagado > 0) || isReadOnly}
                                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                   </div>
                                 </TableCell>
                             </SortableItem>
                           ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
                ) : (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">No hay acuerdo de pago configurado</p>
                    
                    <div className="space-y-2">
                      <Label>Seleccionar Plan de Pago</Label>
                      <Select value={selectedEsquema} onValueChange={setSelectedEsquema} disabled={isReadOnly}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un plan de pago" />
                        </SelectTrigger>
                        <SelectContent>
                          {esquemasPago?.map((esquema) => (
                            <SelectItem key={esquema.id} value={esquema.id.toString()}>
                              {esquema.nombre} - Enganche: {esquema.porcentaje_enganche?.toFixed(2)}% | 
                              Mensualidades: {esquema.numero_mensualidades} pagos de {esquema.porcentaje_mensualidades?.toFixed(2)}% | 
                              Entrega: {esquema.porcentaje_entrega?.toFixed(2)}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Button 
                        onClick={handleCreateAcuerdo} 
                        disabled={!selectedEsquema || createAcuerdoMutation.isPending || isReadOnly}
                      >
                        Crear Acuerdo de Pago
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comisiones" className="space-y-4">
            {isReadOnly && <ReadOnlyBanner isEnDemanda={isEnDemanda} />}
            <Card>
              <CardHeader>
                <CardTitle>Información de Comisiones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Comisión en Efectivo Toggle */}
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="comision-efectivo" className="text-base font-semibold">
                          Comisión en Efectivo
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {esComisionEfectivo 
                            ? 'La comisión se pagará en efectivo (sin IVA)'
                            : 'Activar si la comisión se pagará en efectivo'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="comision-efectivo"
                          checked={esComisionEfectivo}
                          onCheckedChange={(checked) => {
                            if (checked === true && !esComisionEfectivo) {
                              setShowComisionEfectivoDialog(true);
                            }
                          }}
                          disabled={isReadOnly || esComisionEfectivo || aplicaBloqueoComisionPorEnganche}
                        />
                      </div>
                    </div>
                    {esComisionEfectivo && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ Esta configuración no se puede revertir
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="porcentajeComision" className="flex items-center gap-2 flex-wrap">
                        <span>Porcentaje de Comisión de Venta{inmobiliariaProyecto ? ` para` : ' (%)'}</span>
                        {inmobiliariaProyecto && (
                          <Badge variant="secondary" className="text-xs">{inmobiliariaProyecto}</Badge>
                        )}
                      </Label>
                      <Input 
                        id="porcentajeComision"
                        type="number"
                        min="4"
                        max="100"
                        step="0.0001"
                        value={porcentajeComision}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Validar máximo 4 decimales
                          if (value.includes('.')) {
                            const [, decimals] = value.split('.');
                            if (decimals && decimals.length > 4) {
                              return;
                            }
                          }
                          handlePorcentajeComisionChange(value);
                        }}
                        onBlur={handleComisionBlur}
                        disabled={isReadOnly || isComisionLockedByEnganche}
                      />
                      <p className="text-xs text-muted-foreground">
                        {aplicaBloqueoComisionPorEnganche && canSuperAdminEditComision
                          ? 'Editable por Super Admin (factura aún no generada)'
                          : aplicaBloqueoComisionPorEnganche
                            ? 'No editable - El enganche está completamente pagado'
                            : 'Mínimo 4%, máximo 100% (hasta 4 decimales)'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="montoComision">Monto de Comisión</Label>
                      <Input 
                        id="montoComision"
                        value={cuentaDetalle?.precio_final && porcentajeComision ? 
                          new Intl.NumberFormat('es-MX', { 
                            style: 'currency', 
                            currency: 'MXN' 
                          }).format(((cuentaDetalle.precio_final * porcentajeComision) / 100) * (esComisionEfectivo ? 1 : (ivaIncluido ? 1.16 : 1))) 
                          : '$0.00'
                        } 
                        readOnly 
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        {esComisionEfectivo ? 'Sin IVA (Efectivo)' : (ivaIncluido ? 'Incluye IVA (16%)' : 'Sin IVA')}
                      </p>
                    </div>

                    {!esComisionEfectivo && (
                      <div className="space-y-2">
                        <Label>Opciones de IVA</Label>
                        <div className="flex items-center space-x-3 h-10 px-3 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors">
                          <Checkbox
                            id="iva-incluido"
                            checked={ivaIncluido}
                            onCheckedChange={(checked) => {
                              setIvaIncluido(checked === true);
                              updateComisionMutation.mutate({ 
                                porcentaje: porcentajeComision, 
                                ivaIncluido: checked === true 
                              });
                            }}
                            disabled={isReadOnly || isComisionLockedByEnganche}
                          />
                          <Label
                            htmlFor="iva-incluido"
                            className="text-sm font-medium cursor-pointer select-none"
                          >
                            IVA (16%)
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Monto en la factura: {cuentaDetalle?.precio_final && porcentajeComision ? 
                            new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                              ((cuentaDetalle.precio_final * porcentajeComision) / 100) * (ivaIncluido ? 1.16 : 1)
                            ) : '$0.00'} ({ivaIncluido ? '16% IVA' : '0% IVA'})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comisionistas Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Comisionistas</span>
                  <Badge variant="outline">
                    {totalPorcentajeComisionistas.toFixed(4)}% / {porcentajeComision}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aplicaBloqueoComisionPorEnganche && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        ℹ️ El enganche está completamente pagado. Solo se pueden agregar nuevos comisionistas, no editar porcentajes existentes.
                      </p>
                    </div>
                  )}
                  
                  {/* Add Comisionista Form */}
                  {!isReadOnly && (
                    <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                      <h4 className="font-medium">Agregar Comisionista</h4>
                      
                      {/* Campo de búsqueda solo */}
                      <div className="space-y-2">
                        <Label>Buscar Usuario o Inmobiliaria</Label>
                        <div className="relative">
                          <Input
                            placeholder="Buscar por email o nombre..."
                            value={searchUsuario}
                            onChange={(e) => setSearchUsuario(e.target.value)}
                          />
                          {combinedSearchResults && combinedSearchResults.length > 0 && searchUsuario && !selectedUsuario && (
                            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                              {combinedSearchResults.map((item) => (
                                <div
                                  key={item.email}
                                  className="px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                                  onClick={() => {
                                    setSelectedUsuario(item);
                                    setSearchUsuario('');
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">{item.nombre || item.email}</p>
                                    {item.esInmobiliaria && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200">
                                        Inmobiliaria
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{item.email}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Usuario seleccionado + Porcentaje + Monto en la misma fila */}
                      {selectedUsuario && (
                        <div className="grid grid-cols-3 gap-4 items-start">
                          <div className="space-y-1">
                            <Label className="text-xs invisible">Usuario</Label>
                            <div className="flex items-center justify-between p-2 bg-accent/50 rounded-md h-10">
                              <p className="text-sm font-medium truncate">{selectedUsuario.nombre || selectedUsuario.email}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => {
                                  setSelectedUsuario(null);
                                  setSearchUsuario('');
                                }}
                              >
                                Cambiar
                              </Button>
                            </div>
                            <p className="text-xs text-transparent">-</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Porcentaje de Comisión (%)</Label>
                            <Input
                              type="number"
                              min="0.0001"
                              max={porcentajeComision}
                              step="0.0001"
                              placeholder="0.0000"
                              value={porcentajeComisionista}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                
                                // Validar máximo 4 decimales
                                if (inputValue.includes('.')) {
                                  const [, decimals] = inputValue.split('.');
                                  if (decimals && decimals.length > 4) {
                                    return;
                                  }
                                }
                                
                                const value = parseFloat(inputValue);
                                if (value > porcentajeComision) {
                                  toast.error(`El porcentaje no puede ser mayor al ${porcentajeComision}% de comisión por venta`);
                                  return;
                                }
                                setPorcentajeComisionista(inputValue);
                              }}
                            />
                            <p className="text-xs text-muted-foreground">Máximo: {porcentajeComision}% (hasta 4 decimales)</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Monto</Label>
                            <Input
                              value={cuentaDetalle?.precio_final && porcentajeComisionista ? 
                                new Intl.NumberFormat('es-MX', { 
                                  style: 'currency', 
                                  currency: 'MXN' 
                                }).format(((cuentaDetalle.precio_final * parseFloat(porcentajeComisionista)) / 100) * (esComisionEfectivo ? 1 : (ivaIncluido ? 1.16 : 1)))
                                : '$0.00'
                              }
                              readOnly
                              className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground">
                              {esComisionEfectivo ? 'Sin IVA (Efectivo)' : (ivaIncluido ? 'Incluye IVA (16%)' : 'Sin IVA')}
                            </p>
                          </div>
                        </div>
                      )}

                      <Button 
                        onClick={handleAddComisionista}
                        disabled={!selectedUsuario || !porcentajeComisionista || addComisionistaMutation.isPending}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Comisionista
                      </Button>
                    </div>
                  )}

                  {/* Comisionistas Table */}
                  {comisionistas && comisionistas.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Usuario</TableHead>
                          <TableHead className="text-right">% Comisión</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="text-center">Estado</TableHead>
                          {!isReadOnly && <TableHead className="text-center">Acciones</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comisionistas.map((comisionista) => (
                          <TableRow key={comisionista.email_usuario}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {comisionista.usuarios?.nombre || 'N/A'}
                                {comisionista.usuarios?.esInmobiliaria && (
                                  <Badge variant="secondary" className="text-xs">Inmobiliaria</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{comisionista.email_usuario}</TableCell>
                            <TableCell className="text-right">
                              {comisionista.porcentaje_comision.toFixed(4)}%
                            </TableCell>
                            <TableCell className="text-right">
                              {cuentaDetalle?.precio_final ? 
                                new Intl.NumberFormat('es-MX', { 
                                  style: 'currency', 
                                  currency: 'MXN' 
                                }).format(((cuentaDetalle.precio_final * comisionista.porcentaje_comision) / 100) * (esComisionEfectivo ? 1 : (ivaIncluido ? 1.16 : 1)))
                                : '$0.00'
                              }
                            </TableCell>
                            <TableCell className="text-center">
                              {comisionista.pagada ? (
                                <Badge variant="default">Pagada</Badge>
                              ) : comisionista.aprobada ? (
                                <Badge variant="secondary">Aprobada</Badge>
                              ) : (
                                <Badge variant="outline">Pendiente</Badge>
                              )}
                            </TableCell>
                            {!isReadOnly && (
                              <TableCell className="text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteComisionistaMutation.mutate(comisionista.email_usuario)}
                                  disabled={deleteComisionistaMutation.isPending}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay comisionistas agregados
                    </div>
                  )}

                  {/* Validation Warning */}
                  {totalPorcentajeComisionistas > porcentajeComision && (
                    <div className="p-3 bg-destructive/10 border border-destructive rounded-lg">
                      <p className="text-sm text-destructive font-medium">
                        ⚠️ La suma de porcentajes de comisionistas ({totalPorcentajeComisionistas.toFixed(2)}%) 
                        excede el porcentaje de comisión de venta ({porcentajeComision}%)
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de confirmación para comisión en efectivo */}
        <AlertDialog open={showComisionEfectivoDialog} onOpenChange={setShowComisionEfectivoDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Comisión en Efectivo</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Al activar esta opción:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>El cálculo del monto de comisión <strong>no incluirá IVA</strong></li>
                  <li>Esta acción es <strong className="text-destructive">IRREVERSIBLE</strong></li>
                </ul>
                <p className="text-destructive font-semibold mt-4">
                  ⚠️ Una vez confirmado, no podrás desactivar esta opción.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleComisionEfectivoConfirm}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal de confirmación para número de escritura */}
        <ConfirmEscrituraDialog
          open={showConfirmEscrituraDialog}
          onOpenChange={setShowConfirmEscrituraDialog}
          onConfirm={async (numeroEscrituraEditado: string) => {
            setNumeroEscritura(numeroEscrituraEditado);
            updateEscrituraMutation.mutate({ numero_escritura: numeroEscrituraEditado });
            
            // Si debe generar factura, llamar al endpoint
            if (shouldGenerateInvoice && vendedorDetalle) {
              try {
                // Obtener api_key_draft del dueño
                const apiKeyDraft = vendedorDetalle.nombre_api_key_draft;
                
                // Obtener nombres de país, estado y municipio para compradores
                const compradoresConDirecciones = await Promise.all(
                  (compradoresExistentes || []).map(async (c) => {
                    let paisNombre = '';
                    let estadoNombre = '';
                    let municipioNombre = '';

                    if (c.personas?.direccion_fiscal_id_pais) {
                      const { data: paisData } = await supabase
                        .from('paises')
                        .select('nombre')
                        .eq('id', c.personas.direccion_fiscal_id_pais)
                        .single();
                      paisNombre = paisData?.nombre || '';
                    }

                    if (c.personas?.direccion_fiscal_id_estado) {
                      const { data: estadoData } = await supabase
                        .from('estados_mx')
                        .select('nombre')
                        .eq('id', c.personas.direccion_fiscal_id_estado)
                        .single();
                      estadoNombre = estadoData?.nombre || '';
                    }

                    if (c.personas?.direccion_fiscal_id_municipio) {
                      const { data: municipioData } = await supabase
                        .from('municipios_mx')
                        .select('nombre')
                        .eq('id', c.personas.direccion_fiscal_id_municipio)
                        .single();
                      municipioNombre = municipioData?.nombre || '';
                    }

                    return {
                      id_persona: c.id_persona,
                      nombre_completo: c.personas?.nombre_legal?.trim() || '',
                      rfc: c.personas?.rfc?.trim() || '',
                      regimen: c.personas?.regimen?.trim() || '',
                      uso_cfdi: c.personas?.uso_cfdi?.trim() || '',
                      email: c.personas?.email?.trim() || '',
                      telefono: c.personas?.telefono?.trim() || '',
                      porcentaje_propiedad: c.porcentaje_copropiedad,
                      direccion_calle: c.personas?.direccion_calle?.trim() || '',
                      direccion_num_ext: c.personas?.direccion_num_ext?.trim() || '',
                      direccion_num_int: c.personas?.direccion_num_int?.trim() || '',
                      direccion_fiscal: {
                        calle: c.personas?.direccion_fiscal_calle?.trim() || '',
                        numero_exterior: c.personas?.direccion_fiscal_num_ext?.trim() || '',
                        numero_interior: c.personas?.direccion_fiscal_num_int?.trim() || '',
                        colonia: c.personas?.direccion_fiscal_colonia?.trim() || '',
                        codigo_postal: c.personas?.direccion_fiscal_codigo_postal?.trim() || '',
                        municipio: municipioNombre.trim(),
                        estado: estadoNombre.trim(),
                        pais: paisNombre.trim()
                      }
                    };
                  })
                );

                // Obtener dirección del proyecto
                let direccionProyecto = '';
                if (propiedadDetalle?.id_edificio_modelo) {
                  const { data: edificioModelo } = await supabase
                    .from('edificios_modelos')
                    .select(`
                      edificios!edificios_modelos_id_edificio_fkey(
                        proyectos!edificios_id_proyecto_fkey(direccion)
                      )
                    `)
                    .eq('id', propiedadDetalle.id_edificio_modelo)
                    .single();
                  
                  direccionProyecto = (edificioModelo as any)?.edificios?.proyectos?.direccion || '';
                }
                
                // Recopilar todos los datos necesarios
                const payload = {
                  api_key: apiKeyDraft,
                  environment: ENVIRONMENT,
                  tipo_factura: "propiedad",
                  id_propiedad: propiedadDetalle?.id,
                  id_cuenta_cobranza: cuentaDetalle?.id,
                  propiedad: propiedadDetalle ? {
                    numero_propiedad: propiedadDetalle.numero_propiedad,
                    metraje_escriturable: (propiedadDetalle.m2_interiores || 0) + (propiedadDetalle.m2_exteriores || 0),
                    direccion: direccionProyecto,
                    precio_final: cuentaDetalle?.precio_final,
                    piso: propiedadDetalle.numero_piso
                  } : null,
                  estacionamientos: estacionamientosDetalle?.map(est => ({
                    nombre: est.nombre,
                    m2: est.m2,
                    ubicacion: est.ubicacion,
                    es_incluido: est.es_incluido,
                    tipo_estacionamiento: est.tipos_estacionamiento?.nombre || ''
                  })) || [],
                  bodegas: bodegasDetalle?.map(bod => ({
                    nombre: bod.nombre,
                    m2: bod.m2,
                    ubicacion: bod.ubicacion,
                    es_incluido: bod.es_incluido
                  })) || [],
                  escrituracion: {
                    clave_catastral: claveCatastral,
                    libro,
                    hoja,
                    fecha_escritura: fechaEscritura ? format(fechaEscritura, 'yyyy-MM-dd') : null,
                    numero_unidad_privativa: numeroUnidadPrivativa,
                    numero_escritura: numeroEscrituraEditado,
                    notario: (() => {
                      const notario = notarios?.find(n => n.id.toString() === selectedNotario);
                      return notario ? {
                        nombre: notario.nombre?.trim() || '',
                        notaria: notario.notaria?.trim() || '',
                        direccion: notario.direccion?.trim() || '',
                        email: notario.email?.trim() || '',
                        telefono: notario.telefono?.trim() || ''
                      } : null;
                    })()
                  },
                  compradores: compradoresConDirecciones
                };
                
                // Llamar al endpoint
                const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/generaFactura`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                  const errorData = await response.json().catch(() => null);
                  const errorMessage = errorData?.message || errorData?.error || `Error ${response.status}: ${response.statusText}`;
                  throw new Error(errorMessage);
                }
                
                const result = await response.json();
                console.log('✅ Factura generada exitosamente:', result);
                toast.success('Factura generada exitosamente');
              } catch (error) {
                console.error('❌ Error generando factura:', error);
                
                let errorTitle = 'Error al generar la factura';
                let errorDescription = '';
                
                if (error instanceof Error) {
                  if (error.message.includes('404')) {
                    errorTitle = 'Servicio no disponible';
                    errorDescription = 'El servicio de facturación no está disponible (404)';
                  } else if (error.message.includes('500')) {
                    errorTitle = 'Error del servidor';
                    errorDescription = 'Error interno del servidor de facturación (500)';
                  } else if (error.message.includes('timeout') || error.message.includes('network')) {
                    errorTitle = 'Error de conexión';
                    errorDescription = 'No se pudo conectar con el servicio de facturación';
                  } else if (error.message !== 'Error al generar factura') {
                    // Mostrar el mensaje completo del webhook
                    errorTitle = 'Error de validación';
                    errorDescription = error.message;
                  }
                }
                
                toast.error(errorTitle, {
                  description: errorDescription,
                  duration: 8000,
                });
                
                // NO cerrar el dialog para permitir reintento
                return;
              }
            }
          }}
          compradoresData={compradoresExistentes?.map(c => c.personas).filter(Boolean) || []}
          escrituraData={{
            numero_escritura: pendingNumeroEscritura,
            clave_catastral: claveCatastral,
            libro: libro,
            hoja: hoja,
            fecha_escritura: fechaEscritura || null,
            numero_unidad_privativa: numeroUnidadPrivativa,
          }}
          shouldGenerateInvoice={shouldGenerateInvoice}
          isCuentaFullyPaid={isCuentaFullyPaid}
          onGoToCompradores={() => setActiveTab('compradores')}
        />

        {showPersonForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-background rounded-lg shadow-lg max-w-4xl max-h-[90vh] overflow-y-auto">
              <PersonForm
                onCancel={() => setShowPersonForm(false)}
                onSubmit={(persona) => {
                  console.log('PersonForm onSubmit called with persona:', persona);
                  
                  if (!persona.id || typeof persona.id !== 'number') {
                    toast.error("Error: No se pudo obtener el ID de la persona creada");
                    return;
                  }
                  
                   // Close the person form first
                   setShowPersonForm(false);
                   console.log('PersonForm closed, about to add buyer and set tab');
                   // Add the buyer and ensure we stay in compradores tab
                   addCompradorMutation.mutate({ personaId: persona.id });
                   console.log('Mutation called, setting tab to compradores');
                   // Force tab to compradores immediately and with delay
                   setActiveTab('compradores');
                   setTimeout(() => {
                     console.log('Timeout: setting tab to compradores again');
                     setActiveTab('compradores');
                   }, 100);
                }}
                initialData={{ tipo_persona: 'pf' }}
                entityType="comprador"
                restrictToBasicTab={true}
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar a <strong>"{buyerToDelete?.name}"</strong> de la lista de compradores?
                {buyerToDelete?.conyugeId && buyerToDelete?.conyugeName && (
                  <>
                    <br /><br />
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ También se eliminará al cónyuge <strong>"{buyerToDelete.conyugeName}"</strong>.
                    </span>
                  </>
                )}
                <br /><br />
                Los porcentajes de copropiedad se redistribuirán automáticamente entre los compradores restantes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteBuyer}
                disabled={deleteBuyerMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteBuyerMutation.isPending ? "Eliminando..." : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Acuerdo Confirmation Dialog */}
        <AlertDialog open={deleteAcuerdoDialogOpen} onOpenChange={setDeleteAcuerdoDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar eliminación de pago</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar el pago de <strong>"{acuerdoToDelete?.concepto}"</strong>?
                <br /><br />
                Esta acción no se puede deshacer. El monto de este pago (${acuerdoToDelete?.monto?.toLocaleString('es-MX')}) se agregará automáticamente al último pago.
                <br /><br />
                Las fechas de los pagos siguientes se recalcularán automáticamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteAcuerdo}
                disabled={deleteAcuerdoMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteAcuerdoMutation.isPending ? "Eliminando..." : "Eliminar pago"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Precio Final Confirmation Dialog */}
        <AlertDialog open={showPrecioFinalConfirmDialog} onOpenChange={setShowPrecioFinalConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar actualización del precio final</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    {pendingPrecioFinalChange?.difference && pendingPrecioFinalChange.difference > 0 
                      ? `Estás aumentando el precio final en ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(pendingPrecioFinalChange.difference)}.`
                      : `Estás disminuyendo el precio final en ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Math.abs(pendingPrecioFinalChange?.difference || 0))}.`
                    }
                  </p>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">Se actualizará el pago "{pendingPrecioFinalChange?.lastAcuerdoConcepto}":</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Monto actual: {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(pendingPrecioFinalChange?.lastAcuerdoMonto || 0)}
                    </p>
                    <p className="text-sm font-semibold mt-1">
                      Nuevo monto: {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((pendingPrecioFinalChange?.lastAcuerdoMonto || 0) + (pendingPrecioFinalChange?.difference || 0))}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ¿Deseas continuar con esta actualización?
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowPrecioFinalConfirmDialog(false);
                setPendingPrecioFinalChange(null);
              }}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (pendingPrecioFinalChange) {
                    updatePrecioFinalMutation.mutate({
                      newPrecio: pendingPrecioFinalChange.newPrecio,
                      lastAcuerdoId: pendingPrecioFinalChange.lastAcuerdoId,
                      difference: pendingPrecioFinalChange.difference
                    });
                  }
                }}
                disabled={updatePrecioFinalMutation.isPending}
              >
                {updatePrecioFinalMutation.isPending ? "Actualizando..." : "Confirmar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog para editar comprador */}
        <Dialog open={isEditBuyerDialogOpen} onOpenChange={setIsEditBuyerDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Comprador</DialogTitle>
            </DialogHeader>
            <PersonForm
              initialData={{
                ...editingBuyer,
                representativeId: editingBuyer?.id_entidad_relacionada_rep_leg
              }}
              onSubmit={(data) => updateBuyerMutation.mutate(data)}
              isLoading={updateBuyerMutation.isPending}
              onCancel={() => {
                setIsEditBuyerDialogOpen(false);
                setEditingBuyer(null);
              }}
              entityType="comprador"
              canEditDocStatus={canUpdateCuenta || isSuperAdmin}
            />
          </DialogContent>
        </Dialog>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCloseModal}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}