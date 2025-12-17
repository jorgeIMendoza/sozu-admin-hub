import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Building {
  id: string;
  nombre: string;
  numero_pisos: string;
  fecha_lanzamiento: string;
  modelos: string[];
}

interface BuildingFormSectionProps {
  buildings: Building[];
  onBuildingsChange: (buildings: Building[]) => void;
  isNewProject?: boolean;
}

export const BuildingFormSection = ({ buildings, onBuildingsChange, isNewProject = false }: BuildingFormSectionProps) => {
  const { data: modelos } = useQuery({
    queryKey: ["modelos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const addBuilding = () => {
    const newBuilding: Building = {
      id: Date.now().toString(),
      nombre: "",
      numero_pisos: "",
      fecha_lanzamiento: "",
      modelos: [],
    };
    onBuildingsChange([...buildings, newBuilding]);
  };

  const removeBuilding = (id: string) => {
    onBuildingsChange(buildings.filter(b => b.id !== id));
  };

  const updateBuilding = (id: string, field: keyof Building, value: any) => {
    onBuildingsChange(
      buildings.map(b => 
        b.id === id ? { ...b, [field]: value } : b
      )
    );
  };

  const toggleModelo = (buildingId: string, modeloId: string) => {
    const building = buildings.find(b => b.id === buildingId);
    if (!building) return;

    const updatedModelos = building.modelos.includes(modeloId)
      ? building.modelos.filter(m => m !== modeloId)
      : [...building.modelos, modeloId];

    updateBuilding(buildingId, 'modelos', updatedModelos);
  };

  // Ensure buildings is always an array with proper typing
  const safeBuildingsArray = Array.isArray(buildings) ? buildings : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Edificios</Label>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={addBuilding}
          disabled={isNewProject}
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Edificio
        </Button>
      </div>
      {isNewProject && (
        <p className="text-sm text-muted-foreground">
          Solo se podrán dar de alta edificios cuando ya se haya guardado el Proyecto.
        </p>
      )}

      {safeBuildingsArray.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No hay edificios agregados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {safeBuildingsArray.map((building) => (
            <Card key={building.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4" />
                    <span>Edificio</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBuilding(building.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Nombre</Label>
                    <Input
                      placeholder="Nombre del edificio"
                      value={building.nombre || ""}
                      onChange={(e) => updateBuilding(building.id, 'nombre', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Número de Niveles</Label>
                    <Input
                      placeholder="Ej: 20"
                      value={building.numero_pisos || ""}
                      onChange={(e) => updateBuilding(building.id, 'numero_pisos', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha de Lanzamiento</Label>
                    <Input
                      type="date"
                      value={building.fecha_lanzamiento || ""}
                      onChange={(e) => updateBuilding(building.id, 'fecha_lanzamiento', e.target.value)}
                    />
                  </div>
                </div>

                {modelos && modelos.length > 0 && (
                  <div>
                    <Label className="text-xs">Modelos</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {modelos.map((modelo) => (
                        <div key={modelo.id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={building.modelos?.includes(modelo.id.toString()) || false}
                            onCheckedChange={() => toggleModelo(building.id, modelo.id.toString())}
                          />
                          <Label className="text-xs">{modelo.nombre}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};