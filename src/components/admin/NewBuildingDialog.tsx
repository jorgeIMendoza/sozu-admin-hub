import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  numero_pisos: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
  modelos: z.array(z.string()).default([]),
});

interface NewBuildingDialogProps {
  projectId: number;
  onBuildingAdded: () => void;
}

export const NewBuildingDialog = ({ projectId, onBuildingAdded }: NewBuildingDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      numero_pisos: "",
      fecha_lanzamiento: "",
      modelos: [],
    },
  });

  const { data: modelos } = useQuery({
    queryKey: ["modelos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("activo", true)
        .eq("id_proyecto", projectId)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>, event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    try {
      const buildingData = {
        nombre: values.nombre,
        id_proyecto: projectId,
        numero_pisos: values.numero_pisos || null,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
      };

      const { data: newBuilding, error } = await supabase
        .from("edificios")
        .insert(buildingData)
        .select()
        .single();

      if (error) throw error;

      // Insert model relationships if any selected
      if (values.modelos && values.modelos.length > 0) {
        const modelRelations = values.modelos.map(modeloId => ({
          id_edificio: newBuilding.id,
          id_modelo: parseInt(modeloId),
        }));

        const { error: modelError } = await supabase
          .from("edificios_modelos")
          .insert(modelRelations);

        if (modelError) throw modelError;
      }

      toast({
        title: "Edificio creado",
        description: "El edificio se ha creado exitosamente.",
      });

      form.reset();
      setOpen(false);
      onBuildingAdded();
    } catch (error) {
      console.error("Error creating building:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear el edificio.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Building2 className="h-4 w-4 mr-2" />
          Agregar Edificio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Edificio</DialogTitle>
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
                  <FormLabel>Nombre del Edificio</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Torre A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="numero_pisos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Niveles</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fecha_lanzamiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Lanzamiento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modelos"
              render={() => (
                <FormItem>
                  <FormLabel>Modelos</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {modelos?.map((modelo) => (
                      <FormField
                        key={modelo.id}
                        control={form.control}
                        name="modelos"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={modelo.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(modelo.id.toString())}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, modelo.id.toString()])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== modelo.id.toString()
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {modelo.nombre}
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
              <Button type="submit">Crear Edificio</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};