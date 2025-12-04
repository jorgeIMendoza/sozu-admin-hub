import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, Eye, X, Edit, Download, Loader2, Filter, TrendingUp, TrendingDown, Equal, AlertCircle, DollarSign, CheckCircle, FileText, Receipt, Wrench, Package, UserPlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { CompradoresDetailDialog } from "@/components/admin/CompradoresDetailDialog";
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";
import { CashPaymentDetailDialog } from "@/components/admin/CashPaymentDetailDialog";
import { ComplementosDetailDialog } from "@/components/admin/ComplementosDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import { AddResidenteDialog } from "@/components/admin/AddResidenteDialog";
import { ResidentesDetailDialog } from "@/components/admin/ResidentesDetailDialog";

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_persona?: number;
}

interface Residente {
  id_persona: number;
  nombre_legal: string;
  activo: boolean;
}

interface CashPayment {
  fecha_pago: string;
  monto: number;
}

interface BodegaDetalle {
  nombre: string;
  m2: number;
  ubicacion?: string;
  es_incluido: boolean;
}

interface EstacionamientoDetalle {
  nombre: string;
  tipo: string;
  m2: number;
  ubicacion?: string;
  es_incluido: boolean;
}

interface ProductoDetalle {
  nombre: string;
  categoria: string;
  precio: number;
}

interface CuentaCobranza {
  id: number;
  tipo: 'Propiedad' | 'Producto' | 'Servicio';
  producto_nombre?: string;
  clabe_stp: string | null;
  precio_final: number;
  precio_lista: number | null;
  pagado: number;
  restante: number;
  compradores: Comprador[];
  residentes: Residente[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  clave_catastral: string | null;
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
  id_propiedad?: number;
  bodegas?: BodegaDetalle[];
  estacionamientos?: EstacionamientoDetalle[];
  productos?: ProductoDetalle[];
  proxima_fecha_pago?: string | null;
}

export default function CuentasMantenimiento() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [idCuentaFilter, setIdCuentaFilter] = useState("");
  const [propietariosFilter, setPropietariosFilter] = useState("");
  const [clabeFilter, setClabeFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [noPropiedadFilter, setNoPropiedadFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  
  const [editDialog, setEditDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null,
  });
  
  const [complementosDialog, setComplementosDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null,
  });
  
  const [addResidenteDialog, setAddResidenteDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null,
  });
  
  const [residentesDialog, setResidentesDialog] = useState<{ isOpen: boolean; residentes: Residente[] }>({
    isOpen: false,
    residentes: [],
  });
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, idCuentaFilter, propietariosFilter, clabeFilter, proyectoFilter, noPropiedadFilter, modeloFilter]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Función para normalizar saldos pequeños a cero
  const normalizarSaldo = (saldo: number): number => {
    return Math.abs(saldo) < 0.01 ? 0 : saldo;
  };
  
  const { data: cuentasCobranza, isLoading } = useQuery({
    queryKey: ["cuentas_mantenimiento"],
    queryFn: async () => {
      // Get basic cuenta cobranza data with payment sums (ONLY maintenance accounts)
      const { data: cuentas, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          id_oferta,
          activo,
          valor_uma,
          id_cuenta_cobranza_padre,
          tipos_cancelacion:id_tipo_cancelacion(nombre)
        `)
        .not('id_cuenta_cobranza_padre', 'is', null);

      if (cuentasError) {
        console.error('Error fetching cuentas:', cuentasError);
        return [];
      }

      if (!cuentas || cuentas.length === 0) return [];

      // Get parent cuentas_cobranza to fetch clave_catastral and parent oferta
      const parentCuentaIds = [...new Set(cuentas.map(c => c.id_cuenta_cobranza_padre).filter((id): id is number => id !== null))];
      const { data: parentCuentas } = parentCuentaIds.length > 0 ? await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clave_catastral,
          id_oferta
        `)
        .in('id', parentCuentaIds) : { data: [] };

      // Create map for quick parent lookup
      const parentCuentasMap = new Map((parentCuentas || []).map(pc => [pc.id, pc] as [number, typeof pc]));

      // Get all payment amounts for each account using aplicaciones_pago
      const cuentaIds = cuentas.map(c => c.id);
      console.log('Cuenta IDs:', cuentaIds);
      
      // First get all acuerdos for these cuentas with monto
      const { data: acuerdosForPagos } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza, monto')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      const acuerdoIdsForPagos = acuerdosForPagos?.map(a => a.id) || [];
      
      console.log('🔍 Acuerdos de pago (inicial):', acuerdosForPagos);
      
      // Now get aplicaciones_pago for those acuerdos
      const { data: aplicacionesPago, error: aplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .select(`
          monto,
          id_acuerdo_pago,
          es_multa
        `)
        .in('id_acuerdo_pago', acuerdoIdsForPagos)
        .eq('activo', true)
        .eq('es_multa', false);

      console.log('Aplicaciones pago query result:', { aplicacionesPago, aplicacionesError });

      // Create a map from acuerdo_id to cuenta_id
      const acuerdoToCuentaMap = acuerdosForPagos?.reduce((acc: Record<number, number>, a) => {
        acc[a.id] = a.id_cuenta_cobranza;
        return acc;
      }, {}) || {};

      // Calculate total payments per account from aplicaciones
      const pagadoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const totalPagado = aplicacionesPago
          ?.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id)
          ?.reduce((sum, ap) => sum + (ap.monto || 0), 0) || 0;
        acc[cuenta.id] = totalPagado;
        console.log(`Cuenta ${cuenta.id}: pagado = ${totalPagado}`);
        return acc;
      }, {});

      // Get cash payments (id_metodos_pago = 1) for all accounts using aplicaciones_pago
      const { data: pagosCash } = await supabase
        .from('pagos')
        .select('id, fecha_pago, id_metodos_pago, activo')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('id_metodos_pago', 1)
        .eq('activo', true)
        .order('fecha_pago', { ascending: false });

      const pagosCashIds = pagosCash?.map(p => p.id) || [];
      
      // Get aplicaciones for cash payments
      const { data: aplicacionesCash } = await supabase
        .from('aplicaciones_pago')
        .select(`
          monto,
          id_acuerdo_pago,
          id_pago,
          es_multa
        `)
        .in('id_pago', pagosCashIds)
        .in('id_acuerdo_pago', acuerdoIdsForPagos)
        .eq('activo', true)
        .eq('es_multa', false);

      const pagadoEfectivoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const totalEfectivo = aplicacionesCash
          ?.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id)
          ?.reduce((sum, ap) => sum + (ap.monto || 0), 0) || 0;
        acc[cuenta.id] = totalEfectivo;
        return acc;
      }, {});

      // Create a map of individual cash payments per account with aggregated amounts
      const pagosCashPorCuenta = cuentas.reduce((acc: Record<number, CashPayment[]>, cuenta) => {
        // Get all cash payment IDs for this cuenta through aplicaciones
        const aplicacionesForCuenta = aplicacionesCash
          ?.filter(ap => acuerdoToCuentaMap[ap.id_acuerdo_pago] === cuenta.id) || [];
        
        // Group by payment ID and sum amounts
        const pagoAggregated = aplicacionesForCuenta.reduce((pagoAcc: Record<number, number>, ap) => {
          pagoAcc[ap.id_pago] = (pagoAcc[ap.id_pago] || 0) + (ap.monto || 0);
          return pagoAcc;
        }, {});
        
        // Map to payment details
        const pagos = Object.entries(pagoAggregated).map(([pagoId, monto]) => {
          const pago = pagosCash?.find(p => p.id === parseInt(pagoId));
          return {
            fecha_pago: pago?.fecha_pago || '',
            monto: monto as number
          };
        }).filter(p => p.fecha_pago);
        
        acc[cuenta.id] = pagos;
        return acc;
      }, {});

      // Calculate total mensual per account (sum of acuerdos monto) - using acuerdosForPagos
      const totalMensualPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const acuerdosCuenta = acuerdosForPagos?.filter(ap => ap.id_cuenta_cobranza === cuenta.id) || [];
        const totalMensual = acuerdosCuenta.reduce((sum, acuerdo) => sum + (acuerdo.monto || 0), 0);
        acc[cuenta.id] = totalMensual;
        console.log(`Cuenta ${cuenta.id}: total mensual (acuerdos) = ${totalMensual}`);
        return acc;
      }, {});
      
      console.log('✅ Pagado por cuenta:', pagadoPorCuenta);
      console.log('✅ Total mensual por cuenta:', totalMensualPorCuenta);

      // Get aplicaciones_pago para verificar si hay pagos de cesión de derechos
      const acuerdoIds = acuerdosForPagos?.map(a => a.id) || [];
      let cesionDerechosMap: Record<number, boolean> = {};
      
      if (acuerdoIds.length > 0) {
        const { data: aplicaciones } = await supabase
          .from('aplicaciones_pago')
          .select('id_acuerdo_pago, monto')
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true);

        // Get concepto info for cesion de derechos check
        const { data: acuerdosConConcepto } = await supabase
          .from('acuerdos_pago')
          .select('id, id_concepto, id_cuenta_cobranza')
          .in('id', acuerdoIds)
          .eq('activo', true);

        // Crear mapeo de acuerdo_id a concepto_id y cuenta_id
        const acuerdosMap = acuerdosConConcepto?.reduce((acc: any, a) => {
          acc[a.id] = { id_concepto: a.id_concepto, id_cuenta_cobranza: a.id_cuenta_cobranza };
          return acc;
        }, {});

        // Crear un mapa de cuentas que tienen cesión de derechos con pagos (id_concepto = 6)
        aplicaciones?.forEach((app: any) => {
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
      const { data: ofertasTemp } = ofertaIdsTemp.length > 0 ? await supabase
        .from('ofertas')
        .select('id, id_producto')
        .in('id', ofertaIdsTemp) : { data: [] };

      const cuentasProductoSet = new Set(
        ofertasTemp?.filter(o => o.id_producto).map(o => 
          cuentas.find(c => c.id_oferta === o.id)?.id
        ).filter(Boolean) || []
      );

      console.log('🔍 Cuentas de productos:', Array.from(cuentasProductoSet));

      // Get acuerdos with concepto info for apartado check
      const { data: acuerdosConceptos } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza, id_concepto, pago_completado')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      // Create a map of whether initial payment is made for each cuenta
      const apartadoPagadoPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const esProducto = cuentasProductoSet.has(cuenta.id);
        
        if (esProducto) {
          // Para productos, el pago inicial es el Enganche (id_concepto = 2)
          const acuerdoEnganche = acuerdosConceptos?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 2
          );
          acc[cuenta.id] = acuerdoEnganche?.pago_completado || false;
          console.log(`💰 Cuenta ${cuenta.id} [PRODUCTO]: enganche_pagado = ${acc[cuenta.id]}`);
        } else {
          // Para propiedades, el pago inicial es Apartado (id_concepto = 1) o Cesión de derechos (id_concepto = 6)
          const acuerdoApartado = acuerdosConceptos?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 1
          );
          acc[cuenta.id] = (acuerdoApartado?.pago_completado || false) || (cesionDerechosMap[cuenta.id] || false);
          console.log(`💰 Cuenta ${cuenta.id} [PROPIEDAD]: apartado_pagado = ${acc[cuenta.id]} (apartado: ${acuerdoApartado?.pago_completado}, cesión: ${cesionDerechosMap[cuenta.id]})`);
        }
        
        return acc;
      }, {});

      // Create a map to check if each cuenta has acuerdos
      const tieneAcuerdosPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const tieneAcuerdos = acuerdosForPagos?.some(ap => ap.id_cuenta_cobranza === cuenta.id) || false;
        acc[cuenta.id] = tieneAcuerdos;
        return acc;
      }, {});

      // Get multas pendientes para cada cuenta
      const acuerdoIdsForMultas = acuerdosForPagos?.map(ap => ap.id) || [];
      let multasPendientesPorCuenta: Record<number, boolean> = {};
      let montosMultasPorCuenta: Record<number, number> = {};
      
      if (acuerdoIdsForMultas.length > 0) {
        const { data: multas } = await supabase
          .from('multas')
          .select('id, id_acuerdo_pago, es_pagada, monto')
          .in('id_acuerdo_pago', acuerdoIdsForMultas)
          .eq('activo', true);

        // Crear un mapa de acuerdo_id a cuenta_id
        const acuerdoToCuentaMapMultas = acuerdosForPagos?.reduce((acc: any, ap) => {
          acc[ap.id] = ap.id_cuenta_cobranza;
          return acc;
        }, {});

        // Calcular total de multas por cuenta (pagadas y no pagadas)
        cuentas.forEach(cuenta => {
          const multasCuenta = multas?.filter(multa => 
            acuerdoToCuentaMapMultas[multa.id_acuerdo_pago] === cuenta.id
          ) || [];
          
          const totalMultas = multasCuenta.reduce((sum, multa) => sum + (multa.monto || 0), 0);
          montosMultasPorCuenta[cuenta.id] = totalMultas;
          
          // Verificar si tiene multas pendientes (no pagadas)
          const tieneMultasPendientes = multasCuenta.some(m => !m.es_pagada);
          multasPendientesPorCuenta[cuenta.id] = tieneMultasPendientes;
        });

        console.log('🔍 Cuentas con multas pendientes:', multasPendientesPorCuenta);
        console.log('🔍 Montos de multas por cuenta:', montosMultasPorCuenta);
      }

      // Get próxima fecha de pago (fecha_pago máxima no pagada) para cada cuenta
      const { data: proximasFechasPago } = await supabase
        .from('acuerdos_pago')
        .select('id_cuenta_cobranza, fecha_pago')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true)
        .eq('pago_completado', false)
        .not('fecha_pago', 'is', null)
        .order('fecha_pago', { ascending: false });

      // Crear un mapa con la fecha máxima de pago por cuenta
      const proximaFechaPagoPorCuenta = cuentas.reduce((acc: Record<number, string | null>, cuenta) => {
        const fechasCuenta = proximasFechasPago?.filter(f => f.id_cuenta_cobranza === cuenta.id) || [];
        if (fechasCuenta.length > 0) {
          // Obtener la fecha máxima
          const fechasOrdenadas = fechasCuenta
            .map(f => f.fecha_pago)
            .filter(Boolean)
            .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());
          acc[cuenta.id] = fechasOrdenadas[0] || null;
        } else {
          acc[cuenta.id] = null;
        }
        return acc;
      }, {});

      console.log('🔍 Próximas fechas de pago por cuenta:', proximaFechaPagoPorCuenta);

      // Get parent ofertas to fetch property/project/modelo from parent cuenta
      const parentOfertaIds = parentCuentas?.map(pc => pc.id_oferta).filter((id): id is number => id !== null) || [];
      const { data: parentOfertas } = parentOfertaIds.length > 0 ? await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          propiedades!ofertas_id_propiedad_fkey(
            id,
            numero_propiedad,
            id_entidad_relacionada_dueno,
            id_edificio_modelo
          )
        `)
        .in('id', parentOfertaIds) : { data: [] };

      // Create map for quick parent oferta lookup
      const parentOfertasMap = new Map((parentOfertas || []).map(po => [po.id, po] as [number, typeof po]));

      // Get offer IDs to fetch related data
      const ofertaIds = cuentas.map(c => c.id_oferta).filter(id => id !== null);

      // Get ofertas with properties and products
      const { data: ofertas, error: ofertasError } = ofertaIds.length > 0 ? await supabase
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
            id_edificio_modelo
          )
        `)
        .in('id', ofertaIds) : { data: [], error: null };

      if (ofertasError) {
        console.error('Error fetching ofertas:', ofertasError);
        return [];
      }

      // Get compradores
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza,
          porcentaje_copropiedad,
          id_persona,
          personas!compradores_id_persona_fkey(id, nombre_legal, rfc)
        `)
        .in('id_cuenta_cobranza', cuentas.map(c => c.id));

      // Get todos los residentes (activos e inactivos)
      const { data: residentes } = await (supabase as any)
        .from('residentes')
        .select(`
          id_cuenta_cobranza,
          id_persona,
          activo,
          personas!residentes_id_persona_fkey(id, nombre_legal)
        `)
        .in('id_cuenta_cobranza', cuentas.map(c => c.id));

      // Get entidades relacionadas, proyectos, edificios, modelos, productos
      // Include both maintenance account ofertas AND parent ofertas
      const entidadIds = [
        ...(ofertas?.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || []),
        ...(parentOfertas?.map(po => po.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || [])
      ];
      const edificioModeloIds = [
        ...(ofertas?.map(o => o.propiedades?.id_edificio_modelo).filter(Boolean) || []),
        ...(parentOfertas?.map(po => po.propiedades?.id_edificio_modelo).filter(Boolean) || [])
      ];
      const productoIds = ofertas?.map(o => o.id_producto).filter(Boolean) || [];

      // Get productos_servicios data 
      let productosData: any[] = [];
      let entidadesProductosMap: Map<number, number> = new Map(); // id_entidad -> id_proyecto
      let proyectosProductosData: any[] = [];
      
      if (productoIds.length > 0) {
        const { data: productos } = await supabase
          .from('productos_servicios')
          .select('id, nombre, id_entidad_relacionada_dueno')
          .in('id', productoIds);
        
        productosData = productos || [];
        
        if (productosData.length > 0) {
          const entidadIdsProductos = productosData
            .map(p => p.id_entidad_relacionada_dueno)
            .filter(Boolean);
          
          if (entidadIdsProductos.length > 0) {
            const { data: entidadesProductos } = await supabase
              .from('entidades_relacionadas')
              .select('id, id_proyecto')
              .in('id', entidadIdsProductos);
            
            // Create a map for quick lookup
            entidadesProductos?.forEach(e => {
              entidadesProductosMap.set(e.id, e.id_proyecto);
            });
            
            const proyectoIdsProductos = entidadesProductos
              ?.map(e => e.id_proyecto)
              .filter(Boolean) || [];
              
            if (proyectoIdsProductos.length > 0) {
              const { data: proyectos } = await supabase
                .from('proyectos')
                .select('id, id_tipo_uso')
                .in('id', proyectoIdsProductos);
              
              proyectosProductosData = proyectos || [];
            }
          }
        }
      }

      const [entidadesResult, edificiosModelosResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
            id,
            personas!fk_entrel_persona(nombre_legal),
            proyectos!entidades_relacionadas_id_proyecto_fkey(
              nombre,
              id_tipo_uso
            )
          `)
          .in('id', entidadIds),
        supabase
          .from('edificios_modelos')
          .select(`
            id,
            edificios!edificios_modelos_id_edificio_fkey(nombre),
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `)
          .in('id', edificioModeloIds)
      ]);

      // Get complementos (bodegas, estacionamientos, productos) for each property
      const propiedadIds = parentOfertas?.map(po => po.propiedades?.id).filter(Boolean) || [];
      
      // Get bodegas
      const { data: bodegasData } = propiedadIds.length > 0 ? await supabase
        .from('bodegas')
        .select('id_propiedad, nombre, m2, ubicacion, es_incluido')
        .in('id_propiedad', propiedadIds)
        .eq('activo', true) : { data: [] };

      // Get estacionamientos with tipo
      const { data: estacionamientosData } = propiedadIds.length > 0 ? await supabase
        .from('estacionamientos')
        .select(`
          id_propiedad, 
          nombre, 
          m2, 
          ubicacion, 
          es_incluido,
          tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre)
        `)
        .in('id_propiedad', propiedadIds)
        .eq('activo', true) : { data: [] };

      // Get productos (condensadoras, etc.) - productos adicionales comprados via ofertas
      const ofertasProductosIds = parentOfertaIds;
      const { data: ofertasProductos } = ofertasProductosIds.length > 0 ? await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          id_producto,
          productos_servicios!ofertas_id_producto_fkey(
            id,
            nombre,
            precio_lista,
            categorias_producto!productos_servicios_id_categoria_fkey(nombre)
          )
        `)
        .in('id', ofertasProductosIds)
        .not('id_producto', 'is', null) : { data: [] };

      // Create maps for complementos by propiedad
      const bodegasPorPropiedad = (bodegasData || []).reduce((acc: Record<number, any[]>, b) => {
        if (!acc[b.id_propiedad]) acc[b.id_propiedad] = [];
        acc[b.id_propiedad].push(b);
        return acc;
      }, {});

      const estacionamientosPorPropiedad = (estacionamientosData || []).reduce((acc: Record<number, any[]>, e) => {
        if (!acc[e.id_propiedad]) acc[e.id_propiedad] = [];
        acc[e.id_propiedad].push(e);
        return acc;
      }, {});

      const productosPorPropiedad = (ofertasProductos || []).reduce((acc: Record<number, any[]>, o) => {
        if (o.id_propiedad && o.productos_servicios) {
          if (!acc[o.id_propiedad]) acc[o.id_propiedad] = [];
          // Solo incluir bodegas, estacionamientos y otros productos (no mostrar productos que ya están en las tablas específicas)
          const categoria = o.productos_servicios.categorias_producto?.nombre;
          if (categoria && !['Bodega', 'Estacionamiento'].includes(categoria)) {
            acc[o.id_propiedad].push(o.productos_servicios);
          }
        }
        return acc;
      }, {});

      // Transform the data
      const transformedData: CuentaCobranza[] = cuentas.map(cuenta => {
        // Get parent cuenta and its oferta (for proyecto, propiedad, modelo, clave_catastral)
        const parentCuenta = cuenta.id_cuenta_cobranza_padre ? parentCuentasMap.get(cuenta.id_cuenta_cobranza_padre) : null;
        const parentOferta = parentCuenta?.id_oferta ? parentOfertasMap.get(parentCuenta.id_oferta) : null;
        const parentPropiedad = parentOferta?.propiedades;
        
        // Get parent entidad and edificioModelo for proyecto and modelo
        const entidad = entidadesResult.data?.find(e => e.id === parentPropiedad?.id_entidad_relacionada_dueno);
        const edificioModelo = edificiosModelosResult.data?.find(em => em.id === parentPropiedad?.id_edificio_modelo);
        const cuentaCompradores = compradores?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];
        const cuentaResidentes = residentes?.filter(r => r.id_cuenta_cobranza === cuenta.id) || [];
        
        // Get clave_catastral from parent cuenta
        const claveCatastral = parentCuenta?.clave_catastral || null;
        
        // Get maintenance account's own oferta (still needed for tipo determination)
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        
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
        const totalMensual = totalMensualPorCuenta[cuenta.id] || 0;
        const multasMonto = montosMultasPorCuenta[cuenta.id] || 0;
        const precio_final = totalMensual + multasMonto; // Total mensual incluye acuerdos + multas
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
        const pagadoEfectivo = tipo === 'Propiedad' ? (pagadoEfectivoPorCuenta[cuenta.id] || 0) : 0;
        let restanteEfectivo = limiteEfectivo - pagadoEfectivo;
        restanteEfectivo = Math.round(restanteEfectivo * 100) / 100;
        if (Math.abs(restanteEfectivo) < 0.01) {
          restanteEfectivo = 0;
        }
        restanteEfectivo = +restanteEfectivo.toFixed(2);
        const porcentajeEfectivo = limiteEfectivo > 0 ? (pagadoEfectivo / limiteEfectivo) * 100 : 0;

        return {
          id: cuenta.id,
          tipo,
          producto_nombre: productoNombre,
          clabe_stp: cuenta.clabe_stp,
          precio_final,
          precio_lista: parentPropiedad?.precio_lista || null,
          pagado,
          restante,
          cash_limit: limiteEfectivo,
          cash_paid: pagadoEfectivo,
          cash_remaining: restanteEfectivo,
          cash_percentage: porcentajeEfectivo,
          cash_payments: tipo === 'Propiedad' ? (pagosCashPorCuenta[cuenta.id] || []) : [],
          compradores: cuentaCompradores.map(c => ({
            nombre_legal: c.personas?.nombre_legal || '',
            rfc: c.personas?.rfc || null,
            porcentaje_copropiedad: c.porcentaje_copropiedad || 0,
            id_persona: c.id_persona
          })).filter(c => c.nombre_legal),
          residentes: cuentaResidentes.map(r => ({
            id_persona: r.id_persona,
            nombre_legal: r.personas?.nombre_legal || 'Sin nombre',
            activo: r.activo
          })),
          dueno: entidad?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: parentPropiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo',
          clave_catastral: claveCatastral,
          activo: cuenta.activo,
          id_oferta: cuenta.id_oferta,
          motivo_cancelacion: (cuenta as any).tipos_cancelacion?.nombre || null,
          apartado_pagado: apartadoPagadoPorCuenta[cuenta.id],
          tiene_acuerdos: tieneAcuerdosPorCuenta[cuenta.id],
          tiene_multas_pendientes: multasPendientesPorCuenta[cuenta.id] || false,
          id_propiedad: parentPropiedad?.id,
          proxima_fecha_pago: proximaFechaPagoPorCuenta[cuenta.id] || null,
          bodegas: parentPropiedad?.id ? (bodegasPorPropiedad[parentPropiedad.id] || []).map((b: any) => ({
            nombre: b.nombre,
            m2: b.m2,
            ubicacion: b.ubicacion,
            es_incluido: b.es_incluido
          })) : [],
          estacionamientos: parentPropiedad?.id ? (estacionamientosPorPropiedad[parentPropiedad.id] || []).map((e: any) => ({
            nombre: e.nombre,
            tipo: e.tipos_estacionamiento?.nombre || 'Sin tipo',
            m2: e.m2,
            ubicacion: e.ubicacion,
            es_incluido: e.es_incluido
          })) : [],
          productos: parentPropiedad?.id ? (productosPorPropiedad[parentPropiedad.id] || []).map((p: any) => ({
            nombre: p.nombre,
            categoria: p.categorias_producto?.nombre || 'Sin categoría',
            precio: p.precio_lista || 0
          })) : []
        };
      });

      return transformedData.sort((a, b) => b.id - a.id);
    },
  });

  // Refocus search input after loading completes
  useEffect(() => {
    if (!isLoading && inputValue && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isLoading, inputValue]);

  // Filter only active maintenance accounts
  const cuentasToFilter = cuentasCobranza?.filter(c => c.activo) || [];
  
  const filteredCuentas = cuentasToFilter.filter(cuenta => {
    // Filter by search term
    const matchesSearch = searchTerm === "" || (
      cuenta.id.toString().includes(searchTerm) ||
      cuenta.compradores.some(c => c.nombre_legal.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.rfc?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      cuenta.dueno.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.clabe_stp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.edificio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.precio_final.toString().includes(searchTerm)
    );
    
    // Apply individual filters
    const formattedId = formatCuentaMantenimientoId(cuenta.id);
    const filterValue = idCuentaFilter.toLowerCase().replace('cm-', '');
    const matchesIdCuenta = idCuentaFilter === "" || 
      formattedId.toLowerCase().includes(idCuentaFilter.toLowerCase()) ||
      cuenta.id.toString().includes(filterValue);
    const matchesPropietarios = propietariosFilter === "" || cuenta.compradores.some(c => 
      c.nombre_legal.toLowerCase().includes(propietariosFilter.toLowerCase()) || 
      c.rfc?.toLowerCase().includes(propietariosFilter.toLowerCase())
    );
    const matchesClabe = clabeFilter === "" || cuenta.clabe_stp?.toLowerCase().includes(clabeFilter.toLowerCase());
    const matchesProyecto = proyectoFilter === "" || cuenta.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
    const matchesNoPropiedad = noPropiedadFilter === "" || cuenta.numero_propiedad.toLowerCase().includes(noPropiedadFilter.toLowerCase());
    const matchesModelo = modeloFilter === "" || cuenta.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
    
    return matchesSearch && matchesIdCuenta && matchesPropietarios && 
           matchesClabe && matchesProyecto && matchesNoPropiedad && matchesModelo;
  });

  const clearFilters = () => {
    setIdCuentaFilter("");
    setPropietariosFilter("");
    setClabeFilter("");
    setProyectoFilter("");
    setNoPropiedadFilter("");
    setModeloFilter("");
    setSearchTerm("");
    setInputValue("");
  };

  const hasActiveFilters = idCuentaFilter || propietariosFilter || 
                          clabeFilter || proyectoFilter || noPropiedadFilter || 
                          modeloFilter || searchTerm;

  // Pagination logic
  const totalFilteredCount = filteredCuentas.length;
  const totalPages = Math.ceil(totalFilteredCount / itemsPerPage);
  const paginatedCuentas = filteredCuentas.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Helper function to generate pagination items with ellipsis
  const getPaginationItems = (currentPage: number, totalPages: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    items.push(1);

    let rangeStart = Math.max(2, currentPage - 1);
    let rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    if (currentPage <= 3) {
      rangeEnd = Math.min(4, totalPages - 1);
    }
    if (currentPage >= totalPages - 2) {
      rangeStart = Math.max(totalPages - 3, 2);
    }

    if (rangeStart > 2) {
      items.push('ellipsis');
    }

    for (let i = rangeStart; i <= rangeEnd; i++) {
      items.push(i);
    }

    if (rangeEnd < totalPages - 1) {
      items.push('ellipsis');
    }

    if (totalPages > 1) {
      items.push(totalPages);
    }
    return items;
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} 
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} 
              />
            </PaginationItem>
            {getPaginationItems(currentPage, totalPages).map((item, index) => 
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink 
                    onClick={() => setCurrentPage(item as number)} 
                    isActive={currentPage === item} 
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} 
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} 
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
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

  const handleEditCuenta = (cuenta: CuentaCobranza) => {
    setEditDialog({ isOpen: true, cuenta });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-lg text-muted-foreground">Cargando cuentas de mantenimiento...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas de Mantenimientos</h1>
          <p className="text-muted-foreground">
            Gestiona todas las cuentas de mantenimiento ({filteredCuentas.length})
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Buscar por ID, propietario, RFC, CLABE, proyecto, propiedad..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-8"
              />
            </div>
            
            {/* Filters grid - always visible */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <Label htmlFor="filter-id" className="text-sm font-medium mb-2 block">ID Cuenta</Label>
                <Input
                  id="filter-id"
                  placeholder="Filtrar por ID..."
                  value={idCuentaFilter}
                  onChange={(e) => setIdCuentaFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-propietarios" className="text-sm font-medium mb-2 block">Propietarios</Label>
                <Input
                  id="filter-propietarios"
                  placeholder="Filtrar por propietario..."
                  value={propietariosFilter}
                  onChange={(e) => setPropietariosFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-clabe" className="text-sm font-medium mb-2 block">CLABE STP</Label>
                <Input
                  id="filter-clabe"
                  placeholder="Filtrar por CLABE..."
                  value={clabeFilter}
                  onChange={(e) => setClabeFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-proyecto" className="text-sm font-medium mb-2 block">Proyecto</Label>
                <Input
                  id="filter-proyecto"
                  placeholder="Filtrar por proyecto..."
                  value={proyectoFilter}
                  onChange={(e) => setProyectoFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-propiedad" className="text-sm font-medium mb-2 block">No. Propiedad</Label>
                <Input
                  id="filter-propiedad"
                  placeholder="Filtrar por propiedad..."
                  value={noPropiedadFilter}
                  onChange={(e) => setNoPropiedadFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-modelo" className="text-sm font-medium mb-2 block">Modelo</Label>
                <Input
                  id="filter-modelo"
                  placeholder="Filtrar por modelo..."
                  value={modeloFilter}
                  onChange={(e) => setModeloFilter(e.target.value)}
                />
              </div>
            </div>
            
            {/* Clear filters button */}
            <div className="flex justify-end">
              <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtered count display */}
          <div className="mb-4 text-sm text-muted-foreground">
            Mostrando <span className="font-semibold text-foreground">{paginatedCuentas.length}</span> de <span className="font-semibold text-foreground">{filteredCuentas.length}</span> cuentas
          </div>
          
          <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">ID</TableHead>
                      <TableHead>Propietarios</TableHead>
                      <TableHead>Residente</TableHead>
                      <TableHead>CLABE STP</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Clave Catastral</TableHead>
                      <TableHead className="text-right">Total Mensual</TableHead>
                      <TableHead className="text-right">Total Pagado</TableHead>
                      <TableHead className="text-right">Saldo Pendiente</TableHead>
                      <TableHead>Próxima Fecha de Pago</TableHead>
                      <TableHead className="text-center">Complementos</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCuentas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                          {hasActiveFilters ? "No se encontraron cuentas que coincidan con los filtros" : "No hay cuentas de mantenimiento"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedCuentas.map((cuenta) => (
                        <TableRow key={cuenta.id}>
                          <TableCell className="font-medium">
                            {formatCuentaMantenimientoId(cuenta.id)}
                          </TableCell>
                          <TableCell>
                            {cuenta.compradores.length > 0 ? (
                              cuenta.compradores.length > 1 ? (
                                <CompradoresDetailDialog 
                                  compradores={cuenta.compradores} 
                                  label="propietarios"
                                />
                              ) : (
                                <div className="space-y-1">
                                  <Badge 
                                    variant="secondary" 
                                    className="block w-fit"
                                  >
                                    {cuenta.compradores[0].nombre_legal}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                    <br />
                                    {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                  </div>
                                </div>
                              )
                            ) : (
                              <span className="text-muted-foreground">Sin propietarios</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => cuenta.residentes.length > 0 && setResidentesDialog({ isOpen: true, residentes: cuenta.residentes })}
                                      disabled={cuenta.residentes.length === 0}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{cuenta.residentes.length > 0 ? "Ver detalle de residentes" : "Sin asignar"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                          <TableCell 
                            className="font-mono text-xs cursor-pointer hover:bg-secondary/50 transition-colors"
                            onClick={() => {
                              if (cuenta.clabe_stp) {
                                navigator.clipboard.writeText(cuenta.clabe_stp);
                                toast({
                                  title: "CLABE STP copiada",
                                  description: "La CLABE STP se ha copiado al portapapeles",
                                });
                              }
                            }}
                          >
                            {cuenta.clabe_stp || '-'}
                          </TableCell>
                          <TableCell>{cuenta.proyecto}</TableCell>
                          <TableCell>{cuenta.numero_propiedad}</TableCell>
                          <TableCell>{cuenta.modelo}</TableCell>
                          <TableCell>
                            {cuenta.clave_catastral || '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ${cuenta.pagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-medium text-orange-600">
                            ${normalizarSaldo(cuenta.restante) > 0 
                              ? normalizarSaldo(cuenta.restante).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : normalizarSaldo(cuenta.restante) < 0
                                ? Math.abs(normalizarSaldo(cuenta.restante)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '0.00'
                            }
                          </TableCell>
                          <TableCell>
                            {cuenta.proxima_fecha_pago ? (
                              <Badge variant="outline">
                                {(() => {
                                  // Parse fecha como local, no UTC
                                  const [year, month, day] = cuenta.proxima_fecha_pago.split('-').map(Number);
                                  const fecha = new Date(year, month - 1, day);
                                  return fecha.toLocaleDateString('es-MX', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  });
                                })()}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setComplementosDialog({ isOpen: true, cuenta })}
                                    >
                                      <Package className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver complementos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                           <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link to={`/admin/cuentas-mantenimiento/${cuenta.id}/detalle`}>
                                      <Button variant="ghost" size="icon">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver detalle</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setAddResidenteDialog({ isOpen: true, cuenta })}
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Asignar residente</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
          
          {/* Pagination */}
          {renderPagination()}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {complementosDialog.isOpen && complementosDialog.cuenta && (
        <ComplementosDetailDialog
          open={complementosDialog.isOpen}
          onClose={() => setComplementosDialog({ isOpen: false, cuenta: null })}
          bodegas={complementosDialog.cuenta.bodegas || []}
          estacionamientos={complementosDialog.cuenta.estacionamientos || []}
          productos={complementosDialog.cuenta.productos || []}
          propertyNumber={complementosDialog.cuenta.numero_propiedad}
        />
      )}

      {addResidenteDialog.isOpen && addResidenteDialog.cuenta && (
        <AddResidenteDialog
          open={addResidenteDialog.isOpen}
          onOpenChange={(open) => setAddResidenteDialog({ isOpen: open, cuenta: null })}
          cuentaMantenimientoId={addResidenteDialog.cuenta.id}
          compradores={addResidenteDialog.cuenta.compradores.filter(c => c.id_persona !== undefined).map(c => ({
            id_persona: c.id_persona!,
            nombre_legal: c.nombre_legal,
            porcentaje_copropiedad: c.porcentaje_copropiedad
          }))}
        />
      )}

      <ResidentesDetailDialog
        residentes={residentesDialog.residentes}
        open={residentesDialog.isOpen}
        onOpenChange={(open) => setResidentesDialog({ isOpen: open, residentes: [] })}
      />

      {/* Dialog de pago manual */}
    </div>
  );
}
