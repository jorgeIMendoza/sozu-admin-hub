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
import { Combobox } from "@/components/ui/combobox";
import { ModelCharacteristicsSection } from "./ModelCharacteristicsSection";
import { PlanoArquitectonicoUpload } from "./PlanoArquitectonicoUpload";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  numero_recamaras: z.number().optional(),
  numero_completo_banos: z.number().optional(),
  numero_medio_bano: z.number().optional(),
  id_proyecto: z.string().min(1, "El proyecto es requerido"),
});

interface Proyecto {
  id: number;
  nombre: string;
}

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
  id_proyecto?: number | null;
}

interface EditModeloDialogProps {
  modelo: Modelo;
  onModeloUpdated: () => void;
  proyectos: Proyecto[];
}

export const EditModeloDialog = ({ modelo, onModeloUpdated, proyectos }: EditModeloDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedCharacteristicIds, setSelectedCharacteristicIds] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: modelo.nombre,
      descripcion: modelo.descripcion || "",
      numero_recamaras: modelo.numero_recamaras || undefined,
      numero_completo_banos: modelo.numero_completo_banos || undefined,
      numero_medio_bano: modelo.numero_medio_bano || undefined,
      id_proyecto: modelo.id_proyecto?.toString() || "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>, event?: any) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    try {
      // Update modelo
      const modeloData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        numero_recamaras: values.numero_recamaras || null,
        numero_completo_banos: values.numero_completo_banos || null,
        numero_medio_bano: values.numero_medio_bano || null,
        id_proyecto: parseInt(values.id_proyecto),
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

      if (selectedCharacteristicIds.length > 0) {
        const caracteristicasData = selectedCharacteristicIds.map((caracteristicaId) => ({
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Modelo</DialogTitle>
          <DialogDescription>
            Modifica los datos del modelo.
          </DialogDescription>
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

            <ModelCharacteristicsSection
              modelId={modelo.id}
              onCharacteristicsChange={setSelectedCharacteristicIds}
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