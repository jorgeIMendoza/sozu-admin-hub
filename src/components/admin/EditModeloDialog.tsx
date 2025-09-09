import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit } from "lucide-react";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  numero_recamaras: z.number().optional(),
  numero_completo_banos: z.number().optional(),
  numero_medio_bano: z.number().optional(),
  caracteristicas: z.array(z.string()).default([]),
});

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
}

interface EditModeloDialogProps {
  modelo: Modelo;
  onModeloUpdated: () => void;
}

export const EditModeloDialog = ({ modelo, onModeloUpdated }: EditModeloDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: modelo.nombre,
      descripcion: modelo.descripcion || "",
      numero_recamaras: modelo.numero_recamaras || undefined,
      numero_completo_banos: modelo.numero_completo_banos || undefined,
      numero_medio_bano: modelo.numero_medio_bano || undefined,
      caracteristicas: [],
    },
  });

  // Fetch características for checkboxes
  const { data: caracteristicas } = useQuery({
    queryKey: ["caracteristicas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caracteristicas")
        .select("*")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch current model characteristics
  const { data: modeloCaracteristicas } = useQuery({
    queryKey: ["modelo-caracteristicas", modelo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos_caracteristicas")
        .select("id_caracteristica")
        .eq("id_modelo", modelo.id)
        .eq("activo", true);

      if (error) throw error;
      
      const caracteristicaIds = data?.map(item => item.id_caracteristica.toString()) || [];
      form.setValue("caracteristicas", caracteristicaIds);
      return caracteristicaIds;
    },
    enabled: open,
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Update modelo
      const modeloData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        numero_recamaras: values.numero_recamaras || null,
        numero_completo_banos: values.numero_completo_banos || null,
        numero_medio_bano: values.numero_medio_bano || null,
      };

      const { error: modeloError } = await supabase
        .from("modelos")
        .update(modeloData)
        .eq("id", modelo.id);

      if (modeloError) throw modeloError;

      // Update características (first deactivate all, then add selected ones)
      await supabase
        .from("modelos_caracteristicas")
        .update({ activo: false })
        .eq("id_modelo", modelo.id);

      if (values.caracteristicas.length > 0) {
        const caracteristicasData = values.caracteristicas.map((caracteristicaId) => ({
          id_modelo: modelo.id,
          id_caracteristica: parseInt(caracteristicaId),
          activo: true,
        }));

        const { error: caracError } = await supabase
          .from("modelos_caracteristicas")
          .upsert(caracteristicasData);

        if (caracError) throw caracError;
      }

      toast({
        title: "Modelo actualizado",
        description: "El modelo ha sido actualizado exitosamente.",
      });

      form.reset();
      setOpen(false);
      onModeloUpdated();
    } catch (error) {
      console.error("Error updating modelo:", error);
      toast({
        title: "Error",
        description: "Hubo un error al actualizar el modelo.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Modelo</DialogTitle>
          <DialogDescription>
            Modifica los datos del modelo.
          </DialogDescription>
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
                    <Input placeholder="Nombre del modelo" {...field} />
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
                    <Textarea 
                      placeholder="Descripción del modelo (opcional)" 
                      {...field}
                    />
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
                      <Input 
                        type="number" 
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
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
                    <FormLabel>Baños</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
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
                    <FormLabel>1/2 Baños</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
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
                  <div className="mb-4">
                    <FormLabel className="text-base">Características</FormLabel>
                  </div>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Actualizar Modelo</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};