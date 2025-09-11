import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  numero_pisos: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
});

interface EditBuildingDialogProps {
  building: any;
  onBuildingUpdated: () => void;
}

export const EditBuildingDialog = ({ building, onBuildingUpdated }: EditBuildingDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      numero_pisos: "",
      fecha_lanzamiento: "",
    },
  });

  useEffect(() => {
    if (building && open) {
      form.reset({
        nombre: building.nombre || "",
        numero_pisos: building.numero_pisos?.toString() || "",
        fecha_lanzamiento: building.fecha_lanzamiento ? new Date(building.fecha_lanzamiento).toISOString().split('T')[0] : "",
      });
    }
  }, [building, open, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const updateData: any = {
        nombre: values.nombre,
      };

      if (values.numero_pisos) {
        updateData.numero_pisos = parseInt(values.numero_pisos);
      }

      if (values.fecha_lanzamiento) {
        updateData.fecha_lanzamiento = values.fecha_lanzamiento;
      }

      const { error } = await supabase
        .from("edificios")
        .update(updateData)
        .eq("id", building.id);

      if (error) throw error;

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <FormLabel>Número de Pisos</FormLabel>
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