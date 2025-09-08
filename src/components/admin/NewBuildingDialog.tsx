import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  numero_pisos: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
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
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const buildingData = {
        nombre: values.nombre,
        id_proyecto: projectId,
        numero_pisos: values.numero_pisos || null,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
      };

      const { error } = await supabase
        .from("edificios")
        .insert(buildingData);

      if (error) throw error;

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <FormLabel>Número de Pisos</FormLabel>
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