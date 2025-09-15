import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { DocumentsTab } from "./DocumentsTab";

const formSchema = z.object({
  id_proyecto: z.string().min(1, "El proyecto es requerido"),
  id_edificio: z.string().min(1, "El edificio es requerido"),
  id_modelo: z.string().min(1, "El modelo es requerido"),
  numero_propiedad: z.string().min(1, "El número de propiedad es requerido"),
  numero_piso: z.string().min(1, "El número de piso es requerido"),
  m2_reales: z.string().min(1, "Los metros cuadrados son requeridos"),
  m2_escriturables: z.string().min(1, "Los metros cuadrados escriturables son requeridos"),
  precio_lista: z.string().min(1, "El precio de lista es requerido"),
  monto_apartado: z.string().optional(),
  id_tipo_transaccion: z.string().min(1, "El tipo de transacción es requerido"),
  id_tipo_propiedad: z.string().min(1, "El tipo de propiedad es requerido"),
  id_estatus_disponibilidad: z.string().min(1, "El estatus de disponibilidad es requerido"),
  id_vista: z.string().min(1, "La vista es requerida"),
  id_entidad_relacionada_dueno: z.string().min(1, "El propietario es requerido").refine((val) => val !== "no-owners", {
    message: "Se deben asignar Entidades Legales (Dueños vendedor o Aportante) al proyecto"
  }),
});

interface NewPropertyDialogProps {
  onPropertyAdded: () => void;
}

export const NewPropertyDialog = ({ onPropertyAdded }: NewPropertyDialogProps) => {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id_proyecto: "",
      id_edificio: "",
      id_modelo: "",
      numero_propiedad: "",
      numero_piso: "",
      m2_reales: "",
      m2_escriturables: "",
      precio_lista: "",
      monto_apartado: "",
      id_tipo_transaccion: "",
      id_tipo_propiedad: "",
      id_estatus_disponibilidad: "",
      id_vista: "",
      id_entidad_relacionada_dueno: "",
    },
  });

  // Queries para obtener los datos necesarios
  const { data: proyectos } = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: edificios } = useQuery({
    queryKey: ["edificios", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      
      const { data, error } = await supabase
        .from("edificios")
        .select("id, nombre")
        .eq("id_proyecto", parseInt(selectedProjectId))
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProjectId,
  });

  const { data: modelos } = useQuery({
    queryKey: ["modelos", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      
      const { data, error } = await supabase
        .from("edificios_modelos")
        .select(`
          id,
          modelos!fk_edificios_modelos_modelo (
            id,
            nombre
          )
        `)
        .eq("id_edificio", parseInt(selectedBuildingId))
        .eq("activo", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedBuildingId,
  });

  const { data: tiposTransaccion } = useQuery({
    queryKey: ["tipos-transaccion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_transaccion")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: tiposPropiedad } = useQuery({
    queryKey: ["tipos-propiedad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_propiedad")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: estatusDisponibilidad } = useQuery({
    queryKey: ["estatus-disponibilidad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estatus_disponibilidad")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vistas } = useQuery({
    queryKey: ["vistas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vistas")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: propietarios } = useQuery({
    queryKey: ["propietarios", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal)
        `)
        .eq("id_proyecto", parseInt(selectedProjectId))
        .in("id_tipo_entidad", [4, 15]) // Dueño vendedor or Aportante
        .eq("activo", true)
        .order("personas(nombre_legal)");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProjectId,
  });

  // Query para obtener la CLABE del propietario seleccionado
  const { data: ownerClabe, isLoading: isLoadingClabe, error: clabeError } = useQuery({
    queryKey: ["owner-clabe", selectedOwnerId],
    queryFn: async () => {
      if (!selectedOwnerId) return null;
      
      console.log("Generating CLABE for owner ID:", selectedOwnerId);
      
      try {
        const { data, error } = await supabase
          .rpc('crear_referencia_bancaria', {
            id_er_dueno: parseInt(selectedOwnerId)
          });

        if (error) {
          console.error("CLABE generation error:", error);
          throw error;
        }
        
        console.log("Generated CLABE:", data);
        return data;
      } catch (error) {
        console.error("Error getting CLABE:", error);
        throw error;
      }
    },
    enabled: !!selectedOwnerId && selectedOwnerId !== "no-owners",
    retry: 1
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Find the edificio_modelo ID
      const edificioModelo = modelos?.find(em => em.modelos?.id === parseInt(values.id_modelo));
      
      if (!edificioModelo) {
        toast({
          title: "Error",
          description: "No se pudo encontrar la relación edificio-modelo.",
          variant: "destructive",
        });
        return;
      }

      const propertyData = {
        numero_propiedad: values.numero_propiedad,
        numero_piso: parseInt(values.numero_piso),
        m2_reales: parseFloat(values.m2_reales),
        m2_escriturables: parseFloat(values.m2_escriturables),
        precio_lista: parseFloat(values.precio_lista),
        monto_apartado: values.monto_apartado ? parseFloat(values.monto_apartado) : null,
        id_edificio_modelo: edificioModelo.id,
        id_tipo_transaccion: parseInt(values.id_tipo_transaccion),
        id_tipo_propiedad: parseInt(values.id_tipo_propiedad),
        id_estatus_disponibilidad: parseInt(values.id_estatus_disponibilidad),
        id_vista: parseInt(values.id_vista),
        id_entidad_relacionada_dueno: parseInt(values.id_entidad_relacionada_dueno),
        es_aprobado: false,
        activo: true,
      };

      const { data, error } = await supabase
        .from("propiedades")
        .insert(propertyData)
        .select()
        .single();

      if (error) throw error;

      // Generate CLABE for the owner
      try {
        const { data: clabeData, error: clabeError } = await supabase
          .rpc('crear_referencia_bancaria', {
            id_er_dueno: parseInt(values.id_entidad_relacionada_dueno)
          });

        if (clabeError) throw clabeError;

        // Update the property with the generated CLABE
        const { error: updateError } = await supabase
          .from("propiedades")
          .update({
            clabe_stp_tmp_apartado: clabeData
          })
          .eq("id", data.id);

        if (updateError) throw updateError;

        toast({
          title: "Propiedad creada",
          description: `La propiedad se ha creado exitosamente con CLABE: ${clabeData}`,
        });
      } catch (clabeError) {
        console.error("Error generating CLABE:", clabeError);
        toast({
          title: "Propiedad creada",
          description: "La propiedad se ha creado exitosamente, pero hubo un error al generar la CLABE.",
          variant: "destructive",
        });
      }

      setPropertyId(data?.id || null);
      onPropertyAdded(); // Refresh the properties list

      // Reset form and close modal
      form.reset();
      setSelectedProjectId("");
      setSelectedBuildingId("");
      setSelectedOwnerId("");
      setOpen(false);
    } catch (error) {
      console.error("Error creating property:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      // Clear all data when closing
      form.reset();
      setPropertyId(null);
      setSelectedProjectId("");
      setSelectedBuildingId("");
      setSelectedOwnerId("");
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Propiedad
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Propiedad</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted">
            <TabsTrigger value="basic" className="text-foreground">Datos Básicos</TabsTrigger>
            <TabsTrigger value="documents" disabled={!propertyId} className="text-foreground">Documentos</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Project, Building and Model Selection - Priority Fields */}
                <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/50">
                  <h3 className="text-lg font-medium">Selección de Proyecto y Modelo</h3>
                  
                  <FormField
                    control={form.control}
                    name="id_proyecto"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proyecto</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedProjectId(value);
                            setSelectedBuildingId("");
                            form.setValue("id_edificio", "");
                            form.setValue("id_modelo", "");
                          }} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un proyecto" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {proyectos?.map((proyecto) => (
                              <SelectItem key={proyecto.id} value={proyecto.id.toString()}>
                                {proyecto.nombre}
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
                    name="id_edificio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Edificio</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedBuildingId(value);
                            form.setValue("id_modelo", "");
                          }} 
                          value={field.value}
                          disabled={!selectedProjectId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={!selectedProjectId ? "Selecciona un proyecto primero" : "Selecciona un edificio"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {edificios?.map((edificio) => (
                              <SelectItem key={edificio.id} value={edificio.id.toString()}>
                                {edificio.nombre}
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
                    name="id_modelo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modelo</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={!selectedBuildingId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={!selectedBuildingId ? "Selecciona un edificio primero" : "Selecciona un modelo"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modelos?.map((em) => (
                              <SelectItem key={em.modelos?.id} value={em.modelos?.id.toString()}>
                                {em.modelos?.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Show remaining fields only after project, building and model are selected */}
                {form.watch("id_proyecto") && form.watch("id_edificio") && form.watch("id_modelo") && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="numero_propiedad"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de Propiedad</FormLabel>
                            <FormControl>
                              <Input placeholder="Ej: A-101" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="numero_piso"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de Piso</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="m2_reales"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>M² Reales</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="100.50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="m2_escriturables"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>M² Escriturables</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="95.50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="precio_lista"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de Lista</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="1500000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="monto_apartado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto Apartado (Opcional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="50000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="id_entidad_relacionada_dueno"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Propietario</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      console.log("Owner selected:", value);
                      field.onChange(value);
                      setSelectedOwnerId(value);
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona propietario" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {propietarios && propietarios.length > 0 ? (
                        propietarios?.map((entidad) => (
                          <SelectItem key={entidad.id} value={entidad.id.toString()}>
                            {entidad.personas?.nombre_legal}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-owners" disabled>
                          Se deben asignar Entidades Legales (Dueños vendedor o Aportante) al proyecto
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campo de solo lectura para mostrar la CLABE */}
            {selectedOwnerId && selectedOwnerId !== "no-owners" && (
              <div className="space-y-2">
                <FormLabel>CLABE (Generada Automáticamente)</FormLabel>
                {isLoadingClabe ? (
                  <Input 
                    value="Generando CLABE..." 
                    readOnly 
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                ) : clabeError ? (
                  <Input 
                    value="Error al generar CLABE" 
                    readOnly 
                    className="bg-destructive/10 text-destructive cursor-not-allowed"
                  />
                ) : ownerClabe ? (
                  <Input 
                    value={ownerClabe} 
                    readOnly 
                    className="bg-muted text-muted-foreground cursor-not-allowed font-mono"
                  />
                ) : (
                  <Input 
                    value="Sin CLABE disponible" 
                    readOnly 
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                )}
              </div>
            )}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="id_tipo_transaccion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Transacción</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {tiposTransaccion?.map((tipo) => (
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
                        name="id_tipo_propiedad"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Propiedad</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {tiposPropiedad?.map((tipo) => (
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
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="id_estatus_disponibilidad"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Disponibilidad</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona disponibilidad" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {estatusDisponibilidad?.map((estatus) => (
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
                        name="id_vista"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vista</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona vista" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {vistas?.map((vista) => (
                                  <SelectItem key={vista.id} value={vista.id.toString()}>
                                    {vista.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                  </>
                )}

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setOpen(false);
                    setPropertyId(null);
                    setSelectedProjectId("");
                    setSelectedBuildingId("");
                    form.reset();
                    onPropertyAdded();
                  }}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={
                      !form.watch("id_proyecto") || 
                      !form.watch("id_edificio") || 
                      !form.watch("id_modelo") ||
                      !propietarios ||
                      propietarios.length === 0
                    }
                  >
                    {propertyId ? "Actualizar" : "Crear Propiedad"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
          
          <TabsContent value="documents">
            <DocumentsTab 
              entityId={propertyId} 
              entityType="propiedad"
              onDocumentAdded={() => {
                toast({
                  title: "Documento agregado",
                  description: "El documento se ha agregado correctamente."
                });
              }}
            />
            <div className="flex justify-end pt-4">
              <Button onClick={() => {
                setOpen(false);
                setPropertyId(null);
                onPropertyAdded();
              }}>
                Finalizar
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};