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
import { Edit, Trash2, MapPin, Copy, Search, CheckCircle, Grid3x3, Eye, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BuildingManagement } from "./BuildingManagement";
import { PaymentSchemeManagement } from "./PaymentSchemeManagement";
import { ProjectLegalEntitiesSection } from "./ProjectLegalEntitiesSection";
import { ProjectMultimediaSection } from "./ProjectMultimediaSection";
import { ProjectReservableSpacesSection } from "./ProjectReservableSpacesSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GoogleMapComponent } from "./GoogleMapComponent";
import { NewAmenityDialog } from "./NewAmenityDialog";
import { EditAmenityDialog } from "./EditAmenityDialog";
import { ImageUploadField } from "./ImageUploadField";
import { ProjectLegalNoticesSection } from "./ProjectLegalNoticesSection";
import { ProjectBrochuresSection } from "./ProjectBrochuresSection";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  direccion: z.string().optional(),
  id_tipo_uso: z.string().min(1, "El tipo de uso es requerido"),
  id_estatus_proyecto: z.string().min(1, "El estatus del proyecto es requerido"),
  precio_m2_actual: z.string().optional(),
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
  monto_mensual_cuota_extraordinaria: z.string()
    .optional()
    .refine((val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 5000), {
      message: "El monto debe ser entre 0 y 5000"
    }),
  monto_garantia_renta: z.string().optional(),
  mostrar_precio_m2_en_oferta: z.boolean().default(true),
  mostrar_piso_en_oferta: z.boolean().default(true),
  mostrar_seccion_efectivo_en_oferta: z.boolean().default(true),
});

interface EditProjectDialogProps {
  projectId: number;
  onProjectUpdated: () => void;
  trigger?: React.ReactNode;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

export const EditProjectDialog = ({ projectId, onProjectUpdated, trigger, canCreate = true, canUpdate = true, canDelete = true }: EditProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showroomLocation, setShowroomLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showroomDireccion, setShowroomDireccion] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amenidadesSearchTerm, setAmenidadesSearchTerm] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
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
      precio_m2_actual: "",
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
      monto_mensual_cuota_extraordinaria: "",
      monto_garantia_renta: "",
      mostrar_precio_m2_en_oferta: true,
      mostrar_piso_en_oferta: true,
      mostrar_seccion_efectivo_en_oferta: true,
    },
  });

  // Determinar si es proyecto de tipo Productos, Servicios o Mantenimientos
  const isSpecialProject = form.watch("id_tipo_uso") === "9" || form.watch("id_tipo_uso") === "10" || form.watch("id_tipo_uso") === "11";

  // Query para verificar si todas las propiedades del proyecto tienen estatus > 3
  const { data: propiedadesPendientes } = useQuery({
    queryKey: ["propiedades-pendientes-proyecto", projectId],
    queryFn: async () => {
      // Obtener edificios del proyecto
      const { data: edificios, error: edError } = await supabase
        .from("edificios")
        .select("id")
        .eq("id_proyecto", projectId)
        .eq("activo", true);
      if (edError) throw edError;
      if (!edificios || edificios.length === 0) return 0;

      // Obtener edificios_modelos de esos edificios
      const edificioIds = edificios.map(e => e.id);
      const { data: edModelos, error: emError } = await supabase
        .from("edificios_modelos")
        .select("id")
        .in("id_edificio", edificioIds)
        .eq("activo", true);
      if (emError) throw emError;
      if (!edModelos || edModelos.length === 0) return 0;

      // Contar propiedades con estatus <= 3
      const emIds = edModelos.map(em => em.id);
      const { count, error } = await supabase
        .from("propiedades")
        .select("id", { count: "exact", head: true })
        .in("id_edificio_modelo", emIds)
        .lte("id_estatus_disponibilidad", 3)
        .eq("activo", true);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: open,
  });

  const todasVendidas = propiedadesPendientes === 0;

  const { data: project, isLoading: isLoadingProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          id_tipo_uso,
          id_estatus_proyecto,
          precio_m2_actual,
          fecha_lanzamiento,
          fecha_inicio_construccion,
          fecha_entrega,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          latitud,
          longitud,
          descripcion_direccion_showroom,
          latitud_showroom,
          longitud_showroom,
          url_logo,
          url_firma_recibos,
          nombre_firmante_recibos,
          url_imagen_portada,
          costo_mantenimiento_m2,
          monto_mensual_cuota_extraordinaria,
          monto_garantia_renta,
          mostrar_precio_m2_en_oferta,
          mostrar_piso_en_oferta,
          mostrar_seccion_efectivo_en_oferta,
          activo,
          fecha_creacion,
          fecha_actualizacion,
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

  const { data: vistas } = useQuery({
    queryKey: ["vistas-proyecto", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vistas")
        .select("*")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .order("nombre");
      
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
        precio_m2_actual: (project as any).precio_m2_actual?.toString() || "",
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
        monto_mensual_cuota_extraordinaria: (project as any).monto_mensual_cuota_extraordinaria?.toString() || "",
        monto_garantia_renta: (project as any).monto_garantia_renta?.toString() || "",
        mostrar_precio_m2_en_oferta: project.mostrar_precio_m2_en_oferta ?? true,
        mostrar_piso_en_oferta: project.mostrar_piso_en_oferta ?? true,
        mostrar_seccion_efectivo_en_oferta: project.mostrar_seccion_efectivo_en_oferta ?? true,
      });
      
      setSelectedCountry(project.direccion_id_pais || "");
      setShowroomDireccion((project as any).descripcion_direccion_showroom || "");
      const showroomLat = (project as any).latitud_showroom;
      const showroomLng = (project as any).longitud_showroom;
      setShowroomLocation(showroomLat && showroomLng ? { lat: showroomLat, lng: showroomLng } : null);
    }
  }, [project, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log('🔍 [DEBUG] Valores del formulario recibidos en onSubmit:', values);
    console.log('🔍 [DEBUG] url_logo recibido:', values.url_logo);
    
    setIsSubmitting(true);
    try {
      const projectData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion: values.direccion || null,
        id_tipo_uso: parseInt(values.id_tipo_uso),
        id_estatus_proyecto: parseInt(values.id_estatus_proyecto),
        precio_m2_actual: values.precio_m2_actual ? parseFloat(values.precio_m2_actual) : null,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
        fecha_inicio_construccion: values.fecha_inicio_construccion || null,
        fecha_entrega: values.fecha_entrega || null,
        direccion_id_pais: values.direccion_id_pais || null,
        direccion_id_estado: values.direccion_id_estado ? parseInt(values.direccion_id_estado) : null,
        direccion_id_municipio: values.direccion_id_municipio ? parseInt(values.direccion_id_municipio) : null,
        latitud: selectedLocation?.lat || null,
        longitud: selectedLocation?.lng || null,
        descripcion_direccion_showroom: showroomDireccion || null,
        latitud_showroom: showroomLocation?.lat || null,
        longitud_showroom: showroomLocation?.lng || null,
        url_logo: values.url_logo || null,
        url_firma_recibos: values.url_firma_recibos || null,
        nombre_firmante_recibos: values.nombre_firmante_recibos || null,
        url_imagen_portada: values.url_imagen_portada || null,
        costo_mantenimiento_m2: values.costo_mantenimiento_m2 ? parseFloat(values.costo_mantenimiento_m2) : null,
        monto_mensual_cuota_extraordinaria: values.monto_mensual_cuota_extraordinaria ? parseFloat(values.monto_mensual_cuota_extraordinaria) : null,
        monto_garantia_renta: values.monto_garantia_renta ? parseFloat(values.monto_garantia_renta) : null,
        mostrar_precio_m2_en_oferta: values.mostrar_precio_m2_en_oferta,
        mostrar_piso_en_oferta: values.mostrar_piso_en_oferta,
        mostrar_seccion_efectivo_en_oferta: values.mostrar_seccion_efectivo_en_oferta,
      };

      console.log('🔍 [DEBUG] Objeto projectData preparado para enviar:', projectData);
      console.log('🔍 [DEBUG] url_logo en projectData:', projectData.url_logo);

      const { error: updateError } = await supabase
        .from("proyectos")
        .update(projectData)
        .eq("id", projectId);
      
      console.log('🔍 [DEBUG] Resultado del update - Error:', updateError);

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
                <TabsList className={`grid w-full ${isSpecialProject ? 'grid-cols-3' : 'grid-cols-8'}`}>
                  <TabsTrigger value="information">Información</TabsTrigger>
                  {!isSpecialProject && <TabsTrigger value="images">Configuración general</TabsTrigger>}
                  {!isSpecialProject && <TabsTrigger value="multimedia">Multimedia</TabsTrigger>}
                  <TabsTrigger value="legal-entities">Entidades Legales</TabsTrigger>
                  {!isSpecialProject && <TabsTrigger value="reservable-spaces">Espacios para reservar</TabsTrigger>}
                  {!isSpecialProject && <TabsTrigger value="offer-config">Configuración de oferta</TabsTrigger>}
                  {!isSpecialProject && <TabsTrigger value="vistas">Vistas</TabsTrigger>}
                  <TabsTrigger value="brochures">Brochures</TabsTrigger>
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
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSpecialProject}>
                          <FormControl>
                            <SelectTrigger className={isSpecialProject ? "bg-muted cursor-not-allowed" : ""}>
                              <SelectValue placeholder="Selecciona un tipo de uso" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tiposUso?.map((tipo) => (
                              <SelectItem 
                                key={tipo.id} 
                                value={tipo.id.toString()}
                                disabled={tipo.id === 9 || tipo.id === 10 || tipo.id === 11}
                              >
                                {tipo.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                  )}
                />

                {!isSpecialProject && (
                  <>
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
                            name="precio_m2_actual"
                            render={({ field }) => {
                              const formattedValue = field.value 
                                ? parseFloat(field.value).toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })
                                : '';
                              
                              return (
                                <FormItem>
                                  <FormLabel>
                                    Precio por m² actual
                                    {!todasVendidas && " (se habilita cuando todas las propiedades estén vendidas)"}
                                  </FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="text" 
                                      placeholder="0.00" 
                                      value={formattedValue}
                                      disabled={!todasVendidas}
                                      className={!todasVendidas ? "bg-muted" : ""}
                                      readOnly={!todasVendidas}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                                        field.onChange(raw);
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
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

                      {/* Showroom Section */}
                      <div className="space-y-4 border-t pt-4">
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-4 h-4" />
                          <label className="text-sm font-medium">Showroom</label>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Dirección del showroom</label>
                          <Input
                            placeholder="Ej: Av. Chapultepec 123, Col. Americana"
                            value={showroomDireccion}
                            onChange={(e) => setShowroomDireccion(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Ubicación del showroom en mapa</label>
                          <GoogleMapComponent
                            onLocationSelect={setShowroomLocation}
                            initialLocation={showroomLocation}
                          />
                          {showroomLocation && (
                            <p className="text-xs text-muted-foreground">
                              Coordenadas: {showroomLocation.lat.toFixed(6)}, {showroomLocation.lng.toFixed(6)}
                            </p>
                          )}
                        </div>
                        {((showroomDireccion && !showroomLocation) || (!showroomDireccion && showroomLocation)) && (
                          <p className="text-xs text-destructive">
                            Si proporcionas datos de showroom, debes llenar tanto la dirección como la ubicación en el mapa.
                          </p>
                        )}
                      </div>

                      {/* Building Management Section */}
                      <div className="space-y-3">
                        <BuildingManagement projectId={projectId} />
                      </div>

                      {/* Payment Scheme Management Section */}
                      <div className="space-y-3">
                        <PaymentSchemeManagement 
                          projectId={projectId}
                          canCreate={canCreate}
                          canUpdate={canUpdate}
                          canDelete={canDelete}
                        />
                      </div>

                      {/* Amenidades Section - Con separación adicional */}
                      <div className="pt-6">
                      <FormField
                        control={form.control}
                        name="amenidades"
                        render={({ field }) => {
                          const selectedAmenidades = field.value || [];
                          let filteredAmenidades = amenidades?.filter(amenidad => 
                            amenidad.nombre.toLowerCase().includes(amenidadesSearchTerm.toLowerCase())
                          ) || [];
                          
                          if (showOnlySelected) {
                            filteredAmenidades = filteredAmenidades.filter(amenidad => 
                              selectedAmenidades.includes(amenidad.id.toString())
                            );
                          }
                          
                          return (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Amenidades</FormLabel>
                                <NewAmenityDialog onAmenityCreated={() => queryClient.invalidateQueries({ queryKey: ['amenidades'] })} />
                              </div>
                              
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    placeholder="Buscar amenidad..."
                                    value={amenidadesSearchTerm}
                                    onChange={(e) => setAmenidadesSearchTerm(e.target.value)}
                                    className="pl-8"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant={showOnlySelected ? "secondary" : "outline"}
                                  size="sm"
                                  onClick={() => setShowOnlySelected(!showOnlySelected)}
                                  className="whitespace-nowrap"
                                >
                                  {showOnlySelected ? (
                                    <>
                                      <Grid3x3 className="h-4 w-4 mr-1" />
                                      Ver Todas
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Ver Seleccionadas ({selectedAmenidades.length})
                                    </>
                                  )}
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
                                {filteredAmenidades.length > 0 ? (
                                  filteredAmenidades.map((amenidad) => (
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
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm">{amenidad.nombre}</span>
                                              <EditAmenityDialog 
                                                amenityId={amenidad.id}
                                                amenityName={amenidad.nombre}
                                                onAmenityUpdated={() => {
                                                  queryClient.invalidateQueries({ queryKey: ['amenidades'] })
                                                }}
                                              />
                                            </div>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))
                                ) : (
                                  <p className="col-span-2 text-sm text-muted-foreground text-center py-4">
                                    No se encontraron amenidades
                                  </p>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )
                        }}
                      />
                      </div>
                    </>
                  )}
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
                          name="monto_mensual_cuota_extraordinaria"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto mensual de cuota extraordinaria</FormLabel>
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


                        <FormField
                          control={form.control}
                          name="monto_garantia_renta"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto mensual de garantía de renta</FormLabel>
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
                  <ProjectLegalEntitiesSection projectId={projectId} isProductosOrServicios={isSpecialProject} />
                </TabsContent>
                
                <TabsContent value="reservable-spaces" className="mt-6">
                  <ProjectReservableSpacesSection projectId={projectId} />
                </TabsContent>
                
                <TabsContent value="offer-config" className="mt-6 space-y-6">
                  <div>
                    <ProjectLegalNoticesSection projectId={projectId} />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Mostrar en oferta</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Selecciona qué elementos aparecerán en el PDF de la oferta.
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
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="vistas" className="mt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Eye className="h-5 w-5" />
                      <h3 className="text-lg font-semibold">Vistas del Proyecto</h3>
                    </div>
                    
                    {vistas && vistas.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {vistas.map((vista: any) => (
                          <div key={vista.id} className="border rounded-lg p-4 space-y-2">
                            <div className="font-medium">{vista.nombre}</div>
                            {vista.url && (
                              <img 
                                src={vista.url} 
                                alt={vista.nombre}
                                className="w-full h-32 object-cover rounded-md"
                                onError={(e) => {
                                  e.currentTarget.src = '/placeholder.svg';
                                }}
                              />
                            )}
                            {!vista.url && (
                              <div className="w-full h-32 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-sm">
                                Sin imagen
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg">
                        <Eye className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No hay vistas asignadas a este proyecto</p>
                        <p className="text-sm mt-1">Puedes agregar vistas desde la sección "Vistas" en el menú de Inventarios</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="brochures" className="mt-6">
                  <ProjectBrochuresSection projectId={projectId} />
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        )}
        <DialogFooter className="px-6 pb-6 pt-6 border-t mt-12">
          <div className="flex items-center justify-end gap-2 w-full">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};