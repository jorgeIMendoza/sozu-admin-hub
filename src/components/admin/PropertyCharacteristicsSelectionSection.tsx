import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Grid3x3, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PropertyCharacteristicsSelectionSectionProps {
  onCharacteristicsChange?: (selectedIds: number[]) => void;
  initialSelectedIds?: number[];
  excludeCharacteristicIds?: number[];
}

export const PropertyCharacteristicsSelectionSection = ({ 
  onCharacteristicsChange,
  initialSelectedIds = [],
  excludeCharacteristicIds = []
}: PropertyCharacteristicsSelectionSectionProps) => {
  const [selectedCharacteristics, setSelectedCharacteristics] = useState<number[]>(initialSelectedIds);
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // Query para obtener las características disponibles (excluyendo las del modelo)
  const { data: caracteristicas, isLoading } = useQuery({
    queryKey: ["caracteristicas-available", excludeCharacteristicIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caracteristicas")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      // Filter out excluded characteristics (from model)
      return (data || []).filter(c => !excludeCharacteristicIds.includes(c.id));
    },
  });

  const handleCharacteristicChange = (caracteristicaId: number, checked: boolean) => {
    const newSelected = checked
      ? [...selectedCharacteristics, caracteristicaId]
      : selectedCharacteristics.filter(id => id !== caracteristicaId);
    
    setSelectedCharacteristics(newSelected);
    onCharacteristicsChange?.(newSelected);
  };

  // Filter characteristics based on showOnlySelected
  const filteredCharacteristics = showOnlySelected
    ? caracteristicas?.filter(c => selectedCharacteristics.includes(c.id)) || []
    : caracteristicas || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Características extra de la Propiedad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Cargando características...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Características extra de la Propiedad</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona características adicionales a las del modelo
            </p>
          </div>
          <Button
            type="button"
            variant={showOnlySelected ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowOnlySelected(!showOnlySelected)}
          >
            {showOnlySelected ? (
              <>
                <Grid3x3 className="w-4 h-4 mr-2" />
                Ver Todas
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Ver Seleccionadas ({selectedCharacteristics.length})
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {filteredCharacteristics.length === 0 ? (
          <p className="text-muted-foreground">
            {showOnlySelected 
              ? "No hay características seleccionadas" 
              : "No hay características disponibles para asignar."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredCharacteristics.map((caracteristica) => (
              <div key={caracteristica.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`caracteristica-${caracteristica.id}`}
                  checked={selectedCharacteristics.includes(caracteristica.id)}
                  onCheckedChange={(checked) => 
                    handleCharacteristicChange(caracteristica.id, checked as boolean)
                  }
                />
                <label
                  htmlFor={`caracteristica-${caracteristica.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {caracteristica.nombre}
                </label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};