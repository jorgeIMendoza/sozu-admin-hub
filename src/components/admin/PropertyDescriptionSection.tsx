import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { PropertyCharacteristicsSection } from "./PropertyCharacteristicsSection";
import { PropertyCharacteristicsSelectionSection } from "./PropertyCharacteristicsSelectionSection";

interface PropertyDescriptionSectionProps {
  form: any;
  selectedModelId?: string;
  propertyId?: number;
  onCharacteristicsChange?: (selectedIds: number[]) => void;
}

export const PropertyDescriptionSection = ({ form, selectedModelId, propertyId, onCharacteristicsChange }: PropertyDescriptionSectionProps) => {
  // Fetch model details when model is selected
  const { data: modelDetails } = useQuery({
    queryKey: ["model-details", selectedModelId],
    queryFn: async () => {
      if (!selectedModelId) return null;
      
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("id", parseInt(selectedModelId))
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedModelId,
  });

  // Fetch model characteristics when model is selected
  const { data: modelCharacteristics } = useQuery({
    queryKey: ["model-characteristics", selectedModelId],
    queryFn: async () => {
      if (!selectedModelId) return [];
      
      const { data, error } = await supabase
        .from("modelos_caracteristicas")
        .select(`
          id,
          id_caracteristica,
          caracteristicas!inner (
            id,
            nombre,
            activo
          )
        `)
        .eq("id_modelo", parseInt(selectedModelId))
        .eq("activo", true)
        .eq("caracteristicas.activo", true);
      
      if (error) {
        console.error("Error fetching model characteristics:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!selectedModelId,
  });

  // Memoize the excluded characteristic IDs to prevent infinite loops
  const excludedCharacteristicIds = useMemo(() => {
    if (!modelCharacteristics || modelCharacteristics.length === 0) return [];
    return modelCharacteristics
      .map((mc: any) => mc.caracteristicas?.id)
      .filter((id): id is number => id !== undefined);
  }, [modelCharacteristics]);

  return (
    <div className="space-y-6">
      {/* Descripción */}
      <Card>
        <CardHeader>
          <CardTitle>Descripción de la Propiedad</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="descripcion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Describe las características y amenidades de la propiedad..."
                    className="min-h-[100px]"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Configuración del Modelo */}
      {modelDetails && (
        <Card>
          <CardHeader>
            <CardTitle>
              Configuración del Modelo {modelDetails.nombre ? modelDetails.nombre : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <FormLabel>Número de Recámaras</FormLabel>
                <div className="p-3 border rounded-md bg-muted/50">
                  <Badge variant="outline">
                    {modelDetails.numero_recamaras || 0} recámaras
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel>Número de Baños Completos</FormLabel>
                <div className="p-3 border rounded-md bg-muted/50">
                  <Badge variant="outline">
                    {modelDetails.numero_completo_banos || 0} baños completos
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel>Número de Medios Baños</FormLabel>
                <div className="p-3 border rounded-md bg-muted/50">
                  <Badge variant="outline">
                    {modelDetails.numero_medio_bano || 0} medios baños
                  </Badge>
                </div>
              </div>
            </div>

            {/* Características del Modelo */}
            {modelCharacteristics && modelCharacteristics.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <FormLabel>Características del Modelo</FormLabel>
                <div className="p-3 border rounded-md bg-muted/50">
                  <div className="flex flex-wrap gap-2">
                    {modelCharacteristics.map((mc: any) => {
                      const caracteristica = mc.caracteristicas;
                      return (
                        <Badge key={mc.id} variant="secondary">
                          {caracteristica?.nombre || 'Sin nombre'}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Características extra de la Propiedad */}
      {propertyId ? (
        <Card>
          <CardHeader>
            <CardTitle>Características extra de la Propiedad</CardTitle>
          </CardHeader>
          <CardContent>
            <PropertyCharacteristicsSection 
              propertyId={propertyId}
              excludeCharacteristicIds={excludedCharacteristicIds}
            />
          </CardContent>
        </Card>
      ) : (
        <PropertyCharacteristicsSelectionSection 
          onCharacteristicsChange={onCharacteristicsChange}
          excludeCharacteristicIds={excludedCharacteristicIds}
        />
      )}
    </div>
  );
};