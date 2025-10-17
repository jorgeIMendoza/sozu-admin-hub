import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PropertyCharacteristicsSectionProps {
  propertyId: number;
}

export function PropertyCharacteristicsSection({ propertyId }: PropertyCharacteristicsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddingCharacteristic, setIsAddingCharacteristic] = useState(false);
  const [newCharacteristicName, setNewCharacteristicName] = useState("");
  const [newCharacteristicVerEnOferta, setNewCharacteristicVerEnOferta] = useState(true);
  const [editingCharacteristicId, setEditingCharacteristicId] = useState<number | null>(null);
  const [editCharacteristicName, setEditCharacteristicName] = useState("");
  const [editCharacteristicVerEnOferta, setEditCharacteristicVerEnOferta] = useState(true);
  const [selectedCharacteristics, setSelectedCharacteristics] = useState<string[]>([]);

  // Fetch available characteristics (only enabled ones)
  const { data: availableCharacteristics = [] } = useQuery({
    queryKey: ['availableCharacteristics'],
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

  // Fetch property's current characteristics
  const { data: propertyCharacteristics = [] } = useQuery({
    queryKey: ['propertyCharacteristics', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades_caracteristicas')
        .select(`
          *,
          caracteristicas (
            id,
            nombre
          )
        `)
        .eq('id_propiedad', propertyId)
        .eq('activo', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId
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
      queryClient.invalidateQueries({ queryKey: ['availableCharacteristics'] });
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
      queryClient.invalidateQueries({ queryKey: ['availableCharacteristics'] });
      setEditingCharacteristicId(null);
      setEditCharacteristicName("");
      setEditCharacteristicVerEnOferta(true);
      toast({ title: "Característica actualizada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar característica", variant: "destructive" });
    }
  });

  // Mutation to update property characteristics
  const updateCharacteristicsMutation = useMutation({
    mutationFn: async (characteristicIds: string[]) => {
      // First, deactivate all existing characteristics for this property
      const { error: deactivateError } = await supabase
        .from('propiedades_caracteristicas')
        .update({ activo: false })
        .eq('id_propiedad', propertyId);
      
      if (deactivateError) throw deactivateError;

      // Then, add/reactivate selected characteristics
      for (const characteristicId of characteristicIds) {
        // Check if relationship already exists
        const { data: existing } = await supabase
          .from('propiedades_caracteristicas')
          .select('id')
          .eq('id_propiedad', propertyId)
          .eq('id_caracteristica', parseInt(characteristicId))
          .single();

        if (existing) {
          // Reactivate existing relationship
          const { error } = await supabase
            .from('propiedades_caracteristicas')
            .update({ activo: true })
            .eq('id', existing.id);
          
          if (error) throw error;
        } else {
          // Create new relationship
          const { error } = await supabase
            .from('propiedades_caracteristicas')
            .insert([{
              id_propiedad: propertyId,
              id_caracteristica: parseInt(characteristicId)
            }]);
          
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyCharacteristics', propertyId] });
      toast({ title: "Características actualizadas exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar características", variant: "destructive" });
    }
  });

  // Get currently selected characteristic IDs
  React.useEffect(() => {
    if (propertyCharacteristics) {
      const currentIds = propertyCharacteristics.map(pc => pc.id_caracteristica.toString());
      setSelectedCharacteristics(currentIds);
    }
  }, [propertyCharacteristics]);

  const handleCharacteristicToggle = (characteristicId: string, checked: boolean) => {
    let newSelected;
    if (checked) {
      newSelected = [...selectedCharacteristics, characteristicId];
    } else {
      newSelected = selectedCharacteristics.filter(id => id !== characteristicId);
    }
    setSelectedCharacteristics(newSelected);
    updateCharacteristicsMutation.mutate(newSelected);
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
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Características de la Propiedad</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona las características que incluye esta propiedad
            </p>
          </div>
          <Button
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
          <Card>
            <CardHeader>
              <CardTitle>Nueva Característica</CardTitle>
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
                    placeholder="Ej. Balcón, Terraza, etc."
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
          <p className="text-muted-foreground">No hay características disponibles</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
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
                          placeholder="Ej. Balcón, Terraza, etc."
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="edit-ver-en-oferta-prop"
                          checked={editCharacteristicVerEnOferta}
                          onCheckedChange={(checked) => setEditCharacteristicVerEnOferta(checked as boolean)}
                        />
                        <Label htmlFor="edit-ver-en-oferta-prop" className="text-sm font-normal cursor-pointer">
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
                <div key={characteristic.id} className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50 transition-colors group">
                  <Checkbox
                    id={`characteristic-${characteristic.id}`}
                    checked={selectedCharacteristics.includes(characteristic.id.toString())}
                    onCheckedChange={(checked) => 
                      handleCharacteristicToggle(characteristic.id.toString(), checked as boolean)
                    }
                    disabled={updateCharacteristicsMutation.isPending}
                  />
                  <Label 
                    htmlFor={`characteristic-${characteristic.id}`}
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