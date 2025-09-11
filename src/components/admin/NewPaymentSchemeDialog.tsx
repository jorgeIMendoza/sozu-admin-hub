import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  porcentaje_enganche: z.string().min(1, "El porcentaje de enganche es requerido"),
  porcentaje_mensualidades: z.string().min(1, "El porcentaje de mensualidades es requerido"),
  porcentaje_entrega: z.string().min(1, "El porcentaje de entrega es requerido"),
  numero_mensualidades: z.string().min(1, "El número de mensualidades es requerido"),
  porcentaje_descuento_aumento: z.string().default("0"),
}).refine((data) => {
  const enganche = parseFloat(data.porcentaje_enganche);
  const mensualidades = parseFloat(data.porcentaje_mensualidades);
  const entrega = parseFloat(data.porcentaje_entrega);
  const total = enganche + mensualidades + entrega;
  return Math.abs(total - 100) < 0.01; // Allow for small floating point errors
}, {
  message: "Los porcentajes de enganche, mensualidades y entrega deben sumar exactamente 100%",
  path: ["porcentaje_entrega"], // Show error on the last field
});

interface NewPaymentSchemeDialogProps {
  projectId: number;
  onSchemeAdded: () => void;
}

export const NewPaymentSchemeDialog = ({ projectId, onSchemeAdded }: NewPaymentSchemeDialogProps) => {
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

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const { error } = await supabase
        .from("esquemas_pago")
        .insert([{
          id_proyecto: projectId,
          id_producto: 1, // Default product ID - you may need to adjust this
          nombre: values.nombre,
          porcentaje_enganche: parseFloat(values.porcentaje_enganche),
          porcentaje_mensualidades: parseFloat(values.porcentaje_mensualidades),
          porcentaje_entrega: parseFloat(values.porcentaje_entrega),
          numero_mensualidades: parseInt(values.numero_mensualidades),
          porcentaje_descuento_aumento: parseFloat(values.porcentaje_descuento_aumento),
        }]);

      if (error) throw error;

      toast({
        title: "Esquema de pago creado",
        description: "El esquema de pago se ha creado exitosamente.",
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

  // Calculate remaining percentage for entrega field
  const watchedEnganche = form.watch("porcentaje_enganche");
  const watchedMensualidades = form.watch("porcentaje_mensualidades");
  const remainingPercentage = 100 - (parseFloat(watchedEnganche || "0") + parseFloat(watchedMensualidades || "0"));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Agregar Esquema de Pago
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Esquema de Pago</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Mensualidades</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="1" 
                        placeholder="12" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="porcentaje_descuento_aumento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Porcentaje Descuento/Aumento (%)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      placeholder="0.00" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
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