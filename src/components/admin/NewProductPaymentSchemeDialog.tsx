import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  porcentaje_enganche: z.string(),
  porcentaje_mensualidades: z.string(),
  porcentaje_entrega: z.string(),
  numero_mensualidades: z.string(),
  porcentaje_descuento_aumento: z.string().default("0"),
}).refine((data) => {
  const enganche = parseFloat(data.porcentaje_enganche) || 0;
  const mensualidades = parseFloat(data.porcentaje_mensualidades) || 0;
  const entrega = parseFloat(data.porcentaje_entrega) || 0;
  const total = enganche + mensualidades + entrega;
  return Math.abs(total - 100) < 0.01;
}, {
  message: "Los porcentajes deben sumar exactamente 100%",
  path: ["porcentaje_entrega"],
}).refine((data) => {
  const mensualidades = parseFloat(data.porcentaje_mensualidades) || 0;
  const numMensualidades = parseInt(data.numero_mensualidades) || 0;
  // If mensualidades percentage is 0, numero_mensualidades must be 0
  // If mensualidades percentage > 0, numero_mensualidades must be >= 1
  if (mensualidades === 0) {
    return numMensualidades === 0;
  }
  return numMensualidades >= 1;
}, {
  message: "Si el porcentaje de mensualidades es 0, el número de mensualidades debe ser 0. Si es mayor a 0, debe haber al menos 1 mensualidad.",
  path: ["numero_mensualidades"],
});

interface NewProductPaymentSchemeDialogProps {
  productId: number;
  onSchemeAdded: () => void;
}

export const NewProductPaymentSchemeDialog = ({ productId, onSchemeAdded }: NewProductPaymentSchemeDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "0",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>, event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    try {
      const enganche = parseFloat(values.porcentaje_enganche);
      const mensualidades = parseFloat(values.porcentaje_mensualidades);
      const entrega = parseFloat(values.porcentaje_entrega);
      const total = enganche + mensualidades + entrega;
      
      if (Math.abs(total - 100) >= 0.01) {
        toast({
          title: "Error de validación",
          description: "Los porcentajes de enganche, mensualidades y entrega deben sumar exactamente 100%",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("esquemas_pago")
        .insert([{
          id_proyecto: null,
          id_producto: productId,
          nombre: values.nombre,
          porcentaje_enganche: enganche || 0,
          porcentaje_mensualidades: mensualidades || 0,
          porcentaje_entrega: entrega || 0,
          numero_mensualidades: parseInt(values.numero_mensualidades) || 0,
          porcentaje_descuento_aumento: parseFloat(values.porcentaje_descuento_aumento) || 0,
          es_manual: false,
        }]);

      if (error) throw error;

      toast({
        title: "Esquema de pago creado",
        description: "El esquema de pago se ha creado exitosamente.",
      });

      // Get project ID from product and trigger notification
      supabase
        .from('productos_servicios')
        .select('id_proyecto')
        .eq('id', productId)
        .single()
        .then(({ data: prod }) => {
          if (prod?.id_proyecto) {
            supabase.functions.invoke('notificar-agentes', {
              body: {
                tipo_evento: 'nuevo_esquema_pago',
                id_proyecto: prod.id_proyecto,
                datos: { nombre_esquema: values.nombre },
              },
            }).catch(err => console.error('Error sending notification:', err));
          }
        });

      form.reset();
      setOpen(false);
      onSchemeAdded();
    } catch (error) {
      console.error("Error creating payment scheme:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear el esquema de pago.",
        variant: "destructive",
      });
    }
  };

  const watchedEnganche = form.watch("porcentaje_enganche");
  const watchedMensualidades = form.watch("porcentaje_mensualidades");
  const remainingPercentage = 100 - (parseFloat(watchedEnganche || "0") + parseFloat(watchedMensualidades || "0"));

  // Auto-set numero_mensualidades to 0 when porcentaje_mensualidades is 0
  useEffect(() => {
    const mensualidadesPct = parseFloat(watchedMensualidades || "0");
    if (mensualidadesPct === 0) {
      form.setValue("numero_mensualidades", "0");
    }
  }, [watchedMensualidades, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Esquema
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Esquema de Pago para Producto</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Esquema</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Esquema 50-30-20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="porcentaje_enganche"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje Enganche (%)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0" 
                        max="100" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="porcentaje_mensualidades"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje Mensualidades (%)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0" 
                        max="100" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="porcentaje_entrega"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Porcentaje Entrega (%) 
                      {remainingPercentage !== 100 && (
                        <span className="text-sm text-muted-foreground ml-1">
                          (Restante: {remainingPercentage.toFixed(2)}%)
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0" 
                        max="100" 
                        step="0.01"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_mensualidades"
                render={({ field }) => {
                  const mensualidadesPct = parseFloat(form.watch("porcentaje_mensualidades") || "0");
                  const isDisabled = mensualidadesPct === 0;
                  
                  return (
                    <FormItem>
                      <FormLabel>Número de Mensualidades</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0" 
                          placeholder={isDisabled ? "0" : "12"} 
                          disabled={isDisabled}
                          {...field}
                          value={isDisabled ? "0" : field.value}
                          onChange={(e) => {
                            if (!isDisabled) {
                              field.onChange(e);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <FormField
              control={form.control}
              name="porcentaje_descuento_aumento"
              render={({ field }) => {
                const value = parseFloat(field.value || "0");
                const isDiscount = value < 0;
                const isIncrease = value > 0;
                
                return (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Porcentaje Descuento/Aumento (%)
                      {isDiscount && (
                        <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                          Descuento
                        </Badge>
                      )}
                      {isIncrease && (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
                          Aumento
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        placeholder="0" 
                        {...field} 
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Usa valores negativos para descuentos (ej: -5 = 5% descuento) y valores positivos para aumentos (ej: 3 = 3% aumento)
                    </p>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Esquema</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
