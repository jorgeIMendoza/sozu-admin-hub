import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, Eye, X, Edit, Plus, Download, Loader2, Filter, TrendingUp, TrendingDown, Equal, AlertCircle, DollarSign, CheckCircle, FileText, Receipt, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { CompradoresDetailDialog } from "@/components/admin/CompradoresDetailDialog";
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { TransferMoneyDialog } from "@/components/admin/TransferMoneyDialog";
import { CashPaymentDetailDialog } from "@/components/admin/CashPaymentDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { EstadoCuentaService } from "@/services/estadoCuentaService";

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
}

export default function CuentasMantenimiento() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTipos, setSelectedTipos] = useState<Array<'Propiedad' | 'Producto' | 'Servicio'>>(['Propiedad', 'Producto', 'Servicio']);
  
  // Filter states
  const [idCuentaFilter, setIdCuentaFilter] = useState("");
  const [productoFilter, setProductoFilter] = useState("");
  const [compradoresFilter, setCompradoresFilter] = useState("");
  const [clabeFilter, setClabeFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [noPropiedadFilter, setNoPropiedadFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [editDialog, setEditDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [loadingDownload, setLoadingDownload] = useState<number | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [transferDialog, setTransferDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [cashDialog, setCashDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [isGeneratingEstadoCuenta, setIsGeneratingEstadoCuenta] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
          tipos_cancelacion:id_tipo_cancelacion(nombre)
        `)
        .not('id_cuenta_cobranza_padre', 'is', null);

      if (cuentasError) {
        console.error('Error fetching cuentas:', cuentasError);
        return [];
      }

      if (!cuentas || cuentas.length === 0) return [];

      // Get all payment amounts for each account using aplicaciones_pago
      const cuentaIds = cuentas.map(c => c.id);
      console.log('Cuenta IDs:', cuentaIds);
      
      // First get all acuerdos for these cuentas
      const { data: acuerdosForPagos } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      const acuerdoIdsForPagos = acuerdosForPagos?.map(a => a.id) || [];
      
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
      
      console.log('Pagado por cuenta:', pagadoPorCuenta);

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

      // Get acuerdos_pago to check if "Apartado" or "Enganche" is paid
      const { data: acuerdosPago } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza, id_concepto, pago_completado')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      console.log('🔍 Acuerdos de pago:', acuerdosPago);

      // Get aplicaciones_pago para verificar si hay pagos de cesión de derechos
      const acuerdoIds = acuerdosPago?.map(a => a.id) || [];
      let cesionDerechosMap: Record<number, boolean> = {};
      
      if (acuerdoIds.length > 0) {
        const { data: aplicaciones } = await supabase
          .from('aplicaciones_pago')
          .select('id_acuerdo_pago, monto')
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true);

        // Crear mapeo de acuerdo_id a concepto_id y cuenta_id
        const acuerdosMap = acuerdosPago?.reduce((acc: any, a) => {
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

      // Create a map of whether initial payment is made for each cuenta
      const apartadoPagadoPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const esProducto = cuentasProductoSet.has(cuenta.id);
        
        if (esProducto) {
          // Para productos, el pago inicial es el Enganche (id_concepto = 2)
          const acuerdoEnganche = acuerdosPago?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 2
          );
          acc[cuenta.id] = acuerdoEnganche?.pago_completado || false;
          console.log(`💰 Cuenta ${cuenta.id} [PRODUCTO]: enganche_pagado = ${acc[cuenta.id]}`);
        } else {
          // Para propiedades, el pago inicial es Apartado (id_concepto = 1) o Cesión de derechos (id_concepto = 6)
          const acuerdoApartado = acuerdosPago?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 1
          );
          acc[cuenta.id] = (acuerdoApartado?.pago_completado || false) || (cesionDerechosMap[cuenta.id] || false);
          console.log(`💰 Cuenta ${cuenta.id} [PROPIEDAD]: apartado_pagado = ${acc[cuenta.id]} (apartado: ${acuerdoApartado?.pago_completado}, cesión: ${cesionDerechosMap[cuenta.id]})`);
        }
        
        return acc;
      }, {});

      // Create a map to check if each cuenta has acuerdos
      const tieneAcuerdosPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const tieneAcuerdos = acuerdosPago?.some(ap => ap.id_cuenta_cobranza === cuenta.id) || false;
        acc[cuenta.id] = tieneAcuerdos;
        return acc;
      }, {});

      // Get multas pendientes para cada cuenta
      const acuerdoIdsForMultas = acuerdosPago?.map(ap => ap.id) || [];
      let multasPendientesPorCuenta: Record<number, boolean> = {};
      
      if (acuerdoIdsForMultas.length > 0) {
        const { data: multas } = await supabase
          .from('multas')
          .select('id, id_acuerdo_pago, es_pagada')
          .in('id_acuerdo_pago', acuerdoIdsForMultas)
          .eq('activo', true)
          .eq('es_pagada', false);

        // Crear un mapa de acuerdo_id a cuenta_id
        const acuerdoToCuentaMap = acuerdosPago?.reduce((acc: any, ap) => {
          acc[ap.id] = ap.id_cuenta_cobranza;
          return acc;
        }, {});

        // Marcar qué cuentas tienen multas pendientes
        multas?.forEach(multa => {
          const cuentaId = acuerdoToCuentaMap[multa.id_acuerdo_pago];
          if (cuentaId) {
            multasPendientesPorCuenta[cuentaId] = true;
          }
        });

        console.log('🔍 Cuentas con multas pendientes:', multasPendientesPorCuenta);
      }

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

      // Get entidades relacionadas, proyectos, edificios, modelos, productos
      const entidadIds = ofertas?.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const edificioModeloIds = ofertas?.map(o => o.propiedades?.id_edificio_modelo).filter(Boolean) || [];
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

      // Transform the data
      const transformedData: CuentaCobranza[] = cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const entidad = entidadesResult.data?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const edificioModelo = edificiosModelosResult.data?.find(em => em.id === propiedad?.id_edificio_modelo);
        const cuentaCompradores = compradores?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];
        
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
          precio_lista: propiedad?.precio_lista || null,
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
          tiene_multas_pendientes: multasPendientesPorCuenta[cuenta.id] || false
        };
      });

      return transformedData.sort((a, b) => b.id - a.id);
    },
  });

  // Filter only active maintenance accounts
  const cuentasToFilter = cuentasCobranza?.filter(c => c.activo) || [];
  
  const filteredCuentas = cuentasToFilter.filter(cuenta => {
    // Filter by tipo
    if (!selectedTipos.includes(cuenta.tipo)) {
      return false;
    }
    
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
      cuenta.producto_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.precio_final.toString().includes(searchTerm)
    );
    
    // Apply individual filters
    const matchesIdCuenta = idCuentaFilter === "" || cuenta.id.toString().includes(idCuentaFilter);
    const matchesProducto = productoFilter === "" || cuenta.producto_nombre?.toLowerCase().includes(productoFilter.toLowerCase());
    const matchesCompradores = compradoresFilter === "" || cuenta.compradores.some(c => 
      c.nombre_legal.toLowerCase().includes(compradoresFilter.toLowerCase()) || 
      c.rfc?.toLowerCase().includes(compradoresFilter.toLowerCase())
    );
    const matchesClabe = clabeFilter === "" || cuenta.clabe_stp?.toLowerCase().includes(clabeFilter.toLowerCase());
    const matchesProyecto = proyectoFilter === "" || cuenta.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
    const matchesNoPropiedad = noPropiedadFilter === "" || cuenta.numero_propiedad.toLowerCase().includes(noPropiedadFilter.toLowerCase());
    const matchesModelo = modeloFilter === "" || cuenta.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
    
    return matchesSearch && matchesIdCuenta && matchesProducto && matchesCompradores && 
           matchesClabe && matchesProyecto && matchesNoPropiedad && matchesModelo;
  });

  const clearFilters = () => {
    setIdCuentaFilter("");
    setProductoFilter("");
    setCompradoresFilter("");
    setClabeFilter("");
    setProyectoFilter("");
    setNoPropiedadFilter("");
    setModeloFilter("");
    setSearchTerm("");
  };

  const hasActiveFilters = idCuentaFilter || productoFilter || compradoresFilter || 
                          clabeFilter || proyectoFilter || noPropiedadFilter || 
                          modeloFilter || searchTerm;

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

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por ID, comprador, RFC, CLABE, proyecto, propiedad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* Tipo Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Tipo ({selectedTipos.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Filtrar por tipo</h4>
              <div className="space-y-2">
                {(['Propiedad', 'Producto', 'Servicio'] as const).map((tipo) => (
                  <div key={tipo} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tipo-${tipo}`}
                      checked={selectedTipos.includes(tipo)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTipos([...selectedTipos, tipo]);
                        } else {
                          setSelectedTipos(selectedTipos.filter(t => t !== tipo));
                        }
                      }}
                    />
                    <Label htmlFor={`tipo-${tipo}`} className="text-sm font-normal cursor-pointer">
                      {tipo}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Advanced Filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros avanzados
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filtros</h4>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="filter-id">ID Cuenta</Label>
                  <Input
                    id="filter-id"
                    placeholder="Buscar por ID..."
                    value={idCuentaFilter}
                    onChange={(e) => setIdCuentaFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-producto">Producto</Label>
                  <Input
                    id="filter-producto"
                    placeholder="Buscar por producto..."
                    value={productoFilter}
                    onChange={(e) => setProductoFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-compradores">Compradores</Label>
                  <Input
                    id="filter-compradores"
                    placeholder="Buscar por comprador..."
                    value={compradoresFilter}
                    onChange={(e) => setCompradoresFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-clabe">CLABE STP</Label>
                  <Input
                    id="filter-clabe"
                    placeholder="Buscar por CLABE..."
                    value={clabeFilter}
                    onChange={(e) => setClabeFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-proyecto">Proyecto</Label>
                  <Input
                    id="filter-proyecto"
                    placeholder="Buscar por proyecto..."
                    value={proyectoFilter}
                    onChange={(e) => setProyectoFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-propiedad">No. Propiedad</Label>
                  <Input
                    id="filter-propiedad"
                    placeholder="Buscar por no. propiedad..."
                    value={noPropiedadFilter}
                    onChange={(e) => setNoPropiedadFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-modelo">Modelo</Label>
                  <Input
                    id="filter-modelo"
                    placeholder="Buscar por modelo..."
                    value={modeloFilter}
                    onChange={(e) => setModeloFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">ID</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Producto/Servicio</TableHead>
                      <TableHead>Propietarios</TableHead>
                      <TableHead>CLABE STP</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Precio Final</TableHead>
                      <TableHead className="text-right">Pagado</TableHead>
                      <TableHead className="text-right">Restante</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                          No se encontraron cuentas de mantenimiento
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCuentas.map((cuenta) => (
                        <TableRow key={cuenta.id}>
                          <TableCell className="font-medium">
                            {formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              cuenta.tipo === 'Propiedad' ? 'default' :
                              cuenta.tipo === 'Producto' ? 'secondary' :
                              'outline'
                            }>
                              {cuenta.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cuenta.producto_nombre || '-'}
                          </TableCell>
                          <TableCell>
                            {cuenta.compradores.length > 0 ? (
                              cuenta.compradores.length > 1 ? (
                                <CompradoresDetailDialog compradores={cuenta.compradores} />
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
                          <TableCell className="font-mono text-xs">
                            {cuenta.clabe_stp || '-'}
                          </TableCell>
                          <TableCell>{cuenta.proyecto}</TableCell>
                          <TableCell>{cuenta.numero_propiedad}</TableCell>
                          <TableCell>{cuenta.modelo}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            ${cuenta.pagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {normalizarSaldo(cuenta.restante) > 0 ? (
                                <>
                                  <TrendingDown className="h-4 w-4 text-red-500" />
                                  <span className="text-red-600 font-medium">
                                    ${normalizarSaldo(cuenta.restante).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </>
                              ) : normalizarSaldo(cuenta.restante) < 0 ? (
                                <>
                                  <TrendingUp className="h-4 w-4 text-orange-500" />
                                  <span className="text-orange-600 font-medium">
                                    ${Math.abs(normalizarSaldo(cuenta.restante)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-green-600 font-medium">
                                    $0.00
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
