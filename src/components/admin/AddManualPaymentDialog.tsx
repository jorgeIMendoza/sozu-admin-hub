import { useState, useEffect } from "react";
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
import { Calendar, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from "@/lib/config";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

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

interface AddManualPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  cuentaCobranzaLabel: string;
  tipoCuenta?: 'Propiedad' | 'Producto' | 'Servicio';
  precioFinal: number;
  montoPagado: number;
  esMantenimiento?: boolean;
}

export function AddManualPaymentDialog({ 
  isOpen, 
  onClose, 
  cuentaCobranzaId, 
  cuentaCobranzaLabel,
  tipoCuenta = 'Propiedad',
  precioFinal,
  montoPagado,
  esMantenimiento = false
}: AddManualPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const isStpManual = selectedPaymentMethod && metodosPago?.find(m => m.id.toString() === selectedPaymentMethod)?.nombre.toLowerCase().includes("stp-manual");

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

        const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookBody),
        });

        if (!response.ok) {
          console.error('Webhook call failed:', response.statusText);
        }
      } catch (error) {
        console.error('Error calling webhook:', error);
      }

      toast({
        title: "Pago agregado",
        description: "El pago manual ha sido registrado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
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
    
    // Clear previous errors
    form.clearErrors();
    
    // Get form values
    const formValues = form.getValues();
    
    // Validate amount doesn't exceed remaining balance
    const montoNuevoPago = typeof formValues.monto === 'number' ? formValues.monto : parseFloat(formValues.monto as any);
    const montoRestante = precioFinal - montoPagado;
    
    if (montoNuevoPago > montoRestante) {
      toast({
        title: "Error",
        description: `El monto del pago ($${montoNuevoPago.toLocaleString('es-MX', { minimumFractionDigits: 2 })}) más lo ya pagado ($${montoPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}) sobrepasa el precio final ($${precioFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}). El monto máximo permitido es $${montoRestante.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`,
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

    // If no errors, proceed with normal form validation and submission
    form.handleSubmit(onSubmit)(e);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
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
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
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
              <FormField
                control={form.control}
                name="clave_rastreo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clave de Rastreo *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ingresa la clave de rastreo" 
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
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || createPaymentMutation.isPending}>
                {(isSubmitting || createPaymentMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Guardar Pago
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}