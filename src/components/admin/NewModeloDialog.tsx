import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ModelCharacteristicsSection } from "./ModelCharacteristicsSection";
import { PlanoArquitectonicoUpload } from "./PlanoArquitectonicoUpload";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  id_proyecto: z.string().min(1, "El proyecto es requerido"),
  descripcion: z.string().optional(),
  numero_recamaras: z.string().optional(),
  numero_completo_banos: z.string().optional(),
  numero_medio_bano: z.string().optional(),
});

interface Proyecto {
  id: number;
  nombre: string;
}

interface NewModeloDialogProps {
  onModeloAdded: () => void;
  proyectos: Proyecto[];
}

export const NewModeloDialog = ({ onModeloAdded, proyectos }: NewModeloDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedCharacteristicIds, setSelectedCharacteristicIds] = useState<string[]>([]);
  const [planoUrl, setPlanoUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      id_proyecto: "",
      descripcion: "",
      numero_recamaras: "",
      numero_completo_banos: "",
      numero_medio_bano: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>, event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Check if form is valid before proceeding
    const isValid = await form.trigger();
    if (!isValid) {
      return; // Don't close modal or show success message
    }

    try {
      const modeloData = {
        nombre: values.nombre,
        id_proyecto: parseInt(values.id_proyecto),
        descripcion: values.descripcion || null,
        numero_recamaras: values.numero_recamaras ? parseInt(values.numero_recamaras) : null,
        numero_completo_banos: values.numero_completo_banos ? parseInt(values.numero_completo_banos) : null,
        numero_medio_bano: values.numero_medio_bano ? parseInt(values.numero_medio_bano) : null,
        plano_arquitectonico: planoUrl,
      };

      const { data: newModelo, error } = await supabase
        .from("modelos")
        .insert(modeloData)
        .select()
        .single();

      if (error) throw error;

      // Insert characteristic relationships if any selected
      if (selectedCharacteristicIds.length > 0) {
        const characteristicRelations = selectedCharacteristicIds.map(caracteristicaId => ({
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
              name="id_proyecto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proyecto</FormLabel>
                  <FormControl>
                    <Combobox
                      value={field.value}
                      onValueChange={field.onChange}
                      options={proyectos.map((proyecto) => ({
                        label: proyecto.nombre,
                        value: proyecto.id.toString(),
                      }))}
                      placeholder="Selecciona un proyecto"
                      searchPlaceholder="Buscar proyecto..."
                      emptyText="No se encontró el proyecto"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <ModelCharacteristicsSection
              selectedCharacteristicIds={selectedCharacteristicIds}
              onCharacteristicsChange={setSelectedCharacteristicIds}
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