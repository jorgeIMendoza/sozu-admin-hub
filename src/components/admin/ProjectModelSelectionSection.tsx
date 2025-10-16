import { useQuery } from "@tanstack/react-query";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";

interface ProjectModelSelectionSectionProps {
  form: any;
  selectedProjectId: string;
  selectedBuildingId: string;
  selectedOwnerId: string;
  setSelectedProjectId: (value: string) => void;
  setSelectedBuildingId: (value: string) => void;
  setSelectedOwnerId: (value: string) => void;
  ownerClabe?: string;
  isLoadingClabe?: boolean;
  clabeError?: any;
}

export const ProjectModelSelectionSection = ({
  form,
  selectedProjectId,
  selectedBuildingId,
  selectedOwnerId,
  setSelectedProjectId,
  setSelectedBuildingId,
  setSelectedOwnerId,
  ownerClabe,
  isLoadingClabe,
  clabeError
}: ProjectModelSelectionSectionProps) => {
  // Query para obtener proyectos
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

  // Query para obtener edificios
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

  // Query para obtener modelos
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

  // Query para obtener propietarios
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Selección de Proyecto y Modelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="id_proyecto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Proyecto *</FormLabel>
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedProjectId(value);
                      // Reset all subsequent fields when project changes
                      setSelectedBuildingId("");
                      setSelectedOwnerId("");
                      form.setValue("id_edificio", "");
                      form.setValue("id_modelo", "");
                      form.setValue("id_entidad_relacionada_dueno", "");
                    }}
                    options={proyectos?.map((proyecto) => ({
                      value: proyecto.id.toString(),
                      label: proyecto.nombre,
                    })) || []}
                    placeholder="Selecciona un proyecto"
                    searchPlaceholder="Buscar proyecto..."
                    emptyText="No se encontró el proyecto."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_edificio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Edificio *</FormLabel>
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedBuildingId(value);
                      // Reset subsequent fields when building changes
                      setSelectedOwnerId("");
                      form.setValue("id_modelo", "");
                      form.setValue("id_entidad_relacionada_dueno", "");
                    }}
                    options={edificios?.map((edificio) => ({
                      value: edificio.id.toString(),
                      label: edificio.nombre,
                    })) || []}
                    placeholder={!selectedProjectId ? "Selecciona un proyecto primero" : "Selecciona un edificio"}
                    searchPlaceholder="Buscar edificio..."
                    emptyText="No se encontró el edificio."
                    disabled={!selectedProjectId}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_modelo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modelo *</FormLabel>
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Reset subsequent fields when model changes
                      setSelectedOwnerId("");
                      form.setValue("id_entidad_relacionada_dueno", "");
                    }}
                    options={modelos?.map((em) => ({
                      value: em.modelos?.id.toString(),
                      label: em.modelos?.nombre,
                    })) || []}
                    placeholder={!selectedBuildingId ? "Selecciona un edificio primero" : "Selecciona un modelo"}
                    searchPlaceholder="Buscar modelo..."
                    emptyText="No se encontró el modelo."
                    disabled={!selectedBuildingId}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_entidad_relacionada_dueno"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Propietario *</FormLabel>
                <FormControl>
                  <Combobox
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedOwnerId(value);
                    }}
                    options={propietarios?.length === 0 
                      ? [{ value: "no-owners", label: "No hay propietarios disponibles" }]
                      : propietarios?.map((propietario) => ({
                          value: propietario.id.toString(),
                          label: propietario.personas?.nombre_legal || "",
                        })) || []
                    }
                    placeholder={!selectedProjectId ? "Selecciona un proyecto primero" : "Selecciona el propietario"}
                    searchPlaceholder="Buscar propietario..."
                    emptyText="No se encontró el propietario."
                    disabled={!selectedProjectId}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CLABE STP Display */}
          {selectedOwnerId && selectedOwnerId !== "no-owners" && (
            <div className="space-y-2">
              <FormLabel>CLABE STP</FormLabel>
              <div className="p-3 border rounded-md bg-muted/50">
                {isLoadingClabe ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm text-muted-foreground">Generando CLABE...</span>
                  </div>
                ) : clabeError ? (
                  <Badge variant="destructive">Error al generar CLABE</Badge>
                ) : ownerClabe ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ownerClabe}</Badge>
                    <span className="text-sm text-muted-foreground">(Solo lectura)</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Sin CLABE asignada</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};