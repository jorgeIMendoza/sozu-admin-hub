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
import { TramosEscalonadosSection, Tramo } from "./TramosEscalonadosSection";

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
});

interface NewPaymentSchemeDialogProps {
  projectId: number;
  onSchemeAdded: () => void;
  canCreate?: boolean;
}

export const NewPaymentSchemeDialog = ({ projectId, onSchemeAdded, canCreate = true }: NewPaymentSchemeDialogProps) => {
  const [open, setOpen] = useState(false);
  const [tramosEnabled, setTramosEnabled] = useState(false);
  const [tramos, setTramos] = useState<Tramo[]>([]);
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

  const watchedMensualidades = form.watch("porcentaje_mensualidades");
  const watchedNumMensualidades = form.watch("numero_mensualidades");
  const watchedEnganche = form.watch("porcentaje_enganche");

  const mensualidadesPct = parseFloat(watchedMensualidades || "0");
  const numMensualidades = parseInt(watchedNumMensualidades || "0");
  const showTramos = numMensualidades > 1;

  // Reset tramos when conditions no longer met
  useEffect(() => {
    if (!showTramos && tramosEnabled) {
      setTramosEnabled(false);
      setTramos([]);
    }
  }, [showTramos, tramosEnabled]);

  const remainingPercentage = 100 - (parseFloat(watchedEnganche || "0") + parseFloat(watchedMensualidades || "0"));

  // Auto-set numero_mensualidades to 0 only when porcentaje_mensualidades is 0 AND no tramos with fixed amounts
  useEffect(() => {
    if (mensualidadesPct === 0 && !tramosEnabled) {
      form.setValue("numero_mensualidades", "0");
    }
  }, [watchedMensualidades, tramosEnabled, form]);

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

      // Validate tramos if enabled
      if (tramosEnabled && tramos.length > 0) {
        const sumTramos = tramos.reduce((sum, t) => sum + (t.numero_mensualidades || 0), 0);
        const totalMens = parseInt(values.numero_mensualidades) || 0;
        if (sumTramos !== totalMens) {
          toast({
            title: "Error de validación",
            description: `La suma de mensualidades en los tramos (${sumTramos}) debe ser igual al total de mensualidades (${totalMens}).`,
            variant: "destructive",
          });
          return;
        }
      }

      const insertData: any = {
        id_proyecto: projectId,
        id_producto: null,
        nombre: values.nombre,
        porcentaje_enganche: enganche || 0,
        porcentaje_mensualidades: mensualidades || 0,
        porcentaje_entrega: entrega || 0,
        numero_mensualidades: parseInt(values.numero_mensualidades) || 0,
        porcentaje_descuento_aumento: parseFloat(values.porcentaje_descuento_aumento) || 0,
      };

      if (tramosEnabled && tramos.length > 0) {
        insertData.tramos_mensualidad = tramos;
      }

      const { error } = await supabase
        .from("esquemas_pago")
        .insert([insertData]);

      if (error) throw error;

      toast({
        title: "Esquema de pago creado",
        description: "El esquema de pago se ha creado exitosamente.",
      });

      // Trigger notification
      supabase.functions.invoke('notificar-agentes', {
        body: {
          tipo_evento: 'nuevo_esquema_pago',
          id_proyecto: projectId,
          datos: { nombre_esquema: values.nombre },
        },
      }).catch(err => console.error('Error sending notification:', err));

      form.reset();
      setTramosEnabled(false);
      setTramos([]);
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

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (!o) {
        setTramosEnabled(false);
        setTramos([]);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!canCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar Esquema de Pago
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Esquema de Pago</DialogTitle>
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
                      <Input type="number" min="0" max="100" step="0.01" placeholder="0.00" {...field} />
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
                      <Input type="number" min="0" max="100" step="0.01" placeholder="0.00" {...field} />
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
                      <Input type="number" min="0" max="100" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numero_mensualidades"
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Número de Mensualidades</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" min="0" 
                          placeholder="12" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <TramosEscalonadosSection
              enabled={tramosEnabled}
              onEnabledChange={setTramosEnabled}
              tramos={tramos}
              onTramosChange={setTramos}
              totalMensualidades={numMensualidades}
              visible={showTramos}
            />

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
                      {isDiscount && <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">Descuento</Badge>}
                      {isIncrease && <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">Aumento</Badge>}
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0" {...field} />
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Crear Esquema</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
