import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ENVIRONMENT } from "@/lib/config";
import { Textarea } from "@/components/ui/textarea";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formSchema = z.object({
  monto: z.string({
    required_error: "El monto es requerido",
    invalid_type_error: "El monto debe ser un número válido"
  }).min(1, "El monto es requerido").transform((val) => {
    const num = parseFloat(val);
    if (isNaN(num)) {
      throw new Error("El monto debe ser un número válido");
    }
    return num;
  }),
  fecha_pago: z.date({
    required_error: "La fecha de pago es requerida",
    invalid_type_error: "La fecha de pago debe ser una fecha válida"
  }),
  id_metodos_pago: z.string({
    required_error: "El método de pago es requerido",
    invalid_type_error: "El método de pago debe ser válido"
  }).min(1, "El método de pago es requerido"),
  clave_rastreo: z.string().optional(),
  evidencia_pago: z.any().refine((file) => file instanceof File, "La evidencia de pago es requerida"),
  archivo_cep: z.any().optional(),
  descripcion: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PagoExistente {
  id: number;
  id_cuenta_cobranza: number;
  monto: number;
  fecha_pago: string;
  clave_rastreo: string;
  activo: boolean;
  url_cep: string | null;
  tipo_cuenta?: string; // 'Propiedad', 'Producto', 'Servicio'
}

// Helper function to format account number with correct prefix
const formatCuentaLabel = (id: number, tipoCuenta?: string): string => {
  const paddedId = String(id).padStart(6, '0');
  switch (tipoCuenta) {
    case 'Producto':
      return `CCP-${paddedId}`;
    case 'Servicio':
      return `CCS-${paddedId}`;
    case 'Mantenimiento':
      return `CCM-${paddedId}`;
    default:
      return `CC-${paddedId}`;
  }
};

interface AddManualPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  cuentaCobranzaLabel: string;
  tipoCuenta?: 'Propiedad' | 'Producto' | 'Servicio';
  precioFinal: number;
  montoPagado: number;
  esMantenimiento?: boolean;
  totalMultasPendientes?: number;
}

export function AddManualPaymentDialog({ 
  isOpen, 
  onClose, 
  cuentaCobranzaId, 
  cuentaCobranzaLabel,
  tipoCuenta = 'Propiedad',
  precioFinal,
  montoPagado,
  esMantenimiento = false,
  totalMultasPendientes = 0
}: AddManualPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { registrarPago, registrarRecuperacionPago } = useActivityLogger();
  
  // States for duplicate detection and recovery
  const [pagoExistente, setPagoExistente] = useState<PagoExistente | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [searchingClave, setSearchingClave] = useState(false);
  const [nuevoMontoRecuperacion, setNuevoMontoRecuperacion] = useState<number>(0); // cents

  // Fetch payment methods (exclude STP and "Cesión de derechos" for all manual payments)
  const { data: metodosPago } = useQuery({
    queryKey: ["metodos_pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metodos_pago")
        .select("id, nombre")
        .eq("activo", true)
        .neq("nombre", "STP")
        .order("nombre");
      
      if (error) throw error;
      
      // Filter out "Cesión de derechos" for ALL manual payments
      return data?.filter(metodo => metodo.nombre !== "Cesión de derechos") || [];
    },
  });

  // Function to generate automatic clave_rastreo
  const generateClaveRastreo = async (fechaPago: Date): Promise<string> => {
    // Format date as yyyymmdd
    const year = fechaPago.getFullYear();
    const month = String(fechaPago.getMonth() + 1).padStart(2, '0');
    const day = String(fechaPago.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    // Format cuenta_cobranza id with 6 digits
    const cuentaIdStr = String(cuentaCobranzaId).padStart(6, '0');
    
    // Query existing manual payments for this cuenta_cobranza to get next consecutive
    const { data: existingPayments } = await supabase
      .from("pagos")
      .select("clave_rastreo")
      .eq("id_cuenta_cobranza", cuentaCobranzaId)
      .like("clave_rastreo", `manual_%`)
      .order("clave_rastreo", { ascending: false });
    
    // Find the highest consecutive number for this cuenta_cobranza
    let maxConsecutive = 0;
    if (existingPayments) {
      existingPayments.forEach(payment => {
        if (payment.clave_rastreo) {
          const match = payment.clave_rastreo.match(/manual_\d{8}_\d{6}_(\d{6})$/);
          if (match) {
            const consecutive = parseInt(match[1]);
            if (consecutive > maxConsecutive) {
              maxConsecutive = consecutive;
            }
          }
        }
      });
    }
    
    const nextConsecutive = String(maxConsecutive + 1).padStart(6, '0');
    return `manual_${dateStr}_${cuentaIdStr}_${nextConsecutive}`;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      monto: 0,
      fecha_pago: undefined,
      id_metodos_pago: "",
      clave_rastreo: "",
      descripcion: "",
    },
  });

  const selectedPaymentMethod = form.watch("id_metodos_pago");
  const claveRastreoValue = form.watch("clave_rastreo");
  const isStpManual = selectedPaymentMethod && metodosPago?.find(m => m.id.toString() === selectedPaymentMethod)?.nombre.toLowerCase().includes("stp-manual");

  // Search for existing payment when clave_rastreo changes (debounced)
  const searchExistingPayment = useCallback(async (clave: string) => {
    if (!clave || clave.length < 5) {
      setPagoExistente(null);
      return;
    }
    
    setSearchingClave(true);
    try {
      // First get the payment
      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .select("id, id_cuenta_cobranza, monto, fecha_pago, clave_rastreo, activo, url_cep")
        .eq("clave_rastreo", clave)
        .maybeSingle();
      
      if (pagoError) {
        console.error("Error searching for payment:", pagoError);
        setPagoExistente(null);
        return;
      }
      
      if (!pagoData) {
        setPagoExistente(null);
        return;
      }
      
      // Get the account type by checking the account
      let tipoCuentaValue: string | undefined = 'Propiedad'; // Default
      
      // First check if it's a maintenance account
      const { data: cuentaData } = await supabase
        .from("cuentas_cobranza")
        .select("id_cuenta_cobranza_padre, id_oferta")
        .eq("id", pagoData.id_cuenta_cobranza)
        .maybeSingle();
      
      if (cuentaData?.id_cuenta_cobranza_padre) {
        tipoCuentaValue = 'Mantenimiento';
      } else if (cuentaData?.id_oferta) {
        // Check if the offer is for a product or property
        const { data: ofertaData } = await supabase
          .from("ofertas")
          .select("id_propiedad, id_producto")
          .eq("id", cuentaData.id_oferta)
          .maybeSingle();
        
        if (ofertaData?.id_producto) {
          tipoCuentaValue = 'Producto';
        } else if (ofertaData?.id_propiedad) {
          tipoCuentaValue = 'Propiedad';
        } else {
          tipoCuentaValue = 'Servicio';
        }
      }
      
      const pagoConTipo: PagoExistente = {
        ...pagoData,
        tipo_cuenta: tipoCuentaValue
      };
      
      setPagoExistente(pagoConTipo);
      // Pre-populate the recovery amount with the existing payment amount
      setNuevoMontoRecuperacion(Math.round(pagoData.monto * 100));
    } catch (err) {
      console.error("Error in searchExistingPayment:", err);
      setPagoExistente(null);
    } finally {
      setSearchingClave(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (!isStpManual) {
      setPagoExistente(null);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      searchExistingPayment(claveRastreoValue || "");
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [claveRastreoValue, isStpManual, searchExistingPayment]);

  // Handle payment recovery
  const handleRecoverPayment = async () => {
    if (!pagoExistente) return;
    
    const nuevoMonto = nuevoMontoRecuperacion / 100; // Convert from cents
    if (nuevoMonto <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser mayor a 0",
        variant: "destructive",
      });
      return;
    }
    
    setIsRecovering(true);
    try {
      // Get form values for evidence files
      const formValues = form.getValues();
      
      // 1. Upload new evidence file
      let nuevaEvidenciaUrl: string | null = null;
      if (formValues.evidencia_pago && formValues.evidencia_pago instanceof File) {
        const fileName = `evidencia_${Date.now()}_${formValues.evidencia_pago.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(fileName, formValues.evidencia_pago);
        
        if (uploadError) {
          console.error("Error uploading evidence:", uploadError);
          throw new Error("No se pudo subir la evidencia de pago");
        }
        
        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(fileName);
        
        nuevaEvidenciaUrl = urlData.publicUrl;
      }
      
      // 2. Upload new CEP file if STP-Manual
      let nuevoCepUrl: string | null = null;
      if (isStpManual && formValues.archivo_cep && formValues.archivo_cep instanceof File) {
        const fileName = `cep_${Date.now()}_${formValues.archivo_cep.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(fileName, formValues.archivo_cep);
        
        if (uploadError) {
          console.error("Error uploading CEP:", uploadError);
          throw new Error("No se pudo subir el archivo CEP");
        }
        
        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(fileName);
        
        nuevoCepUrl = urlData.publicUrl;
      }
      
      // 3. Delete old inactive applications for this payment
      const { error: deleteError } = await supabase
        .from("aplicaciones_pago")
        .delete()
        .eq("id_pago", pagoExistente.id);
      
      if (deleteError) {
        console.error("Error deleting old applications:", deleteError);
        throw new Error("No se pudieron eliminar las aplicaciones antiguas");
      }
      
      // 4. Delete records from STP tables using clave_rastreo
      if (pagoExistente.clave_rastreo) {
        // Delete from tabla_datos_cep (column is "claverastreo" without underscore)
        await supabase
          .from("tabla_datos_cep")
          .delete()
          .eq("claverastreo", pagoExistente.clave_rastreo)
          .then(({ error }) => {
            if (error) console.warn("Could not delete from tabla_datos_cep:", error);
          });
        
        // Delete from pagos_stp_raw
        await supabase
          .from("pagos_stp_raw")
          .delete()
          .eq("claverastreo", pagoExistente.clave_rastreo)
          .then(({ error }) => {
            if (error) console.warn("Could not delete from pagos_stp_raw:", error);
          });
      }
      
      // 5. Reactivate the payment and update monto and evidence ONLY (NOT fecha_pago)
      const updateData: { 
        activo: boolean; 
        monto?: number;
        url_recibo?: string;
        url_cep?: string;
      } = { activo: true };
      
      if (nuevoMonto !== pagoExistente.monto) {
        updateData.monto = nuevoMonto;
      }
      if (nuevaEvidenciaUrl) {
        updateData.url_recibo = nuevaEvidenciaUrl;
      }
      if (nuevoCepUrl) {
        updateData.url_cep = nuevoCepUrl;
      }
      // NOTE: We intentionally do NOT update fecha_pago - keep the original payment date
      
      const { error: updateError } = await supabase
        .from("pagos")
        .update(updateData)
        .eq("id", pagoExistente.id);
      
      if (updateError) {
        console.error("Error reactivating payment:", updateError);
        throw new Error("No se pudo reactivar el pago");
      }
      
      // 6. Execute recalculation of applications
      // Note: The recalcular-aplicaciones function processes payments in order by fecha_pago,
      // so payments with earlier dates will be applied first correctly
      const { error: recalcError } = await supabase.functions.invoke('recalcular-aplicaciones', {
        body: { id_cuenta_cobranza: pagoExistente.id_cuenta_cobranza }
      });
      
      if (recalcError) {
        console.error("Error recalculating applications:", recalcError);
        throw new Error("No se pudieron recalcular las aplicaciones");
      }
      
      // 7. Register activity
      const montoFinal = nuevoMonto !== pagoExistente.monto ? nuevoMonto : pagoExistente.monto;
      await registrarRecuperacionPago({
        id_pago: pagoExistente.id,
        id_cuenta_cobranza: pagoExistente.id_cuenta_cobranza,
        monto_original: pagoExistente.monto,
        monto_nuevo: montoFinal,
        monto_modificado: nuevoMonto !== pagoExistente.monto,
        clave_rastreo: pagoExistente.clave_rastreo
      });
      
      toast({
        title: "Pago recuperado",
        description: `El pago de $${montoFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ha sido reactivado y las aplicaciones recalculadas`,
      });
      
      // 8. Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", pagoExistente.id_cuenta_cobranza] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", pagoExistente.id_cuenta_cobranza] });
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", pagoExistente.id_cuenta_cobranza] });
      queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", pagoExistente.id_cuenta_cobranza] });
      
      // Also invalidate the current account if different
      if (pagoExistente.id_cuenta_cobranza !== cuentaCobranzaId) {
        queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaCobranzaId] });
      }
      
      // Only close dialogs after everything is complete
      setShowRecoveryDialog(false);
      handleClose();
    } catch (error) {
      console.error("Error recovering payment:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo recuperar el pago",
        variant: "destructive",
      });
      setIsRecovering(false);
    }
  };

  // Mutation to create payment with file uploads
  const createPaymentMutation = useMutation({
    mutationFn: async (data: FormData) => {
      let evidenciaUrl = null;
      let cepUrl = null;

      // Upload evidencia file
      if (data.evidencia_pago) {
        const fileName = `evidencia_${Date.now()}_${data.evidencia_pago.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(fileName, data.evidencia_pago);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(fileName);
        
        evidenciaUrl = urlData.publicUrl;
      }

      // Upload CEP file if STP-Manual
      if (data.archivo_cep && isStpManual) {
        const fileName = `cep_${Date.now()}_${data.archivo_cep.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(fileName, data.archivo_cep);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(fileName);
        
        cepUrl = urlData.publicUrl;
      }

      // Only generate clave_rastreo for STP-Manual
      let claveRastreo: string | null = null;
      if (isStpManual) {
        claveRastreo = data.clave_rastreo || "";
      }

      const { data: insertedPayment, error } = await supabase
        .from("pagos")
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          monto: data.monto,
          fecha_pago: data.fecha_pago.toISOString(),
          id_metodos_pago: parseInt(data.id_metodos_pago),
          clave_rastreo: claveRastreo,
          url_recibo: evidenciaUrl,
          url_cep: cepUrl,
          descripcion: data.descripcion || null,
          activo: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Return data needed for webhook
      return {
        monto: data.monto,
        clave_rastreo: claveRastreo,
        id_pago: insertedPayment.id
      };
    },
    onSuccess: async (result) => {
      // Call webhook after successful payment creation
      try {
        // Determine siguiente_accion based on account type
        const siguienteAccion = esMantenimiento
          ? 'aplicar_pago_manual_mantenimiento'
          : (tipoCuenta === 'Producto' || tipoCuenta === 'Servicio') 
            ? 'aplicar_pago_manual_producto'
            : 'aplicar_pago_manual';
        
        const webhookBody = {
          success: true,
          siguiente_accion: siguienteAccion,
          message: "Pago manual aplicado",
          clave_rastreo: result.clave_rastreo,
          id_cuenta_cobranza: cuentaCobranzaId,
          pagos: [{ 
            monto_pagado: result.monto,
            id_pago: result.id_pago 
          }],
          es_stp_manual: isStpManual,
          environment: ENVIRONMENT
        };

        // Enrutar a través de enviar-notificacion para que inyecte
        // URL_WA_base / instanciaWA / urlEndpointWA desde los secrets
        const { error: notifError } = await supabase.functions.invoke('enviar-notificacion', {
          body: { ...webhookBody, n8nPath: 'aplicaPago' },
        });

        if (notifError) {
          console.error('enviar-notificacion (aplicaPago) failed:', notifError);
        }
      } catch (error) {
        console.error('Error calling webhook:', error);
      }

      toast({
        title: "Pago agregado",
        description: "El pago manual ha sido registrado exitosamente",
      });

      // Registrar actividad
      const metodoPagoNombre = metodosPago?.find(m => m.id === parseInt(form.getValues().id_metodos_pago))?.nombre;
      registrarPago({
        id_pago: result.id_pago,
        id_cuenta_cobranza: cuentaCobranzaId,
        cuenta_label: cuentaCobranzaLabel,
        monto: result.monto,
        metodo_pago: metodoPagoNombre,
        es_mantenimiento: esMantenimiento,
        tipo_cuenta: tipoCuenta
      });
      
      // Invalidar queries genéricas
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      
      // Invalidar queries específicas según el tipo de cuenta
      if (esMantenimiento) {
        // Queries específicas de mantenimiento
        queryClient.invalidateQueries({ queryKey: ["cuenta_mantenimiento_detalle", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["multas_mantenimiento", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaCobranzaId] });
      } else {
        // Queries específicas de cuentas de cobranza normales
        queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaCobranzaId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaCobranzaId] });
      }
      
      form.reset();
      onClose();
    },
    onError: (error) => {
      console.error("Error creating payment:", error);
      toast({
        title: "Error",
        description: "No se pudo registrar el pago",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await createPaymentMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validación: Si el pago existe y pertenece a OTRA cuenta, bloquear
    if (pagoExistente && pagoExistente.id_cuenta_cobranza !== cuentaCobranzaId) {
      toast({
        title: "Cuenta incorrecta",
        description: `Este pago pertenece a la cuenta ${formatCuentaLabel(pagoExistente.id_cuenta_cobranza, pagoExistente.tipo_cuenta)}. No se puede agregar a esta cuenta.`,
        variant: "destructive",
      });
      return;
    }
    
    // Block submission if there's an active payment with this clave
    if (pagoExistente?.activo) {
      toast({
        title: "Clave de rastreo duplicada",
        description: `Esta clave ya está registrada en la cuenta ${formatCuentaLabel(pagoExistente.id_cuenta_cobranza, pagoExistente.tipo_cuenta)}`,
        variant: "destructive",
      });
      return;
    }
    
    // Clear previous errors
    form.clearErrors();
    
    // Get form values
    const formValues = form.getValues();
    
    // Validate amount doesn't exceed remaining balance + pending fines
    const montoNuevoPago = typeof formValues.monto === 'number' ? formValues.monto : parseFloat(formValues.monto as any);
    const saldoPrecioFinal = precioFinal - montoPagado;
    const montoMaximoPermitido = saldoPrecioFinal + totalMultasPendientes;
    
    // Round to 2 decimal places to avoid floating point precision issues
    const montoRedondeado = Math.round(montoNuevoPago * 100) / 100;
    const maxRedondeado = Math.round(montoMaximoPermitido * 100) / 100;
    
    if (montoRedondeado > maxRedondeado) {
      toast({
        title: "Error",
        description: `El monto del pago excede el máximo permitido. Saldo pendiente: $${saldoPrecioFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} + Multas: $${totalMultasPendientes.toLocaleString('es-MX', { minimumFractionDigits: 2 })} = Máximo: $${maxRedondeado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        variant: "destructive",
      });
      return;
    }
    
    // Manual validation for STP-Manual
    let hasErrors = false;
    
    if (isStpManual) {
      if (!formValues.clave_rastreo || formValues.clave_rastreo.trim() === "") {
        form.setError("clave_rastreo", {
          type: "required",
          message: "La clave de rastreo es requerida para pagos STP-Manual"
        });
        hasErrors = true;
      }
      
      if (!formValues.archivo_cep) {
        form.setError("archivo_cep", {
          type: "required", 
          message: "El archivo CEP es requerido para pagos STP-Manual"
        });
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      return;
    }

    // If there's an inactive payment found, check if it belongs to this account
    if (pagoExistente && !pagoExistente.activo) {
      // Block if the payment belongs to a different account
      if (pagoExistente.id_cuenta_cobranza !== cuentaCobranzaId) {
        toast({
          title: "Cuenta incorrecta",
          description: `Este pago pertenece a la cuenta ${formatCuentaLabel(pagoExistente.id_cuenta_cobranza, pagoExistente.tipo_cuenta)}. No se puede agregar a esta cuenta.`,
          variant: "destructive",
        });
        return;
      }
      
      // Show recovery dialog for payments of this account
      setNuevoMontoRecuperacion(Math.round(montoNuevoPago * 100));
      setShowRecoveryDialog(true);
      return;
    }

    // If no errors, proceed with normal form validation and submission
    form.handleSubmit(onSubmit)(e);
  };

  const handleClose = () => {
    form.reset();
    setPagoExistente(null);
    setShowRecoveryDialog(false);
    onClose();
  };

  const handleClearClave = () => {
    form.setValue("clave_rastreo", "");
    setPagoExistente(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Agregar Pago Manual</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {esMantenimiento ? 'Cuenta de mantenimiento' : 'Cuenta de cobranza'}: {cuentaCobranzaLabel}
            </p>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="monto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto *</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value ? Math.round(Number(field.value) * 100) : 0}
                          onChange={(cents) => field.onChange((cents / 100).toFixed(2))}
                          placeholder="0.00"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fecha_pago"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Pago *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: es })
                              ) : (
                                <span>Seleccionar fecha</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date()}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="id_metodos_pago"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de Pago *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar método de pago" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {metodosPago?.map((metodo) => (
                          <SelectItem key={metodo.id} value={metodo.id.toString()}>
                            {metodo.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isStpManual && (
                <>
                  <FormField
                    control={form.control}
                    name="clave_rastreo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clave de Rastreo *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              placeholder="Ingresa la clave de rastreo" 
                              {...field} 
                            />
                            {searchingClave && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Alert for duplicate payment detection */}
                  {pagoExistente && (() => {
                    const montoFormulario = form.watch("monto");
                    const nuevoMontoNum = typeof montoFormulario === 'number' ? montoFormulario : parseFloat(String(montoFormulario) || "0");
                    const montosDiferentes = !pagoExistente.activo && nuevoMontoNum > 0 && Math.abs(nuevoMontoNum - pagoExistente.monto) > 0.01;
                    
                    return (
                      <Alert variant={pagoExistente.activo ? "destructive" : "default"} className={!pagoExistente.activo ? "border-primary bg-primary/5" : ""}>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>
                          {pagoExistente.activo ? "Pago ya registrado" : "Pago anterior encontrado"}
                        </AlertTitle>
                        <AlertDescription>
                          <div className="mt-2 space-y-2 text-sm">
                            {/* Show amount with update preview if different */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span><strong>Monto registrado:</strong></span>
                              <span className={montosDiferentes ? "line-through text-muted-foreground" : ""}>
                                ${pagoExistente.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </span>
                              {montosDiferentes && (
                                <>
                                  <ArrowRight className="h-4 w-4 text-primary" />
                                  <span className="font-semibold text-primary">
                                    ${nuevoMontoNum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </span>
                                </>
                              )}
                            </div>
                            <p><strong>Fecha:</strong> {format(new Date(pagoExistente.fecha_pago), 'PPP', { locale: es })}</p>
                            <p><strong>Cuenta:</strong> {formatCuentaLabel(pagoExistente.id_cuenta_cobranza, pagoExistente.tipo_cuenta)}</p>
                            {pagoExistente.activo ? (
                              <p className="text-muted-foreground mt-2">
                                Este pago ya está activo. No se puede crear otro con la misma clave.
                              </p>
                            ) : pagoExistente.id_cuenta_cobranza !== cuentaCobranzaId ? (
                              <p className="text-destructive mt-2 font-medium">
                                ⚠️ Este pago pertenece a otra cuenta. No se puede agregar aquí.
                              </p>
                            ) : (
                              <p className="text-primary mt-2 font-medium">
                                Al guardar, se reactivará este pago{montosDiferentes ? " con el nuevo monto" : ""} y se recalcularán las aplicaciones.
                              </p>
                            )}
                          </div>
                        </AlertDescription>
                      </Alert>
                    );
                  })()}
                </>
              )}

              <FormField
                control={form.control}
                name="evidencia_pago"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
                    <FormLabel>Evidencia *</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onChange(file);
                        }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isStpManual && (
                <FormField
                  control={form.control}
                  name="archivo_cep"
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Archivo CEP *</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onChange(file);
                          }}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="descripcion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Añade una descripción si lo necesitas..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting || isRecovering}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={(() => {
                    if (isSubmitting || createPaymentMutation.isPending || isRecovering) return true;
                    if (pagoExistente?.activo === true) return true;
                    // Disable if payment belongs to a different account
                    if (pagoExistente && !pagoExistente.activo && pagoExistente.id_cuenta_cobranza !== cuentaCobranzaId) return true;
                    
                    const formValues = form.getValues();
                    const monto = typeof formValues.monto === 'number' ? formValues.monto : parseFloat(String(formValues.monto) || "0");
                    
                    // Required fields validation
                    if (monto <= 0) return true;
                    if (!formValues.fecha_pago) return true;
                    if (!formValues.id_metodos_pago) return true;
                    if (!formValues.evidencia_pago) return true;
                    
                    // STP-Manual specific validations
                    if (isStpManual) {
                      if (!formValues.clave_rastreo || formValues.clave_rastreo.trim() === "") return true;
                      if (!formValues.archivo_cep) return true;
                    }
                    
                    return false;
                  })()}
                >
                  {(isSubmitting || createPaymentMutation.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (isRecovering && !showRecoveryDialog) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reactivando...
                    </>
                  ) : (
                    "Guardar Pago"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Recovery confirmation dialog */}
      <AlertDialog 
        open={showRecoveryDialog} 
        onOpenChange={(open) => {
          // Only allow closing if NOT recovering
          if (!isRecovering) {
            setShowRecoveryDialog(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar este pago?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Se reactivará el pago de la cuenta <strong>{pagoExistente ? formatCuentaLabel(pagoExistente.id_cuenta_cobranza, pagoExistente.tipo_cuenta) : ''}</strong>
                  {pagoExistente?.id_cuenta_cobranza === cuentaCobranzaId 
                    ? " y se recalcularán las aplicaciones."
                    : ". Las aplicaciones de esa cuenta serán recalculadas."
                  }
                </p>
                
                <div className="space-y-2">
                  <label htmlFor="nuevo-monto" className="text-sm font-medium">
                    Monto a aplicar
                  </label>
                  <CurrencyInput
                    id="nuevo-monto"
                    value={nuevoMontoRecuperacion}
                    onChange={(value) => setNuevoMontoRecuperacion(value)}
                    placeholder="0.00"
                  />
                  {pagoExistente && nuevoMontoRecuperacion !== Math.round(pagoExistente.monto * 100) && (
                    <p className="text-xs text-muted-foreground">
                      Monto original: ${pagoExistente.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Esta acción eliminará las aplicaciones antiguas y redistribuirá los pagos en el orden correcto.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecovering}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecoverPayment} disabled={isRecovering || nuevoMontoRecuperacion <= 0}>
              {isRecovering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reactivando...
                </>
              ) : (
                "Reactivar y Recalcular"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
