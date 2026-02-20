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
import { Plus, MapPin, Copy, Search, CheckCircle, Grid3x3, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BuildingFormSection, Building } from "./BuildingFormSection";
import { PaymentSchemeFormSection, PaymentScheme } from "./PaymentSchemeFormSection";
import { PaymentSchemeManagement } from "./PaymentSchemeManagement";
import { GoogleMapComponent } from "./GoogleMapComponent";
import { NewAmenityDialog } from "./NewAmenityDialog";
import { EditAmenityDialog } from "./EditAmenityDialog";
import { ImageUploadField } from "./ImageUploadField";

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
  direccion_id_pais: z.string().optional(),
  direccion_id_estado: z.string().optional(), 
  direccion_id_municipio: z.string().optional(),
  direccion: z.string().optional(),
  id_tipo_uso: z.string().min(1, "El tipo de uso es requerido"),
  id_estatus_proyecto: z.string().optional(),
  precio_m2_actual: z.string().optional(),
  fecha_lanzamiento: z.string().optional(),
  fecha_inicio_construccion: z.string().optional(),
  fecha_entrega: z.string().optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  amenidades: z.array(z.string()).default([]),
  edificios: z.array(BuildingSchema).default([]),
  esquemas_pago: z.array(PaymentSchemeSchema).default([]),
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
}).refine((data) => {
  // Si no es tipo Productos, Servicios o Mantenimientos, id_estatus_proyecto es requerido
  if (data.id_tipo_uso !== "9" && data.id_tipo_uso !== "10" && data.id_tipo_uso !== "11") {
    return data.id_estatus_proyecto && data.id_estatus_proyecto.length > 0;
  }
  return true;
}, {
  message: "El estatus del proyecto es requerido",
  path: ["id_estatus_proyecto"],
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
  const [showroomLocation, setShowroomLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showroomDireccion, setShowroomDireccion] = useState("");
  const [amenidadesSearchTerm, setAmenidadesSearchTerm] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      direccion_id_pais: "",
      direccion_id_estado: "",
      direccion_id_municipio: "",
      direccion: "",
      id_tipo_uso: "",
      id_estatus_proyecto: "",
      precio_m2_actual: "",
      fecha_lanzamiento: "",
      fecha_inicio_construccion: "",
      fecha_entrega: "",
      latitud: undefined,
      longitud: undefined,
      amenidades: [],
      edificios: [],
      esquemas_pago: [],
      url_logo: "",
      url_firma_recibos: "",
      nombre_firmante_recibos: "",
      url_imagen_portada: "",
      costo_mantenimiento_m2: "",
      monto_mensual_cuota_extraordinaria: "",
      monto_garantia_renta: "",
    },
  });

  // Update form with buildings and payment schemes state
  form.setValue('edificios', buildings);
  form.setValue('esquemas_pago', paymentSchemes);

  // Query para verificar proyectos existentes de tipo Productos/Servicios/Mantenimientos
  const { data: existingSpecialProjects } = useQuery({
    queryKey: ["special-projects-check"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, id_tipo_uso")
        .in("id_tipo_uso", [9, 10, 11])
        .eq("activo", true);
      
      if (error) throw error;
      return data || [];
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
    queryKey: ["estados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estados_mx")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
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
    enabled: !!form.watch("direccion_id_estado"),
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Verificar si existe un proyecto con el mismo nombre
      const { data: existingProject } = await supabase
        .from("proyectos")
        .select("id, nombre")
        .ilike("nombre", values.nombre.trim())
        .eq("activo", true)
        .maybeSingle();

      if (existingProject) {
        toast({
          variant: "destructive",
          title: "Error al crear proyecto",
          description: `Ya existe un proyecto activo con el nombre "${values.nombre}". Por favor, elige otro nombre.`,
        });
        return;
      }

      // Para proyectos tipo Productos, Servicios o Mantenimientos, usar estatus por defecto (id=1)
      const isSpecialProject = values.id_tipo_uso === "9" || values.id_tipo_uso === "10" || values.id_tipo_uso === "11";
      
      const projectData = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion_id_pais: values.direccion_id_pais || null,
        direccion_id_estado: values.direccion_id_estado ? parseInt(values.direccion_id_estado) : null,
        direccion_id_municipio: values.direccion_id_municipio ? parseInt(values.direccion_id_municipio) : null,
        direccion: values.direccion || null,
        id_tipo_uso: parseInt(values.id_tipo_uso),
        id_estatus_proyecto: isSpecialProject ? 1 : parseInt(values.id_estatus_proyecto),
        precio_m2_actual: values.precio_m2_actual ? parseFloat(values.precio_m2_actual) : 0,
        fecha_lanzamiento: values.fecha_lanzamiento || null,
        fecha_inicio_construccion: values.fecha_inicio_construccion || null,
        fecha_entrega: values.fecha_entrega || null,
        latitud: selectedLocation?.lat || null,
        longitud: selectedLocation?.lng || null,
        descripcion_direccion_showroom: showroomDireccion || null,
        latitud_showroom: showroomLocation?.lat || null,
        longitud_showroom: showroomLocation?.lng || null,
        url_logo: values.url_logo || null,
        url_firma_recibos: values.url_firma_recibos || null,
        nombre_firmante_recibos: values.nombre_firmante_recibos || null,
        url_imagen_portada: values.url_imagen_portada || null,
        costo_mantenimiento_m2: values.costo_mantenimiento_m2 ? parseFloat(values.costo_mantenimiento_m2) : 0,
        monto_mensual_cuota_extraordinaria: values.monto_mensual_cuota_extraordinaria ? parseFloat(values.monto_mensual_cuota_extraordinaria) : 0,
        monto_garantia_renta: values.monto_garantia_renta ? parseFloat(values.monto_garantia_renta) : 0,
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
                {!(form.watch("id_tipo_uso") === "9" || form.watch("id_tipo_uso") === "10" || form.watch("id_tipo_uso") === "11") && (
                  <TabsTrigger value="images">Configuración general</TabsTrigger>
                )}
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
                  render={({ field }) => {
                    const selectedTipoUso = field.value;
                    const isSpecialProject = selectedTipoUso === "9" || selectedTipoUso === "10" || selectedTipoUso === "11";
                    
                    return (
                      <FormItem>
                        <FormLabel>Tipo de Uso</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un tipo de uso" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tiposUso?.map((tipo) => {
                              const isDisabled = 
                                (tipo.id === 9 || tipo.id === 10 || tipo.id === 11) && 
                                existingSpecialProjects?.some(p => p.id_tipo_uso === tipo.id);
                              
                              return (
                                <SelectItem 
                                  key={tipo.id} 
                                  value={tipo.id.toString()}
                                  disabled={isDisabled}
                                >
                                  {tipo.nombre} {isDisabled && "(Ya existe)"}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {!(form.watch("id_tipo_uso") === "9" || form.watch("id_tipo_uso") === "10" || form.watch("id_tipo_uso") === "11") && (
                  <>
                    <FormField
                      control={form.control}
                      name="id_estatus_proyecto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estatus del Proyecto</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                    <FormField
                      control={form.control}
                      name="precio_m2_actual"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Precio por m² actual (calculado automáticamente)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="0.00" 
                              {...field}
                              disabled
                              className="bg-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
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

                    {/* Location Fields */}
                    <FormField
                      control={form.control}
                      name="direccion_id_pais"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>País</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="direccion_id_estado"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
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

                {/* Buildings Section */}
                <BuildingFormSection 
                  buildings={buildings} 
                  onBuildingsChange={setBuildings}
                  isNewProject={true}
                />

                {/* Payment Schemes Section */}
                {createdProjectId ? (
                  <div className="space-y-3">
                    <PaymentSchemeManagement 
                      projectId={createdProjectId}
                      canCreate={true}
                      canUpdate={true}
                      canDelete={true}
                    />
                  </div>
                ) : (
                  <PaymentSchemeFormSection
                    paymentSchemes={paymentSchemes}
                    onPaymentSchemesChange={setPaymentSchemes}
                  />
                )}

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

                <div className="flex justify-end space-x-2 mt-8">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => form.handleSubmit(onSubmit)()}>Crear Proyecto</Button>
                </div>
              </TabsContent>
              
              {!(form.watch("id_tipo_uso") === "9" || form.watch("id_tipo_uso") === "10") && (
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

                  <div className="flex items-center justify-end gap-2 mt-16 pt-6 border-t">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={() => form.handleSubmit(onSubmit)()}>
                      Crear Proyecto
                    </Button>
                  </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
