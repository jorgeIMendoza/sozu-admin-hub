import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, CreditCard, Eye, X, Edit, Plus, Download, Loader2, Filter, TrendingUp, TrendingDown, Equal, AlertCircle, DollarSign, CheckCircle, FileText, Upload, Banknote, ChevronDown, ChevronUp, Wallet } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { EstadoCuentaService } from "@/services/estadoCuentaService";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";
interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_persona?: number;
}
interface CashPayment {
  fecha_pago: string;
  monto: number;
}
interface CuentaCobranza {
  id: number;
  tipo: 'Propiedad' | 'Producto' | 'Servicio';
  producto_nombre?: string;
  clabe_stp: string | null;
  precio_final: number;
  precio_lista: number | null;
  es_comision_venta_efectivo?: boolean;
  porcentaje_comision_venta?: number;
  pagado: number;
  restante: number;
  compradores: Comprador[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  activo: boolean;
  id_oferta: number;
  motivo_cancelacion?: string | null;
  apartado_pagado: boolean;
  tiene_acuerdos: boolean;
  tiene_multas_pendientes?: boolean;
  cash_limit?: number;
  cash_paid?: number;
  cash_remaining?: number;
  cash_percentage?: number;
  cash_payments?: CashPayment[];
  id_estatus_disponibilidad?: number;
  collection_id?: number | null;
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
  
  // Estado para controlar si las estadísticas están expandidas (con persistencia en localStorage)
  const [statsExpanded, setStatsExpanded] = useState(() => {
    const saved = localStorage.getItem('pagos-stats-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // State for project summary dialog
  const [projectSummaryDialog, setProjectSummaryDialog] = useState<{
    isOpen: boolean;
    projectName: string;
    cuentaIds: number[];
    totalColocado: number;
    totalCobrado: number;
  }>({
    isOpen: false,
    projectName: "",
    cuentaIds: [],
    totalColocado: 0,
    totalCobrado: 0
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

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPageActive(1);
  }, [searchTerm, idCuentaFilter, productoFilter, compradoresFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter, selectedTipos]);
  useEffect(() => {
    setCurrentPageCancelled(1);
  }, [searchTerm, idCuentaFilter, productoFilter, compradoresFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter, selectedTipos]);

  // Helper function to normalize balance and avoid floating point precision issues
  const normalizarSaldo = (saldo: number): number => {
    // Round to 2 decimal places first to avoid precision issues
    const rounded = Math.round(saldo * 100) / 100;

    // If balance is very close to zero (less than 1 cent), treat it as exactly zero
    // This also handles -0 (negative zero) by explicitly returning positive 0
    if (Math.abs(rounded) < 0.01 || Object.is(rounded, -0)) {
      return 0; // Explicitly return positive 0
    }
    return rounded;
  };
  const {
    data: cuentasCobranza,
    isLoading
  } = useQuery({
    queryKey: ["cuentas_cobranza"],
    queryFn: async () => {
      // Get basic cuenta cobranza data with payment sums (excluding maintenance accounts)
      const selectColumns = `
          id,
          clabe_stp,
          precio_final,
          id_oferta,
          activo,
          valor_uma,
          es_comision_venta_efectivo,
          porcentaje_comision_venta,
          collection_id,
          tipos_cancelacion:id_tipo_cancelacion(nombre)
        `;

      const pageSize = 1000;
      let cuentas: any[] = [];
      let from = 0;
      let to = pageSize - 1;
      let more = true;
      let cuentasError: any = null;

      while (more) {
        const { data, error } = await supabase
          .from('cuentas_cobranza')
          .select(selectColumns)
          .is('id_cuenta_cobranza_padre', null)
          .order('id', { ascending: false })
          .range(from, to);

        if (error) {
          cuentasError = error;
          break;
        }

        if (!data || data.length === 0) {
          more = false;
          break;
        }

        cuentas = cuentas.concat(data);

        if (data.length < pageSize) {
          // Última página
          more = false;
        } else {
          from += pageSize;
          to += pageSize;
        }
      }

      if (cuentasError) {
        console.error('Error fetching cuentas:', cuentasError);
        return [];
      }

      if (!cuentas || cuentas.length === 0) return [];

      // Get all payment amounts for each account using aplicaciones_pago
      const cuentaIds = cuentas.map(c => c.id);
      console.log('Cuenta IDs:', cuentaIds);

      // Helper function to chunk arrays for batched queries (Supabase .in() has limits)
      const chunkArray = <T,>(array: T[], chunkSize: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
          chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
      };

      // First get all acuerdos for these cuentas (batched by cuenta IDs)
      let acuerdosForPagos: any[] = [];
      const cuentaIdChunks = chunkArray(cuentaIds, 500);
      for (const chunk of cuentaIdChunks) {
        const pageSize = 1000;
        let from = 0;
        let more = true;
        while (more) {
          const { data, error } = await supabase
            .from('acuerdos_pago')
            .select('id, id_cuenta_cobranza')
            .in('id_cuenta_cobranza', chunk)
            .eq('activo', true)
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) {
            more = false;
          } else {
            acuerdosForPagos = acuerdosForPagos.concat(data);
            if (data.length < pageSize) more = false;
            else from += pageSize;
          }
        }
      }
      const acuerdoIdsForPagos = acuerdosForPagos.map(a => a.id);
      console.log('Acuerdos for pagos count:', acuerdosForPagos.length);

      // Now get aplicaciones_pago for those acuerdos (batched by acuerdo IDs)
      let aplicacionesPago: any[] = [];
      if (acuerdoIdsForPagos.length > 0) {
        const acuerdoIdChunks = chunkArray(acuerdoIdsForPagos, 500);
        for (const chunk of acuerdoIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let more = true;
          while (more) {
            const { data, error } = await supabase
              .from('aplicaciones_pago')
              .select('monto, id_acuerdo_pago, es_multa')
              .in('id_acuerdo_pago', chunk)
              .eq('activo', true)
              .eq('es_multa', false)
              .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) {
              more = false;
            } else {
              aplicacionesPago = aplicacionesPago.concat(data);
              if (data.length < pageSize) more = false;
              else from += pageSize;
            }
          }
        }
      }
      console.log('Aplicaciones pago count:', aplicacionesPago.length);

      // Create a map from acuerdo_id to cuenta_id
      const acuerdoToCuentaMap = acuerdosForPagos.reduce((acc: Record<number, number>, a) => {
        acc[a.id] = a.id_cuenta_cobranza;
        return acc;
      }, {});

      // DEBUG: Check if account 536 is being processed correctly
      const acuerdos536 = acuerdosForPagos.filter(a => a.id_cuenta_cobranza === 536);
      console.log('🔍 DEBUG - Acuerdos for cuenta 536:', acuerdos536);
      const acuerdoIds536 = acuerdos536.map(a => a.id);
      const aplicaciones536 = aplicacionesPago.filter(ap => acuerdoIds536.includes(ap.id_acuerdo_pago));
      console.log('🔍 DEBUG - Aplicaciones for cuenta 536:', aplicaciones536);

      // Calculate total payments per account from aplicaciones
      const pagadoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const totalPagado = aplicacionesPago.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id).reduce((sum, ap) => sum + (ap.monto || 0), 0);
        acc[cuenta.id] = totalPagado;
        return acc;
      }, {});
      console.log('Pagado por cuenta sample:', Object.entries(pagadoPorCuenta).slice(0, 5));
      console.log('🔍 DEBUG - Pagado cuenta 536:', pagadoPorCuenta[536]);

      // Get cash payments (id_metodos_pago = 1) for all accounts (batched)
      let pagosCash: any[] = [];
      for (const chunk of cuentaIdChunks) {
        const pageSize = 1000;
        let from = 0;
        let more = true;
        while (more) {
          const { data, error } = await supabase
            .from('pagos')
            .select('id, fecha_pago, id_metodos_pago, activo')
            .in('id_cuenta_cobranza', chunk)
            .eq('id_metodos_pago', 1)
            .eq('activo', true)
            .order('fecha_pago', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) {
            more = false;
          } else {
            pagosCash = pagosCash.concat(data);
            if (data.length < pageSize) more = false;
            else from += pageSize;
          }
        }
      }
      const pagosCashIds = pagosCash.map(p => p.id);

      // Get aplicaciones for cash payments (batched)
      let aplicacionesCash: any[] = [];
      if (pagosCashIds.length > 0 && acuerdoIdsForPagos.length > 0) {
        const pagosCashIdChunks = chunkArray(pagosCashIds, 500);
        for (const chunk of pagosCashIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let more = true;
          while (more) {
            const { data, error } = await supabase
              .from('aplicaciones_pago')
              .select('monto, id_acuerdo_pago, id_pago, es_multa')
              .in('id_pago', chunk)
              .eq('activo', true)
              .eq('es_multa', false)
              .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) {
              more = false;
            } else {
              aplicacionesCash = aplicacionesCash.concat(data);
              if (data.length < pageSize) more = false;
              else from += pageSize;
            }
          }
        }
      }

      // Get acuerdos_pago to check if "Apartado" or "Enganche" is paid (batched)
      let acuerdosPago: any[] = [];
      for (const chunk of cuentaIdChunks) {
        const pageSize = 1000;
        let from = 0;
        let more = true;
        while (more) {
          const { data, error } = await supabase
            .from('acuerdos_pago')
            .select('id, id_cuenta_cobranza, id_concepto, pago_completado')
            .in('id_cuenta_cobranza', chunk)
            .eq('activo', true)
            .range(from, from + pageSize - 1);
          if (error || !data || data.length === 0) {
            more = false;
          } else {
            acuerdosPago = acuerdosPago.concat(data);
            if (data.length < pageSize) more = false;
            else from += pageSize;
          }
        }
      }
      console.log('🔍 Acuerdos de pago count:', acuerdosPago.length);

      // Get aplicaciones_pago para verificar si hay pagos de cesión de derechos (batched)
      const acuerdoIds = acuerdosPago.map(a => a.id);
      let cesionDerechosMap: Record<number, boolean> = {};
      if (acuerdoIds.length > 0) {
        let aplicaciones: any[] = [];
        const acuerdoIdChunks = chunkArray(acuerdoIds, 500);
        for (const chunk of acuerdoIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let more = true;
          while (more) {
            const { data, error } = await supabase
              .from('aplicaciones_pago')
              .select('id_acuerdo_pago, monto')
              .in('id_acuerdo_pago', chunk)
              .eq('activo', true)
              .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) {
              more = false;
            } else {
              aplicaciones = aplicaciones.concat(data);
              if (data.length < pageSize) more = false;
              else from += pageSize;
            }
          }
        }

        // Crear mapeo de acuerdo_id a concepto_id y cuenta_id
        const acuerdosMap = acuerdosPago.reduce((acc: any, a) => {
          acc[a.id] = {
            id_concepto: a.id_concepto,
            id_cuenta_cobranza: a.id_cuenta_cobranza
          };
          return acc;
        }, {});

        // Crear un mapa de cuentas que tienen cesión de derechos con pagos (id_concepto = 6)
        aplicaciones.forEach((app: any) => {
          const acuerdo = acuerdosMap[app.id_acuerdo_pago];
          if (acuerdo && acuerdo.id_concepto === 6 && app.monto > 0) {
            cesionDerechosMap[acuerdo.id_cuenta_cobranza] = true;
          }
        });
        console.log('🔍 Cuentas con cesión de derechos:', cesionDerechosMap);
      }

      // Primero necesitamos determinar qué cuentas son de productos
      // Obtenemos las ofertas para saber cuáles tienen id_producto
      const ofertaIdsTemp = cuentas.map(c => c.id_oferta).filter(id => id !== null);
      const {
        data: ofertasTemp
      } = ofertaIdsTemp.length > 0 ? await supabase.from('ofertas').select('id, id_producto').in('id', ofertaIdsTemp) : {
        data: []
      };
      const cuentasProductoSet = new Set(ofertasTemp?.filter(o => o.id_producto).map(o => cuentas.find(c => c.id_oferta === o.id)?.id).filter(Boolean) || []);
      console.log('🔍 Cuentas de productos:', Array.from(cuentasProductoSet));

      // Create a map of whether initial payment is made for each cuenta
      const apartadoPagadoPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const esProducto = cuentasProductoSet.has(cuenta.id);
        if (esProducto) {
          // Para productos, el pago inicial es el Enganche (id_concepto = 2)
          const acuerdoEnganche = acuerdosPago.find(ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 2);
          acc[cuenta.id] = acuerdoEnganche?.pago_completado || false;
          console.log(`💰 Cuenta ${cuenta.id} [PRODUCTO]: enganche_pagado = ${acc[cuenta.id]}`);
        } else {
          // Para propiedades, el pago inicial es Apartado (id_concepto = 1) o Cesión de derechos (id_concepto = 6)
          const acuerdoApartado = acuerdosPago.find(ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 1);
          acc[cuenta.id] = acuerdoApartado?.pago_completado || false || cesionDerechosMap[cuenta.id] || false;
          console.log(`💰 Cuenta ${cuenta.id} [PROPIEDAD]: apartado_pagado = ${acc[cuenta.id]} (apartado: ${acuerdoApartado?.pago_completado}, cesión: ${cesionDerechosMap[cuenta.id]})`);
        }
        return acc;
      }, {});

      // Create a map to check if each cuenta has acuerdos
      const tieneAcuerdosPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const tieneAcuerdos = acuerdosPago.some(ap => ap.id_cuenta_cobranza === cuenta.id);
        acc[cuenta.id] = tieneAcuerdos;
        return acc;
      }, {});

      // Get multas pendientes para cada cuenta (batched)
      const acuerdoIdsForMultas = acuerdosPago.map(ap => ap.id);
      let multasPendientesPorCuenta: Record<number, boolean> = {};
      if (acuerdoIdsForMultas.length > 0) {
        let multas: any[] = [];
        const acuerdoIdChunksForMultas = chunkArray(acuerdoIdsForMultas, 500);
        for (const chunk of acuerdoIdChunksForMultas) {
          const pageSize = 1000;
          let from = 0;
          let more = true;
          while (more) {
            const { data, error } = await supabase
              .from('multas')
              .select('id, id_acuerdo_pago, es_pagada')
              .in('id_acuerdo_pago', chunk)
              .eq('activo', true)
              .eq('es_pagada', false)
              .range(from, from + pageSize - 1);
            if (error || !data || data.length === 0) {
              more = false;
            } else {
              multas = multas.concat(data);
              if (data.length < pageSize) more = false;
              else from += pageSize;
            }
          }
        }

        // Crear un mapa de acuerdo_id a cuenta_id
        const acuerdoToCuentaMapMultas = acuerdosPago.reduce((acc: any, ap) => {
          acc[ap.id] = ap.id_cuenta_cobranza;
          return acc;
        }, {});

        // Marcar qué cuentas tienen multas pendientes
        multas.forEach(multa => {
          const cuentaId = acuerdoToCuentaMapMultas[multa.id_acuerdo_pago];
          if (cuentaId) {
            multasPendientesPorCuenta[cuentaId] = true;
          }
        });
        console.log('🔍 Cuentas con multas pendientes:', multasPendientesPorCuenta);
      }

      // Get offer IDs to fetch related data
      const ofertaIds = cuentas.map(c => c.id_oferta).filter(id => id !== null);

      // Get ofertas with properties and products (batched)
      let ofertas: any[] = [];
      let ofertasError: any = null;

      if (ofertaIds.length > 0) {
        const ofertaIdChunks = chunkArray(ofertaIds, 500);
        for (const chunk of ofertaIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let to = pageSize - 1;
          let more = true;

          while (more) {
            const { data, error } = await supabase
              .from('ofertas')
              .select(`
                id,
                id_propiedad,
                id_producto,
                propiedades!ofertas_id_propiedad_fkey(
                  id,
                  numero_propiedad,
                  precio_lista,
                  id_entidad_relacionada_dueno,
                  id_edificio_modelo,
                  id_estatus_disponibilidad
                )
              `)
              .in('id', chunk)
              .range(from, to);

            if (error) {
              ofertasError = error;
              break;
            }

            if (!data || data.length === 0) {
              more = false;
              break;
            }

            ofertas = ofertas.concat(data);

            if (data.length < pageSize) {
              more = false;
            } else {
              from += pageSize;
              to += pageSize;
            }
          }
          if (ofertasError) break;
        }
      }
      if (ofertasError) {
        console.error('Error fetching ofertas:', ofertasError);
        return [];
      }

      // Get property IDs to find non-included bodegas and estacionamientos
      const propiedadIds = ofertas.filter(o => o.id_propiedad).map(o => o.id_propiedad);

      // Get bodegas not included for these properties (batched)
      let bodegasNoIncluidas: any[] = [];
      if (propiedadIds.length > 0) {
        const propiedadIdChunks = chunkArray(propiedadIds, 500);
        for (const chunk of propiedadIdChunks) {
          const { data } = await supabase
            .from('bodegas')
            .select('id, id_propiedad, id_producto, es_incluido')
            .in('id_propiedad', chunk)
            .eq('es_incluido', false)
            .eq('activo', true);
          if (data) bodegasNoIncluidas = bodegasNoIncluidas.concat(data);
        }
      }

      // Get estacionamientos not included for these properties (batched)
      let estacionamientosNoIncluidos: any[] = [];
      if (propiedadIds.length > 0) {
        const propiedadIdChunks2 = chunkArray(propiedadIds, 500);
        for (const chunk of propiedadIdChunks2) {
          const { data } = await supabase
            .from('estacionamientos')
            .select('id, id_propiedad, id_producto, es_incluido')
            .in('id_propiedad', chunk)
            .eq('es_incluido', false)
            .eq('activo', true);
          if (data) estacionamientosNoIncluidos = estacionamientosNoIncluidos.concat(data);
        }
      }

      // Create maps: propiedad_id -> [producto_ids]
      const bodegaProductosPorPropiedad = new Map<number, number[]>();
      const estacionamientoProductosPorPropiedad = new Map<number, number[]>();
      bodegasNoIncluidas.forEach(b => {
        if (b.id_producto && b.id_propiedad) {
          if (!bodegaProductosPorPropiedad.has(b.id_propiedad)) {
            bodegaProductosPorPropiedad.set(b.id_propiedad, []);
          }
          bodegaProductosPorPropiedad.get(b.id_propiedad)!.push(b.id_producto);
        }
      });
      estacionamientosNoIncluidos.forEach(e => {
        if (e.id_producto && e.id_propiedad) {
          if (!estacionamientoProductosPorPropiedad.has(e.id_propiedad)) {
            estacionamientoProductosPorPropiedad.set(e.id_propiedad, []);
          }
          estacionamientoProductosPorPropiedad.get(e.id_propiedad)!.push(e.id_producto);
        }
      });

      // Get all complementary product IDs
      const complementarioProductIds = [...(bodegasNoIncluidas.map(b => b.id_producto).filter(Boolean)), ...(estacionamientosNoIncluidos.map(e => e.id_producto).filter(Boolean))];

      // Get ofertas for complementary products (batched)
      let ofertasComplementarias: any[] = [];
      let cuentasComplementarias: any[] = [];
      if (complementarioProductIds.length > 0) {
        const productIdChunks = chunkArray(complementarioProductIds, 500);
        for (const chunk of productIdChunks) {
          const { data: ofertasComp } = await supabase
            .from('ofertas')
            .select('id, id_producto')
            .in('id_producto', chunk)
            .eq('activo', true);
          if (ofertasComp) ofertasComplementarias = ofertasComplementarias.concat(ofertasComp);
        }
        if (ofertasComplementarias.length > 0) {
          const ofertaCompIds = ofertasComplementarias.map(o => o.id);
          const ofertaCompIdChunks = chunkArray(ofertaCompIds, 500);
          for (const chunk of ofertaCompIdChunks) {
            const { data: cuentasComp } = await supabase
              .from('cuentas_cobranza')
              .select('id, id_oferta')
              .in('id_oferta', chunk)
              .eq('activo', true);
            if (cuentasComp) cuentasComplementarias = cuentasComplementarias.concat(cuentasComp);
          }
        }
      }

      // Create map: oferta_id -> cuenta_id
      const ofertaToCuentaCompMap = new Map<number, number>();
      cuentasComplementarias.forEach(c => {
        ofertaToCuentaCompMap.set(c.id_oferta, c.id);
      });

      // Create map: producto_id -> cuenta_id
      const productoToCuentaMap = new Map<number, number>();
      ofertasComplementarias.forEach(o => {
        const cuentaId = ofertaToCuentaCompMap.get(o.id);
        if (cuentaId && o.id_producto) {
          productoToCuentaMap.set(o.id_producto, cuentaId);
        }
      });

      // Calculate cash paid per cuenta, including complementary units
      const pagadoEfectivoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const oferta = ofertas.find(o => o.id === cuenta.id_oferta);
        const propiedadId = oferta?.id_propiedad;

        // 1. Cash paid for main property account
        let totalEfectivo = aplicacionesCash.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id).reduce((sum, ap) => sum + (ap.monto || 0), 0);

        // 2. Add cash paid for non-included bodegas (only for property accounts)
        if (propiedadId && bodegaProductosPorPropiedad.has(propiedadId)) {
          const bodegaProductos = bodegaProductosPorPropiedad.get(propiedadId) || [];
          bodegaProductos.forEach(productoId => {
            const cuentaComplementariaId = productoToCuentaMap.get(productoId);
            if (cuentaComplementariaId) {
              const efectivoBodega = aplicacionesCash.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuentaComplementariaId).reduce((sum, ap) => sum + (ap.monto || 0), 0);
              totalEfectivo += efectivoBodega;
            }
          });
        }

        // 3. Add cash paid for non-included estacionamientos (only for property accounts)
        if (propiedadId && estacionamientoProductosPorPropiedad.has(propiedadId)) {
          const estacionamientoProductos = estacionamientoProductosPorPropiedad.get(propiedadId) || [];
          estacionamientoProductos.forEach(productoId => {
            const cuentaComplementariaId = productoToCuentaMap.get(productoId);
            if (cuentaComplementariaId) {
              const efectivoEstacionamiento = aplicacionesCash.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuentaComplementariaId).reduce((sum, ap) => sum + (ap.monto || 0), 0);
              totalEfectivo += efectivoEstacionamiento;
            }
          });
        }
        acc[cuenta.id] = totalEfectivo;
        return acc;
      }, {});

      // Create a map of individual cash payments per account with aggregated amounts
      const pagosCashPorCuenta = cuentas.reduce((acc: Record<number, CashPayment[]>, cuenta) => {
        // Get all cash payment IDs for this cuenta through aplicaciones
        const aplicacionesForCuenta = aplicacionesCash.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id);

        // Group by payment ID and sum amounts
        const pagoAggregated = aplicacionesForCuenta.reduce((pagoAcc: Record<number, number>, ap) => {
          pagoAcc[ap.id_pago] = (pagoAcc[ap.id_pago] || 0) + (ap.monto || 0);
          return pagoAcc;
        }, {});

        // Map to payment details
        const pagos = Object.entries(pagoAggregated).map(([pagoId, monto]) => {
          const pago = pagosCash.find(p => p.id === parseInt(pagoId));
          return {
            fecha_pago: pago?.fecha_pago || '',
            monto: monto as number
          };
        }).filter(p => p.fecha_pago);
        acc[cuenta.id] = pagos;
        return acc;
      }, {});

      // Get compradores - include inactive personas too (batched)
      let compradores: any[] = [];
      if (cuentaIds.length > 0) {
        for (const chunk of cuentaIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let to = pageSize - 1;
          let more = true;

          while (more) {
            const { data, error } = await supabase
              .from('compradores')
              .select(`
                id_cuenta_cobranza,
                porcentaje_copropiedad,
                id_persona,
                activo
              `)
              .in('id_cuenta_cobranza', chunk)
              .eq('activo', true)
              .range(from, to);

            if (error) {
              console.error('Error fetching compradores:', error);
              break;
            }

            if (!data || data.length === 0) {
              more = false;
              break;
            }

            compradores = compradores.concat(data);

            if (data.length < pageSize) {
              more = false;
            } else {
              from += pageSize;
              to += pageSize;
            }
          }
        }
      }

      // Get all persona IDs
      const personaIds = [...new Set(compradores.map(c => c.id_persona).filter(Boolean))];

      // Fetch personas separately (batched)
      let personas: any[] = [];
      if (personaIds.length > 0) {
        const personaIdChunks = chunkArray(personaIds, 500);
        for (const chunk of personaIdChunks) {
          const pageSize = 1000;
          let from = 0;
          let to = pageSize - 1;
          let more = true;
          
          while (more) {
            const { data, error } = await supabase
              .from('personas')
              .select('id, nombre_legal, rfc')
              .in('id', chunk)
              .range(from, to);
            
            if (error) {
              console.error('Error fetching personas:', error);
              break;
            }
            
            if (!data || data.length === 0) {
              more = false;
              break;
            }
            
            personas = personas.concat(data);
            
            if (data.length < pageSize) {
              more = false;
            } else {
              from += pageSize;
              to += pageSize;
            }
          }
        }
      }

      // Create personas map
      const personasMap = new Map<number, {
        id: number;
        nombre_legal: string;
        rfc: string | null;
      }>();
      personas.forEach(p => {
        personasMap.set(p.id, {
          id: p.id,
          nombre_legal: p.nombre_legal,
          rfc: p.rfc
        });
      });

      // Get entidades relacionadas, proyectos, edificios, modelos, productos
      const entidadIds = ofertas.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean);
      const edificioModeloIds = ofertas.map(o => o.propiedades?.id_edificio_modelo).filter(Boolean);
      const productoIds = ofertas.map(o => o.id_producto).filter(Boolean);

      // Get productos_servicios data 
      let productosData: any[] = [];
      let entidadesProductosMap: Map<number, number> = new Map(); // id_entidad -> id_proyecto
      let proyectosProductosData: any[] = [];
      if (productoIds.length > 0) {
        const {
          data: productos
        } = await supabase.from('productos_servicios').select('id, nombre, id_entidad_relacionada_dueno').in('id', productoIds);
        productosData = productos || [];
        if (productosData.length > 0) {
          const entidadIdsProductos = productosData.map(p => p.id_entidad_relacionada_dueno).filter(Boolean);
          if (entidadIdsProductos.length > 0) {
            const {
              data: entidadesProductos
            } = await supabase.from('entidades_relacionadas').select('id, id_proyecto').in('id', entidadIdsProductos);

            // Create a map for quick lookup
            entidadesProductos?.forEach(e => {
              entidadesProductosMap.set(e.id, e.id_proyecto);
            });
            const proyectoIdsProductos = entidadesProductos?.map(e => e.id_proyecto).filter(Boolean) || [];
            if (proyectoIdsProductos.length > 0) {
              const {
                data: proyectos
              } = await supabase.from('proyectos').select('id, id_tipo_uso').in('id', proyectoIdsProductos);
              proyectosProductosData = proyectos || [];
            }
          }
        }
      }
      const [entidadesResult, edificiosModelosResult] = await Promise.all([supabase.from('entidades_relacionadas').select(`
            id,
            personas!fk_entrel_persona(nombre_legal),
            proyectos!entidades_relacionadas_id_proyecto_fkey(
              nombre,
              id_tipo_uso
            )
          `).in('id', entidadIds), supabase.from('edificios_modelos').select(`
            id,
            edificios!edificios_modelos_id_edificio_fkey(nombre),
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `).in('id', edificioModeloIds)]);

      // Transform the data
      const transformedData: CuentaCobranza[] = cuentas.map(cuenta => {
        const oferta = ofertas.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const entidad = entidadesResult.data?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const edificioModelo = edificiosModelosResult.data?.find(em => em.id === propiedad?.id_edificio_modelo);
        const cuentaCompradores = compradores.filter(c => c.id_cuenta_cobranza === cuenta.id);

        // Determine tipo based on oferta
        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        let productoNombre: string | undefined;
        if (oferta?.id_producto) {
          const producto = productosData?.find((p: any) => p.id === oferta.id_producto);
          productoNombre = producto?.nombre;
          if (producto && producto.id_entidad_relacionada_dueno) {
            // Get proyecto id from the map
            const idProyecto = entidadesProductosMap.get(producto.id_entidad_relacionada_dueno);
            if (idProyecto) {
              const proyecto = proyectosProductosData?.find((pr: any) => pr.id === idProyecto);
              if (proyecto) {
                // id_tipo_uso: 9 = Productos, 10 = Servicios, 11 = Mantenimientos (also Servicios)
                const tipoUso = proyecto.id_tipo_uso;
                if (tipoUso === 9) {
                  tipo = 'Producto';
                } else if (tipoUso === 10 || tipoUso === 11) {
                  tipo = 'Servicio';
                }
              } else {
                tipo = 'Producto'; // Default if we can't determine
              }
            } else {
              tipo = 'Producto'; // Default if we can't determine
            }
          } else {
            tipo = 'Producto'; // Default if we can't determine
          }
        }
        const pagado = pagadoPorCuenta[cuenta.id] || 0;
        const precio_final = cuenta.precio_final || 0;
        // Calculate difference and normalize to avoid -0
        let restante = precio_final - pagado;
        restante = Math.round(restante * 100) / 100;
        // Force any zero (including -0) to positive 0
        if (Math.abs(restante) < 0.01) {
          restante = 0;
        }
        // Final cleanup: use + operator to convert -0 to 0
        restante = +restante.toFixed(2);

        // Calculate cash payment data (only for properties)
        const valorUma = cuenta.valor_uma || 0;
        const limiteEfectivo = valorUma * 8025;
        const pagadoEfectivo = tipo === 'Propiedad' ? pagadoEfectivoPorCuenta[cuenta.id] || 0 : 0;
        let restanteEfectivo = limiteEfectivo - pagadoEfectivo;
        restanteEfectivo = Math.round(restanteEfectivo * 100) / 100;
        if (Math.abs(restanteEfectivo) < 0.01) {
          restanteEfectivo = 0;
        }
        restanteEfectivo = +restanteEfectivo.toFixed(2);
        const porcentajeEfectivo = limiteEfectivo > 0 ? pagadoEfectivo / limiteEfectivo * 100 : 0;
        return {
          id: cuenta.id,
          tipo,
          producto_nombre: productoNombre,
          clabe_stp: cuenta.clabe_stp,
          precio_final,
          precio_lista: propiedad?.precio_lista || null,
          es_comision_venta_efectivo: (cuenta as any).es_comision_venta_efectivo || false,
          porcentaje_comision_venta: (cuenta as any).porcentaje_comision_venta || 0,
          pagado,
          restante,
          cash_limit: limiteEfectivo,
          cash_paid: pagadoEfectivo,
          cash_remaining: restanteEfectivo,
          cash_percentage: porcentajeEfectivo,
          cash_payments: tipo === 'Propiedad' ? pagosCashPorCuenta[cuenta.id] || [] : [],
          compradores: cuentaCompradores.map(c => {
            const persona = personasMap.get(c.id_persona);
            return {
              nombre_legal: persona?.nombre_legal || '',
              rfc: persona?.rfc || null,
              porcentaje_copropiedad: c.porcentaje_copropiedad || 0,
              id_persona: c.id_persona
            };
          }).filter(c => c.nombre_legal),
          dueno: entidad?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo',
          activo: cuenta.activo,
          id_oferta: cuenta.id_oferta,
          motivo_cancelacion: (cuenta as any).tipos_cancelacion?.nombre || null,
          apartado_pagado: apartadoPagadoPorCuenta[cuenta.id],
          tiene_acuerdos: tieneAcuerdosPorCuenta[cuenta.id],
          tiene_multas_pendientes: multasPendientesPorCuenta[cuenta.id] || false,
          id_estatus_disponibilidad: propiedad?.id_estatus_disponibilidad,
          collection_id: cuenta.collection_id
        };
      });
      return transformedData.sort((a, b) => b.id - a.id);
    }
  });

  // Filter by active status and search term
  const cuentasActivas = cuentasCobranza?.filter(cuenta => cuenta.activo) || [];
  const cuentasCanceladas = cuentasCobranza?.filter(cuenta => !cuenta.activo) || [];

  // Filter function to apply to any list of cuentas
  const applyFilters = (cuentas: CuentaCobranza[]) => {
    return cuentas.filter(cuenta => {
      // Filter by tipo
      if (!selectedTipos.includes(cuenta.tipo)) {
        return false;
      }

      // Filter by search term (including formatted ID like CC-000001)
      const formattedId = formatCuentaCobranzaId(cuenta.id, cuenta.tipo).toLowerCase();
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === "" || formattedId.includes(searchLower) || cuenta.id.toString().includes(searchTerm) || cuenta.compradores.some(c => c.nombre_legal.toLowerCase().includes(searchLower) || c.rfc?.toLowerCase().includes(searchLower)) || cuenta.dueno.toLowerCase().includes(searchLower) || cuenta.clabe_stp?.toLowerCase().includes(searchLower) || cuenta.proyecto.toLowerCase().includes(searchLower) || cuenta.edificio.toLowerCase().includes(searchLower) || cuenta.numero_propiedad.toLowerCase().includes(searchLower) || cuenta.modelo.toLowerCase().includes(searchLower) || cuenta.producto_nombre?.toLowerCase().includes(searchLower) || cuenta.precio_final.toString().includes(searchTerm);

      // Apply individual filters (ID filter supports both raw ID and formatted ID like CC-000001)
      const idFilterTrimmed = idCuentaFilter.trim().toLowerCase();
      const paddedNumber = String(cuenta.id).padStart(6, '0'); // e.g., "000100"
      const matchesIdCuenta = idCuentaFilter.trim() === "" || 
        formattedId.includes(idFilterTrimmed) ||  // Search in "cc-000100"
        paddedNumber.includes(idFilterTrimmed) || // Search in "000100" (without prefix)
        cuenta.id.toString().includes(idFilterTrimmed); // Search in "100"
      const matchesProducto = productoFilter === "" || cuenta.producto_nombre?.toLowerCase().includes(productoFilter.toLowerCase());
      const matchesCompradores = compradoresFilter === "" || cuenta.compradores.some(c => c.nombre_legal.toLowerCase().includes(compradoresFilter.toLowerCase()) || c.rfc?.toLowerCase().includes(compradoresFilter.toLowerCase()));
      const matchesClabe = clabeFilter === "" || cuenta.clabe_stp?.toLowerCase().includes(clabeFilter.toLowerCase());
      const matchesProyecto = proyectoFilter === "" || cuenta.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
      const matchesNoPropiedad = noPropiedadFilter === "" || cuenta.numero_propiedad.toLowerCase().includes(noPropiedadFilter.toLowerCase());
      const matchesModelo = modeloFilter === "" || cuenta.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
      return matchesSearch && matchesIdCuenta && matchesProducto && matchesCompradores && matchesClabe && matchesProyecto && matchesNoPropiedad && matchesModelo;
    });
  };

  // Apply filters to both activas and canceladas
  const filteredCuentasActivas = applyFilters(cuentasActivas);
  const filteredCuentasCanceladas = applyFilters(cuentasCanceladas);
  const currentCuentas = activeTab === "activas" ? cuentasActivas : cuentasCanceladas;
  const filteredCuentas = activeTab === "activas" ? filteredCuentasActivas : filteredCuentasCanceladas;

  // Pagination logic
  const currentPage = activeTab === "activas" ? currentPageActive : currentPageCancelled;
  const setCurrentPage = activeTab === "activas" ? setCurrentPageActive : setCurrentPageCancelled;
  const totalFilteredCount = filteredCuentas.length;
  const totalPages = Math.ceil(totalFilteredCount / itemsPerPage);
  const paginatedCuentas = filteredCuentas.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const handleTipoToggle = (tipo: 'Propiedad' | 'Producto' | 'Servicio') => {
    setSelectedTipos(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  };
  
  // Función para alternar expansión de estadísticas
  const toggleStatsExpanded = () => {
    const newValue = !statsExpanded;
    setStatsExpanded(newValue);
    localStorage.setItem('pagos-stats-expanded', JSON.stringify(newValue));
  };

  // Statistics should always use unfiltered data based on active tab
  const statsCuentas = activeTab === "activas" ? cuentasActivas : cuentasCanceladas;
  const totalMonto = statsCuentas.reduce((sum, cuenta) => sum + Number(cuenta.precio_final), 0);
  
  // Separar cuentas por tipo (Propiedades vs Productos/Servicios)
  const cuentasPropiedades = statsCuentas.filter(c => c.tipo === 'Propiedad');
  const cuentasProductos = statsCuentas.filter(c => c.tipo === 'Producto' || c.tipo === 'Servicio');
  
  // Calculate total cobrado (only from ACTIVE accounts - not cancelled)
  const cuentasActivasParaCobrado = cuentasActivas;
  const cuentasPropiedadesActivas = cuentasActivasParaCobrado.filter(c => c.tipo === 'Propiedad');
  const cuentasProductosActivas = cuentasActivasParaCobrado.filter(c => c.tipo === 'Producto' || c.tipo === 'Servicio');
  
  const totalCobradoPropiedades = cuentasPropiedadesActivas.reduce((sum, cuenta) => sum + Number(cuenta.pagado || 0), 0);
  const totalCobradoProductos = cuentasProductosActivas.reduce((sum, cuenta) => sum + Number(cuenta.pagado || 0), 0);
  const totalCobrado = totalCobradoPropiedades + totalCobradoProductos;
  
  // Calculate top 3 projects by number of accounts with totals (unfiltered) - SOLO PROPIEDADES ACTIVAS
  const proyectosDataMap = cuentasPropiedadesActivas.reduce((acc, cuenta) => {
    const proyecto = cuenta.proyecto;
    if (!acc[proyecto]) {
      acc[proyecto] = { count: 0, total: 0, cobrado: 0, cuentaIds: [] as number[] };
    }
    acc[proyecto].count += 1;
    acc[proyecto].total += Number(cuenta.precio_final);
    acc[proyecto].cobrado += Number(cuenta.pagado || 0);
    acc[proyecto].cuentaIds.push(cuenta.id);
    return acc;
  }, {} as Record<string, { count: number; total: number; cobrado: number; cuentaIds: number[] }>);

  const top3Proyectos = Object.entries(proyectosDataMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 3)
    .map(([proyecto, data]) => ({ 
      proyecto, 
      count: data.count, 
      total: data.total,
      promedio: data.total / data.count,
      cobrado: data.cobrado,
      restante: data.total - data.cobrado,
      cuentaIds: data.cuentaIds
    }));

  // Estadísticas para productos
  const totalMontoProductos = cuentasProductos.reduce((sum, cuenta) => sum + Number(cuenta.precio_final), 0);
  const totalMontoPropiedades = cuentasPropiedades.reduce((sum, cuenta) => sum + Number(cuenta.precio_final), 0);
  const promedioProductos = cuentasProductos.length > 0 ? totalMontoProductos / cuentasProductos.length : 0;

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
      const service = new EstadoCuentaService();
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

      // Get the offer data for this account
      const {
        data: offerData,
        error: offerError
      } = await supabase.from('cuentas_cobranza').select(`
          id_oferta,
          ofertas!fk_cuentas_cobranza_oferta(
            id,
            id_propiedad,
            id_producto
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
      const {
        generateOfferPDF
      } = await import('@/services/htmlToPdfService');

      // Check if it's a product/service offer or property offer
      if (offerData.ofertas.id_producto && !offerData.ofertas.id_propiedad) {
        // It's a product/service offer
        await generateOfferPDF({
          propertyId: offerData.ofertas.id_propiedad || 0,
          // Will be ignored for product offers
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
        description: "La oferta se ha descargado exitosamente"
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
              <CardTitle className="text-sm font-medium">
                {activeTab === "activas" ? "Cuentas Activas" : "Cuentas Canceladas"}
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsCuentas.length}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Propiedades: <span className="font-medium text-foreground">{cuentasPropiedades.length}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total de cuentas de propiedades</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Productos: <span className="font-medium text-foreground">{cuentasProductos.length}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total de cuentas de productos y servicios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total Colocado</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-2xl font-bold cursor-help">
                      {formatCurrencyCompact(totalMonto)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formatCurrency(totalMonto)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Propiedades: <span className="font-medium text-foreground">{formatCurrencyCompact(cuentasPropiedades.reduce((sum, c) => sum + Number(c.precio_final), 0))}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(cuentasPropiedades.reduce((sum, c) => sum + Number(c.precio_final), 0))}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        Productos: <span className="font-medium text-foreground">{formatCurrencyCompact(totalMontoProductos)}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(totalMontoProductos)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>

          {/* New Card: Monto Total Cobrado */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total Cobrado</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-2xl font-bold text-green-600 cursor-help">
                      {formatCurrencyCompact(totalCobrado)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formatCurrency(totalCobrado)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="grid grid-cols-2 gap-4 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground block">Propiedades:</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-medium text-green-600 cursor-help">{formatCurrencyCompact(totalCobradoPropiedades)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalCobradoPropiedades)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block text-orange-600 cursor-help">Rest: {formatCurrencyCompact(totalMontoPropiedades - totalCobradoPropiedades)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalMontoPropiedades - totalCobradoPropiedades)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div>
                  <span className="text-muted-foreground block">Productos:</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-medium text-green-600 cursor-help">{formatCurrencyCompact(totalCobradoProductos)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalCobradoProductos)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block text-orange-600 cursor-help">Rest: {formatCurrencyCompact(totalMontoProductos - totalCobradoProductos)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{formatCurrency(totalMontoProductos - totalCobradoProductos)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                          {formatCurrencyCompact(cuentasPropiedades.length > 0 ? cuentasPropiedades.reduce((sum, c) => sum + Number(c.precio_final), 0) / cuentasPropiedades.length : 0)}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatCurrency(cuentasPropiedades.length > 0 ? cuentasPropiedades.reduce((sum, c) => sum + Number(c.precio_final), 0) / cuentasPropiedades.length : 0)}</p>
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
                              cuentaIds: item.cuentaIds,
                              totalColocado: item.total,
                              totalCobrado: item.cobrado
                            })}
                          >
                            {item.proyecto}
                          </button>
                        </div>
                        <Badge variant="secondary" className="ml-2">
                          {item.count} {item.count === 1 ? 'cuenta' : 'cuentas'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pl-7">
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
                                <span className="block text-muted-foreground">Restante:</span>
                                <span className="font-semibold text-orange-600">{formatCurrencyCompact(item.restante)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatCurrency(item.restante)}</p>
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
              {cuentasProductos.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2 pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total de Cuentas</span>
                      <Badge variant="secondary">
                        {cuentasProductos.length} {cuentasProductos.length === 1 ? 'cuenta' : 'cuentas'}
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
                      <span className="text-sm font-medium">Monto Total Restante</span>
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
          <TabsTrigger value="activas">Cuentas Activas ({filteredCuentasActivas.length})</TabsTrigger>
          <TabsTrigger value="canceladas">Cuentas Canceladas ({filteredCuentasCanceladas.length})</TabsTrigger>
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
                </div>
                
                {/* Clear filters button */}
                <div className="flex justify-end">
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
                }}>
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filtered count display */}
              {!isLoading && <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando <span className="font-semibold text-foreground">{filteredCuentas.length}</span> de <span className="font-semibold text-foreground">{cuentasActivas.length}</span> cuentas
                </div>}
              {isLoading ? <div className="text-center py-8">Cargando cuentas de cobranza...</div> : filteredCuentas.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || idCuentaFilter || productoFilter || compradoresFilter || clabeFilter || proyectoFilter || noPropiedadFilter || modeloFilter || selectedTipos.length < 3 ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de cobranza activas"}
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
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas.map(cuenta => <TableRow key={cuenta.id} className={Math.abs(cuenta.restante) < 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 ? "bg-green-50 dark:bg-green-950/20" : ""}>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
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
                              </TooltipProvider> : !cuenta.apartado_pagado && cuenta.id_estatus_disponibilidad !== 10 ? <TooltipProvider>
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
                         <TableCell className="font-semibold text-orange-600">
                           <div className="flex items-center gap-2">
                             {formatCurrency(cuenta.restante)}
                             {Math.abs(cuenta.restante) < 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 && <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <CheckCircle className="h-4 w-4 text-green-500" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Cuenta completamente pagada</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>}
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
                                     <Button variant="outline" size="icon" onClick={() => handleEditCuenta(cuenta)}>
                                       <Edit className="h-4 w-4" />
                                     </Button>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Editar Cuenta</p>
                                   </TooltipContent>
                                 </Tooltip>
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
                </div>
                
                {/* Clear filters button */}
                <div className="flex justify-end">
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
                }}>
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filtered count display */}
              {!isLoading && <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando <span className="font-semibold text-foreground">{filteredCuentas.length}</span> de <span className="font-semibold text-foreground">{cuentasCanceladas.length}</span> cuentas
                </div>}
              {isLoading ? <div className="text-center py-8">Cargando cuentas de cobranza...</div> : filteredCuentas.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                  {searchTerm || idCuentaFilter || productoFilter || compradoresFilter || clabeFilter || proyectoFilter || noPropiedadFilter || modeloFilter || selectedTipos.length < 3 ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de cobranza canceladas"}
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
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Motivo Cancelación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas.map(cuenta => <TableRow key={cuenta.id} className={Math.abs(cuenta.restante) < 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 ? "bg-green-50 dark:bg-green-950/20" : ""}>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
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
                              </TooltipProvider> : !cuenta.apartado_pagado && cuenta.id_estatus_disponibilidad !== 10 ? <TooltipProvider>
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
                         <TableCell className="font-semibold text-orange-600">
                           <div className="flex items-center gap-2">
                             {formatCurrency(cuenta.restante)}
                             {Math.abs(cuenta.restante) < 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 && <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <CheckCircle className="h-4 w-4 text-green-500" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Cuenta completamente pagada</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>}
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
        onClose={() => setProjectSummaryDialog({ isOpen: false, projectName: "", cuentaIds: [], totalColocado: 0, totalCobrado: 0 })}
        projectName={projectSummaryDialog.projectName}
        cuentaIds={projectSummaryDialog.cuentaIds}
        totalColocado={projectSummaryDialog.totalColocado}
        totalCobrado={projectSummaryDialog.totalCobrado}
      />
    </div>;
}