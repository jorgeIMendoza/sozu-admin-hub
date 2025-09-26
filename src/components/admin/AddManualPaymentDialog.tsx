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

const formSchema = z.object({
  monto: z.string().min(1, "El monto es requerido").transform((val) => parseFloat(val)),
  fecha_pago: z.date({
    required_error: "La fecha de pago es requerida",
  }),
  id_metodos_pago: z.string().min(1, "El método de pago es requerido"),
  clave_rastreo: z.string().min(1, "La clave de rastreo es requerida"),
  url_recibo: z.string().optional(),
  url_cep: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddManualPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  cuentaCobranzaLabel: string;
}

export function AddManualPaymentDialog({ 
  isOpen, 
  onClose, 
  cuentaCobranzaId, 
  cuentaCobranzaLabel 
}: AddManualPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      fecha_pago: new Date(),
      id_metodos_pago: "",
      clave_rastreo: "",
      url_recibo: "",
      url_cep: "",
    },
  });

  // Auto-generate clave_rastreo when fecha_pago changes
  useEffect(() => {
    const fechaPago = form.watch("fecha_pago");
    if (fechaPago) {
      generateClaveRastreo(fechaPago).then((claveRastreo) => {
        form.setValue("clave_rastreo", claveRastreo);
      }).catch((error) => {
        console.error("Error generating clave_rastreo:", error);
      });
    }
  }, [form.watch("fecha_pago")]);

  // Fetch payment methods
  const { data: metodosPago } = useQuery({
    queryKey: ["metodos_pago"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metodos_pago")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  // Mutation to create payment
  const createPaymentMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase
        .from("pagos")
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          monto: data.monto,
          fecha_pago: data.fecha_pago.toISOString(),
          id_metodos_pago: parseInt(data.id_metodos_pago),
          clave_rastreo: data.clave_rastreo || null,
          url_recibo: data.url_recibo || null,
          url_cep: data.url_cep || null,
          activo: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Pago agregado",
        description: "El pago manual ha sido registrado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
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
            Cuenta de cobranza: {cuentaCobranzaLabel}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            <FormField
              control={form.control}
              name="clave_rastreo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clave de Rastreo (Generada automáticamente)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Se genera automáticamente" 
                      readOnly 
                      className="bg-muted"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url_recibo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL del Recibo</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url_cep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL del CEP</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Guardar Pago"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}