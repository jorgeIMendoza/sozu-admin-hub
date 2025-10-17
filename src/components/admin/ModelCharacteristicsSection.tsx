import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ModelCharacteristicsSectionProps {
  modelId?: number;
  selectedCharacteristicIds?: string[];
  onCharacteristicsChange?: (ids: string[]) => void;
}

export function ModelCharacteristicsSection({ 
  modelId, 
  selectedCharacteristicIds = [],
  onCharacteristicsChange 
}: ModelCharacteristicsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddingCharacteristic, setIsAddingCharacteristic] = useState(false);
  const [newCharacteristicName, setNewCharacteristicName] = useState("");
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(selectedCharacteristicIds);

  // Fetch available characteristics
  const { data: availableCharacteristics = [] } = useQuery({
    queryKey: ['caracteristicas-activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caracteristicas')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch model's current characteristics (only if modelId exists - edit mode)
  const { data: modelCharacteristics = [] } = useQuery({
    queryKey: ['modelo-caracteristicas', modelId],
    queryFn: async () => {
      if (!modelId) return [];
      
      const { data, error } = await supabase
        .from('modelos_caracteristicas')
        .select(`
          *,
          caracteristicas (
            id,
            nombre
          )
        `)
        .eq('id_modelo', modelId)
        .eq('activo', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!modelId
  });

  // Mutation to add new characteristic
  const addCharacteristicMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('caracteristicas')
        .insert([{
          nombre: name
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caracteristicas-activas'] });
      setNewCharacteristicName("");
      setIsAddingCharacteristic(false);
      toast({ title: "Característica agregada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar característica", variant: "destructive" });
    }
  });

  // Initialize selected IDs from model characteristics or props
  useEffect(() => {
    if (modelCharacteristics.length > 0) {
      const currentIds = modelCharacteristics.map(mc => mc.id_caracteristica.toString());
      setInternalSelectedIds(currentIds);
      if (onCharacteristicsChange) {
        onCharacteristicsChange(currentIds);
      }
    }
  }, [modelCharacteristics]);

  // Update internal state when external prop changes (for new models)
  useEffect(() => {
    if (!modelId && selectedCharacteristicIds.length >= 0) {
      setInternalSelectedIds(selectedCharacteristicIds);
    }
  }, [selectedCharacteristicIds, modelId]);

  const handleCharacteristicToggle = (characteristicId: string, checked: boolean) => {
    let newSelected;
    if (checked) {
      newSelected = [...internalSelectedIds, characteristicId];
    } else {
      newSelected = internalSelectedIds.filter(id => id !== characteristicId);
    }
    setInternalSelectedIds(newSelected);
    
    // Notify parent component of changes
    if (onCharacteristicsChange) {
      onCharacteristicsChange(newSelected);
    }
  };

  const handleAddNewCharacteristic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharacteristicName.trim()) {
      toast({ title: "Por favor ingresa un nombre para la característica", variant: "destructive" });
      return;
    }
    addCharacteristicMutation.mutate(newCharacteristicName.trim());
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Características del Modelo</CardTitle>
            <CardDescription>Selecciona las características que incluye este modelo</CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => setIsAddingCharacteristic(true)}
            disabled={isAddingCharacteristic}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Característica
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAddingCharacteristic && (
          <Card className="border-2 border-primary/20 animate-scale-in">
            <CardHeader>
              <CardTitle className="text-base">Nueva Característica</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddNewCharacteristic} className="space-y-4">
                <div>
                  <Label htmlFor="characteristic-name">Nombre de la Característica</Label>
                  <Input
                    id="characteristic-name"
                    type="text"
                    value={newCharacteristicName}
                    onChange={(e) => setNewCharacteristicName(e.target.value)}
                    placeholder="Ej. Closet, Cocina integral, etc."
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button type="submit" disabled={addCharacteristicMutation.isPending}>
                    {addCharacteristicMutation.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsAddingCharacteristic(false);
                      setNewCharacteristicName("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {availableCharacteristics.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hay características disponibles</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {availableCharacteristics.map((characteristic) => (
              <div 
                key={characteristic.id} 
                className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  id={`model-char-${characteristic.id}`}
                  checked={internalSelectedIds.includes(characteristic.id.toString())}
                  onCheckedChange={(checked) => 
                    handleCharacteristicToggle(characteristic.id.toString(), checked as boolean)
                  }
                />
                <Label 
                  htmlFor={`model-char-${characteristic.id}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {characteristic.nombre}
                </Label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
