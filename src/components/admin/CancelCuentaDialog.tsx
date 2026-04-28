import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Upload, FileText, ExternalLink, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from "@/lib/config";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Comprador {
  id: number;
  nombre_legal: string;
  rfc: string | null;
}

interface PagoNuevo {
  monto: number;
  fecha_pago: string;
  id_metodo_pago: string;
  evidencia: File | null;
}

interface MetodoPago {
  id: number;
  nombre: string;
}

interface TipoCancelacion {
  id: number;
  nombre: string;
}

interface ConvenioDocumento {
  id: number;
  url: string;
  id_estatus_verificacion: number;
  fecha_creacion: string;
}

interface CancelCuentaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaId: number;
  precioFinal: number;
  totalPagado: number;
  idOferta: number;
  clabeStpOriginal: string | null;
  onSuccess: () => void;
  tipoCuenta?: 'Propiedad' | 'Producto' | 'Servicio';
}

export function CancelCuentaDialog({
  isOpen,
  onClose,
  cuentaId,
  precioFinal,
  totalPagado,
  idOferta,
  clabeStpOriginal,
  onSuccess,
  tipoCuenta = 'Propiedad'
}: CancelCuentaDialogProps) {
  const [tipoCancelacion, setTipoCancelacion] = useState<string>("");
  const [montoCancelacion, setMontoCancelacion] = useState<number>(0);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [tiposCancelacion, setTiposCancelacion] = useState<TipoCancelacion[]>([]);
  const [nuevoCompradorId, setNuevoCompradorId] = useState<string>("");
  const [pagosNuevos, setPagosNuevos] = useState<PagoNuevo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [convenioDocumento, setConvenioDocumento] = useState<ConvenioDocumento | null>(null);
  const [convenioLoading, setConvenioLoading] = useState(false);
  const [convenioFile, setConvenioFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { registrarCancelacion } = useActivityLogger();

  // ID del tipo de documento "Convenio de terminación de contrato"
  const ID_TIPO_CONVENIO = 39;

  // Cálculos
  const montoDevolucion = totalPagado - montoCancelacion;

  useEffect(() => {
    if (isOpen) {
      fetchMetodosPago();
      fetchTiposCancelacion();
      if (tipoCancelacion === "1") {
        fetchCompradores();
      }
    }
  }, [isOpen, tipoCancelacion]);

  // Buscar convenio cuando se selecciona tipo 6 (incumplimiento de contrato)
  useEffect(() => {
    if (isOpen && tipoCancelacion === "6") {
      fetchConvenioDocumento();
    }
  }, [isOpen, tipoCancelacion]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTipoCancelacion("");
      setMontoCancelacion(0);
      setEvidenciaFile(null);
      setNuevoCompradorId("");
      setPagosNuevos([]);
      setConvenioDocumento(null);
      setConvenioFile(null);
    }
  }, [isOpen]);

  const fetchConvenioDocumento = async () => {
    setConvenioLoading(true);
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('id, url, id_estatus_verificacion, fecha_creacion')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('id_tipo_documento', ID_TIPO_CONVENIO)
        .eq('activo', true)
        .maybeSingle();

      if (error) {
        console.error('Error al buscar convenio:', error);
        return;
      }

      setConvenioDocumento(data);
    } catch (err) {
      console.error('Error al buscar convenio:', err);
    } finally {
      setConvenioLoading(false);
    }
  };

  const fetchTiposCancelacion = async () => {
    // Para Propiedad: 1 (Cesión), 4, 5, 6
    // Para Producto/Servicio: 4, 5, 6
    const idsPermitidos = tipoCuenta === 'Propiedad' 
      ? [1, 4, 5, 6] 
      : [4, 5, 6];
    
    const { data, error } = await supabase
      .from('tipos_cancelacion')
      .select('id, nombre')
      .eq('activo', true)
      .in('id', idsPermitidos)
      .order('id');

    if (!error && data) {
      setTiposCancelacion(data);
    }
  };

  const fetchMetodosPago = async () => {
    const { data, error } = await supabase
      .from('metodos_pago')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');

    if (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los métodos de pago",
        variant: "destructive"
      });
      return;
    }

    const metodosFiltrados = (data || []).filter(metodo => 
      ['cheque', 'efectivo', 'transferencia bancaria'].includes(metodo.nombre.toLowerCase())
    );
    
    setMetodosPago(metodosFiltrados);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const fetchCompradores = async () => {
    const { data: compradoresActuales } = await supabase
      .from('compradores')
      .select('id_persona')
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true);

    const idsExcluir = compradoresActuales?.map(c => c.id_persona) || [];

    const { data, error } = await supabase
      .from('personas')
      .select(`
        id, 
        nombre_legal, 
        rfc,
        entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
          id_tipo_entidad
        )
      `)
      .eq('activo', true)
      .eq('entidades_relacionadas.activo', true)
      .eq('entidades_relacionadas.id_tipo_entidad', 2)
      .is('entidades_relacionadas.id_proyecto', null)
      .not('id', 'in', `(${idsExcluir.join(',')})`)
      .order('nombre_legal');

    if (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los compradores",
        variant: "destructive"
      });
      return;
    }

    setCompradores(data || []);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Error",
          description: "Solo se permiten archivos PDF o imágenes",
          variant: "destructive"
        });
        return;
      }
      setEvidenciaFile(file);
    }
  };

  const agregarPago = () => {
    setPagosNuevos([...pagosNuevos, { 
      monto: 0, 
      fecha_pago: new Date().toISOString().split('T')[0],
      id_metodo_pago: "",
      evidencia: null
    }]);
  };

  const eliminarPago = (index: number) => {
    setPagosNuevos(pagosNuevos.filter((_, i) => i !== index));
  };

  const actualizarPago = (index: number, field: keyof PagoNuevo, value: string | number | File | null) => {
    const nuevos = [...pagosNuevos];
    nuevos[index] = { ...nuevos[index], [field]: value };
    setPagosNuevos(nuevos);
  };

  const totalPagosNuevos = pagosNuevos.reduce((sum, p) => sum + p.monto, 0);
  const minimoRequerido = totalPagado - montoCancelacion;

  const validarFormulario = (): string | null => {
    if (!tipoCancelacion) return "Debe seleccionar un tipo de cancelación";
    
    // Validar monto de cancelación no exceda lo pagado
    if (montoCancelacion > totalPagado) {
      return `El monto por cancelación no puede exceder lo pagado ($${formatCurrency(totalPagado)})`;
    }

    // Para tipo 6 (incumplimiento de contrato) se requiere convenio
    if (tipoCancelacion === "6") {
      if (!convenioDocumento && !convenioFile) {
        return "Debe subir el Convenio de terminación de contrato para poder cancelar por incumplimiento";
      }
    }

    // Para tipos 4, 5, 6 se requiere evidencia
    if (['4', '5', '6'].includes(tipoCancelacion) && !evidenciaFile) {
      return "La evidencia es obligatoria";
    }

    if (tipoCancelacion === "1") {
      if (!nuevoCompradorId) return "Debe seleccionar un nuevo comprador";
      if (pagosNuevos.length === 0) return "Debe agregar al menos un pago";
      
      const pagosSinMetodo = pagosNuevos.some(p => !p.id_metodo_pago);
      if (pagosSinMetodo) return "Todos los pagos deben tener un método de pago";
      
      if (totalPagosNuevos !== minimoRequerido) {
        return `La suma de los pagos debe ser exactamente $${formatCurrency(minimoRequerido)} (actualmente: $${formatCurrency(totalPagosNuevos)})`;
      }
    }

    return null;
  };

  const subirEvidencia = async (): Promise<string | null> => {
    if (!evidenciaFile) return null;

    const fileName = `evidencia_cancelacion_${cuentaId}_${Date.now()}.${evidenciaFile.name.split('.').pop()}`;
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(fileName, evidenciaFile);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const subirConvenio = async (): Promise<void> => {
    if (!convenioFile) return;

    const fileName = `convenio_terminacion_${cuentaId}_${Date.now()}.pdf`;
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(fileName, convenioFile);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(fileName);

    // Insertar registro en documentos
    const { error: dbError } = await supabase
      .from('documentos')
      .insert({
        id_cuenta_cobranza: cuentaId,
        id_tipo_documento: ID_TIPO_CONVENIO,
        url: publicUrl,
        id_estatus_verificacion: 1, // Pendiente
        activo: true
      });

    if (dbError) throw dbError;
  };

  const agregarPagosCancelacionYDevolucion = async () => {
    // Obtener el último orden de acuerdo_pago con pago completado (excluir conceptos de cancelación)
    const { data: ultimoAcuerdo, error: acuerdoError } = await supabase
      .from('acuerdos_pago')
      .select('orden, id_concepto')
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true)
      .eq('pago_completado', true)
      .not('id_concepto', 'in', '(7,9)') // Excluir conceptos de cancelación
      .order('orden', { ascending: false })
      .limit(1);

    const ultimoOrden = ultimoAcuerdo?.[0]?.orden || 0;
    let nuevoOrden = ultimoOrden + 1;

    // Insertar Pago por cancelación (positivo) - concepto 7
    if (montoCancelacion > 0) {
      const { error: pagoCanError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_cuenta_cobranza: cuentaId,
          id_concepto: 7, // Pago por cancelación
          monto: montoCancelacion,
          orden: nuevoOrden,
          pago_completado: true,
          activo: true
        });

      if (pagoCanError) throw pagoCanError;
      nuevoOrden++; // Incrementar solo si se insertó
    }

    // Insertar Devolución de pago - concepto 9
    // Nota: Se guarda como positivo porque la BD tiene constraint de monto > 0
    // El concepto 9 ya indica que es una devolución
    if (montoDevolucion > 0) {
      const { error: devError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_cuenta_cobranza: cuentaId,
          id_concepto: 9, // Devolución de pago
          monto: montoDevolucion, // Positivo (el concepto indica que es devolución)
          orden: nuevoOrden,
          pago_completado: true,
          activo: true
        });

      if (devError) throw devError;
    }

    // Marcar como activo=false los acuerdos sin aplicación de pago
    const { data: acuerdosSinPago } = await supabase
      .from('acuerdos_pago')
      .select('id')
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true)
      .eq('pago_completado', false);

    if (acuerdosSinPago && acuerdosSinPago.length > 0) {
      const ids = acuerdosSinPago.map(a => a.id);
      await supabase
        .from('acuerdos_pago')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .in('id', ids);
    }
  };

  const cancelarCuentasProductoRelacionadas = async () => {
    // Obtener cuentas de cobranza de productos relacionadas a la misma oferta
    const { data: cuentasProducto } = await supabase
      .from('cuentas_cobranza')
      .select('id')
      .eq('id_oferta', idOferta)
      .eq('activo', true)
      .neq('id', cuentaId);

    if (cuentasProducto && cuentasProducto.length > 0) {
      const ids = cuentasProducto.map(c => c.id);
      await supabase
        .from('cuentas_cobranza')
        .update({ 
          activo: false, 
          id_tipo_cancelacion: parseInt(tipoCancelacion),
          fecha_actualizacion: new Date().toISOString() 
        })
        .in('id', ids);
    }
  };

  const handleGuardar = async () => {
    const error = validarFormulario();
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const urlEvidencia = await subirEvidencia();

      // Si es tipo 6 y hay convenio nuevo, subirlo
      if (tipoCancelacion === "6" && convenioFile) {
        await subirConvenio();
      }

      // Tipos 4, 5, 6 - Cancelación normal con pagos de cancelación/devolución
      if (['4', '5', '6'].includes(tipoCancelacion)) {
        // Agregar pagos de cancelación y devolución si hay monto
        if (montoCancelacion > 0 || montoDevolucion > 0) {
          await agregarPagosCancelacionYDevolucion();
        }

        // Actualizar cuenta de cobranza
        const { error: updateError } = await supabase
          .from('cuentas_cobranza')
          .update({
            id_tipo_cancelacion: parseInt(tipoCancelacion),
            url_evidencia_cancelacion: urlEvidencia,
            monto_cobro_cancelacion: montoCancelacion,
            activo: false,
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id', cuentaId);

        if (updateError) throw updateError;

        // Si es cuenta de propiedad, cancelar también las cuentas de productos
        if (tipoCuenta === 'Propiedad') {
          await cancelarCuentasProductoRelacionadas();

          // Liberar la propiedad
          const { data: ofertaData } = await supabase
            .from('ofertas')
            .select('id_propiedad, propiedades!ofertas_id_propiedad_fkey(id_entidad_relacionada_dueno)')
            .eq('id', idOferta)
            .single();

          if (ofertaData?.id_propiedad) {
            const idErDueno = ofertaData?.propiedades?.id_entidad_relacionada_dueno;
            
            // Generar nueva CLABE
            let nuevaClabe = null;
            if (idErDueno) {
              const { data: clabeData } = await supabase
                .rpc('crear_referencia_bancaria', { id_er_dueno: idErDueno });
              nuevaClabe = clabeData;
            }

            await supabase
              .from('propiedades')
              .update({
                id_estatus_disponibilidad: 2, // Disponible
                clabe_stp_tmp_apartado: nuevaClabe,
                fecha_actualizacion: new Date().toISOString()
              })
              .eq('id', ofertaData.id_propiedad);
          }
        }
      }
      // Tipo 1 - Cesión de derechos (lógica existente)
      else if (tipoCancelacion === "1") {
        // Actualizar cuenta de cobranza original
        const { error: updateError } = await supabase
          .from('cuentas_cobranza')
          .update({
            id_tipo_cancelacion: 1,
            url_evidencia_cancelacion: urlEvidencia,
            monto_cobro_cancelacion: montoCancelacion,
            activo: false
          })
          .eq('id', cuentaId);

        if (updateError) throw updateError;

        // Obtener datos para el webhook
        const { data: ofertaData, error: ofertaError } = await supabase
          .from('ofertas')
          .select(`
            id_propiedad,
            id_esquema_pago_seleccionado,
            propiedades!ofertas_id_propiedad_fkey(
              id_entidad_relacionada_dueno,
              monto_apartado
            ),
            esquemas_pago!ofertas_id_esquema_pago_seleccionado_fkey(
              porcentaje_enganche,
              porcentaje_mensualidades,
              porcentaje_entrega,
              numero_mensualidades
            )
          `)
          .eq('id', idOferta)
          .single();

        if (ofertaError) throw ofertaError;

        const idErDueno = ofertaData?.propiedades?.id_entidad_relacionada_dueno;
        if (!idErDueno) {
          throw new Error('No se pudo obtener id_er_dueno');
        }

        const esquema = ofertaData?.esquemas_pago;
        const montoApartado = ofertaData?.propiedades?.monto_apartado || 0;
        const montoEnganche = esquema ? (precioFinal * esquema.porcentaje_enganche / 100) : 0;
        const montoEntrega = esquema ? (precioFinal * esquema.porcentaje_entrega / 100) : 0;

        const pagosParaWebhook = [];
        for (const pago of pagosNuevos) {
          let urlRecibo = null;
          
          if (pago.evidencia) {
            const fileName = `evidencia_pago_${cuentaId}_${Date.now()}_${Math.random()}.${pago.evidencia.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage
              .from('documentos')
              .upload(fileName, pago.evidencia);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('documentos')
              .getPublicUrl(fileName);

            urlRecibo = publicUrl;
          }

          pagosParaWebhook.push({
            monto_pagado: pago.monto,
            fecha_pago: pago.fecha_pago,
            id_metodo_pago: parseInt(pago.id_metodo_pago),
            url_recibo: urlRecibo
          });
        }

        const { data: notifData, error: notifError } = await supabase.functions.invoke('enviar-notificacion', {
          body: {
            n8nPath: 'aplicaPago',
            success: true,
            siguiente_accion: "genera_cuenta_cobranza_completa_cesion",
            message: "Cancelación con cesión de derechos",
            id_oferta: idOferta,
            pagos: pagosParaWebhook,
            es_cancelacion: true,
            precio_final: precioFinal,
            id_er_dueno: idErDueno,
            id_persona_lead: parseInt(nuevoCompradorId),
            environment: ENVIRONMENT,
            datos_propiedad: {
              porcentaje_enganche: esquema?.porcentaje_enganche || 0,
              monto_apartado: montoApartado,
              monto_enganche: montoEnganche,
              porcentaje_mensualidades: esquema?.porcentaje_mensualidades || 0,
              numero_mensualidades: esquema?.numero_mensualidades || 0,
              porcentaje_entrega: esquema?.porcentaje_entrega || 0,
              monto_entrega: montoEntrega
            }
          }
        });

        if (notifError || (notifData?.n8nStatus ?? 500) >= 400) {
          const errMsg = notifError?.message || JSON.stringify(notifData?.n8nResponse ?? notifData);
          throw new Error(`Error al llamar al webhook: ${errMsg}`);
        }
      }

      // Registrar la cancelación en el log
      const tipoNombre = tiposCancelacion.find(t => t.id === parseInt(tipoCancelacion))?.nombre || tipoCancelacion;
      await registrarCancelacion('cuentas_cobranza', {
        id_cuenta_cobranza: cuentaId,
        tipo_cancelacion: tipoNombre,
        monto_cobro_cancelacion: montoCancelacion,
        monto_devolucion: montoDevolucion,
        url_evidencia: urlEvidencia,
        precio_final: precioFinal,
        total_pagado: totalPagado,
        clabe_stp_original: clabeStpOriginal,
        tipo_cuenta: tipoCuenta,
        id_oferta: idOferta
      }, 'cancelar_cuenta_cobranza');

      toast({
        title: "Éxito",
        description: "Cuenta cancelada correctamente"
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error al cancelar cuenta:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar la cuenta",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isTipoNormal = ['4', '5', '6'].includes(tipoCancelacion);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancelar Cuenta de Cobranza {formatCuentaCobranzaId(cuentaId, tipoCuenta)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Cancelación */}
          <div className="space-y-2">
            <Label>Tipo de Cancelación *</Label>
            <RadioGroup value={tipoCancelacion} onValueChange={setTipoCancelacion}>
              {tiposCancelacion.map((tipo) => (
                <div key={tipo.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={String(tipo.id)} id={`tipo-${tipo.id}`} />
                  <Label htmlFor={`tipo-${tipo.id}`}>{tipo.nombre}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Información de pagos y monto de cancelación - Solo para tipos 4, 5, 6 */}
          {isTipoNormal && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Monto ya pagado</Label>
                  <p className="text-lg font-semibold">${formatCurrency(totalPagado)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Devolución al cliente</Label>
                  <p className="text-lg font-semibold text-green-600">${formatCurrency(montoDevolucion)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Monto por Cancelación (se queda en Sozu) *</Label>
                <CurrencyInput
                  value={Math.round(montoCancelacion * 100)}
                  onChange={(value) => setMontoCancelacion(value / 100)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Este monto no se devolverá al cliente
                </p>
              </div>
            </div>
          )}

          {/* Cobro por Cancelación - Para Cesión */}
          {tipoCancelacion === "1" && (
            <div className="space-y-2">
              <Label>Cobro por Cancelación *</Label>
              <CurrencyInput
                value={montoCancelacion * 100}
                onChange={(value) => setMontoCancelacion(value / 100)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Sección Convenio de Terminación - Solo para tipo 6 (incumplimiento) */}
          {tipoCancelacion === "6" && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <Label className="font-semibold">Convenio de Terminación de Contrato *</Label>
              </div>

              {convenioLoading ? (
                <p className="text-sm text-muted-foreground">Buscando documento...</p>
              ) : convenioDocumento ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-background rounded-md border">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Convenio de terminación de contrato</p>
                      <p className="text-xs text-muted-foreground">
                        Subido el {new Date(convenioDocumento.fecha_creacion).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(convenioDocumento.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </div>
                  
                  {/* Selector de estatus */}
                  <div className="space-y-2">
                    <Label>Estatus del documento</Label>
                    <Select
                      value={String(convenioDocumento.id_estatus_verificacion)}
                      onValueChange={async (value) => {
                        const nuevoEstatus = parseInt(value);
                        try {
                          const { error } = await supabase
                            .from('documentos')
                            .update({ 
                              id_estatus_verificacion: nuevoEstatus,
                              fecha_actualizacion: new Date().toISOString()
                            })
                            .eq('id', convenioDocumento.id);

                          if (error) throw error;

                          setConvenioDocumento({
                            ...convenioDocumento,
                            id_estatus_verificacion: nuevoEstatus
                          });

                          toast({
                            title: "Éxito",
                            description: "Estatus actualizado correctamente"
                          });
                        } catch (err: any) {
                          toast({
                            title: "Error",
                            description: "No se pudo actualizar el estatus",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            Pendiente
                          </div>
                        </SelectItem>
                        <SelectItem value="2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            Validado
                          </div>
                        </SelectItem>
                        <SelectItem value="3">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-destructive" />
                            Rechazado
                          </div>
                        </SelectItem>
                        <SelectItem value="4">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            Expirado
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No existe el convenio de terminación de contrato. Es obligatorio subir este documento para poder confirmar la cancelación.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-2">
                    <Label>Subir Convenio de Terminación (PDF) *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.type !== 'application/pdf') {
                              toast({
                                title: "Error",
                                description: "Solo se permiten archivos PDF para el convenio",
                                variant: "destructive"
                              });
                              return;
                            }
                            setConvenioFile(file);
                          }
                        }}
                        className="flex-1"
                      />
                      {convenioFile && (
                        <Button variant="outline" size="sm" onClick={() => setConvenioFile(null)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {convenioFile && (
                      <p className="text-sm text-muted-foreground">{convenioFile.name}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evidencia de pago */}
          <div className="space-y-2">
            <Label>
              Evidencia de pago (PDF o Imagen) {isTipoNormal ? "*" : "(opcional)"}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="flex-1"
              />
              {evidenciaFile && (
                <Button variant="outline" size="sm" onClick={() => setEvidenciaFile(null)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {evidenciaFile && (
              <p className="text-sm text-muted-foreground">{evidenciaFile.name}</p>
            )}
          </div>

          {/* Sección específica para Cesión de Derechos */}
          {tipoCancelacion === "1" && (
            <>
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold">Cesión de Derechos</h3>
                
                <div className="space-y-2">
                  <Label>Nuevo Comprador *</Label>
                  <Select value={nuevoCompradorId} onValueChange={setNuevoCompradorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar comprador" />
                    </SelectTrigger>
                    <SelectContent>
                      {compradores.map((comprador) => (
                        <SelectItem key={comprador.id} value={String(comprador.id)}>
                          {comprador.nombre_legal} {comprador.rfc ? `- ${comprador.rfc}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Pagos (mínimo requerido: ${formatCurrency(minimoRequerido)})</Label>
                    <Button onClick={agregarPago} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" /> Agregar Pago
                    </Button>
                  </div>
                  
                  {pagosNuevos.map((pago, index) => (
                    <div key={index} className="border p-4 rounded-lg space-y-3">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Monto *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={pago.monto}
                            onChange={(e) => actualizarPago(index, 'monto', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Fecha *</Label>
                          <Input
                            type="date"
                            value={pago.fecha_pago}
                            onChange={(e) => actualizarPago(index, 'fecha_pago', e.target.value)}
                          />
                        </div>
                        <Button 
                          variant="destructive" 
                          size="icon"
                          onClick={() => eliminarPago(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs">Método de Pago *</Label>
                        <Select 
                          value={pago.id_metodo_pago} 
                          onValueChange={(value) => actualizarPago(index, 'id_metodo_pago', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar método" />
                          </SelectTrigger>
                          <SelectContent>
                            {metodosPago.map((metodo) => (
                              <SelectItem key={metodo.id} value={String(metodo.id)}>
                                {metodo.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Evidencia (opcional)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
                                if (!validTypes.includes(file.type)) {
                                  toast({
                                    title: "Error",
                                    description: "Solo se permiten archivos PDF o imágenes",
                                    variant: "destructive"
                                  });
                                  return;
                                }
                                actualizarPago(index, 'evidencia', file);
                              }
                            }}
                            className="flex-1"
                          />
                          {pago.evidencia && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => actualizarPago(index, 'evidencia', null)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {pago.evidencia && (
                          <p className="text-xs text-muted-foreground">{pago.evidencia.name}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {pagosNuevos.length > 0 && (
                    <div className="text-sm font-medium mt-2">
                      Total: ${formatCurrency(totalPagosNuevos)}
                      {totalPagosNuevos < minimoRequerido && (
                        <span className="text-destructive ml-2">
                          (Faltan ${formatCurrency(minimoRequerido - totalPagosNuevos)})
                        </span>
                      )}
                      {totalPagosNuevos > minimoRequerido && (
                        <span className="text-destructive ml-2">
                          (Excede por ${formatCurrency(totalPagosNuevos - minimoRequerido)})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGuardar} 
            disabled={
              isLoading || 
              !tipoCancelacion || 
              (tipoCancelacion === "6" && (!convenioDocumento || convenioDocumento.id_estatus_verificacion !== 2) && !convenioFile) ||
              (tipoCancelacion === "6" && convenioDocumento && convenioDocumento.id_estatus_verificacion !== 2) ||
              (isTipoNormal && !evidenciaFile)
            }
          >
            {isLoading ? "Guardando..." : "Confirmar Cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
