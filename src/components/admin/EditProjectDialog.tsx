import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BuildingManagement } from "./BuildingManagement";
import { PaymentSchemeManagement } from "./PaymentSchemeManagement";
import { ProjectLegalEntitiesSection } from "./ProjectLegalEntitiesSection";
import { ProjectMultimediaSection } from "./ProjectMultimediaSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GoogleMapComponent } from "./GoogleMapComponent";
import { NewAmenityDialog } from "./NewAmenityDialog";
import { EditAmenityDialog } from "./EditAmenityDialog";
import { ImageUploadField } from "./ImageUploadField";
import { ProjectLegalNoticesSection } from "./ProjectLegalNoticesSection";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  direccion: z.string().optional(),
  id_tipo_uso: z.string().min(1, "El tipo de uso es requerido"),
  id_estatus_proyecto: z.string().min(1, "El estatus del proyecto es requerido"),
  precio_m2: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
  fecha_inicio_construccion: z.string().optional(),
  fecha_entrega: z.string().optional(),
  direccion_id_pais: z.string().optional(),
  direccion_id_estado: z.string().optional(),
  direccion_id_municipio: z.string().optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  amenidades: z.array(z.string()).default([]),
  url_logo: z.string().optional(),
  url_firma_recibos: z.string().optional(),
  nombre_firmante_recibos: z.string().optional(),
  url_imagen_portada: z.string().optional(),
  costo_mantenimiento_m2: z.string().optional(),
  porcentaje_anual_cuota_extraordinaria: z.string().optional(),
  porcentaje_anual_cuota_estancia_corta: z.string().optional(),
  porcentaje_anual_cuota_garantia_renta: z.string().optional(),
  mostrar_precio_m2_en_oferta: z.boolean().default(true),
  mostrar_piso_en_oferta: z.boolean().default(true),
  mostrar_seccion_efectivo_en_oferta: z.boolean().default(true),
  mostrar_estacionamientos_en_oferta: z.boolean().default(true),
  mostrar_bodega_en_oferta: z.boolean().default(true),
  mostrar_modelo_en_oferta: z.boolean().default(true),
  mostrar_edificio_en_oferta: z.boolean().default(true),
});

interface EditProjectDialogProps {
  projectId: number;
  onProjectUpdated: () => void;
  trigger?: React.ReactNode;
}

export const EditProjectDialog = ({ projectId, onProjectUpdated, trigger }: EditProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      direccion: "",
      id_tipo_uso: "",
      id_estatus_proyecto: "",
      precio_m2: "",
      fecha_lanzamiento: "",
      fecha_inicio_construccion: "",
      fecha_entrega: "",
      direccion_id_pais: "",
      direccion_id_estado: "",
      direccion_id_municipio: "",
      latitud: undefined,
      longitud: undefined,
      amenidades: [],
      url_logo: "",
      url_firma_recibos: "",
      nombre_firmante_recibos: "",
      url_imagen_portada: "",
      costo_mantenimiento_m2: "",
      porcentaje_anual_cuota_extraordinaria: "",
      porcentaje_anual_cuota_estancia_corta: "",
      porcentaje_anual_cuota_garantia_renta: "",
      mostrar_precio_m2_en_oferta: true,
      mostrar_piso_en_oferta: true,
      mostrar_seccion_efectivo_en_oferta: true,
      mostrar_estacionamientos_en_oferta: true,
      mostrar_bodega_en_oferta: true,
      mostrar_modelo_en_oferta: true,
      mostrar_edificio_en_oferta: true,
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
        .eq("habilitar_asignar", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: estatusProyecto } = useQuery({
    queryKey: ["estatus-proyecto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estatus_proyecto")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: paises } = useQuery({
    queryKey: ["paises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paises")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: estados } = useQuery({
    queryKey: ["estados", selectedCountry],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estados_mx")
        .select("*")
        .eq("activo", true)
        .eq("id_pais", selectedCountry)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
    enabled: selectedCountry === "MX",
  });

  const { data: municipios } = useQuery({
    queryKey: ["municipios", form.watch("direccion_id_estado")],
    queryFn: async () => {
      const estadoId = form.watch("direccion_id_estado");
      if (!estadoId) return [];
      
      const { data, error } = await supabase
        .from("municipios_mx")
        .select("*")
        .eq("activo", true)
        .eq("id_estado", parseInt(estadoId))
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
    enabled: !!form.watch("direccion_id_estado") && selectedCountry === "MX",
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
        id_estatus_proyecto: project.id_estatus_proyecto?.toString() || "",
        precio_m2: project.precio_m2?.toString() || "",
        fecha_lanzamiento: project.fecha_lanzamiento || "",
        fecha_inicio_construccion: project.fecha_inicio_construccion || "",
        fecha_entrega: project.fecha_entrega || "",
        direccion_id_pais: project.direccion_id_pais || "",
        direccion_id_estado: project.direccion_id_estado?.toString() || "",
        direccion_id_municipio: project.direccion_id_municipio?.toString() || "",
        latitud: project.latitud || undefined,
        longitud: project.longitud || undefined,
        amenidades: project.amenidades_proyectos?.map((ap: any) => ap.id_amenidad.toString()) || [],
        url_logo: project.url_logo || "",
        url_firma_recibos: project.url_firma_recibos || "",
        nombre_firmante_recibos: project.nombre_firmante_recibos || "",
        url_imagen_portada: project.url_imagen_portada || "",
        costo_mantenimiento_m2: project.costo_mantenimiento_m2?.toString() || "",
        porcentaje_anual_cuota_extraordinaria: project.porcentaje_anual_cuota_extraordinaria?.toString() || "",
        porcentaje_anual_cuota_estancia_corta: project.porcentaje_anual_cuota_estancia_corta?.toString() || "",
        porcentaje_anual_cuota_garantia_renta: project.porcentaje_anual_cuota_garantia_renta?.toString() || "",
        mostrar_precio_m2_en_oferta: project.mostrar_precio_m2_en_oferta ?? true,
        mostrar_piso_en_oferta: project.mostrar_piso_en_oferta ?? true,
        mostrar_seccion_efectivo_en_oferta: project.mostrar_seccion_efectivo_en_oferta ?? true,
        mostrar_estacionamientos_en_oferta: project.mostrar_estacionamientos_en_oferta ?? true,
        mostrar_bodega_en_oferta: project.mostrar_bodega_en_oferta ?? true,
        mostrar_modelo_en_oferta: project.mostrar_modelo_en_oferta ?? true,
        mostrar_edificio_en_oferta: project.mostrar_edificio_en_oferta ?? true,
      });
      
      setSelectedCountry(project.direccion_id_pais || "");
    }
  }, [project, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const projectData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion: values.direccion || null,
        id_tipo_uso: parseInt(values.id_tipo_uso),
        id_estatus_proyecto: parseInt(values.id_estatus_proyecto),
        precio_m2: values.precio_m2 ? parseFloat(values.precio_m2) : null,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
        fecha_inicio_construccion: values.fecha_inicio_construccion || null,
        fecha_entrega: values.fecha_entrega || null,
        direccion_id_pais: values.direccion_id_pais || null,
        direccion_id_estado: values.direccion_id_estado ? parseInt(values.direccion_id_estado) : null,
        direccion_id_municipio: values.direccion_id_municipio ? parseInt(values.direccion_id_municipio) : null,
        latitud: selectedLocation?.lat || null,
        longitud: selectedLocation?.lng || null,
        url_logo: values.url_logo || null,
        url_firma_recibos: values.url_firma_recibos || null,
        nombre_firmante_recibos: values.nombre_firmante_recibos || null,
        url_imagen_portada: values.url_imagen_portada || null,
        costo_mantenimiento_m2: values.costo_mantenimiento_m2 ? parseFloat(values.costo_mantenimiento_m2) : null,
        porcentaje_anual_cuota_extraordinaria: values.porcentaje_anual_cuota_extraordinaria ? parseFloat(values.porcentaje_anual_cuota_extraordinaria) : null,
        porcentaje_anual_cuota_estancia_corta: values.porcentaje_anual_cuota_estancia_corta ? parseFloat(values.porcentaje_anual_cuota_estancia_corta) : null,
        porcentaje_anual_cuota_garantia_renta: values.porcentaje_anual_cuota_garantia_renta ? parseFloat(values.porcentaje_anual_cuota_garantia_renta) : null,
        mostrar_precio_m2_en_oferta: values.mostrar_precio_m2_en_oferta,
        mostrar_piso_en_oferta: values.mostrar_piso_en_oferta,
        mostrar_seccion_efectivo_en_oferta: values.mostrar_seccion_efectivo_en_oferta,
        mostrar_estacionamientos_en_oferta: values.mostrar_estacionamientos_en_oferta,
        mostrar_bodega_en_oferta: values.mostrar_bodega_en_oferta,
        mostrar_modelo_en_oferta: values.mostrar_modelo_en_oferta,
        mostrar_edificio_en_oferta: values.mostrar_edificio_en_oferta,
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
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!trigger && (
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
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
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="information">Información</TabsTrigger>
                  <TabsTrigger value="images">Configuración general</TabsTrigger>
                  <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
                  <TabsTrigger value="legal-entities">Entidades Legales</TabsTrigger>
                  <TabsTrigger value="offer-config">Configuración de oferta</TabsTrigger>
                </TabsList>
                
                <TabsContent value="information" className="mt-6">
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Proyecto</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ingrese el nombre del proyecto" 
                            {...field} 
                            readOnly 
                            className="bg-muted cursor-not-allowed"
                          />
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
                    name="id_estatus_proyecto"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estatus del Proyecto</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estatus" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {estatusProyecto?.map((estatus) => (
                              <SelectItem key={estatus.id} value={estatus.id.toString()}>
                                {estatus.nombre}
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
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <FormField
                       control={form.control}
                       name="fecha_inicio_construccion"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Fecha de Inicio Construcción</FormLabel>
                           <FormControl>
                             <Input type="date" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />

                     <FormField
                       control={form.control}
                       name="fecha_entrega"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Fecha de Entrega</FormLabel>
                           <FormControl>
                             <Input type="date" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />
                   </div>

                   {/* Address Fields */}
                   <div className="grid grid-cols-1 gap-4">
                     <FormField
                       control={form.control}
                       name="direccion_id_pais"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>País</FormLabel>
                           <Select 
                             onValueChange={(value) => {
                               field.onChange(value);
                               setSelectedCountry(value);
                               // Reset state and municipality when country changes
                               if (value !== "MX") {
                                 form.setValue("direccion_id_estado", "");
                                 form.setValue("direccion_id_municipio", "");
                               }
                             }} 
                             value={field.value}
                           >
                             <FormControl>
                               <SelectTrigger>
                                 <SelectValue placeholder="Selecciona un país" />
                               </SelectTrigger>
                             </FormControl>
                             <SelectContent>
                               {paises?.map((pais) => (
                                 <SelectItem key={pais.id} value={pais.id}>
                                   {pais.nombre}
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                           <FormMessage />
                         </FormItem>
                       )}
                     />

                     {selectedCountry === "MX" && (
                       <>
                         <FormField
                           control={form.control}
                           name="direccion_id_estado"
                           render={({ field }) => (
                             <FormItem>
                               <FormLabel>Estado</FormLabel>
                               <Select 
                                 onValueChange={(value) => {
                                   field.onChange(value);
                                   // Reset municipality when state changes
                                   form.setValue("direccion_id_municipio", "");
                                 }} 
                                 value={field.value}
                               >
                                 <FormControl>
                                   <SelectTrigger>
                                     <SelectValue placeholder="Selecciona un estado" />
                                   </SelectTrigger>
                                 </FormControl>
                                 <SelectContent>
                                   {estados?.map((estado) => (
                                     <SelectItem key={estado.id} value={estado.id.toString()}>
                                       {estado.nombre}
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
                           name="direccion_id_municipio"
                           render={({ field }) => (
                             <FormItem>
                               <FormLabel>Municipio</FormLabel>
                               <Select onValueChange={field.onChange} value={field.value}>
                                 <FormControl>
                                   <SelectTrigger>
                                     <SelectValue placeholder="Selecciona un municipio" />
                                   </SelectTrigger>
                                 </FormControl>
                                 <SelectContent>
                                   {municipios?.map((municipio) => (
                                     <SelectItem key={municipio.id} value={municipio.id.toString()}>
                                       {municipio.nombre}
                                     </SelectItem>
                                   ))}
                                 </SelectContent>
                               </Select>
                               <FormMessage />
                             </FormItem>
                           )}
                         />
                       </>
                     )}
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
                        <div className="flex items-center justify-between">
                          <FormLabel>Amenidades</FormLabel>
                          <NewAmenityDialog onAmenityCreated={() => queryClient.invalidateQueries({ queryKey: ['amenidades'] })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
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
                                      <div className="flex items-center justify-between flex-1">
                                        <FormLabel className="text-sm font-normal">
                                          {amenidad.nombre}
                                        </FormLabel>
                                        <div 
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                          }}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                          }}
                                        >
                                          <EditAmenityDialog 
                                            amenityId={amenidad.id}
                                            amenityName={amenidad.nombre}
                                            onAmenityUpdated={() => queryClient.invalidateQueries({ queryKey: ['amenidades'] })}
                                            onAmenityDeleted={() => queryClient.invalidateQueries({ queryKey: ['amenidades'] })}
                                          />
                                        </div>
                                      </div>
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
                   </div>
                </TabsContent>

                <TabsContent value="images" className="mt-6">
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="url_logo"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <ImageUploadField 
                              label="Logo del Proyecto"
                              value={field.value}
                              onChange={field.onChange}
                              accept="image/*"
                            />
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
                          <FormControl>
                            <ImageUploadField 
                              label="Imagen de Portada"
                              value={field.value}
                              onChange={field.onChange}
                              accept="image/*"
                            />
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
                            <FormControl>
                              <ImageUploadField 
                                label="Imagen de Firma para Recibos"
                                value={field.value}
                                onChange={field.onChange}
                                accept="image/*"
                              />
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

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="costo_mantenimiento_m2"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Costo Mantenimiento M²</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="porcentaje_anual_cuota_extraordinaria"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>% Anual Cuota Extraordinaria</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="porcentaje_anual_cuota_estancia_corta"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>% Anual Cuota Estancia Corta</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="porcentaje_anual_cuota_garantia_renta"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>% Anual Cuota Garantía Renta</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                     <div className="flex justify-end space-x-2">
                       <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                         Cancelar
                       </Button>
                     </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="multimedia" className="mt-6">
                  <ProjectMultimediaSection projectId={projectId} />
                </TabsContent>
                
                <TabsContent value="legal-entities" className="mt-6">
                  <ProjectLegalEntitiesSection projectId={projectId} />
                </TabsContent>
                
                <TabsContent value="offer-config" className="mt-6 space-y-6">
                  <div>
                    <ProjectLegalNoticesSection projectId={projectId} />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Mostrar en oferta</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Selecciona qué elementos aparecerán en la sección "Detalles de la propiedad" del PDF de la oferta.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="mostrar_precio_m2_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Precio por m²</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_piso_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Piso</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_seccion_efectivo_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Sección En efectivo</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_estacionamientos_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Estacionamientos</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                Mostrará el número y entre paréntesis los tipos de estacionamientos
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_bodega_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Bodega</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                Mostrará el número de bodegas
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_modelo_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Modelo</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mostrar_edificio_en_oferta"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Edificio</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        )}
        <DialogFooter className="px-6 pb-6">
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};