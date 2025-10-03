import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Edit, Trash2, Upload, Plus, Eye, Download, Car, Warehouse, CreditCard, Loader2, DollarSign, Calendar, Home, FileText, ArrowRightLeft, Zap, TrendingUp, TrendingDown, Equal, Check, X, ShoppingCart } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";
import { NewPropertyDialog } from "@/components/admin/NewPropertyDialog";
import { EditPropertyDialog } from "@/components/admin/EditPropertyDialog";
import { BulkUploadPropertiesDialog } from "@/components/admin/BulkUploadPropertiesDialog";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { NewProductOfferDialog } from "@/components/admin/NewProductOfferDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateOfferPDF } from "@/services/htmlToPdfService";
import { EstacionamientosDetailDialog } from "@/components/admin/EstacionamientosDetailDialog";
import { BodegasDetailDialog } from "@/components/admin/BodegasDetailDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
  precio_lista: number;
  monto_apartado: number | null;
  monto_apartado_pagando: number | null;
  clabe_stp_tmp_apartado: string | null;
  clabe_stp: string | null; // Nueva propiedad para CLABE de cuentas_cobranza
  cuenta_cobranza_id: number | null; // Nueva propiedad para ID de cuenta de cobranza
  precio_final: number | null; // Nueva propiedad para precio final de cuenta de cobranza
  total_pagado: number; // Nueva propiedad para total pagado
  restante: number; // Nueva propiedad para monto restante
  activo: boolean;
  es_aprobado: boolean;
  // Relaciones
  propietario: string;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  vista: string;
  disponibilidad: string;
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
    apartado: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
    enganche: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
    mensualidades: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
    entrega: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
    especial: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
    cesion_derechos: { status: 'no_pagado' | 'en_proceso' | 'pagado'; monto: number; monto_pagado: number; fecha: string | null };
  } | null;
}

const Propiedades = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activos");
  
  // Initialize search term from URL parameters
  useEffect(() => {
    const urlSearchTerm = searchParams.get('search');
    if (urlSearchTerm) {
      setSearchTerm(urlSearchTerm);
    }
  }, [searchParams]);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [selectedPropertyOffers, setSelectedPropertyOffers] = useState<any[] | null>(null);
  const [selectedPropertyProductOffers, setSelectedPropertyProductOffers] = useState<any[] | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [selectedPropertyForOffers, setSelectedPropertyForOffers] = useState<Property | null>(null);
  const [selectedPropertyForProductOffers, setSelectedPropertyForProductOffers] = useState<Property | null>(null);
  const [offersDialogOpen, setOffersDialogOpen] = useState(false);
  const [productOffersDialogOpen, setProductOffersDialogOpen] = useState(false);
  const [selectedProperties, setSelectedProperties] = useState<number[]>([]);
  const [availableSchemes, setAvailableSchemes] = useState<any[]>([]);
  const [downloadingOfferId, setDownloadingOfferId] = useState<number | null>(null);
  const [confirmGenerateAccountOpen, setConfirmGenerateAccountOpen] = useState(false);
  const [selectedOfferForAccount, setSelectedOfferForAccount] = useState<any | null>(null);
  
  // Estados para modales de detalle
  const [estacionamientosDialogOpen, setEstacionamientosDialogOpen] = useState(false);
  const [bodegasDialogOpen, setBodegasDialogOpen] = useState(false);
  const [selectedPropertyEstacionamientos, setSelectedPropertyEstacionamientos] = useState<any[]>([]);
  const [selectedPropertyBodegas, setSelectedPropertyBodegas] = useState<any[]>([]);
  const [selectedPropertyForDetail, setSelectedPropertyForDetail] = useState<Property | null>(null);
  
  // Filtros de texto
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [recamarasFilter, setRecamarasFilter] = useState("");
  const [banosFilter, setBanosFilter] = useState("");
  const [disponibilidadFilter, setDisponibilidadFilter] = useState<string[]>([]);
  const [bodegasFilter, setBodegasFilter] = useState("");
  const [estacionamientosFilter, setEstacionamientosFilter] = useState("");
  const [cuentaCobranzaFilter, setCuentaCobranzaFilter] = useState("");
  
  // Paginación
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDraft, setCurrentPageDraft] = useState(1);
  const [currentPageInactive, setCurrentPageInactive] = useState(1);
  const itemsPerPage = 25;
  
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
        creatorEmail: offer.agent_name?.includes('@') ? offer.agent_name : "jorge.mendoza@sozu.com"
      });

      toast({
        title: "PDF generado",
        description: "El PDF se ha descargado exitosamente.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error al generar PDF",
        description: "Hubo un problema al generar el PDF. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setDownloadingOfferId(null);
    }
  };

  const { data: properties, isLoading, error: queryError } = useQuery({
    queryKey: ['properties-detailed-with-payment-dates'],
    queryFn: async () => {
      try {
        console.log('Starting properties query...');
        // First, get the base property data
        const { data, error } = await supabase
          .from('propiedades')
          .select(`
            id,
            numero_propiedad,
            numero_piso,
            m2_reales,
            precio_lista,
            monto_apartado,
            monto_apartado_pagando,
            clabe_stp_tmp_apartado,
            activo,
            es_aprobado,
            edificios_modelos!inner(
              edificios!edificios_modelos_id_edificio_fkey!inner(
                nombre,
                proyectos!edificios_id_proyecto_fkey!inner(id, nombre)
              ),
              modelos!edificios_modelos_id_modelo_fkey!inner(
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
            estatus_disponibilidad!inner(nombre),
            ofertas!ofertas_id_propiedad_fkey(
              id,
              id_producto,
              activo,
              cuentas_cobranza!fk_cuentas_cobranza_oferta(clabe_stp, id)
            )
          `)
          .order('id', { ascending: false });
        
        if (error) {
          console.error('Error fetching properties:', error);
          throw error;
        }
        
        console.log('Properties fetched:', data?.length);

      // Get parking counts
      const { data: estacionamientosData, error: estacionamientosError } = await supabase
        .from('estacionamientos')
        .select('id_propiedad')
        .eq('activo', true);

      if (estacionamientosError) {
        console.error('Error fetching estacionamientos:', estacionamientosError);
      }

      // Get storage counts  
      const { data: bodegasData, error: bodegasError } = await supabase
        .from('bodegas')
        .select('id_propiedad')
        .eq('activo', true);

      if (bodegasError) {
        console.error('Error fetching bodegas:', bodegasError);
      }

      // Create count maps
      const estacionamientosCounts = (estacionamientosData || []).reduce((acc: any, item: any) => {
        acc[item.id_propiedad] = (acc[item.id_propiedad] || 0) + 1;
        return acc;
      }, {});

      const bodegasCounts = (bodegasData || []).reduce((acc: any, item: any) => {
        acc[item.id_propiedad] = (acc[item.id_propiedad] || 0) + 1;
        return acc;
      }, {});
      
      // Get active cuentas_cobranza separately
      const { data: activeCuentas } = await supabase
        .from('cuentas_cobranza')
        .select('id, clabe_stp, id_oferta, precio_final')
        .eq('activo', true);

      const activeCuentasMap = (activeCuentas || []).reduce((acc: any, cuenta: any) => {
        acc[cuenta.id_oferta] = cuenta;
        return acc;
      }, {});

      // Get payment agreements and applications for each cuenta_cobranza
      const cuentaIds = (activeCuentas || []).map(c => c.id);
      
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
      (activeCuentas || []).forEach(cuenta => {
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
        const { data: acuerdosData } = await supabase
          .from('acuerdos_pago')
          .select(`
            id,
            monto,
            pago_completado,
            id_concepto,
            id_cuenta_cobranza,
            fecha_pago
          `)
          .in('id_cuenta_cobranza', cuentaIds)
          .eq('activo', true);

        // Get all aplicaciones_pago for these acuerdos WITH payment method info AND payment dates
        const acuerdoIds = (acuerdosData || []).map(a => a.id);
        
        let aplicacionesMap: any = {};
        let pagosPorMetodo: any = {};
        if (acuerdoIds.length > 0) {
          const { data: aplicacionesData } = await supabase
            .from('aplicaciones_pago')
            .select(`
              id_acuerdo_pago,
              monto,
              pagos!fk_aplicaciones_pago_pago!inner(id_metodos_pago, fecha_pago)
            `)
            .in('id_acuerdo_pago', acuerdoIds)
            .eq('activo', true);

          console.log('📅 Aplicaciones data sample:', aplicacionesData?.slice(0, 3));

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
            console.warn(`⚠️ Cuenta ${acuerdo.id_cuenta_cobranza} no encontrada en paymentStatusMap`);
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
            console.log(`🔍 Acuerdo ${acuerdo.id}, concepto ${conceptoKey}: fecha_pago =`, fechaPago);
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
            console.warn(`⚠️ Cuenta ${cuentaId} no encontrada al determinar estado final`);
            return;
          }
          
          const info = paymentStatusMap[cuentaId][conceptoKey];
          const todosCompletados = info.completados === info.total && info.total > 0;
          const algunoPagado = acuerdos.some((a: any) => a.montoPagado > 0);
          
          console.log(`📊 Cuenta ${cuentaId} - ${conceptoKey}: ${info.completados}/${info.total} completados, monto: ${info.monto_pagado}/${info.monto}`);
          
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
      const transformedData = data?.map((property: any) => {
        // Get clabe_stp from ACTIVE cuentas_cobranza if available
        const cuentaCobranzaData = property.ofertas?.map((oferta: any) => 
          activeCuentasMap[oferta.id]
        ).find((cuenta: any) => cuenta !== undefined);
        
        let paymentStatus = cuentaCobranzaData?.id && paymentStatusMap[cuentaCobranzaData.id] 
          ? paymentStatusMap[cuentaCobranzaData.id] 
          : null;
        
        // Add apartado amount to enganche if it exists
        if (paymentStatus && paymentStatus.enganche && property.monto_apartado_pagando && property.monto_apartado_pagando > 0) {
          paymentStatus.enganche.monto_pagado += Number(property.monto_apartado_pagando) || 0;
          
          // Recalculate enganche status considering apartado
          if (paymentStatus.enganche.monto_pagado >= paymentStatus.enganche.monto && paymentStatus.enganche.monto > 0) {
            paymentStatus.enganche.status = 'pagado';
          } else if (paymentStatus.enganche.monto_pagado > 0) {
            paymentStatus.enganche.status = 'en_proceso';
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
        const restante = precio_final - total_pagado;
        
        return {
          id: property.id,
          numero_propiedad: property.numero_propiedad,
          numero_piso: property.numero_piso,
          m2_reales: property.m2_reales,
          precio_lista: property.precio_lista,
          monto_apartado: property.monto_apartado,
          monto_apartado_pagando: property.monto_apartado_pagando,
          clabe_stp_tmp_apartado: property.clabe_stp_tmp_apartado,
          clabe_stp: cuentaCobranzaData?.clabe_stp || property.clabe_stp_tmp_apartado,
          cuenta_cobranza_id: cuentaCobranzaData?.id || null,
          precio_final: precio_final > 0 ? precio_final : null,
          total_pagado,
          restante,
          activo: property.activo,
          es_aprobado: property.es_aprobado,
          propietario: property.entidades_relacionadas?.personas?.nombre_legal || 'Sin propietario',
          proyecto: property.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto',
          proyecto_id: property.edificios_modelos?.edificios?.proyectos?.id || 0,
          edificio: property.edificios_modelos?.edificios?.nombre || 'Sin edificio',
          modelo: property.edificios_modelos?.modelos?.nombre || 'Sin modelo',
          vista: property.vistas?.nombre || 'Sin vista',
          disponibilidad: property.estatus_disponibilidad?.nombre || 'Sin estatus',
          tieneOfertas: property.ofertas && property.ofertas.some((o: any) => o.activo && o.id_producto === null),
          tieneOfertasProductos: property.ofertas && property.ofertas.some((o: any) => o.activo && o.id_producto !== null),
          estacionamientos_count: estacionamientosCounts[property.id] || 0,
          bodegas_count: bodegasCounts[property.id] || 0,
          payment_status: paymentStatus,
          configuracion_modelo: {
            numero_recamaras: property.edificios_modelos?.modelos?.numero_recamaras || 0,
            numero_completo_banos: property.edificios_modelos?.modelos?.numero_completo_banos || 0,
            numero_medio_bano: property.edificios_modelos?.modelos?.numero_medio_bano || 0,
          }
        };
      }) || [];
      
        console.log('Transforming data...');
        return transformedData;
      } catch (error) {
        console.error('Error in properties query:', error);
        throw error;
      }
    },
  });

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
        productos_servicios!ofertas_id_producto_fkey(nombre)
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
      let enrichedOffer = {
        ...offer,
        product_name: offer.productos_servicios?.nombre || 'N/A',
      };
      
      // Get cuenta_cobranza if available
      const { data: cuentaData } = await supabase
        .from('cuentas_cobranza')
        .select('id, activo, clabe_stp, precio_final')
        .eq('id_oferta', offer.id)
        .eq('activo', true)
        .single();
      
      if (cuentaData) {
        enrichedOffer.cuenta_cobranza_id = cuentaData.id;
        enrichedOffer.cuenta_activo = cuentaData.activo;
        enrichedOffer.cuenta_clabe_stp = cuentaData.clabe_stp;
        enrichedOffer.cuenta_precio_final = cuentaData.precio_final;
      }
      
      // Get lead info
      if (offer.id_persona_lead) {
        const { data: personaData } = await supabase
          .from('personas')
          .select('nombre_legal, email, telefono, rfc')
          .eq('id', offer.id_persona_lead)
          .single();
        
        if (personaData) {
          enrichedOffer.lead_name = personaData.nombre_legal;
          enrichedOffer.lead_email = personaData.email;
          enrichedOffer.lead_telefono = personaData.telefono;
          enrichedOffer.lead_rfc = personaData.rfc;
        }
      }
      
      // Get payment scheme info
      if (offer.id_esquema_pago_seleccionado) {
        const { data: schemeData } = await supabase
          .from('esquemas_pago')
          .select('nombre, es_manual')
          .eq('id', offer.id_esquema_pago_seleccionado)
          .single();
        
        if (schemeData) {
          enrichedOffer.esquema_nombre = schemeData.nombre;
          enrichedOffer.esquema_es_manual = schemeData.es_manual;
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
        es_incluido,
        tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre)
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching estacionamientos:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      nombre: item.nombre,
      tipo_nombre: item.tipos_estacionamiento?.nombre || 'N/A',
      m2: item.m2,
      ubicacion: item.ubicacion,
      es_incluido: item.es_incluido
    }));
  };

  // Función para obtener bodegas de una propiedad
  const fetchPropertyBodegas = async (propertyId: number) => {
    const { data, error } = await supabase
      .from('bodegas')
      .select('id, nombre, m2, ubicacion, es_incluido')
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching bodegas:', error);
      return [];
    }

    return data || [];
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
              rfc_curp_ordenante: currentOffer?.lead_rfc || ''
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
      
      const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siguiente_accion: 'genera_cuenta_cobranza_por_oferta',
          id_oferta: offerId,
          id_propiedad: propertyId,
          id_persona_lead: currentOffer?.id_persona_lead,
          monto_apartado_pagando: selectedPropertyForOffers?.monto_apartado_pagando || selectedPropertyForProductOffers?.monto_apartado_pagando || 0,
          clabe_stp: selectedPropertyForOffers?.clabe_stp_tmp_apartado || selectedPropertyForProductOffers?.clabe_stp_tmp_apartado || '',
          rfc_curp_ordenante: currentOffer?.lead_rfc || ''
        }),
      });

      if (!response.ok) {
        throw new Error('Error al generar cuenta de cobranza');
      }

      toast({
        title: "Éxito",
        description: "Cuenta de cobranza generada correctamente",
      });

      // Refresh the offers data
      if (selectedPropertyId) {
        const updatedOffers = await fetchPropertyOffers(selectedPropertyId);
        setSelectedPropertyOffers(updatedOffers);
        const updatedProductOffers = await fetchPropertyProductOffers(selectedPropertyId);
        setSelectedPropertyProductOffers(updatedProductOffers);
      }
      
      // Close confirmation dialog
      setConfirmGenerateAccountOpen(false);
      setSelectedOfferForAccount(null);
    } catch (error) {
      console.error('Error generating collection account:', error);
      toast({
        title: "Error",
        description: "No se pudo generar la cuenta de cobranza",
        variant: "destructive",
      });
    }
  };

  // Filtrar propiedades por pestaña
  const getPropertiesByTab = (properties: Property[], tab: string) => {
    switch (tab) {
      case "activos":
        return properties.filter(p => p.activo && p.es_aprobado);
      case "draft":
        return properties.filter(p => p.activo && !p.es_aprobado);
      case "eliminados":
        return properties.filter(p => !p.activo && !p.es_aprobado);
      default:
        return [];
    }
  };

  // Filtrar propiedades
  const filteredProperties = properties?.filter(property => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === "" || 
      property.numero_propiedad.toString().includes(searchTerm) ||
      property.numero_propiedad.toLowerCase().includes(searchLower) ||
      property.propietario.toLowerCase().includes(searchLower) ||
      property.proyecto.toLowerCase().includes(searchLower) ||
      property.edificio.toLowerCase().includes(searchLower) ||
      property.modelo.toLowerCase().includes(searchLower) ||
      (property.clabe_stp && property.clabe_stp.toLowerCase().includes(searchLower)) ||
      (property.clabe_stp_tmp_apartado && property.clabe_stp_tmp_apartado.toLowerCase().includes(searchLower));
    
    const matchesProyecto = proyectoFilter === "" || property.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
    const matchesModelo = modeloFilter === "" || property.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
    
    const matchesRecamaras = recamarasFilter === "" || property.configuracion_modelo.numero_recamaras.toString().includes(recamarasFilter);
    const matchesBanos = banosFilter === "" || property.configuracion_modelo.numero_completo_banos.toString().includes(banosFilter);
    
    const matchesDisponibilidad = disponibilidadFilter.length === 0 || disponibilidadFilter.some(filter => property.disponibilidad.toLowerCase().includes(filter.toLowerCase()));
    
    const matchesBodegas = bodegasFilter === "" || 
      (bodegasFilter === "con_bodegas" && property.bodegas_count > 0) ||
      (bodegasFilter === "sin_bodegas" && property.bodegas_count === 0);
    
    const matchesEstacionamientos = estacionamientosFilter === "" || 
      (estacionamientosFilter === "con_estacionamientos" && property.estacionamientos_count > 0) ||
      (estacionamientosFilter === "sin_estacionamientos" && property.estacionamientos_count === 0);
    
    const matchesCuentaCobranza = cuentaCobranzaFilter === "" ||
      (cuentaCobranzaFilter === "si" && property.cuenta_cobranza_id !== null) ||
      (cuentaCobranzaFilter === "no" && property.cuenta_cobranza_id === null);
    
    return matchesSearch && matchesProyecto && matchesModelo && matchesRecamaras && matchesBanos && matchesDisponibilidad && matchesBodegas && matchesEstacionamientos && matchesCuentaCobranza;
  }) || [];

  // Separar propiedades por pestaña
  const activeProperties = getPropertiesByTab(filteredProperties, "activos");
  const draftProperties = getPropertiesByTab(filteredProperties, "draft");
  const inactiveProperties = getPropertiesByTab(filteredProperties, "eliminados");

  // Paginación para propiedades activas
  const totalActivePage = Math.ceil(activeProperties.length / itemsPerPage);
  const startIndexActive = (currentPageActive - 1) * itemsPerPage;
  const endIndexActive = startIndexActive + itemsPerPage;
  const paginatedActiveProperties = activeProperties.slice(startIndexActive, endIndexActive);

  // Paginación para propiedades draft
  const totalDraftPage = Math.ceil(draftProperties.length / itemsPerPage);
  const startIndexDraft = (currentPageDraft - 1) * itemsPerPage;
  const endIndexDraft = startIndexDraft + itemsPerPage;
  const paginatedDraftProperties = draftProperties.slice(startIndexDraft, endIndexDraft);

  // Paginación para propiedades inactivas
  const totalInactivePage = Math.ceil(inactiveProperties.length / itemsPerPage);
  const startIndexInactive = (currentPageInactive - 1) * itemsPerPage;
  const endIndexInactive = startIndexInactive + itemsPerPage;
  const paginatedInactiveProperties = inactiveProperties.slice(startIndexInactive, endIndexInactive);

  const handleDelete = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false, es_aprobado: false })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad eliminada",
        description: "La propiedad se ha marcado como inactiva correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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

      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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

      toast({
        title: "Propiedad aprobada",
        description: "La propiedad se ha aprobado correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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

      toast({
        title: "Propiedades aprobadas",
        description: `${selectedProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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

      toast({
        title: "Propiedades eliminadas",
        description: `${selectedProperties.length} propiedades han sido eliminadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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
      const propertyIds = draftProperties.map(p => p.id);
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .in('id', propertyIds);

      if (error) throw error;

      toast({
        title: "Propiedades aprobadas",
        description: `${draftProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
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

  const formatPrecioPorM2 = (precioLista: number, m2Reales: number) => {
    if (m2Reales === 0) return 'N/A';
    return formatCurrency(precioLista / m2Reales);
  };

  const handlePropertyAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
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
              <TableHead>Proyecto</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead>Edificio</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>No. Departamento</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead>Vista</TableHead>
              <TableHead>M2</TableHead>
              <TableHead>Configuración</TableHead>
              <TableHead>Precio de Lista</TableHead>
              <TableHead>Precio por M2</TableHead>
              <TableHead>Estacionamientos</TableHead>
              <TableHead>Bodegas</TableHead>
              <TableHead>Ofertas Comerciales</TableHead>
              <TableHead>Ofertas de Productos</TableHead>
              <TableHead>Disponibilidad</TableHead>
              <TableHead>Cuenta de cobranza</TableHead>
              <TableHead>Cuenta Clabe</TableHead>
              <TableHead>Precio Final</TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead>Restante</TableHead>
              <TableHead>Estado de Pagos</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {propertiesToRender.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tabType === "draft" ? 21 : 20} className="text-center py-6">
                  {searchTerm || proyectoFilter || modeloFilter || recamarasFilter || banosFilter || disponibilidadFilter.length > 0 || bodegasFilter || estacionamientosFilter || cuentaCobranzaFilter
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
                <TableRow key={property.id} className={tabType === "eliminados" ? "opacity-60" : ""}>
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
                  <TableCell className="font-medium">{property.proyecto}</TableCell>
                  <TableCell>{property.propietario}</TableCell>
                  <TableCell>{property.edificio}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{property.modelo}</Badge>
                  </TableCell>
                  <TableCell>{property.numero_propiedad}</TableCell>
                  <TableCell>{property.numero_piso}</TableCell>
                  <TableCell>{property.vista}</TableCell>
                  <TableCell>{property.m2_reales} m²</TableCell>
                  <TableCell className="text-sm">{formatConfiguracion(property.configuracion_modelo)}</TableCell>
                   <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                   <TableCell>{formatPrecioPorM2(property.precio_lista, property.m2_reales)}</TableCell>
                   <TableCell>
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
                         {property.estacionamientos_count}
                         {property.estacionamientos_count > 0 && <Car className="ml-1 h-3 w-3" />}
                       </Badge>
                     </Button>
                   </TableCell>
                   <TableCell>
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
                         {property.bodegas_count}
                         {property.bodegas_count > 0 && <Warehouse className="ml-1 h-3 w-3" />}
                       </Badge>
                     </Button>
                   </TableCell>
                   <TableCell>
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
                   <TableCell>
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
                   </TableCell>
                    <TableCell>
                      <span className={getDisponibilidadBadgeClass(property.disponibilidad)}>{property.disponibilidad}</span>
                    </TableCell>
                    <TableCell>
                      {property.cuenta_cobranza_id ? (
                        <Button
                          variant="outline"  
                          size="sm"
                          onClick={() => navigate(`/admin/cuentas-cobranza/${property.cuenta_cobranza_id}/detalle`)}
                          className="h-6 px-2 text-xs font-semibold cursor-pointer hover:bg-accent"
                        >
                          CC-{String(property.cuenta_cobranza_id).padStart(6, '0')}
                        </Button>
                      ) : (
                        <Badge variant="outline">N/A</Badge>
                      )}
                    </TableCell>
                   <TableCell className="font-mono text-sm">{property.clabe_stp || 'Sin CLABE'}</TableCell>
                   <TableCell className="text-right font-semibold">
                     {property.precio_final ? (
                       <div className="flex items-center justify-end gap-2">
                         <span>{formatCurrency(property.precio_final)}</span>
                         {property.precio_final > property.precio_lista ? (
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
                         ) : property.precio_final < property.precio_lista ? (
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
                       </div>
                     ) : '-'}
                   </TableCell>
                   <TableCell className="text-right">
                     {property.total_pagado > 0 ? formatCurrency(property.total_pagado) : '-'}
                   </TableCell>
                   <TableCell className="text-right">
                     {property.precio_final && property.restante !== 0 ? (
                       <span className={property.restante > 0 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                         {formatCurrency(property.restante)}
                       </span>
                     ) : '-'}
                   </TableCell>
                    <TableCell>
                       {property.payment_status ? (
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
                                         : (paymentInfo?.monto || 0) > 0
                                         ? 'bg-[hsl(var(--pago-no-pagado))]'
                                         : 'border-2 border-muted'
                                     }`}>
                                       <IconComponent className={`h-3 w-3 ${
                                         (paymentInfo?.monto || 0) > 0 ? 'text-white' : 'text-muted-foreground'
                                       }`} />
                                     </div>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <div className="text-sm">
                                       <p className="font-semibold">{type.label}</p>
                                       {(paymentInfo?.monto || 0) > 0 ? (
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
                   <TableCell>
                    {tabType === "eliminados" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(property.id)}
                        className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                      >
                        Restaurar
                      </Button>
                    ) : tabType === "draft" ? (
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApprove(property.id)}
                          className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                        >
                          Aprobar
                        </Button>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              disabled={property.tieneOfertas}
                              title={property.tieneOfertas ? "No se puede eliminar una propiedad con ofertas asociadas" : "Eliminar propiedad"}
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
                      </div>
                     ) : (
                       <div className="flex space-x-2">
                          {property.disponibilidad === "Disponible" && (
                            <NewOfferDialog 
                              propertyId={property.id} 
                              propertyNumber={property.numero_propiedad} 
                            />
                          )}
                          {(property.disponibilidad === "Apartado" || 
                            property.disponibilidad === "Vendido" || 
                            property.disponibilidad === "En escrituración" ||
                            property.disponibilidad === "Entregado") && (
                            <NewProductOfferDialog 
                              propertyId={property.id}
                              property={property}
                            />
                          )}
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
                         <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              disabled={property.tieneOfertas}
                              title={property.tieneOfertas ? "No se puede eliminar una propiedad con ofertas asociadas" : "Eliminar propiedad"}
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
                      </div>
                    )}
                  </TableCell>
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
          <Button
            onClick={() => setBulkUploadOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Carga Masiva
          </Button>
          <NewPropertyDialog onPropertyAdded={handlePropertyAdded} />
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
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            
            {/* Filtros específicos */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">Proyecto</label>
                <Input
                  placeholder="Filtrar por proyecto..."
                  value={proyectoFilter}
                  onChange={(e) => setProyectoFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Modelo</label>
                <Input
                  placeholder="Filtrar por modelo..."
                  value={modeloFilter}
                  onChange={(e) => setModeloFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Recámaras</label>
                <Input
                  placeholder="Ej: 2, 3..."
                  value={recamarasFilter}
                  onChange={(e) => setRecamarasFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Baños</label>
                <Input
                  placeholder="Ej: 1, 2..."
                  value={banosFilter}
                  onChange={(e) => setBanosFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Disponibilidad</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {disponibilidadFilter.length === 0 
                        ? "Filtrar por disponibilidad..." 
                        : `${disponibilidadFilter.length} seleccionado${disponibilidadFilter.length > 1 ? 's' : ''}`
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar disponibilidad..." />
                      <CommandEmpty>No se encontró disponibilidad.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {availabilityOptions?.map((option) => (
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
              <div>
                <label className="text-sm font-medium mb-2 block">Bodegas</label>
                <Select value={bodegasFilter} onValueChange={setBodegasFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por bodegas..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="con_bodegas">Con Bodegas</SelectItem>
                    <SelectItem value="sin_bodegas">Sin Bodegas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Estacionamientos</label>
                <Select value={estacionamientosFilter} onValueChange={setEstacionamientosFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por estacionamientos..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="con_estacionamientos">Con Estacionamientos</SelectItem>
                    <SelectItem value="sin_estacionamientos">Sin Estacionamientos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Tiene C.C.</label>
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
            </div>
            
            {/* Botón para limpiar filtros */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setProyectoFilter("");
                  setModeloFilter("");
                  setRecamarasFilter("");
                  setBanosFilter("");
                  setDisponibilidadFilter([]);
                  setBodegasFilter("");
                  setEstacionamientosFilter("");
                  setCuentaCobranzaFilter("");
                  setSelectedProperties([]);
                }}
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activos">
                Activos ({activeProperties.length})
              </TabsTrigger>
              <TabsTrigger value="draft">
                Draft ({draftProperties.length})
              </TabsTrigger>
              <TabsTrigger value="eliminados">
                Eliminados ({inactiveProperties.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="activos" className="mt-4">
              {renderPropertiesTable(paginatedActiveProperties, "activos")}
              {renderPagination(currentPageActive, totalActivePage, setCurrentPageActive)}
            </TabsContent>

            <TabsContent value="draft" className="mt-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {draftProperties.length > 0 && (
                  <Button onClick={handleApproveAllVisible} variant="default" className="bg-green-600 hover:bg-green-700">
                    Aprobar Todas las Visibles ({draftProperties.length})
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
              {renderPropertiesTable(paginatedDraftProperties, "draft")}
              {renderPagination(currentPageDraft, totalDraftPage, setCurrentPageDraft)}
            </TabsContent>

            <TabsContent value="eliminados" className="mt-4">
              {renderPropertiesTable(paginatedInactiveProperties, "eliminados")}
              {renderPagination(currentPageInactive, totalInactivePage, setCurrentPageInactive)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <BulkUploadPropertiesDialog 
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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
            m2_reales: editingProperty.m2_reales,
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
            queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });
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
                       
                       // Determine row color based on status
                       let rowClassName = "";
                       if (isAccountActive && hasPaymentScheme) {
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
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <Button
                                   variant="link"
                                   size="sm"
                                   onClick={() => {
                                     const isCreditCardEnabled = !hasAccount && !hasActiveAccountWithScheme && selectedPropertyForOffers?.disponibilidad === 'Apartado' && offer.esquema_id;
                                     if (!hasAccount && !hasActiveAccountWithScheme && offer.esquema_id && !isCreditCardEnabled) {
                                       setSelectedOfferForAccount({ ...offer, propertyId: selectedPropertyForOffers!.id, isProductOffer: false });
                                       setConfirmGenerateAccountOpen(true);
                                     }
                                   }}
                                   disabled={
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
                                 <p>Generar cuenta de cobranza manualmente</p>
                               </TooltipContent>
                             </Tooltip>
                           </TableCell>
                          <TableCell>
                            {(offer.agent_name || 'AGENTE POR DEFINIR').toUpperCase()}
                          </TableCell>
                          <TableCell>
                            {(offer.lead_name || 'N/A').toUpperCase()}
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
                                     isAccountActive && hasPaymentScheme
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
                                    CC-{String(offer.cuenta_cobranza_id).padStart(6, '0')}
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
                    <TableHead>Cuenta de Cobranza</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Check if there's any active account among product offers
                    const hasActiveAccountWithScheme = selectedPropertyProductOffers.some((offer: any) => 
                      offer.cuenta_cobranza_id && offer.cuenta_activo
                    );
                    
                    return selectedPropertyProductOffers.map((offer: any) => {
                      const hasAccount = !!offer.cuenta_cobranza_id;
                      const isAccountActive = hasAccount && offer.cuenta_activo;
                      const isAccountCancelled = hasAccount && !offer.cuenta_activo;
                      
                      return (
                         <TableRow key={offer.id}>
                          <TableCell className="font-medium">
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <Button
                                 variant="link"
                                 size="sm"
                                 onClick={() => {
                                   if (!hasAccount && !hasActiveAccountWithScheme) {
                                     setSelectedOfferForAccount({ ...offer, propertyId: selectedPropertyForProductOffers!.id, isProductOffer: true });
                                     setConfirmGenerateAccountOpen(true);
                                   }
                                 }}
                                 disabled={hasAccount || hasActiveAccountWithScheme}
                                 className="p-0 h-auto font-semibold"
                               >
                                 OP-{String(offer.id).padStart(6, '0')}
                               </Button>
                             </TooltipTrigger>
                             <TooltipContent>
                               <p>Generar cuenta de cobranza manualmente</p>
                             </TooltipContent>
                           </Tooltip>
                         </TableCell>
                        <TableCell>
                          {(offer.product_name || 'N/A').toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {(offer.lead_name || 'N/A').toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {new Date(offer.fecha_generacion).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`font-medium ${
                              offer.esquema_id
                                ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700" 
                                : "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
                            }`}
                          >
                            {offer.esquema_nombre || 'Sin esquema'}
                          </Badge>
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
                                  CC-{String(offer.cuenta_cobranza_id).padStart(6, '0')}
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
                      {selectedOfferForAccount.isProductOffer ? 'Producto/Servicio:' : 'Agente:'}
                    </div>
                    <div>
                      {selectedOfferForAccount.isProductOffer 
                        ? (selectedOfferForAccount.product_name || 'N/A').toUpperCase()
                        : (selectedOfferForAccount.agent_name || 'AGENTE POR DEFINIR').toUpperCase()
                      }
                    </div>
                    
                    <div className="font-medium text-foreground">Lead:</div>
                    <div>{(selectedOfferForAccount.lead_name || 'N/A').toUpperCase()}</div>
                    
                    <div className="font-medium text-foreground">Fecha:</div>
                    <div>{new Date(selectedOfferForAccount.fecha_generacion).toLocaleDateString()}</div>
                    
                    <div className="font-medium text-foreground">Esquema de pago:</div>
                    <div>
                      {selectedOfferForAccount.esquema_nombre || 
                       availableSchemes.find(s => s.id === selectedOfferForAccount.esquema_id)?.nombre || 
                       `ID: ${selectedOfferForAccount.esquema_id}`}
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
      </div>
    </TooltipProvider>
  );
};

export default Propiedades;