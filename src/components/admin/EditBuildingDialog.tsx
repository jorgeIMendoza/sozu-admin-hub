import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  numero_pisos: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
  modelos: z.array(z.string()).default([]),
});

interface EditBuildingDialogProps {
  building: any;
  projectId: number;
  onBuildingUpdated: () => void;
}

export const EditBuildingDialog = ({ building, projectId, onBuildingUpdated }: EditBuildingDialogProps) => {
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

  // Fetch modelos del proyecto
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
    enabled: open && !!projectId,
  });

  // Fetch modelos actuales del edificio
  const { data: buildingModelos } = useQuery({
    queryKey: ["building-modelos", building.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edificios_modelos")
        .select("id_modelo")
        .eq("id_edificio", building.id)
        .eq("activo", true);
      
      if (error) throw error;
      return data?.map(em => em.id_modelo.toString()) || [];
    },
    enabled: open && !!building.id,
  });

  useEffect(() => {
    if (building && open && buildingModelos) {
      form.reset({
        nombre: building.nombre || "",
        numero_pisos: building.numero_pisos?.toString() || "",
        fecha_lanzamiento: building.fecha_lanzamiento ? new Date(building.fecha_lanzamiento).toISOString().split('T')[0] : "",
        modelos: buildingModelos,
      });
    }
  }, [building, open, form, buildingModelos]);

  const onSubmit = async (values: z.infer<typeof formSchema>, event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    try {
      const updateData: any = {
        nombre: values.nombre,
        numero_pisos: values.numero_pisos || null,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
      };

      const { error } = await supabase
        .from("edificios")
        .update(updateData)
        .eq("id", building.id);

      if (error) throw error;

      // Update model relationships
      // First, delete existing relationships
      const { error: deleteError } = await supabase
        .from("edificios_modelos")
        .delete()
        .eq("id_edificio", building.id);

      if (deleteError) throw deleteError;

      // Then, insert new relationships if any selected
      if (values.modelos && values.modelos.length > 0) {
        const modelRelations = values.modelos.map(modeloId => ({
          id_edificio: building.id,
          id_modelo: parseInt(modeloId),
        }));

        const { error: modelError } = await supabase
          .from("edificios_modelos")
          .insert(modelRelations);

        if (modelError) throw modelError;
      }

      toast({
        title: "Edificio actualizado",
        description: "El edificio se ha actualizado exitosamente.",
      });

      setOpen(false);
      onBuildingUpdated();
    } catch (error) {
      console.error("Error updating building:", error);
      toast({
        title: "Error",
        description: "Hubo un error al actualizar el edificio.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Edificio</DialogTitle>
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
                    <Input placeholder="Ej. Torre A" {...field} />
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
              <Button type="submit">Actualizar Edificio</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};