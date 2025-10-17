import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil } from "lucide-react";
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
  const [newCharacteristicVerEnOferta, setNewCharacteristicVerEnOferta] = useState(true);
  const [editingCharacteristicId, setEditingCharacteristicId] = useState<number | null>(null);
  const [editCharacteristicName, setEditCharacteristicName] = useState("");
  const [editCharacteristicVerEnOferta, setEditCharacteristicVerEnOferta] = useState(true);
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
    mutationFn: async (data: { nombre: string; ver_en_oferta: boolean }) => {
      const { data: result, error } = await supabase
        .from('caracteristicas')
        .insert([{
          nombre: data.nombre,
          ver_en_oferta: data.ver_en_oferta,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caracteristicas-activas'] });
      setNewCharacteristicName("");
      setNewCharacteristicVerEnOferta(true);
      setIsAddingCharacteristic(false);
      toast({ title: "Característica agregada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar característica", variant: "destructive" });
    }
  });

  // Mutation to update characteristic
  const updateCharacteristicMutation = useMutation({
    mutationFn: async (data: { id: number; nombre: string; ver_en_oferta: boolean }) => {
      const { data: result, error } = await supabase
        .from('caracteristicas')
        .update({
          nombre: data.nombre,
          ver_en_oferta: data.ver_en_oferta,
        })
        .eq('id', data.id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caracteristicas-activas'] });
      setEditingCharacteristicId(null);
      setEditCharacteristicName("");
      setEditCharacteristicVerEnOferta(true);
      toast({ title: "Característica actualizada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar característica", variant: "destructive" });
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
    addCharacteristicMutation.mutate({
      nombre: newCharacteristicName.trim(),
      ver_en_oferta: newCharacteristicVerEnOferta
    });
  };

  const handleEditCharacteristic = (characteristic: any) => {
    setEditingCharacteristicId(characteristic.id);
    setEditCharacteristicName(characteristic.nombre);
    setEditCharacteristicVerEnOferta(characteristic.ver_en_oferta ?? true);
  };

  const handleUpdateCharacteristic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCharacteristicName.trim()) {
      toast({ title: "Por favor ingresa un nombre para la característica", variant: "destructive" });
      return;
    }
    if (editingCharacteristicId) {
      updateCharacteristicMutation.mutate({
        id: editingCharacteristicId,
        nombre: editCharacteristicName.trim(),
        ver_en_oferta: editCharacteristicVerEnOferta
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingCharacteristicId(null);
    setEditCharacteristicName("");
    setEditCharacteristicVerEnOferta(true);
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
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ver-en-oferta"
                  checked={newCharacteristicVerEnOferta}
                  onCheckedChange={(checked) => setNewCharacteristicVerEnOferta(checked as boolean)}
                />
                <Label htmlFor="ver-en-oferta" className="text-sm font-normal cursor-pointer">
                  Ver en oferta
                </Label>
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
                    setNewCharacteristicVerEnOferta(true);
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
              editingCharacteristicId === characteristic.id ? (
                <Card key={characteristic.id} className="col-span-2 border-2 border-primary/20">
                  <CardContent className="pt-4">
                    <form onSubmit={handleUpdateCharacteristic} className="space-y-3">
                      <div>
                        <Label htmlFor="edit-characteristic-name">Nombre de la Característica</Label>
                        <Input
                          id="edit-characteristic-name"
                          type="text"
                          value={editCharacteristicName}
                          onChange={(e) => setEditCharacteristicName(e.target.value)}
                          placeholder="Ej. Closet, Cocina integral, etc."
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="edit-ver-en-oferta"
                          checked={editCharacteristicVerEnOferta}
                          onCheckedChange={(checked) => setEditCharacteristicVerEnOferta(checked as boolean)}
                        />
                        <Label htmlFor="edit-ver-en-oferta" className="text-sm font-normal cursor-pointer">
                          Ver en oferta
                        </Label>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={updateCharacteristicMutation.isPending}>
                          {updateCharacteristicMutation.isPending ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <div 
                  key={characteristic.id} 
                  className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors group"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleEditCharacteristic(characteristic)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
