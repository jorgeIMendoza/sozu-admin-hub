import { useState } from "react";
import { FileCheck, Upload, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ENVIRONMENT } from "@/lib/config";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { CurrencyInput } from "@/components/ui/currency-input";

interface JuicioTerminadoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  propiedadId?: number;
  totalPagado?: number;
}

type AccionJuicio = 'liberar' | 'vendido';

export function JuicioTerminadoDialog({ 
  isOpen, 
  onClose, 
  cuentaCobranzaId, 
  propiedadId,
  totalPagado = 0
}: JuicioTerminadoDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [accionSeleccionada, setAccionSeleccionada] = useState<AccionJuicio>('liberar');
  const [tipoCancelacion, setTipoCancelacion] = useState<string>("2"); // 2=demanda, 3=negociación
  const [montoCancelacion, setMontoCancelacion] = useState<number>(0);
  const [nuevoPrecioLista, setNuevoPrecioLista] = useState<number>(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cálculos
  const montoDevolucion = totalPagado - montoCancelacion;

  // Get the document type ID for "Documentos de Juicio"
  const { data: tipoDocumentoJuicio } = useQuery({
    queryKey: ["tipo_documento_juicio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id')
        .eq('nombre', 'Documentos de Juicio')
        .eq('activo', true)
        .single();

      if (error) throw error;
      return data;
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newFiles: { name: string; url: string }[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `juicio_${cuentaCobranzaId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `documentos_juicio/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);

        newFiles.push({ name: file.name, url: publicUrl });
      }

      setUploadedFiles(prev => [...prev, ...newFiles]);
      toast({
        title: "Archivos subidos",
        description: `${newFiles.length} archivo(s) subido(s) exitosamente`,
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: "No se pudieron subir los archivos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const agregarPagosCancelacionYDevolucion = async () => {
    // Obtener el último orden de acuerdo_pago que tenga aplicación
    const { data: acuerdosConAplicacion } = await supabase
      .from('acuerdos_pago')
      .select(`
        id,
        orden,
        aplicaciones_pago(id)
      `)
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true)
      .order('orden', { ascending: false });

    // Filtrar los que tienen aplicaciones
    const acuerdosConPago = acuerdosConAplicacion?.filter(a => 
      a.aplicaciones_pago && a.aplicaciones_pago.length > 0
    ) || [];
    
    const ultimoOrden = acuerdosConPago.length > 0 ? acuerdosConPago[0].orden : 0;
    const nuevoOrden = ultimoOrden + 1;

    // Insertar Pago por cancelación (positivo) - concepto 7
    if (montoCancelacion > 0) {
      const { error: pagoCanError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_concepto: 7, // Pago por cancelación
          monto: montoCancelacion,
          orden: nuevoOrden,
          pago_completado: true,
          activo: true
        });

      if (pagoCanError) throw pagoCanError;
    }

    // Insertar Devolución de pago - concepto 9
    // Nota: Se guarda como positivo porque la BD tiene constraint chk_acpago_monto_positivo (monto >= 0).
    // El concepto 9 ya indica que es una devolución (mismo patrón que CancelCuentaDialog).
    if (montoDevolucion > 0) {
      const { error: devError } = await supabase
        .from('acuerdos_pago')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_concepto: 9, // Devolución de pago
          monto: montoDevolucion, // Positivo (el concepto indica que es devolución)
          orden: nuevoOrden + 1,
          pago_completado: true,
          activo: true
        });

      if (devError) throw devError;
    }

    // Marcar como activo=false los acuerdos sin aplicación de pago
    const acuerdosSinPago = acuerdosConAplicacion?.filter(a => 
      !a.aplicaciones_pago || a.aplicaciones_pago.length === 0
    ) || [];

    if (acuerdosSinPago.length > 0) {
      const ids = acuerdosSinPago.map(a => a.id);
      await supabase
        .from('acuerdos_pago')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .in('id', ids);
    }
  };

  const agregarPagoPenalizacion = async () => {
    // Obtener el último acuerdo activo de la cuenta (sin importar si tiene aplicaciones)
    const { data: ultimoAcuerdo, error: acuerdoError } = await supabase
      .from('acuerdos_pago')
      .select('id, orden, monto')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true)
      .order('orden', { ascending: false })
      .limit(1)
      .single();

    if (acuerdoError || !ultimoAcuerdo) {
      throw new Error('No se encontró un acuerdo de pago activo para vincular la penalización');
    }

    // Insertar la multa en la tabla multas, vinculada al último acuerdo
    const { error: multaError } = await supabase
      .from('multas')
      .insert({
        id_acuerdo_pago: ultimoAcuerdo.id,
        monto: montoCancelacion,
        descripcion: descripcion, // Usar la descripción del juicio
        id_tipo_multa: 3, // Penalización
        es_pagada: false,
        activo: true
      });

    if (multaError) throw multaError;
  };

  const handleConfirm = async () => {
    if (!propiedadId) {
      toast({
        title: "Error",
        description: "No se encontró la propiedad asociada a esta cuenta",
        variant: "destructive",
      });
      return;
    }

    if (uploadedFiles.length === 0) {
      toast({
        title: "Documentos requeridos",
        description: "Debe subir al menos un documento del juicio",
        variant: "destructive",
      });
      return;
    }

    if (!descripcion.trim()) {
      toast({
        title: "Descripción requerida",
        description: "Debe ingresar una descripción de la resolución del juicio",
        variant: "destructive",
      });
      return;
    }

    if (!tipoDocumentoJuicio?.id) {
      toast({
        title: "Error",
        description: "No se encontró el tipo de documento 'Documentos de Juicio'",
        variant: "destructive",
      });
      return;
    }

    // Validar monto
    if (montoCancelacion > totalPagado) {
      toast({
        title: "Error",
        description: `El monto no puede exceder lo pagado ($${formatCurrency(totalPagado)})`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create document records for each uploaded file
      for (const file of uploadedFiles) {
        const { error: docError } = await supabase
          .from('documentos')
          .insert({
            id_propiedad: propiedadId,
            id_cuenta_cobranza: cuentaCobranzaId,
            id_tipo_documento: tipoDocumentoJuicio.id,
            url: file.url,
            id_estatus_verificacion: 2, // 2 = Validado
            activo: true
          });

        if (docError) throw docError;
      }

      if (accionSeleccionada === 'liberar') {
        // OPCIÓN 1: Liberar propiedad
        // Agregar pagos de cancelación y devolución
        if (montoCancelacion > 0 || montoDevolucion > 0) {
          await agregarPagosCancelacionYDevolucion();
        }

        // Actualizar cuenta de cobranza
        const { error: cuentaError } = await supabase
          .from('cuentas_cobranza')
          .update({ 
            activo: false,
            id_tipo_cancelacion: parseInt(tipoCancelacion), // 2 o 3
            monto_cobro_cancelacion: montoCancelacion,
            url_evidencia_cancelacion: descripcion,
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id', cuentaCobranzaId);

        if (cuentaError) throw cuentaError;

        // Cancelar cuentas de productos relacionadas para todas las ofertas de la propiedad
        const { data: ofertasRelacionadas, error: ofertasError } = await supabase
          .from('ofertas')
          .select('id')
          .eq('id_propiedad', propiedadId);

        if (ofertasError) throw ofertasError;

        const ofertasIds = ofertasRelacionadas?.map((oferta) => oferta.id) ?? [];

        if (ofertasIds.length > 0) {
          const { data: cuentasProducto, error: cuentasProductoError } = await supabase
            .from('cuentas_cobranza')
            .select('id')
            .in('id_oferta', ofertasIds)
            .eq('activo', true)
            .neq('id', cuentaCobranzaId);

          if (cuentasProductoError) throw cuentasProductoError;

          if (cuentasProducto && cuentasProducto.length > 0) {
            const ids = cuentasProducto.map(c => c.id);
            const { error: cuentasRelacionadasError } = await supabase
              .from('cuentas_cobranza')
              .update({ 
                activo: false, 
                id_tipo_cancelacion: parseInt(tipoCancelacion),
                fecha_actualizacion: new Date().toISOString() 
              })
              .in('id', ids);

            if (cuentasRelacionadasError) throw cuentasRelacionadasError;
          }
        }

        // Generar nueva CLABE y actualizar propiedad
        const { data: propData } = await supabase
          .from('propiedades')
          .select('id_entidad_relacionada_dueno')
          .eq('id', propiedadId)
          .single();

        let nuevaClabe = null;
        if (propData?.id_entidad_relacionada_dueno) {
          const { data: clabeData } = await supabase
            .rpc('crear_referencia_bancaria', { id_er_dueno: propData.id_entidad_relacionada_dueno });
          nuevaClabe = clabeData;
        }

        const { error: propError } = await supabase
          .from('propiedades')
          .update({ 
            id_estatus_disponibilidad: 1, // Inventario (queda como draft)
            es_aprobado: false, // Borrador: requiere segunda revisión manual antes de publicarse
            clabe_stp_tmp_apartado: nuevaClabe,
            fecha_actualizacion: new Date().toISOString(),
            ...(nuevoPrecioLista > 0 ? { precio_lista: nuevoPrecioLista } : {})
          })
          .eq('id', propiedadId);

        if (propError) throw propError;

        toast({
          title: "Juicio terminado",
          description: "Cuenta cancelada. La propiedad quedó en Inventario como borrador y requiere aprobación manual antes de publicarse.",
        });
      } else {
        // OPCIÓN 2: Cambiar a Vendido (Mantener compra)
        // Agregar pago de penalización si hay monto
        if (montoCancelacion > 0) {
          await agregarPagoPenalizacion();
        }

        // Solo cambiar el estatus de la propiedad a Vendido
        const { error: propError } = await supabase
          .from('propiedades')
          .update({ 
            id_estatus_disponibilidad: 5, // Vendido
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id', propiedadId);

        if (propError) throw propError;

        // Generar factura de comisión Sozu (no bloquea el flujo principal)
        try {
          const { data: funcData, error: funcError } = await supabase.functions.invoke(
            'generar-factura-comision-sozu',
            { body: { id_cuenta_cobranza: cuentaCobranzaId, environment: ENVIRONMENT } }
          );
          if (funcError) {
            console.error('Error generando factura comisión sozu:', funcError);
          } else {
            console.log('Resultado factura comisión sozu:', funcData);
          }
        } catch (facturaError) {
          console.error('Error generando factura comisión sozu:', facturaError);
        }

        toast({
          title: "Juicio terminado",
          description: "La propiedad ha sido marcada como vendida y se agregó el pago de penalización",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["propiedades"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago"] });
      
      // Reset state
      setDescripcion("");
      setUploadedFiles([]);
      setAccionSeleccionada('liberar');
      setTipoCancelacion("2");
      setMontoCancelacion(0);
      onClose();
    } catch (error) {
      console.error('Error finishing lawsuit:', error);
      toast({
        title: "Error",
        description: "No se pudo completar el proceso de juicio terminado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = uploadedFiles.length > 0 && descripcion.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <FileCheck className="h-5 w-5" />
            Juicio Terminado
          </DialogTitle>
          <DialogDescription className="text-left pt-2">
            Ingrese la documentación y resolución del juicio. Seleccione la acción a realizar con la propiedad.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Acción a realizar */}
          <div className="space-y-3">
            <Label>Acción a realizar *</Label>
            <RadioGroup 
              value={accionSeleccionada} 
              onValueChange={(value) => setAccionSeleccionada(value as AccionJuicio)}
              className="space-y-2"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="liberar" id="liberar" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="liberar" className="cursor-pointer font-medium">
                    Liberar propiedad
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Cancela la cuenta de cobranza y pone la propiedad en estado "Disponible"
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="vendido" id="vendido" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="vendido" className="cursor-pointer font-medium">
                    Cambiar a Vendido
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Mantiene la cuenta activa y cambia la propiedad a estado "Vendido"
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Tipo de cancelación - Solo para Liberar */}
          {accionSeleccionada === 'liberar' && (
            <div className="space-y-2">
              <Label>Tipo de Rescisión *</Label>
              <RadioGroup 
                value={tipoCancelacion} 
                onValueChange={setTipoCancelacion}
                className="space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="2" id="tipo-2" />
                  <Label htmlFor="tipo-2">Rescisión de contrato por demanda</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="3" id="tipo-3" />
                  <Label htmlFor="tipo-3">Rescisión de contrato por negociación</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Información de pagos */}
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Monto ya pagado</Label>
                <p className="text-lg font-semibold">${formatCurrency(totalPagado)}</p>
              </div>
              {accionSeleccionada === 'liberar' && (
                <div>
                  <Label className="text-muted-foreground">Devolución al cliente</Label>
                  <p className="text-lg font-semibold text-green-600">${formatCurrency(montoDevolucion)}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                {accionSeleccionada === 'liberar' 
                  ? "Monto por Cancelación (se queda en Sozu)" 
                  : "Monto de Penalización"
                } *
              </Label>
              <CurrencyInput
                value={montoCancelacion * 100}
                onChange={(value) => setMontoCancelacion(value / 100)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                {accionSeleccionada === 'liberar'
                  ? "Este monto no se devolverá al cliente"
                  : "Se agregará como nuevo concepto a pagar"
                }
              </p>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="documentos">Documentos del Juicio *</Label>
            <div className="flex items-center gap-2">
              <input
                id="documentos"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('documentos')?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir Documentos
                  </>
                )}
              </Button>
            </div>
            
            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-muted p-2 rounded text-sm">
                    <span className="truncate flex-1">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-6 w-6 p-0 text-destructive"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción de la Resolución *</Label>
            <Textarea
              id="descripcion"
              placeholder="Describa la resolución del juicio..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isLoading || !canSubmit}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? "Procesando..." : accionSeleccionada === 'liberar' ? "Confirmar y Liberar" : "Confirmar y Marcar Vendido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
