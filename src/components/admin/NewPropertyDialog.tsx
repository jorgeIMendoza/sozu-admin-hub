import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { ProjectModelSelectionSection } from "./ProjectModelSelectionSection";
import { PropertyBasicDataSection } from "./PropertyBasicDataSection";
import { PropertyClassificationSection } from "./PropertyClassificationSection";
import { PropertyDescriptionSection } from "./PropertyDescriptionSection";
import { PropertyMultimediaSection } from "./PropertyMultimediaSection";
import { PropertyCharacteristicsSelectionSection } from "./PropertyCharacteristicsSelectionSection";
import { useActivityLogger } from "@/hooks/useActivityLogger";

const formSchema = z.object({
  id_proyecto: z.string().min(1, "El proyecto es requerido"),
  id_edificio: z.string().min(1, "El edificio es requerido"),
  id_modelo: z.string().min(1, "El modelo es requerido"),
  numero_propiedad: z.string().min(1, "El número de propiedad es requerido"),
  numero_piso: z.string().min(1, "El nivel es requerido"),
  m2_interiores: z.string().min(1, "Los metros cuadrados interiores son requeridos"),
  m2_exteriores: z.string().min(1, "Los metros cuadrados exteriores son requeridos"),
  m2_loft: z.string().optional(),
  precio_lista: z.string().min(1, "El precio de lista es requerido"),
  monto_apartado: z.string().optional(),
  id_tipo_transaccion: z.string().min(1, "El tipo de transacción es requerido"),
  id_tipo_propiedad: z.string().min(1, "El tipo de propiedad es requerido"),
  id_estatus_disponibilidad: z.string().min(1, "El estatus de disponibilidad es requerido"),
  id_vista: z.string().optional(),
  id_entidad_relacionada_dueno: z.string().min(1, "El propietario es requerido").refine((val) => val !== "no-owners", {
    message: "Se deben asignar Entidades Legales (Dueños vendedor o Aportante) al proyecto"
  }),
  descripcion: z.string().optional(),
  url_imagen_portada: z.string().optional(),
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
  const [selectedCharacteristics, setSelectedCharacteristics] = useState<number[]>([]);
  const [multimediaItems, setMultimediaItems] = useState<any[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { registrarCreacion } = useActivityLogger();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id_proyecto: "",
      id_edificio: "",
      id_modelo: "",
      numero_propiedad: "",
      numero_piso: "",
      m2_interiores: "",
      m2_exteriores: "",
      m2_loft: "",
      precio_lista: "",
      monto_apartado: "",
      id_tipo_transaccion: "",
      id_tipo_propiedad: "",
      id_estatus_disponibilidad: "",
      id_vista: "",
      id_entidad_relacionada_dueno: "",
      descripcion: "",
      url_imagen_portada: "",
    },
  });

  // Query para obtener la CLABE del propietario seleccionado
  const { data: ownerClabe, isLoading: isLoadingClabe, error: clabeError } = useQuery({
    queryKey: ["owner-clabe", selectedOwnerId],
    queryFn: async () => {
      if (!selectedOwnerId) return null;
      
      try {
        const { data, error } = await supabase
          .rpc('crear_referencia_bancaria', {
            id_er_dueno: parseInt(selectedOwnerId)
          });

        if (error) throw error;
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
    setIsSubmitting(true);
    
    try {
      // Paso 1: Crear la propiedad
      const propertyData = {
        numero_propiedad: values.numero_propiedad,
        numero_piso: values.numero_piso as any,
        m2_interiores: parseFloat(values.m2_interiores),
        m2_exteriores: parseFloat(values.m2_exteriores),
        m2_loft: values.m2_loft ? parseFloat(values.m2_loft) : null,
        precio_lista: parseFloat(values.precio_lista),
        monto_apartado: values.monto_apartado ? parseFloat(values.monto_apartado) : null,
        id_edificio_modelo: parseInt(values.id_modelo),
        id_tipo_transaccion: parseInt(values.id_tipo_transaccion),
        id_tipo_propiedad: parseInt(values.id_tipo_propiedad),
        id_estatus_disponibilidad: parseInt(values.id_estatus_disponibilidad),
        id_vista: parseInt(values.id_vista),
        id_entidad_relacionada_dueno: parseInt(values.id_entidad_relacionada_dueno),
        descripcion: values.descripcion || null,
        url_imagen_portada: values.url_imagen_portada || null,
        es_aprobado: false,
        activo: true,
      };

      const { data, error } = await supabase
        .from("propiedades")
        .insert(propertyData)
        .select()
        .single();

      if (error) throw error;

      const createdPropertyId = data?.id;
      setPropertyId(createdPropertyId || null);

      // Paso 2: Insertar características si las hay
      if (selectedCharacteristics.length > 0 && createdPropertyId) {
        const characteristicsData = selectedCharacteristics.map(caracteristicaId => ({
          id_propiedad: createdPropertyId,
          id_caracteristica: caracteristicaId,
          activo: true
        }));

        const { error: characteristicsError } = await supabase
          .from("propiedades_caracteristicas")
          .insert(characteristicsData);

        if (characteristicsError) {
          console.error("Error inserting characteristics:", characteristicsError);
        }
      }

      // Paso 3: Subir archivos multimedia y guardar referencias
      if (multimediaItems.length > 0 && createdPropertyId) {
        for (const item of multimediaItems) {
          let finalUrl = item.url;
          
          // Si hay un archivo, subirlo primero
          if (item.file) {
            try {
              const fileExt = item.file.name.split('.').pop();
              const fileName = `${Date.now()}.${fileExt}`;
              const filePath = `properties/${createdPropertyId}/multimedia/${fileName}`;

              const { error: uploadError } = await supabase.storage
                .from('documentos')
                .upload(filePath, item.file);

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                .from('documentos')
                .getPublicUrl(filePath);

              finalUrl = urlData.publicUrl;
            } catch (uploadError) {
              console.error('Error uploading file:', uploadError);
              continue; // Skip this item if upload fails
            }
          }

          // Insertar referencia en la base de datos
          const { error: multimediaError } = await supabase
            .from('multimedias_propiedad')
            .insert([{
              id_propiedad: createdPropertyId,
              url: finalUrl,
              descripcion: item.descripcion,
              es_imagen: item.es_imagen,
              activo: true
            }]);

          if (multimediaError) {
            console.error('Error inserting multimedia:', multimediaError);
          }
        }
      }

      // Paso 4: Insertar videos de YouTube
      if (youtubeVideos.length > 0 && createdPropertyId) {
        const youtubeData = youtubeVideos.map(video => ({
          nombre: video.nombre,
          link: video.link,
          id_propiedad: createdPropertyId,
          id_proyecto: null,
          activo: true
        }));

        const { error: youtubeError } = await supabase
          .from('videos_youtube')
          .insert(youtubeData);

        if (youtubeError) {
          console.error('Error inserting YouTube videos:', youtubeError);
        }
      }

      onPropertyAdded();

      // Registrar actividad
      registrarCreacion('propiedad', {
        id: createdPropertyId,
        numero_propiedad: values.numero_propiedad,
        id_proyecto: values.id_proyecto,
        id_edificio: values.id_edificio,
        precio_lista: values.precio_lista,
        multimedia_count: multimediaItems.length,
        youtube_count: youtubeVideos.length
      });

      toast({
        title: "Propiedad creada exitosamente",
        description: `Se creó la propiedad con ${multimediaItems.length} archivos multimedia y ${youtubeVideos.length} videos de YouTube`,
      });

      // Reset form and close modal
      handleClose(false);
    } catch (error) {
      console.error("Error creating property:", error);
      toast({
        title: "Error",
        description: "Hubo un error al crear la propiedad.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
      setPropertyId(null);
      setSelectedProjectId("");
      setSelectedBuildingId("");
      setSelectedOwnerId("");
      setSelectedCharacteristics([]);
      setMultimediaItems([]);
      setYoutubeVideos([]);
    }
    setOpen(newOpen);
  };

  const handleMultimediaChange = (multimedia: any[], youtube: any[]) => {
    setMultimediaItems(multimedia);
    setYoutubeVideos(youtube);
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
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">Características Generales</TabsTrigger>
            <TabsTrigger value="descripcion">Descripción</TabsTrigger>
            <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
          </TabsList>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <TabsContent value="general" className="space-y-6">
                {/* Selección de Proyecto y Modelo */}
                <ProjectModelSelectionSection
                  form={form}
                  selectedProjectId={selectedProjectId}
                  selectedBuildingId={selectedBuildingId}
                  selectedOwnerId={selectedOwnerId}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedBuildingId={setSelectedBuildingId}
                  setSelectedOwnerId={setSelectedOwnerId}
                  ownerClabe={ownerClabe}
                  isLoadingClabe={isLoadingClabe}
                  clabeError={clabeError}
                />
                
                {/* Datos Básicos y Clasificaciones - aparecen cuando se selecciona propietario */}
                {selectedOwnerId && selectedOwnerId !== "no-owners" && (
                  <>
                    <PropertyBasicDataSection form={form} />
                    <PropertyClassificationSection form={form} />
                  </>
                )}
              </TabsContent>
              
              <TabsContent value="descripcion" className="space-y-6">
                {selectedOwnerId && selectedOwnerId !== "no-owners" ? (
                  <div className="space-y-6">
                    <PropertyDescriptionSection 
                      form={form} 
                      selectedModelId={form.watch("id_modelo")}
                      onCharacteristicsChange={setSelectedCharacteristics}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Selecciona un propietario para continuar con la descripción
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="multimedia" className="space-y-6">
                {selectedOwnerId && selectedOwnerId !== "no-owners" ? (
                  <PropertyMultimediaSection 
                    form={form} 
                    projectId={form.watch("id_proyecto")}
                    onMultimediaChange={handleMultimediaChange}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Selecciona un propietario para continuar con la multimedia
                  </div>
                )}
              </TabsContent>
              
              {/* Botón de crear - visible en todas las pestañas cuando hay propietario */}
              {selectedOwnerId && selectedOwnerId !== "no-owners" && (
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creando..." : "Crear Propiedad"}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};