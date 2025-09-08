import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  numero_recamaras: z.string().optional(),
  numero_completo_banos: z.string().optional(),
  numero_medio_bano: z.string().optional(),
  caracteristicas: z.array(z.string()).default([]),
});

interface NewModeloDialogProps {
  onModeloAdded: () => void;
}

export const NewModeloDialog = ({ onModeloAdded }: NewModeloDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      numero_recamaras: "",
      numero_completo_banos: "",
      numero_medio_bano: "",
      caracteristicas: [],
    },
  });

  const { data: caracteristicas } = useQuery({
    queryKey: ["caracteristicas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caracteristicas")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const modeloData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        numero_recamaras: values.numero_recamaras ? parseInt(values.numero_recamaras) : null,
        numero_completo_banos: values.numero_completo_banos ? parseInt(values.numero_completo_banos) : null,
        numero_medio_bano: values.numero_medio_bano ? parseInt(values.numero_medio_bano) : null,
      };

      const { data: newModelo, error } = await supabase
        .from("modelos")
        .insert(modeloData)
        .select()
        .single();

      if (error) throw error;

      // Insert characteristic relationships if any selected
      if (values.caracteristicas && values.caracteristicas.length > 0) {
        const characteristicRelations = values.caracteristicas.map(caracteristicaId => ({
          id_modelo: newModelo.id,
          id_caracteristica: parseInt(caracteristicaId),
        }));

        const { error: characteristicError } = await supabase
          .from("modelos_caracteristicas")
          .insert(characteristicRelations);

        if (characteristicError) throw characteristicError;
      }

      toast({
        title: "Modelo creado",
        description: "El modelo se ha creado exitosamente.",
      });

      form.reset();
      setOpen(false);
      onModeloAdded();
    } catch (error) {
      console.error("Error creating modelo:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear el modelo.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary-hover">
          <Home className="h-4 w-4 mr-2" />
          Nuevo Modelo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Modelo</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Modelo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Modelo A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descripción del modelo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="numero_recamaras"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recámaras</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_completo_banos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Baños Completos</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numero_medio_bano"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medios Baños</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="caracteristicas"
              render={() => (
                <FormItem>
                  <FormLabel>Características</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {caracteristicas?.map((caracteristica) => (
                      <FormField
                        key={caracteristica.id}
                        control={form.control}
                        name="caracteristicas"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={caracteristica.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(caracteristica.id.toString())}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, caracteristica.id.toString()])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== caracteristica.id.toString()
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {caracteristica.nombre}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Modelo</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};