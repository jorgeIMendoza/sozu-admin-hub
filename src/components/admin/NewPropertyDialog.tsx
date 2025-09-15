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
  numero_propiedad: z.string().min(1, "El número de propiedad es requerido"),
  numero_piso: z.string().min(1, "El número de piso es requerido"),
  m2_reales: z.string().min(1, "Los metros cuadrados son requeridos"),
  m2_escriturables: z.string().min(1, "Los metros cuadrados escriturables son requeridos"),
  precio_lista: z.string().min(1, "El precio de lista es requerido"),
  monto_apartado: z.string().optional(),
  id_edificio_modelo: z.string().min(1, "El modelo del edificio es requerido"),
  id_tipo_transaccion: z.string().min(1, "El tipo de transacción es requerido"),
  id_tipo_propiedad: z.string().min(1, "El tipo de propiedad es requerido"),
  id_estatus_disponibilidad: z.string().min(1, "El estatus de disponibilidad es requerido"),
  id_vista: z.string().min(1, "La vista es requerida"),
  id_entidad_relacionada_dueno: z.string().min(1, "El propietario es requerido"),
});

interface NewPropertyDialogProps {
  onPropertyAdded: () => void;
}

export const NewPropertyDialog = ({ onPropertyAdded }: NewPropertyDialogProps) => {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numero_propiedad: "",
      numero_piso: "",
      m2_reales: "",
      m2_escriturables: "",
      precio_lista: "",
      monto_apartado: "",
      id_edificio_modelo: "",
      id_tipo_transaccion: "",
      id_tipo_propiedad: "",
      id_estatus_disponibilidad: "",
      id_vista: "",
      id_entidad_relacionada_dueno: "",
    },
  });

  // Queries para obtener los datos necesarios
  const { data: edificiosModelos } = useQuery({
    queryKey: ["edificios-modelos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edificios_modelos")
        .select(`
          id,
          edificios!fk_edificios_modelos_edificio (
            nombre,
            proyectos!fk_edificios_proyecto (
              nombre
            )
          ),
          modelos!fk_edificios_modelos_modelo (
            nombre
          )
        `)
        .eq("activo", true);
      
      if (error) throw error;
      return data || [];
    },
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

  const { data: personas } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personas")
        .select("id, nombre_legal")
        .eq("activo", true)
        .order("nombre_legal");
      
      if (error) throw error;
      return data || [];
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const propertyData = {
        numero_propiedad: values.numero_propiedad,
        numero_piso: parseInt(values.numero_piso),
        m2_reales: parseFloat(values.m2_reales),
        m2_escriturables: parseFloat(values.m2_escriturables),
        precio_lista: parseFloat(values.precio_lista),
        monto_apartado: values.monto_apartado ? parseFloat(values.monto_apartado) : null,
        id_edificio_modelo: parseInt(values.id_edificio_modelo),
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

      setPropertyId(data?.id || null);

      toast({
        title: "Propiedad creada",
        description: "La propiedad se ha creado exitosamente.",
      });

      // Don't close dialog immediately, let user add documents
      form.reset();
    } catch (error) {
      console.error("Error creating property:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear la propiedad.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
            <TabsTrigger value="documents" disabled={!propertyId}>Documentos</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="id_edificio_modelo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edificio y Modelo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona edificio y modelo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {edificiosModelos?.map((em) => (
                        <SelectItem key={em.id} value={em.id.toString()}>
                          {em.edificios?.proyectos?.nombre} - {em.edificios?.nombre} - {em.modelos?.nombre}
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

            <FormField
              control={form.control}
              name="id_entidad_relacionada_dueno"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Propietario</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona propietario" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {personas?.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id.toString()}>
                          {persona.nombre_legal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setOpen(false);
                    setPropertyId(null);
                    onPropertyAdded();
                  }}>
                    Cancelar
                  </Button>
                  <Button type="submit">
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