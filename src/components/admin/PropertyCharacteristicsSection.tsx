import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit } from "lucide-react";
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

  // Fetch property's current characteristics (ALL relations, including activo=false)
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
        .eq('id_propiedad', propertyId);
      
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

  // Mutation to toggle a single characteristic in propiedades_caracteristicas
  const toggleCharacteristicMutation = useMutation({
    mutationFn: async ({ caracteristicaId, isActive }: { caracteristicaId: number; isActive: boolean }) => {
      // Check if relation exists
      const { data: existing } = await supabase
        .from('propiedades_caracteristicas')
        .select('id, activo')
        .eq('id_propiedad', propertyId)
        .eq('id_caracteristica', caracteristicaId)
        .maybeSingle();

      if (existing) {
        // Update activo status
        const { error } = await supabase
          .from('propiedades_caracteristicas')
          .update({ activo: isActive })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        // Create new relation
        const { error } = await supabase
          .from('propiedades_caracteristicas')
          .insert([{
            id_propiedad: propertyId,
            id_caracteristica: caracteristicaId,
            activo: isActive
          }]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyCharacteristics', propertyId] });
      toast({ title: "Característica actualizada exitosamente" });
    },
    onError: (error) => {
      console.error('Error toggling characteristic:', error);
      toast({ title: "Error al actualizar característica", variant: "destructive" });
    },
  });

  // Get currently selected characteristic IDs (only activo=true)
  React.useEffect(() => {
    if (propertyCharacteristics) {
      const currentIds = propertyCharacteristics
        .filter(pc => pc.activo)
        .map(pc => pc.id_caracteristica.toString());
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
    
    // Save to database immediately
    toggleCharacteristicMutation.mutate({
      caracteristicaId: parseInt(characteristicId),
      isActive: checked
    });
  };

  const handleAddNewCharacteristic = (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
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

  const handleUpdateCharacteristic = (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
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
              <div className="space-y-4">
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
                  <Button 
                    type="button" 
                    onClick={(e) => handleAddNewCharacteristic(e)}
                    disabled={addCharacteristicMutation.isPending}
                  >
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
              </div>
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
                    <div className="space-y-3">
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
                        <Button 
                          type="button" 
                          size="sm" 
                          onClick={(e) => handleUpdateCharacteristic(e)}
                          disabled={updateCharacteristicMutation.isPending}
                        >
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
                    </div>
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
                    disabled={toggleCharacteristicMutation.isPending}
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
                    <Edit className="h-4 w-4" />
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