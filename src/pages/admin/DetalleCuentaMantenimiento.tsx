import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign, CalendarDays, ChevronDown, ChevronUp, Home, ArrowRight, Plus, Calendar, Upload, Loader2, Eye, Download, RefreshCw } from "lucide-react";
import { EstadoCuentaMantenimientoEdgeFunctionService } from "@/services/estadoCuentaMantenimientoEdgeFunctionService";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TransferPaymentDialog } from "@/components/admin/TransferPaymentDialog";
import { NewMultaMantenimientoDialog } from "@/components/admin/NewMultaMantenimientoDialog";
import { NewReservaDialog } from "@/components/admin/NewReservaDialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago: string | null;
  pago_completado: boolean;
  concepto: string;
  id_concepto?: number;
  espacio_reserva?: string;
  aplicaciones: AplicacionPago[];
}

interface AplicacionPago {
  id: number;
  monto: number;
  fecha_creacion: string;
  pago: {
    id: number;
    fecha_pago: string;
    monto: number;
    metodo_pago: string;
    id_metodos_pago: number;
    clave_rastreo: string | null;
  };
}

interface Propietario {
  id_persona?: number;
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
}

interface CuentaDetalle {
  id: number;
  precio_final: number;
  propietarios: Propietario[];
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  proyecto_id: number;
  id_cuenta_cobranza_padre: number | null;
  clabe_stp: string | null;
  monto_mensual_cuota_extraordinaria: number | null;
  proyecto_nombre: string;
  m2_exteriores: number | null;
  costo_mantenimiento_m2: number | null;
}

export default function DetalleCuentaMantenimiento() {
  const { id } = useParams<{ id: string }>();
  const cuentaId = parseInt(id || '0');
  const [openAcuerdos, setOpenAcuerdos] = useState<{ [key: number]: boolean }>({});
  const [transferDialog, setTransferDialog] = useState<{ isOpen: boolean }>({ isOpen: false });
  const [propietariosOpen, setPropietariosOpen] = useState(false);
  const [visibleAcuerdos, setVisibleAcuerdos] = useState(5);
  const [multaDialog, setMultaDialog] = useState(false);
  const [reservaDialog, setReservaDialog] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState<number | null>(null);
  const [generatingEstadoCuenta, setGeneratingEstadoCuenta] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarSubidaDocumento } = useActivityLogger();

  const { data: cuentaDetalle, isLoading: cuentaLoading } = useQuery({
    queryKey: ["cuenta_mantenimiento_detalle", cuentaId],
    queryFn: async () => {
      // Get cuenta mantenimiento (stored in cuentas_cobranza with id_cuenta_cobranza_padre not null)
      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('id, precio_final, id_cuenta_cobranza_padre, clabe_stp')
        .eq('id', cuentaId)
        .not('id_cuenta_cobranza_padre', 'is', null)
        .maybeSingle();

      if (cuentaError) throw cuentaError;
      if (!cuenta) throw new Error('Cuenta de mantenimiento no encontrada');

      // Get parent account to retrieve property data
      const { data: parentCuenta } = cuenta.id_cuenta_cobranza_padre 
        ? await supabase
            .from('cuentas_cobranza')
            .select('id, id_oferta')
            .eq('id', cuenta.id_cuenta_cobranza_padre)
            .maybeSingle()
        : { data: null };

      // Get oferta and propiedad data from parent account
      const { data: oferta } = parentCuenta?.id_oferta 
        ? await supabase
            .from('ofertas')
            .select(`
              id,
              propiedades!ofertas_id_propiedad_fkey(
                id,
                numero_propiedad,
                m2_interiores,
                m2_exteriores,
                id_entidad_relacionada_dueno,
                id_edificio_modelo
              )
            `)
            .eq('id', parentCuenta.id_oferta)
            .maybeSingle()
        : { data: null };


      // Get propietarios (from parent cuenta_cobranza if exists)
      let propietarios: Propietario[] = [];
      if (cuenta.id_cuenta_cobranza_padre) {
        const { data: compradores } = await supabase
          .from('compradores')
          .select(`
            id_persona,
            porcentaje_copropiedad,
            personas!compradores_id_persona_fkey(id, nombre_legal, rfc)
          `)
          .eq('id_cuenta_cobranza', cuenta.id_cuenta_cobranza_padre)
          .eq('activo', true);

        propietarios = compradores?.map(c => ({
          id_persona: c.personas?.id,
          nombre_legal: c.personas?.nombre_legal || '',
          rfc: c.personas?.rfc || null,
          porcentaje_copropiedad: c.porcentaje_copropiedad || 0
        })).filter(c => c.nombre_legal) || [];
      }

      // Fetch proyecto info from cuenta padre
      let proyectoNombre = 'Sin proyecto';
      let porcentajeAnual = null;
      let costoMantenimientoM2 = null;
      
      if (cuenta.id_cuenta_cobranza_padre) {
        // Get oferta from cuenta padre
        const { data: cuentaPadre } = await supabase
          .from('cuentas_cobranza')
          .select('id_oferta')
          .eq('id', cuenta.id_cuenta_cobranza_padre)
          .maybeSingle();

        if (cuentaPadre?.id_oferta) {
          // Get propiedad from oferta
          const { data: ofertaData } = await supabase
            .from('ofertas')
            .select('id_propiedad')
            .eq('id', cuentaPadre.id_oferta)
            .maybeSingle();

          if (ofertaData?.id_propiedad) {
            // Get entidad relacionada from propiedad
            const { data: propiedadData } = await supabase
              .from('propiedades')
              .select('id_entidad_relacionada_dueno')
              .eq('id', ofertaData.id_propiedad)
              .maybeSingle();

            if (propiedadData?.id_entidad_relacionada_dueno) {
              // Get proyecto info
              const { data: entidadResult } = await supabase
                .from('entidades_relacionadas')
                .select('id_proyecto')
                .eq('id', propiedadData.id_entidad_relacionada_dueno)
                .maybeSingle();

              if (entidadResult?.id_proyecto) {
                const { data: proyectoData } = await supabase
                  .from('proyectos')
                  .select('nombre, monto_mensual_cuota_extraordinaria, costo_mantenimiento_m2')
                  .eq('id', entidadResult.id_proyecto)
                  .maybeSingle() as { data: { nombre: string; monto_mensual_cuota_extraordinaria: number; costo_mantenimiento_m2: number | null } | null };

                if (proyectoData) {
                  proyectoNombre = proyectoData.nombre || 'Sin proyecto';
                  porcentajeAnual = proyectoData.monto_mensual_cuota_extraordinaria;
                  costoMantenimientoM2 = proyectoData.costo_mantenimiento_m2;
                }
              }
            }
          }
        }
      }

      // Get building info
      const { data: edificioModeloResult } = await supabase
        .from('edificios_modelos')
        .select(`
          edificios!edificios_modelos_id_edificio_fkey(nombre),
          modelos!edificios_modelos_id_modelo_fkey(nombre)
        `)
        .eq('id', oferta?.propiedades?.id_edificio_modelo)
        .maybeSingle();

      const detalle: CuentaDetalle = {
        id: cuenta.id,
        precio_final: cuenta.precio_final || 0,
        propietarios,
        proyecto: proyectoNombre,
        edificio: edificioModeloResult?.edificios?.nombre || 'Sin edificio',
        numero_propiedad: oferta?.propiedades?.numero_propiedad || 'Sin número',
        modelo: edificioModeloResult?.modelos?.nombre || 'Sin modelo',
        proyecto_id: 0,
        id_cuenta_cobranza_padre: cuenta.id_cuenta_cobranza_padre,
        clabe_stp: cuenta.clabe_stp,
        monto_mensual_cuota_extraordinaria: porcentajeAnual,
        proyecto_nombre: proyectoNombre,
        m2_exteriores: (
          (oferta?.propiedades?.m2_interiores || 0) + 
          (oferta?.propiedades?.m2_exteriores || 0)
        ) || null,
        costo_mantenimiento_m2: costoMantenimientoM2
      };

      return detalle;
    },
    enabled: !!cuentaId,
  });

  // Fetch all pagos for this cuenta
  const { data: pagosData } = useQuery({
    queryKey: ["pagos_mantenimiento", cuentaId],
    queryFn: async () => {
      const { data: pagos, error } = await supabase
        .from('pagos')
        .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago, descripcion, url_recibo, url_cep')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('fecha_pago', { ascending: true });

      if (error) throw error;

      // Get metodos_pago
      const metodoIds = [...new Set(pagos?.map(p => p.id_metodos_pago).filter((id): id is number => id !== null) || [])];
      const { data: metodos } = metodoIds.length > 0 ? await supabase
        .from('metodos_pago')
        .select('id, nombre')
        .in('id', metodoIds) : { data: [] };

      const metodosMap = new Map<number, string>();
      metodos?.forEach(m => metodosMap.set(m.id, m.nombre));

      return (pagos || []).map(p => ({
        ...p,
        metodo_pago_nombre: metodosMap.get(p.id_metodos_pago) || 'N/A'
      }));
    },
    enabled: !!cuentaId,
  });

  // Fetch aplicaciones for pagos (for the new tab)
  const { data: aplicacionesPorPago } = useQuery({
    queryKey: ["aplicaciones_por_pago", cuentaId],
    queryFn: async () => {
      if (!pagosData || pagosData.length === 0) return [];

      const pagoIds = pagosData.map(p => p.id);
      const { data: aplicaciones, error } = await supabase
        .from('aplicaciones_pago')
        .select('id, monto, id_pago, id_acuerdo_pago')
        .in('id_pago', pagoIds)
        .eq('activo', true);

      if (error) throw error;

      // Get acuerdos info
      const acuerdoIds = [...new Set(aplicaciones?.map(a => a.id_acuerdo_pago).filter((id): id is number => id !== null) || [])];
      const { data: acuerdos } = acuerdoIds.length > 0 ? await supabase
        .from('acuerdos_pago')
        .select('id, fecha_pago, monto, id_concepto')
        .in('id', acuerdoIds) : { data: [] };

      // Get conceptos
      const conceptoIds = [...new Set(acuerdos?.map(a => a.id_concepto).filter((id): id is number => id !== null) || [])];
      const { data: conceptos } = conceptoIds.length > 0 ? await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds) : { data: [] };

      const acuerdosMap = new Map<number, any>();
      acuerdos?.forEach(a => acuerdosMap.set(a.id, a));
      const conceptosMap = new Map<number, string>();
      conceptos?.forEach(c => conceptosMap.set(c.id, c.nombre));

      return (aplicaciones || []).map(ap => ({
        ...ap,
        acuerdo: acuerdosMap.get(ap.id_acuerdo_pago),
        concepto_nombre: conceptosMap.get(acuerdosMap.get(ap.id_acuerdo_pago)?.id_concepto) || 'N/A'
      }));
    },
    enabled: !!cuentaId && !!pagosData && pagosData.length > 0,
  });

  // Fetch acuerdos de pago (using regular acuerdos_pago table)
  const { data: acuerdosPago } = useQuery({
    queryKey: ["acuerdos_mantenimiento", cuentaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acuerdos_pago')
        .select('id, orden, monto, fecha_pago, pago_completado, id_concepto')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('orden', { ascending: false });

      if (error) throw error;

      // Get conceptos for the acuerdos
      const conceptoIds = [...new Set(data?.map(a => a.id_concepto).filter(id => id) || [])];
      const { data: conceptos } = conceptoIds.length > 0 ? await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds) : { data: [] };

      const conceptosMap = new Map<number, string>();
      conceptos?.forEach(c => conceptosMap.set(c.id, c.nombre));

      // Get reserva info for "Pago de reserva" (id_concepto = 14)
      const acuerdosReserva = data?.filter(a => a.id_concepto === 14) || [];
      const reservasMap = new Map<number, any>();
      
      if (acuerdosReserva.length > 0) {
        const { data: reservas } = await supabase
          .from('reservas' as any)
          .select('id_acuerdo_pago, id_espacio_reservable_edificio')
          .in('id_acuerdo_pago', acuerdosReserva.map(a => a.id))
          .eq('activo', true) as any;

        if (reservas && reservas.length > 0) {
          const espacioIds = reservas.map((r: any) => r.id_espacio_reservable_edificio).filter(Boolean);
          
          if (espacioIds.length > 0) {
            const { data: espacios } = await supabase
              .from('espacios_reservables_edificio' as any)
              .select('id, descripcion')
              .in('id', espacioIds) as any;

            const espaciosMap = new Map<number, string>();
            espacios?.forEach((e: any) => espaciosMap.set(e.id, e.descripcion || 'Sin descripción'));

            reservas?.forEach((r: any) => {
              const descripcionEspacio = espaciosMap.get(r.id_espacio_reservable_edificio);
              
              reservasMap.set(r.id_acuerdo_pago, {
                espacio_nombre: descripcionEspacio || 'N/A'
              });
            });
          }
        }
      }

      // Get aplicaciones for each acuerdo
      const acuerdosWithApps = await Promise.all(
        (data || []).map(async (acuerdo) => {
          const { data: apps } = await supabase
            .from('aplicaciones_pago')
            .select('id, monto, fecha_creacion, id_pago')
            .eq('id_acuerdo_pago', acuerdo.id)
            .eq('activo', true);

          // Get pago details for each aplicacion
          const pagoIds = [...new Set(apps?.map(app => app.id_pago).filter((id): id is number => id !== null) || [])];
          const { data: pagos } = pagoIds.length > 0 ? await supabase
            .from('pagos')
            .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago')
            .in('id', pagoIds) : { data: [] };

          // Get metodos_pago
          const metodoIds = [...new Set(pagos?.map(p => p.id_metodos_pago).filter((id): id is number => id !== null) || [])];
          const { data: metodos } = metodoIds.length > 0 ? await supabase
            .from('metodos_pago')
            .select('id, nombre')
            .in('id', metodoIds) : { data: [] };

          const pagosMap = new Map<number, any>();
          pagos?.forEach(p => pagosMap.set(p.id, p));
          const metodosMap = new Map<number, string>();
          metodos?.forEach(m => metodosMap.set(m.id, m.nombre));

          const reservaInfo = reservasMap.get(acuerdo.id);

          return {
            id: acuerdo.id,
            orden: acuerdo.orden,
            monto: acuerdo.monto,
            fecha_pago: acuerdo.fecha_pago,
            pago_completado: acuerdo.pago_completado,
            concepto: conceptosMap.get(acuerdo.id_concepto) || 'Sin concepto',
            id_concepto: acuerdo.id_concepto,
            espacio_reserva: reservaInfo?.espacio_nombre,
            aplicaciones: (apps || []).map(app => {
              const pago = pagosMap.get(app.id_pago);
              return {
                id: app.id,
                monto: app.monto,
                fecha_creacion: app.fecha_creacion,
                pago: {
                  id: pago?.id || 0,
                  fecha_pago: pago?.fecha_pago || '',
                  monto: pago?.monto || 0,
                  metodo_pago: metodosMap.get(pago?.id_metodos_pago) || '',
                  id_metodos_pago: pago?.id_metodos_pago || 0,
                  clave_rastreo: pago?.clave_rastreo || null
                }
              };
            })
          };
        })
      );

      return acuerdosWithApps;
    },
    enabled: !!cuentaId,
  });

  // Fetch multas for this cuenta
  const { data: multas } = useQuery({
    queryKey: ["multas_mantenimiento", cuentaId],
    queryFn: async () => {
      const acuerdoIds = acuerdosPago?.map(a => a.id) || [];
      if (acuerdoIds.length === 0) return [];

      const { data, error } = await supabase
        .from('multas')
        .select('id, monto, es_pagada, id_acuerdo_pago')
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      if (error) throw error;
      
      // Get tipos de multa and descripcion via RPC for complete data
      const multaIds = data?.map(m => m.id) || [];
      let multasCompletas: any[] = [];
      
      if (multaIds.length > 0) {
        const { data: multasData } = await supabase
          .rpc('execute_safe_query', {
            query_text: `SELECT id, monto, es_pagada, id_acuerdo_pago, descripcion, id_tipo_multa FROM multas WHERE id IN (${multaIds.join(',')})`,
            max_rows: 1000
          });
        
        multasCompletas = multasData as any[] || [];
      }
      
      // Get tipos de multa names
      const tipoIds = [...new Set(multasCompletas.map((m: any) => m.id_tipo_multa).filter(id => id))];
      let tiposMap = new Map<number, string>();
      
      if (tipoIds.length > 0) {
        const { data: tipos } = await supabase
          .rpc('execute_safe_query', {
            query_text: `SELECT id, nombre FROM tipos_multa WHERE id IN (${tipoIds.join(',')})`,
            max_rows: 100
          });
        
        (tipos as any)?.forEach((t: any) => tiposMap.set(t.id, t.nombre));
      }
      
      return multasCompletas.map((m: any) => ({
        id: m.id,
        monto: m.monto,
        es_pagada: m.es_pagada,
        id_acuerdo_pago: m.id_acuerdo_pago,
        descripcion: m.descripcion || '',
        id_tipo_multa: m.id_tipo_multa,
        tipo_nombre: tiposMap.get(m.id_tipo_multa) || 'N/A'
      }));
    },
    enabled: !!cuentaId && !!acuerdosPago && acuerdosPago.length > 0,
  });

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return format(localDate, "dd 'de' MMMM 'de' yyyy", { locale: es });
  };

  const handleUploadEvidence = async (pagoId: number, file: File) => {
    try {
      setUploadingEvidence(pagoId);

      const fileExt = file.name.split('.').pop();
      const fileName = `${pagoId}_${Date.now()}.${fileExt}`;
      const filePath = `evidencias_pago/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('pagos')
        .update({ url_recibo: publicUrl })
        .eq('id', pagoId);

      if (updateError) throw updateError;

      await registrarSubidaDocumento({
        tipo: 'evidencia_pago_mantenimiento',
        id_pago: pagoId,
        id_cuenta_mantenimiento: cuentaId,
        nombre_archivo: file.name,
        url: publicUrl
      });

      toast({
        title: "Evidencia subida",
        description: "La evidencia de pago se ha guardado correctamente",
      });

      queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", cuentaId] });
    } catch (error) {
      console.error("Error uploading evidence:", error);
      
      await registrarSubidaDocumento(
        { tipo: 'evidencia_pago_mantenimiento', id_pago: pagoId, id_cuenta_mantenimiento: cuentaId, nombre_archivo: file.name },
        'error',
        error instanceof Error ? error.message : 'Error desconocido'
      );

      toast({
        title: "Error",
        description: "No se pudo subir la evidencia de pago",
        variant: "destructive",
      });
    } finally {
      setUploadingEvidence(null);
    }
  };

  const addDays = (date: string, days: number) => {
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    localDate.setDate(localDate.getDate() + days);
    return format(localDate, "dd 'de' MMMM 'de' yyyy", { locale: es });
  };

  const conRecargos = (fechaPago: string | null) => {
    if (!fechaPago) return false;
    
    const today = new Date();
    const dayOfMonth = today.getDate();
    
    // Parse fecha_pago (formato YYYY-MM-DD) a fecha local
    const [year, month, day] = fechaPago.split('-').map(Number);
    const fechaPagoDate = new Date(year, month - 1, day);
    
    // Solo mostrar recargos si:
    // 1. El día actual del mes es mayor a 10
    // 2. Y la fecha de pago ya pasó (es anterior a hoy)
    return dayOfMonth > 10 && fechaPagoDate < today;
  };

  const calcularMontos = (montoConRecargos: number) => {
    if (!cuentaDetalle?.monto_mensual_cuota_extraordinaria) {
      return { montoOriginal: montoConRecargos, montoRecargos: 0 };
    }
    
    const montoRecargos = cuentaDetalle.monto_mensual_cuota_extraordinaria;
    const montoOriginal = montoConRecargos - montoRecargos;
    
    return { montoOriginal, montoRecargos };
  };

  const getNombreMes = (fecha: string): string => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    // Parseamos la fecha correctamente desde el string YYYY-MM-DD
    const [year, month, day] = fecha.split('-').map(Number);
    return meses[month - 1]; // month es 1-indexed, el array es 0-indexed
  };

  const formatConcepto = (concepto: string, fechaPago: string | null): string => {
    if (concepto === 'Pago de Mantenimiento' && fechaPago) {
      return `Pago Mantenimiento ${getNombreMes(fechaPago)}`;
    }
    return concepto;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const toggleAcuerdo = (acuerdoId: number) => {
    setOpenAcuerdos((prev) => ({
      ...prev,
      [acuerdoId]: !prev[acuerdoId],
    }));
  };

  if (cuentaLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando cuenta de mantenimiento...</p>
        </div>
      </div>
    );
  }

  if (!cuentaDetalle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">Cuenta no encontrada</p>
          <Link to="/admin/cuentas-mantenimiento">
            <Button variant="link">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Regresar a Cuentas de Mantenimiento
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Total aplicado a acuerdos de pago
  const totalAplicado = acuerdosPago?.reduce((sum, acuerdo) => {
    const totalAcuerdo = acuerdo.aplicaciones.reduce((appSum, app) => appSum + app.monto, 0);
    return sum + totalAcuerdo;
  }, 0) || 0;

  // Total pagado (suma de todos los pagos realizados)
  const totalPagado = pagosData?.reduce((sum, pago) => sum + pago.monto, 0) || 0;

  // Excedente = Total pagado - Total aplicado (dinero que aún no se ha aplicado a acuerdos)
  const excedente = totalPagado - totalAplicado;

  // Calculate total mensual: suma de todos los acuerdos (incluyendo multas)
  // Para acuerdos de multa, usamos el monto de la multa asociada
  const pagoMensual = acuerdosPago?.reduce((sum, acuerdo) => {
    const esAcuerdoMulta = acuerdo.concepto === 'Pago de multa';
    if (esAcuerdoMulta) {
      const multaAsociada = multas?.find(m => m.id_acuerdo_pago === acuerdo.id);
      return sum + (multaAsociada?.monto || 0);
    }
    return sum + (acuerdo.monto || 0);
  }, 0) || 0;

  // Saldo pendiente bruto = pago mensual - total aplicado
  const saldoPendienteBruto = pagoMensual - totalAplicado;
  
  // Saldo pendiente real = descuenta el excedente del saldo pendiente bruto
  // Si el excedente cubre todo el saldo pendiente, el saldo real es 0
  const saldoPendienteReal = Math.max(0, saldoPendienteBruto - excedente);
  
  // Excedente neto = lo que sobra después de cubrir el saldo pendiente
  const excedenteNeto = Math.max(0, excedente - saldoPendienteBruto);
  
  // Determinar estados para UI
  const tieneExcedenteNeto = excedenteNeto > 0.01;
  const tieneSaldoPendiente = saldoPendienteReal > 0.01;
  const estaAlCorriente = !tieneSaldoPendiente && !tieneExcedenteNeto;

  // Detectar discrepancia entre pagos reales y aplicaciones (para mostrar botón recalcular)
  const totalAplicacionesGlobal = aplicacionesPorPago?.reduce((sum, app) => sum + (app.monto || 0), 0) || 0;
  const discrepanciaPagosVsAplicaciones = totalPagado - totalAplicacionesGlobal;
  const hayDiscrepanciaAplicaciones = pagosData && pagosData.length > 0 && aplicacionesPorPago !== undefined && Math.abs(discrepanciaPagosVsAplicaciones) > 0.01;

  // Find last payment and check if it's STP
  const pagosAplicados = acuerdosPago?.flatMap(acuerdo => 
    (acuerdo.aplicaciones || [])
  ) || [];
  
  // Get the most recent payment (regardless of method)
  const ultimoPago = pagosAplicados
    .sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())[0]?.pago || null;
  
  // Check if the last payment is STP (method ID = 6)
  const ultimoPagoEsSTP = ultimoPago && 'id_metodos_pago' in ultimoPago ? ultimoPago.id_metodos_pago === 6 : false;
  
  // Only set ultimoPagoSTP if the most recent payment is STP
  const ultimoPagoSTP = ultimoPagoEsSTP ? ultimoPago : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/cuentas-mantenimiento">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">
                Detalle Cuenta de Mantenimiento {formatCuentaMantenimientoId(cuentaDetalle.id)}
              </h1>
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                Mantenimiento
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Información detallada de pagos y acuerdos
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={async () => {
              if (!cuentaId) return;
              try {
                setGeneratingEstadoCuenta(true);
                const service = new EstadoCuentaMantenimientoEdgeFunctionService();
                await service.generateEstadoCuenta({
                  id_cuenta: cuentaId
                });
                toast({
                  title: "Estado de cuenta generado",
                  description: "El PDF se ha abierto en una nueva pestaña."
                });
              } catch (error) {
                console.error("Error generating estado de cuenta:", error);
                toast({
                  title: "Error",
                  description: "No se pudo generar el estado de cuenta.",
                  variant: "destructive"
                });
              } finally {
                setGeneratingEstadoCuenta(false);
              }
            }}
            variant="outline"
            disabled={generatingEstadoCuenta}
          >
            {generatingEstadoCuenta ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Estado de Cuenta
          </Button>
          <Button 
            onClick={() => setTransferDialog({ isOpen: true })}
            variant="outline"
            disabled={!ultimoPagoSTP}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Transferir entre cuentas
          </Button>
          <Button 
            onClick={() => setMultaDialog(true)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Multa o Pago extra
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button 
                    onClick={() => setReservaDialog(true)}
                    variant="outline"
                    disabled={saldoPendienteReal > 0.01}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Agregar Reserva
                  </Button>
                </span>
              </TooltipTrigger>
              {saldoPendienteReal > 0.01 && (
                <TooltipContent>
                  <p>Hay saldo pendiente, no se pueden agregar reservas</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {excedente > 0.01 && acuerdosPago?.some(a => !a.pago_completado) && (
            <Button 
              onClick={async () => {
                setRecalculando(true);
                try {
                  const { data, error } = await supabase.functions.invoke('recalcular-aplicaciones', {
                    body: { id_cuenta_cobranza: cuentaId }
                  });
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", cuentaId] });
                  queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", cuentaId] });
                  queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
                  toast({
                    title: "Recálculo completado",
                    description: `Se redistribuyeron las aplicaciones de pago correctamente.`,
                  });
                } catch (error) {
                  console.error("Error recalculando:", error);
                  toast({
                    title: "Error",
                    description: "No se pudieron recalcular las aplicaciones de pago.",
                    variant: "destructive",
                  });
                } finally {
                  setRecalculando(false);
                }
              }}
              variant="outline"
              disabled={recalculando}
            >
              {recalculando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalcular Aplicaciones
            </Button>
          )}
        </div>
      </div>

      {/* Cards de Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pago mantenimiento acumulado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(pagoMensual)}</div>
            <p className="text-xs text-muted-foreground">Incluye recargos y multas o pagos extra</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</div>
            <p className="text-xs text-muted-foreground">
              Pagado en esta cuenta
            </p>
            {excedente > 0.01 && saldoPendienteBruto > 0.01 && (
              <p className="text-xs text-blue-600 mt-1">
                ({formatCurrency(Math.min(excedente, saldoPendienteBruto))} cubrirá el próximo pago)
              </p>
            )}
            {tieneExcedenteNeto && (
              <p className="text-xs text-green-600 mt-1">
                ({formatCurrency(excedenteNeto)} de saldo a favor)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {tieneExcedenteNeto ? 'Saldo a Favor' : tieneSaldoPendiente ? 'Saldo Pendiente' : 'Saldo'}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tieneExcedenteNeto ? (
              <>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(excedenteNeto)}</div>
                <p className="text-xs text-muted-foreground">
                  Disponible para próximos pagos
                </p>
              </>
            ) : tieneSaldoPendiente ? (
              <>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(saldoPendienteReal)}</div>
                <p className="text-xs text-muted-foreground">
                  Por pagar
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(0)}</div>
                <p className="text-xs text-muted-foreground">
                  Al corriente
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Información de la Propiedad */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Información de la Propiedad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Proyecto</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.proyecto}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.modelo}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Edificio</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.edificio}</p>
            </div>
            <div>
              <label className="text-sm font-medium">No. Propiedad</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.numero_propiedad}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Metraje Total</label>
              <p className="text-sm text-muted-foreground">
                {cuentaDetalle.m2_exteriores ? `${cuentaDetalle.m2_exteriores} m²` : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Interior + Exterior del departamento
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Costo por m²</label>
              <p className="text-sm text-muted-foreground">
                {cuentaDetalle.costo_mantenimiento_m2 ? formatCurrency(cuentaDetalle.costo_mantenimiento_m2) : 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">CLABE STP</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
            </div>
          </div>
          
          {cuentaDetalle?.propietarios && cuentaDetalle.propietarios.length > 0 && (
            <div className="mt-4">
              <Collapsible open={propietariosOpen} onOpenChange={setPropietariosOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between p-3 h-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Propietarios ({cuentaDetalle.propietarios.length})</span>
                    </div>
                    {propietariosOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>RFC</TableHead>
                        <TableHead className="text-right">% Copropiedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cuentaDetalle.propietarios.map((propietario, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{propietario.nombre_legal}</TableCell>
                          <TableCell>
                            {propietario.rfc ? (
                              <Badge variant="secondary">{propietario.rfc}</Badge>
                            ) : (
                              'Sin RFC'
                            )}
                          </TableCell>
                          <TableCell className="text-right">{propietario.porcentaje_copropiedad.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-2 text-right pr-4">
                    <span className="text-sm font-medium">
                      Total: {cuentaDetalle.propietarios.reduce((sum, p) => sum + p.porcentaje_copropiedad, 0).toFixed(2)}%
                    </span>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Acuerdos y Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="acuerdos" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="acuerdos">Acuerdos de Pago y Aplicaciones</TabsTrigger>
              <TabsTrigger value="pagos">Pagos Aplicados</TabsTrigger>
            </TabsList>

            {/* Tab: Acuerdos de Pago */}
            <TabsContent value="acuerdos" className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="h-5 w-5" />
                <span className="font-semibold">Acuerdos de Pago</span>
                <Badge variant="secondary">
                  {acuerdosPago?.length || 0} acuerdos
                </Badge>
              </div>
              
              {acuerdosPago && acuerdosPago.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                  {acuerdosPago.slice(0, visibleAcuerdos).map((acuerdo) => {
                    const totalAplicado = (acuerdo.aplicaciones || []).reduce((sum, app) => sum + app.monto, 0);
                    const isOpen = openAcuerdos[acuerdo.id];
                    
                    // Check if this is a multa acuerdo
                    const multaAsociada = multas?.find(m => m.id_acuerdo_pago === acuerdo.id);
                    const esAcuerdoMulta = acuerdo.concepto === 'Pago de multa' || acuerdo.id_concepto === 13;
                    
                    // Only show surcharges for Fondo de reserva (11) and Pago Mantenimiento (12)
                    const mostrarRecargos = acuerdo.id_concepto === 11 || acuerdo.id_concepto === 12;
                    
                    return (
                      <Collapsible key={acuerdo.id} open={isOpen} onOpenChange={() => toggleAcuerdo(acuerdo.id)}>
                        <div className="border rounded-lg">
                          <CollapsibleTrigger asChild>
                            <div className="w-full p-3 hover:bg-muted/50 cursor-pointer">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex flex-col gap-1 flex-1">
                                  {esAcuerdoMulta && multaAsociada ? (
                                    <>
                                      <span className="text-sm font-medium">
                                        Multa o Pago extra: {(multaAsociada as any).tipo_nombre || 'N/A'}
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {(multaAsociada as any).descripcion || 'Sin descripción'}
                                      </span>
                                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                        {formatCurrency(multaAsociada.monto)}
                                      </span>
                                      {acuerdo.fecha_pago && (
                                        <span className="text-xs text-muted-foreground">
                                          Fecha de pago: {formatDate(acuerdo.fecha_pago)}
                                        </span>
                                      )}
                                    </>
                                   ) : mostrarRecargos ? (
                                    <>
                                      <span className="text-sm font-medium">{formatConcepto(acuerdo.concepto, acuerdo.fecha_pago)}</span>
                                      {conRecargos(acuerdo.fecha_pago) && cuentaDetalle?.monto_mensual_cuota_extraordinaria ? (
                                        <>
                                          <span className="text-sm text-muted-foreground line-through">
                                            {formatCurrency(calcularMontos(acuerdo.monto).montoOriginal)}
                                          </span>
                                          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                                            {formatCurrency(acuerdo.monto)}
                                            <span className="ml-1 text-xs">(recargos incluidos)</span>
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            Recargo: {formatCurrency(calcularMontos(acuerdo.monto).montoRecargos)}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          {formatCurrency(acuerdo.monto)}
                                        </span>
                                      )}
                                      {acuerdo.fecha_pago && (
                                        <div className="flex flex-col text-xs text-muted-foreground">
                                          <span className="text-green-600 dark:text-green-400">
                                            Sin recargos: {formatDate(acuerdo.fecha_pago)} al {addDays(acuerdo.fecha_pago, 9)}
                                          </span>
                                          <span className="text-amber-600 dark:text-amber-400">
                                            Con recargos desde: {addDays(acuerdo.fecha_pago, 10)}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-sm font-medium">{formatConcepto(acuerdo.concepto, acuerdo.fecha_pago)}</span>
                                      {acuerdo.id_concepto === 14 && acuerdo.espacio_reserva && (
                                        <span className="text-xs text-muted-foreground">
                                          Espacio: {acuerdo.espacio_reserva}
                                        </span>
                                      )}
                                      <span className="text-sm text-muted-foreground">
                                        {formatCurrency(acuerdo.monto)}
                                      </span>
                                      {acuerdo.fecha_pago && (
                                        <span className="text-xs text-muted-foreground">
                                          Fecha de pago: {formatDate(acuerdo.fecha_pago)}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  {(() => {
                                    const montoTotal = esAcuerdoMulta && multaAsociada ? multaAsociada.monto : acuerdo.monto;
                                    const pendiente = montoTotal - totalAplicado;
                                    // Considerar pagado solo si el pendiente es 0 o menor (por redondeos)
                                    const estaPagado = pendiente <= 0;
                                    const esParcial = totalAplicado > 0 && pendiente > 0;
                                    return (
                                      <Badge variant={estaPagado ? "default" : esParcial ? "secondary" : "outline"}>
                                        {estaPagado ? "Pagado" : esParcial ? "Parcial" : "Pendiente"}
                                      </Badge>
                                    );
                                  })()}
                                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              </div>

                              {/* Barra de progreso visual */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Pagado: <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalAplicado)}</span>
                                  </span>
                                  <span className="text-muted-foreground">
                                    Pendiente: <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency((esAcuerdoMulta && multaAsociada ? multaAsociada.monto : acuerdo.monto) - totalAplicado)}</span>
                                  </span>
                                </div>
                                 <div className="relative">
                                   {(() => {
                                     const montoTotal = esAcuerdoMulta && multaAsociada ? multaAsociada.monto : acuerdo.monto;
                                     // Si el monto es 0 y está completado, mostrar 100%
                                     // Si el monto es 0 y no está completado, mostrar 0%
                                     // Si el monto es mayor a 0, calcular normalmente
                                     const pendiente = montoTotal - totalAplicado;
                                      // Calcular porcentaje real sin redondear a 100% si hay pendiente
                                      let porcentaje = montoTotal === 0 
                                        ? (pendiente <= 0.001 ? 100 : 0)
                                        : (totalAplicado / montoTotal) * 100;
                                      // Si hay pendiente mayor a 0.01 (1 centavo), no permitir que muestre 100%
                                      if (pendiente > 0.01 && porcentaje >= 99.5) {
                                        porcentaje = Math.min(porcentaje, 99.9);
                                      }
                                      return (
                                        <>
                                          <Progress 
                                            value={porcentaje} 
                                            className="h-6"
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xs font-bold bg-background/80 px-2 py-0.5 rounded">
                                              {porcentaje.toFixed(1)}%
                                            </span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-4 border-t">
                              {acuerdo.aplicaciones.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Fecha</TableHead>
                                      <TableHead>Monto</TableHead>
                                      <TableHead>Método</TableHead>
                                      <TableHead>Clave Rastreo</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {acuerdo.aplicaciones.map((app) => (
                                      <TableRow key={app.id}>
                                        <TableCell>{formatDate(app.pago.fecha_pago)}</TableCell>
                                        <TableCell>{formatCurrency(app.monto)}</TableCell>
                                        <TableCell>{app.pago.metodo_pago}</TableCell>
                                        <TableCell>{app.pago.clave_rastreo || '-'}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                  No hay pagos aplicados
                                </div>
                              )}
                              <div className="mt-2 pt-2 border-t flex justify-between text-sm">
                                <span>Total aplicado:</span>
                                <span className="font-semibold">{formatCurrency(totalAplicado)}</span>
                              </div>
                              {totalAplicado < acuerdo.monto && (
                                <div className="mt-1 flex justify-between text-sm text-muted-foreground">
                                  <span>Saldo pendiente:</span>
                                  <span>{formatCurrency(acuerdo.monto - totalAplicado)}</span>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                  </div>
                  {(visibleAcuerdos < acuerdosPago.length || visibleAcuerdos > 5) && (
                    <div className="flex justify-center gap-2 pt-2">
                      {visibleAcuerdos > 5 && (
                        <Button 
                          variant="outline" 
                          onClick={() => setVisibleAcuerdos(5)}
                        >
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Ver menos
                        </Button>
                      )}
                      {visibleAcuerdos < acuerdosPago.length && (
                        <Button 
                          variant="outline" 
                          onClick={() => setVisibleAcuerdos(prev => prev + 5)}
                        >
                          Ver más
                          <ChevronDown className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay acuerdos de pago registrados
                </div>
              )}
            </TabsContent>

            {/* Tab: Pagos Aplicados */}
            <TabsContent value="pagos" className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-5 w-5" />
                <span className="font-semibold">Pagos Aplicados</span>
                <Badge variant="secondary">
                  {pagosData?.length || 0} pagos
                </Badge>
              </div>

              {pagosData && pagosData.length > 0 ? (
                <div className="space-y-3">
                  {pagosData.map((pago) => {
                    const aplicaciones = aplicacionesPorPago?.filter(ap => ap.id_pago === pago.id) || [];
                    
                    return (
                      <Collapsible key={pago.id}>
                        <div className="border rounded-lg">
                          <CollapsibleTrigger asChild>
                            <div className="w-full p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{formatCurrency(pago.monto)}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {pago.metodo_pago_nombre}
                                  </Badge>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  Fecha: {formatDate(pago.fecha_pago)}
                                </span>
                                {pago.clave_rastreo && (
                                  <span className="text-xs text-muted-foreground">
                                    Clave: {pago.clave_rastreo}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {aplicaciones.length} {aplicaciones.length === 1 ? 'aplicación' : 'aplicaciones'}
                                </Badge>
                                {(pago.url_cep || pago.url_recibo) && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(pago.url_cep || pago.url_recibo || '', '_blank');
                                          }}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Ver evidencia de pago</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <label htmlFor={`evidence-upload-mant-${pago.id}`}>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          asChild
                                          disabled={uploadingEvidence === pago.id}
                                        >
                                          <span>
                                            {uploadingEvidence === pago.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Upload className="h-4 w-4" />
                                            )}
                                          </span>
                                        </Button>
                                        <input
                                          id={`evidence-upload-mant-${pago.id}`}
                                          type="file"
                                          className="hidden"
                                          accept=".pdf,.jpg,.jpeg,.png"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              e.stopPropagation();
                                              handleUploadEvidence(pago.id, file);
                                            }
                                            e.target.value = '';
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </label>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{pago.url_recibo ? "Actualizar evidencia" : "Subir evidencia de pago"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-4 border-t">
                              {aplicaciones.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Concepto</TableHead>
                                      <TableHead>Fecha Acuerdo</TableHead>
                                      <TableHead className="text-right">Monto Aplicado</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {aplicaciones.map((ap) => (
                                      <TableRow key={ap.id}>
                                        <TableCell>
                                          {formatConcepto(ap.concepto_nombre, ap.acuerdo?.fecha_pago || null)}
                                        </TableCell>
                                        <TableCell>
                                          {ap.acuerdo?.fecha_pago 
                                            ? formatDate(ap.acuerdo.fecha_pago)
                                            : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                          {formatCurrency(ap.monto)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                  No hay aplicaciones para este pago
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay pagos registrados
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <TransferPaymentDialog
        isOpen={transferDialog.isOpen}
        onClose={() => setTransferDialog({ isOpen: false })}
        cuentaOrigenId={cuentaId}
        ultimoPagoSTP={ultimoPagoSTP && 'id' in ultimoPagoSTP && 'clave_rastreo' in ultimoPagoSTP && 'monto' in ultimoPagoSTP ? {
          id: ultimoPagoSTP.id,
          clave_rastreo: ultimoPagoSTP.clave_rastreo || '',
          monto: ultimoPagoSTP.monto
        } : null}
      />

      <NewMultaMantenimientoDialog
        open={multaDialog}
        onOpenChange={setMultaDialog}
        cuentaId={cuentaId}
      />

      <NewReservaDialog
        open={reservaDialog}
        onOpenChange={setReservaDialog}
        preselectedCuentaMantenimientoId={cuentaId}
      />
    </div>
  );
}
