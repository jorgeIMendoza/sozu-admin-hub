import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
        <CardTitle>Características extra de la Propiedad</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Selecciona características adicionales a las del modelo
        </p>
      </CardHeader>
      <CardContent>
        {!caracteristicas || caracteristicas.length === 0 ? (
          <p className="text-muted-foreground">
            No hay características disponibles para asignar.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {caracteristicas.map((caracteristica) => (
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