import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Edit, Home, Building2 } from "lucide-react";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";

interface EdificioModeloWithDetails {
  id: number;
  id_edificio: number;
  id_modelo: number;
  edificios: {
    id: number;
    nombre: string;
    id_proyecto: number;
    proyectos: {
      id: number;
      nombre: string;
    };
  };
  modelos: {
    id: number;
    nombre: string;
    descripcion?: string;
    numero_recamaras?: number;
    numero_completo_banos?: number;
    numero_medio_bano?: number;
  };
}

interface ProjectGroupNew {
  proyecto: {
    id: number;
    nombre: string;
  };
  modelosWithBuildings: {
    modelo: EdificioModeloWithDetails['modelos'];
    edificios: EdificioModeloWithDetails['edificios'][];
  }[];
}

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: edificiosModelos, isLoading, refetch } = useQuery({
    queryKey: ["edificios-modelos-detailed"],
    queryFn: async () => {
      // Step 1: Get all edificios_modelos relationships
      const { data: relationships, error: relError } = await supabase
        .from("edificios_modelos")
        .select("id, id_edificio, id_modelo")
        .eq("activo", true);
      
      if (relError) {
        console.error("Error fetching relationships:", relError);
        throw relError;
      }

      if (!relationships || relationships.length === 0) {
        return [];
      }

      // Step 2: Get all unique edificio IDs
      const edificioIds = [...new Set(relationships.map(r => r.id_edificio))];
      
      // Step 3: Get edificios with proyectos
      const { data: edificios, error: edificiosError } = await supabase
        .from("edificios")
        .select(`
          id,
          nombre,
          id_proyecto,
          proyectos!inner (
            id,
            nombre
          )
        `)
        .in("id", edificioIds)
        .eq("activo", true)
        .eq("proyectos.activo", true);
      
      if (edificiosError) {
        console.error("Error fetching edificios:", edificiosError);
        throw edificiosError;
      }

      // Step 4: Get all unique modelo IDs
      const modeloIds = [...new Set(relationships.map(r => r.id_modelo))];
      
      // Step 5: Get modelos
      const { data: modelos, error: modelosError } = await supabase
        .from("modelos")
        .select("id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano")
        .in("id", modeloIds)
        .eq("activo", true);
      
      if (modelosError) {
        console.error("Error fetching modelos:", modelosError);
        throw modelosError;
      }

      // Step 6: Combine the data
      const result = relationships.map(rel => {
        const edificio = edificios?.find(e => e.id === rel.id_edificio);
        const modelo = modelos?.find(m => m.id === rel.id_modelo);
        
        return {
          id: rel.id,
          id_edificio: rel.id_edificio,
          id_modelo: rel.id_modelo,
          edificio,
          modelo
        };
      }).filter(item => item.edificio && item.modelo);

      console.log("Combined edificios_modelos data:", result);
      return result;
    },
  });

  const handleModeloAdded = () => {
    refetch();
  };

  // Group models by project
  const groupedByProject = () => {
    if (!edificiosModelos) return [];

    const projectMap = new Map<number, ProjectGroupNew>();

    edificiosModelos.forEach((item: any) => {
      if (item.edificio && item.modelo) {
        const proyecto = item.edificio.proyectos;
        
        if (!projectMap.has(proyecto.id)) {
          projectMap.set(proyecto.id, {
            proyecto: proyecto,
            modelosWithBuildings: []
          });
        }

        const projectGroup = projectMap.get(proyecto.id)!;
        
        // Find or create modelo entry
        let modeloEntry = projectGroup.modelosWithBuildings.find(
          m => m.modelo.id === item.modelo.id
        );
        
        if (!modeloEntry) {
          modeloEntry = {
            modelo: item.modelo,
            edificios: []
          };
          projectGroup.modelosWithBuildings.push(modeloEntry);
        }
        
        // Add edificio if not already present
        if (!modeloEntry.edificios.find(e => e.id === item.edificio.id)) {
          modeloEntry.edificios.push(item.edificio);
        }
      }
    });

    return Array.from(projectMap.values());
  };

  const filteredGroups = groupedByProject().map(group => ({
    ...group,
    modelosWithBuildings: group.modelosWithBuildings.filter((item) =>
      item.modelo.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.modelo.descripcion && item.modelo.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })).filter(group => group.modelosWithBuildings.length > 0);

  if (isLoading) {
    return <div>Cargando modelos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Modelos</h1>
          <p className="text-muted-foreground">
            Administra los modelos de propiedades agrupados por proyecto
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar modelos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <NewModeloDialog onModeloAdded={handleModeloAdded} />
        </div>
      </div>

      {filteredGroups && filteredGroups.length > 0 ? (
        <div className="space-y-8">
          {filteredGroups.map((group) => (
            <div key={group.proyecto.id} className="space-y-4">
              <div className="flex items-center space-x-3 border-b pb-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">{group.proyecto.nombre}</h2>
                <Badge variant="secondary" className="text-xs">
                  {group.modelosWithBuildings.length} modelo{group.modelosWithBuildings.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.modelosWithBuildings.map((modeloWithBuildings) => (
                  <Card key={modeloWithBuildings.modelo.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Home className="h-5 w-5 text-primary" />
                          <span className="text-lg">{modeloWithBuildings.modelo.nombre}</span>
                        </div>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {modeloWithBuildings.modelo.descripcion && (
                        <p className="text-sm text-muted-foreground">
                          {modeloWithBuildings.modelo.descripcion}
                        </p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {modeloWithBuildings.modelo.numero_recamaras && (
                          <div>
                            <span className="font-medium">Recámaras:</span> {modeloWithBuildings.modelo.numero_recamaras}
                          </div>
                        )}
                        {modeloWithBuildings.modelo.numero_completo_banos && (
                          <div>
                            <span className="font-medium">Baños:</span> {modeloWithBuildings.modelo.numero_completo_banos}
                          </div>
                        )}
                        {modeloWithBuildings.modelo.numero_medio_bano && (
                          <div>
                            <span className="font-medium">Medios baños:</span> {modeloWithBuildings.modelo.numero_medio_bano}
                          </div>
                        )}
                      </div>

                      {/* Show buildings where this model is used */}
                      <div>
                        <p className="text-sm font-medium mb-2">Edificios:</p>
                        <div className="flex flex-wrap gap-1">
                          {modeloWithBuildings.edificios.map((edificio) => (
                            <Badge key={edificio.id} variant="outline" className="text-xs">
                              {edificio.nombre}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? "No se encontraron modelos que coincidan con la búsqueda" : "No hay modelos disponibles"}
            </p>
            {searchTerm && (
              <p className="text-sm text-muted-foreground mt-1">
                Intenta con otros términos de búsqueda
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}