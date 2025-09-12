import { useState, useEffect } from "react";
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
import { Edit, Trash2, MapPin, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { BuildingManagement } from "./BuildingManagement";
import { PaymentSchemeManagement } from "./PaymentSchemeManagement";
import { ProjectLegalEntitiesSection } from "./ProjectLegalEntitiesSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GoogleMapComponent } from "./GoogleMapComponent";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  direccion: z.string().optional(),
  id_tipo_uso: z.string().min(1, "El tipo de uso es requerido"),
  precio_m2: z.string().optional(),
  fecha_inicio: z.string().optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  amenidades: z.array(z.string()).default([]),
  url_logo: z.string().optional(),
  url_firma_recibos: z.string().optional(),
  nombre_firmante_recibos: z.string().optional(),
  url_imagen_portada: z.string().optional(),
});

interface EditProjectDialogProps {
  projectId: number;
  onProjectUpdated: () => void;
}

export const EditProjectDialog = ({ projectId, onProjectUpdated }: EditProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
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
      latitud: undefined,
      longitud: undefined,
      amenidades: [],
      url_logo: "",
      url_firma_recibos: "",
      nombre_firmante_recibos: "",
      url_imagen_portada: "",
    },
  });

  const { data: project, isLoading: isLoadingProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          *,
          amenidades_proyectos (
            id_amenidad
          )
        `)
        .eq("id", projectId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: open,
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

  // Populate form when project data is loaded
  useEffect(() => {
    if (project) {
      const initialLocation = project.latitud && project.longitud 
        ? { lat: project.latitud, lng: project.longitud }
        : null;
      
      setSelectedLocation(initialLocation);
      
      form.reset({
        nombre: project.nombre || "",
        descripcion: project.descripcion || "",
        direccion: project.direccion || "",
        id_tipo_uso: project.id_tipo_uso?.toString() || "",
        precio_m2: project.precio_m2?.toString() || "",
        fecha_inicio: project.fecha_inicio || "",
        latitud: project.latitud || undefined,
        longitud: project.longitud || undefined,
        amenidades: project.amenidades_proyectos?.map((ap: any) => ap.id_amenidad.toString()) || [],
        url_logo: project.url_logo || "",
        url_firma_recibos: project.url_firma_recibos || "",
        nombre_firmante_recibos: project.nombre_firmante_recibos || "",
        url_imagen_portada: project.url_imagen_portada || "",
      });
    }
  }, [project, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const projectData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion: values.direccion || null,
        id_tipo_uso: parseInt(values.id_tipo_uso),
        precio_m2: values.precio_m2 ? parseFloat(values.precio_m2) : null,
        fecha_inicio: values.fecha_inicio || null,
        latitud: selectedLocation?.lat || null,
        longitud: selectedLocation?.lng || null,
        url_logo: values.url_logo || null,
        url_firma_recibos: values.url_firma_recibos || null,
        nombre_firmante_recibos: values.nombre_firmante_recibos || null,
        url_imagen_portada: values.url_imagen_portada || null,
      };

      const { error: updateError } = await supabase
        .from("proyectos")
        .update(projectData)
        .eq("id", projectId);

      if (updateError) throw updateError;

      // Update amenities relationships
      // First, delete existing relationships
      const { error: deleteError } = await supabase
        .from("amenidades_proyectos")
        .delete()
        .eq("id_proyecto", projectId);

      if (deleteError) throw deleteError;

      // Then, insert new relationships if any selected
      if (values.amenidades && values.amenidades.length > 0) {
        const amenityRelations = values.amenidades.map(amenidadId => ({
          id_proyecto: projectId,
          id_amenidad: parseInt(amenidadId),
        }));

        const { error: amenityError } = await supabase
          .from("amenidades_proyectos")
          .insert(amenityRelations);

        if (amenityError) throw amenityError;
      }

      toast({
        title: "Proyecto actualizado",
        description: "El proyecto se ha actualizado exitosamente.",
      });

      setOpen(false);
      onProjectUpdated();
    } catch (error) {
      console.error("Error updating project:", error);
      toast({
        title: "Error",
        description: "Hubo un error al actualizar el proyecto.",
        variant: "destructive",
      });
    }
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50">
          <Edit className="h-4 w-4 mr-1" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Proyecto</DialogTitle>
        </DialogHeader>
        {isLoadingProject ? (
          <div className="flex justify-center py-4">
            <p>Cargando...</p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="edit-project-form">
              <Tabs defaultValue="information" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="information">Información</TabsTrigger>
                  <TabsTrigger value="images">Imágenes principales</TabsTrigger>
                  <TabsTrigger value="legal-entities">Entidades Legales</TabsTrigger>
                </TabsList>
                
                <TabsContent value="information" className="mt-6">
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
                        <Select onValueChange={field.onChange} value={field.value}>
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

                  {/* Location and Address Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
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
                      
                      {selectedLocation && (
                        <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4" />
                            <div>
                              <p className="font-medium">Coordenadas seleccionadas:</p>
                              <p>Lat: {selectedLocation.lat.toFixed(6)}</p>
                              <p>Lng: {selectedLocation.lng.toFixed(6)}</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const coordinates = `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`;
                              navigator.clipboard.writeText(coordinates);
                              toast({
                                title: "Coordenadas copiadas",
                                description: coordinates,
                              });
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-4 h-4" />
                        <label className="text-sm font-medium">Ubicación en Google Maps</label>
                      </div>
                      <GoogleMapComponent
                        onLocationSelect={setSelectedLocation}
                        onAddressSelect={(address) => form.setValue('direccion', address)}
                        initialLocation={selectedLocation}
                      />
                      <p className="text-xs text-muted-foreground">
                        Haz clic en el mapa para seleccionar la ubicación del proyecto
                      </p>
                    </div>
                  </div>

                  {/* Building Management Section */}
                  <div className="space-y-3">
                    <BuildingManagement projectId={projectId} />
                  </div>

                  {/* Payment Scheme Management Section */}
                  <div className="space-y-3">
                    <PaymentSchemeManagement projectId={projectId} />
                  </div>

                  <FormField
                    control={form.control}
                    name="amenidades"
                    render={() => (
                      <FormItem>
                        <FormLabel>Amenidades</FormLabel>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
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
                    <Button type="submit">Actualizar Proyecto</Button>
                  </div>
                </TabsContent>

                <TabsContent value="images" className="mt-6">
                  <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="url_logo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo del Proyecto</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="URL del logo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="url_imagen_portada"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imagen de Portada</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="URL de la imagen de portada" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="url_firma_recibos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Imagen de Firma para Recibos</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="URL de la firma" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nombre_firmante_recibos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Firmante</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre completo del firmante" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Actualizar Proyecto</Button>
                  </div>
                </div>
                </TabsContent>
                
                <TabsContent value="legal-entities" className="mt-6">
                  <ProjectLegalEntitiesSection projectId={projectId} />
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};