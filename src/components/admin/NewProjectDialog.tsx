import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { MapPin, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { BuildingFormSection, Building } from "./BuildingFormSection";
import { PaymentSchemeFormSection, PaymentScheme } from "./PaymentSchemeFormSection";
import { PaymentSchemeManagement } from "./PaymentSchemeManagement";
import { GoogleMapComponent } from "./GoogleMapComponent";

const BuildingSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  numero_pisos: z.string(),
  fecha_lanzamiento: z.string(),
  modelos: z.array(z.string()),
});

const PaymentSchemeSchema = z.object({
  id: z.string(),
  nombre: z.string().min(1, "El nombre es requerido"),
  porcentaje_enganche: z.string().min(1, "El porcentaje de enganche es requerido"),
  porcentaje_mensualidades: z.string().min(1, "El porcentaje de mensualidades es requerido"),
  porcentaje_entrega: z.string().min(1, "El porcentaje de entrega es requerido"),
  numero_mensualidades: z.string().min(1, "El número de mensualidades es requerido"),
  porcentaje_descuento_aumento: z.string().default("0")
});

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
  edificios: z.array(BuildingSchema).default([]),
  esquemas_pago: z.array(PaymentSchemeSchema).default([]),
  url_logo: z.string().optional(),
  url_firma_recibos: z.string().optional(),
  nombre_firmante_recibos: z.string().optional(),
  url_imagen_portada: z.string().optional(),
});

interface NewProjectDialogProps {
  onProjectAdded: () => void;
}

export const NewProjectDialog = ({ onProjectAdded }: NewProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [paymentSchemes, setPaymentSchemes] = useState<PaymentScheme[]>([]);
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
      edificios: [],
      esquemas_pago: [],
      url_logo: "",
      url_firma_recibos: "",
      nombre_firmante_recibos: "",
      url_imagen_portada: "",
    },
  });

  // Update form with buildings and payment schemes state
  form.setValue('edificios', buildings);
  form.setValue('esquemas_pago', paymentSchemes);

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
        latitud: selectedLocation?.lat || null,
        longitud: selectedLocation?.lng || null,
        url_logo: values.url_logo || null,
        url_firma_recibos: values.url_firma_recibos || null,
        nombre_firmante_recibos: values.nombre_firmante_recibos || null,
        url_imagen_portada: values.url_imagen_portada || null,
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

      // Create payment schemes for the project
      if (values.esquemas_pago && values.esquemas_pago.length > 0) {
        for (const scheme of values.esquemas_pago) {
          if (scheme.nombre && scheme.porcentaje_enganche && scheme.porcentaje_mensualidades && scheme.porcentaje_entrega && scheme.numero_mensualidades) {
            // Validate percentages sum to 100
            const enganche = parseFloat(scheme.porcentaje_enganche);
            const mensualidades = parseFloat(scheme.porcentaje_mensualidades);
            const entrega = parseFloat(scheme.porcentaje_entrega);
            const total = enganche + mensualidades + entrega;
            
            if (Math.abs(total - 100) >= 0.01) {
              throw new Error(`El esquema "${scheme.nombre}" no suma 100%. Total: ${total}%`);
            }

            const { error: schemeError } = await supabase
              .from("esquemas_pago")
              .insert({
                id_proyecto: newProject.id,
                id_producto: null,
                nombre: scheme.nombre,
                porcentaje_enganche: enganche,
                porcentaje_mensualidades: mensualidades,
                porcentaje_entrega: entrega,
                numero_mensualidades: parseInt(scheme.numero_mensualidades),
                porcentaje_descuento_aumento: parseFloat(scheme.porcentaje_descuento_aumento || "0")
              });

            if (schemeError) throw schemeError;
          }
        }
      }

      toast({
        title: "Proyecto creado",
        description: "El proyecto se ha creado exitosamente.",
      });

      // Store the created project ID for payment scheme management
      setCreatedProjectId(newProject.id);
      
      toast({
        title: "Proyecto creado",
        description: "Proyecto creado exitosamente. Ahora puedes agregar esquemas de pago.",
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
      setBuildings([]);
      setPaymentSchemes([]);
      setSelectedLocation(null);
      setCreatedProjectId(null);
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
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="new-project-form">
            <Tabs defaultValue="information" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="information">Información</TabsTrigger>
                <TabsTrigger value="images">Imágenes principales</TabsTrigger>
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

                {/* Buildings Section */}
                <BuildingFormSection 
                  buildings={buildings} 
                  onBuildingsChange={setBuildings} 
                />

                {/* Payment Schemes Section */}
                {createdProjectId ? (
                  <div className="space-y-3">
                    <PaymentSchemeManagement projectId={createdProjectId} />
                  </div>
                ) : (
                  <PaymentSchemeFormSection
                    paymentSchemes={paymentSchemes}
                    onPaymentSchemesChange={setPaymentSchemes}
                  />
                )}

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
                  <Button type="submit">Crear Proyecto</Button>
                </div>
              </div>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};