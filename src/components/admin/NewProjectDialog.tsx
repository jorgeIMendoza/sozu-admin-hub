import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { BuildingFormSection, Building } from "./BuildingFormSection";

const BuildingSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  numero_pisos: z.string(),
  fecha_lanzamiento: z.string(),
  modelos: z.array(z.string()),
});

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  direccion: z.string().optional(),
  id_tipo_uso: z.string().min(1, "El tipo de uso es requerido"),
  precio_m2: z.string().optional(),
  fecha_inicio: z.string().optional(),
  amenidades: z.array(z.string()).default([]),
  edificios: z.array(BuildingSchema).default([]),
});

interface NewProjectDialogProps {
  onProjectAdded: () => void;
}

export const NewProjectDialog = ({ onProjectAdded }: NewProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      direccion: "",
      id_tipo_uso: "",
      precio_m2: "",
      fecha_inicio: "",
      amenidades: [],
      edificios: [],
    },
  });

  const { data: tiposUso } = useQuery({
    queryKey: ["tipos-uso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_uso")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: amenidades } = useQuery({
    queryKey: ["amenidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenidades")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const projectData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion: values.direccion || null,
        id_tipo_uso: parseInt(values.id_tipo_uso),
        precio_m2: values.precio_m2 ? parseFloat(values.precio_m2) : null,
        fecha_inicio: values.fecha_inicio || null,
      };

      const { data: newProject, error } = await supabase
        .from("proyectos")
        .insert(projectData)
        .select()
        .single();

      if (error) throw error;

      // Insert amenities relationships if any selected
      if (values.amenidades && values.amenidades.length > 0) {
        const amenityRelations = values.amenidades.map(amenidadId => ({
          id_proyecto: newProject.id,
          id_amenidad: parseInt(amenidadId),
        }));

        const { error: amenityError } = await supabase
          .from("amenidades_proyectos")
          .insert(amenityRelations);

        if (amenityError) throw amenityError;
      }

      // Create buildings if any defined
      if (values.edificios && values.edificios.length > 0) {
        for (const edificio of values.edificios) {
          if (edificio.nombre.trim()) {
            const buildingData = {
              nombre: edificio.nombre,
              id_proyecto: newProject.id,
              numero_pisos: edificio.numero_pisos || null,
              fecha_lanzamiento: edificio.fecha_lanzamiento || null,
            };

            const { data: newBuilding, error: buildingError } = await supabase
              .from("edificios")
              .insert(buildingData)
              .select()
              .single();

            if (buildingError) throw buildingError;

            // Insert model relationships if any selected
            if (edificio.modelos && edificio.modelos.length > 0) {
              const modelRelations = edificio.modelos.map(modeloId => ({
                id_edificio: newBuilding.id,
                id_modelo: parseInt(modeloId),
              }));

              const { error: modelError } = await supabase
                .from("edificios_modelos")
                .insert(modelRelations);

              if (modelError) throw modelError;
            }
          }
        }
      }

      toast({
        title: "Proyecto creado",
        description: "El proyecto se ha creado exitosamente.",
      });

      form.reset();
      setOpen(false);
      onProjectAdded();
    } catch (error) {
      console.error("Error creating project:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear el proyecto.",
        variant: "destructive",
      });
    }
  };

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
      onProjectAdded();
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Proyecto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ingrese el nombre del proyecto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_tipo_uso"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Uso</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tipo de uso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tiposUso?.map((tipo) => (
                        <SelectItem key={tipo.id} value={tipo.id.toString()}>
                          {tipo.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Textarea placeholder="Descripción del proyecto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input placeholder="Dirección del proyecto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="precio_m2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio por m²</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fecha_inicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Inicio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Building Management Section */}
            <FormField
              control={form.control}
              name="edificios"
              render={({ field }) => (
                <FormItem>
                  <BuildingFormSection
                    buildings={field.value as Building[]}
                    onBuildingsChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amenidades"
              render={() => (
                <FormItem>
                  <FormLabel>Amenidades</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {amenidades?.map((amenidad) => (
                      <FormField
                        key={amenidad.id}
                        control={form.control}
                        name="amenidades"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={amenidad.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(amenidad.id.toString())}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, amenidad.id.toString()])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== amenidad.id.toString()
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {amenidad.nombre}
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
                <Button type="submit">Crear Proyecto</Button>
              </div>
            </form>
          </Form>
      </DialogContent>
    </Dialog>
  );
};