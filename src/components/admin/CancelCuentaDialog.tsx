import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Upload } from "lucide-react";

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

interface CancelCuentaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaId: number;
  precioFinal: number;
  totalPagado: number;
  idOferta: number;
  clabeStpOriginal: string | null;
  onSuccess: () => void;
}

export function CancelCuentaDialog({
  isOpen,
  onClose,
  cuentaId,
  precioFinal,
  totalPagado,
  idOferta,
  clabeStpOriginal,
  onSuccess
}: CancelCuentaDialogProps) {
  const [tipoCancelacion, setTipoCancelacion] = useState<string>("");
  const [montoCobro, setMontoCobro] = useState<string>("0");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([]);
  const [nuevoCompradorId, setNuevoCompradorId] = useState<string>("");
  const [pagosNuevos, setPagosNuevos] = useState<PagoNuevo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMontoCobro, setErrorMontoCobro] = useState<string>("");
  const { toast } = useToast();

  const montoCobrolNumber = parseFloat(montoCobro) || 0;
  const porcentajePrecioFinal = precioFinal > 0 ? (montoCobrolNumber / precioFinal * 100).toFixed(2) : "0";
  const totalPagosNuevos = pagosNuevos.reduce((sum, p) => sum + p.monto, 0);
  const minimoRequerido = totalPagado - montoCobrolNumber;

  useEffect(() => {
    if (isOpen) {
      fetchMetodosPago();
      if (tipoCancelacion === "1") {
        fetchCompradores();
      }
    }
  }, [isOpen, tipoCancelacion]);

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

    // Filtrar solo Cheque, Efectivo y Transferencia bancaria
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
    // Obtener compradores actuales de esta cuenta
    const { data: compradoresActuales } = await supabase
      .from('compradores')
      .select('id_persona')
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true);

    const idsExcluir = compradoresActuales?.map(c => c.id_persona) || [];

    // Obtener todos los compradores (id_tipo_entidad = 2) excepto los actuales
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

  const validarMontoCobro = (valor: string) => {
    const monto = parseFloat(valor) || 0;
    
    if (monto < 0) {
      setErrorMontoCobro("El monto no puede ser negativo");
      return;
    }
    
    const maxCincoPerciento = precioFinal * 0.05;
    if (monto > maxCincoPerciento) {
      setErrorMontoCobro(`No puede ser mayor al 5% del precio final ($${formatCurrency(maxCincoPerciento)})`);
      return;
    }
    
    if (monto > totalPagado) {
      setErrorMontoCobro(`No puede ser mayor al monto ya pagado ($${formatCurrency(totalPagado)})`);
      return;
    }
    
    setErrorMontoCobro("");
  };

  const handleMontoCobroChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setMontoCobro(valor);
    validarMontoCobro(valor);
  };

  const validarFormulario = (): string | null => {
    if (!tipoCancelacion) return "Debe seleccionar un tipo de cancelación";
    if (montoCobro === "") return "El cobro por cancelación es obligatorio";
    
    if (errorMontoCobro) return errorMontoCobro;
    
    if (tipoCancelacion === "2" && !evidenciaFile) {
      return "La evidencia es obligatoria para Rescisión de contrato";
    }

    if (tipoCancelacion === "1") {
      if (!nuevoCompradorId) return "Debe seleccionar un nuevo comprador";
      if (pagosNuevos.length === 0) return "Debe agregar al menos un pago";
      
      // Validar que todos los pagos tengan método de pago
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

  const handleGuardar = async () => {
    const error = validarFormulario();
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // Subir evidencia si existe
      const urlEvidencia = await subirEvidencia();

      // Actualizar cuenta de cobranza original
      const { error: updateError } = await supabase
        .from('cuentas_cobranza')
        .update({
          id_tipo_cancelacion: parseInt(tipoCancelacion),
          url_evidencia_cancelacion: urlEvidencia,
          monto_cobro_cancelacion: montoCobrolNumber,
          activo: false
        })
        .eq('id', cuentaId);

      if (updateError) throw updateError;

      // Si es Cesión de derechos
      if (tipoCancelacion === "1") {
        // Obtener id_er_dueno y datos del esquema de pago
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

        // Calcular montos basados en precio final
        const esquema = ofertaData?.esquemas_pago;
        const montoApartado = ofertaData?.propiedades?.monto_apartado || 0;
        const montoEnganche = esquema ? (precioFinal * esquema.porcentaje_enganche / 100) : 0;
        const montoEntrega = esquema ? (precioFinal * esquema.porcentaje_entrega / 100) : 0;

        // Guardar los pagos en la base de datos ANTES de enviar el webhook
        const pagosGuardados = [];
        for (const pago of pagosNuevos) {
          // Subir evidencia del pago si existe
          let urlEvidenciaPago = null;
          if (pago.evidencia) {
            const fileName = `evidencia_pago_${cuentaId}_${Date.now()}.${pago.evidencia.name.split('.').pop()}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('documentos')
              .upload(fileName, pago.evidencia);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('documentos')
              .getPublicUrl(fileName);

            urlEvidenciaPago = publicUrl;
          }

          // Insertar el pago en la base de datos
          const { data: pagoInsertado, error: pagoError } = await supabase
            .from('pagos')
            .insert({
              id_cuenta_cobranza: cuentaId,
              monto: pago.monto,
              fecha_pago: pago.fecha_pago,
              id_metodos_pago: parseInt(pago.id_metodo_pago),
              url_recibo: urlEvidenciaPago,
              activo: true
            })
            .select()
            .single();

          if (pagoError) throw pagoError;

          // Agregar al array con el formato correcto
          pagosGuardados.push({
            monto_pagado: pagoInsertado.monto,
            id_pago: pagoInsertado.id
          });
        }

        // Llamar al webhook con los pagos que ya tienen id_pago
        const webhookBaseUrl = import.meta.env.VITE_N8N_WEBHOOK_BASE_URL;
        if (!webhookBaseUrl) {
          throw new Error('VITE_N8N_WEBHOOK_BASE_URL no está configurado');
        }
        
        const webhookUrl = `${webhookBaseUrl}/aplicaPago`;
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            siguiente_accion: "genera_cuenta_cobranza_completa_cesion",
            message: "Cancelación con cesión de derechos",
            id_cuenta_cobranza: cuentaId,
            id_oferta: idOferta,
            pagos: pagosGuardados,
            es_cancelacion: true,
            precio_final: precioFinal,
            id_er_dueno: idErDueno,
            id_persona_lead: parseInt(nuevoCompradorId),
            datos_propiedad: {
              porcentaje_enganche: esquema?.porcentaje_enganche || 0,
              monto_apartado: montoApartado,
              monto_enganche: montoEnganche,
              porcentaje_mensualidades: esquema?.porcentaje_mensualidades || 0,
              numero_mensualidades: esquema?.numero_mensualidades || 0,
              porcentaje_entrega: esquema?.porcentaje_entrega || 0,
              monto_entrega: montoEntrega
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Error al llamar al webhook: ${errorText}`);
        }
      }

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancelar Cuenta de Cobranza CC-{String(cuentaId).padStart(6, '0')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Cancelación */}
          <div className="space-y-2">
            <Label>Tipo de Cancelación *</Label>
            <RadioGroup value={tipoCancelacion} onValueChange={setTipoCancelacion}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2" id="rescision" />
                <Label htmlFor="rescision">Rescisión de contrato</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1" id="cesion" />
                <Label htmlFor="cesion">Cesión de derechos</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Cobro por Cancelación */}
          <div className="space-y-2">
            <Label>Cobro por Cancelación * ({porcentajePrecioFinal}% del precio final: ${formatCurrency(precioFinal)})</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={montoCobro}
              onChange={handleMontoCobroChange}
              placeholder="0.00"
              className={errorMontoCobro ? "border-destructive" : ""}
            />
            {errorMontoCobro && (
              <p className="text-sm text-destructive">{errorMontoCobro}</p>
            )}
          </div>

          {/* Evidencia */}
          <div className="space-y-2">
            <Label>
              Evidencia (PDF o Imagen) {tipoCancelacion === "2" ? "*" : "(opcional)"}
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
          </div>

          {/* Sección específica para Cesión de Derechos */}
          {tipoCancelacion === "1" && (
            <>
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold">Cesión de Derechos</h3>
                
                {/* Nuevo Comprador */}
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

                {/* Pagos */}
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
          <Button onClick={handleGuardar} disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
