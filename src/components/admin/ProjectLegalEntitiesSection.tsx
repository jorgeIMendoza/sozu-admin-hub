import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Building2, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectLegalEntitiesSectionProps {
  projectId?: number;
  isCreating?: boolean;
}

export const ProjectLegalEntitiesSection = ({ 
  projectId, 
  isCreating = false 
}: ProjectLegalEntitiesSectionProps) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available legal entity types (only specific allowed types)
  const { data: legalEntityTypes = [] } = useQuery({
    queryKey: ["legal-entity-types"],
    queryFn: async () => {
      const allowedEntityTypes = [
        "Administrador",
        "Aportante", 
        "Contratista",
        "Desarrollador",
        "Dueño Vendedor",
        "Inmobiliaria",
        "Inversionista",
        "Proveedor",
        "Socio"
      ];

      const { data, error } = await supabase
        .from("tipos_entidad")
        .select("id, nombre")
        .eq("padre", "p")
        .eq("activo", true)
        .in("nombre", allowedEntityTypes)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch available legal entities with their entity relations (only allowed types)
  const { data: availableLegalEntities = [] } = useQuery({
    queryKey: ["available-legal-entities"],
    queryFn: async () => {
      const allowedEntityTypes = [
        "Administrador",
        "Aportante", 
        "Contratista",
        "Desarrollador",
        "Dueño Vendedor",
        "Inmobiliaria",
        "Inversionista",
        "Proveedor",
        "Socio"
      ];

      const { data, error } = await supabase
        .from("personas")
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey (
            id,
            id_tipo_entidad,
            tipos_entidad!inner (
              id,
              nombre
            )
          )
        `)
        .eq("activo", true)
        .eq("tipo_persona", "pm")
        .eq("entidades_relacionadas.activo", true)
        .eq("entidades_relacionadas.tipos_entidad.padre", "p")
        .in("entidades_relacionadas.tipos_entidad.nombre", allowedEntityTypes);
      
      if (error) throw error;
      
      // Group entities by tipo_entidad_id to get unique combinations
      const entityMap = new Map();
      (data || []).forEach((item: any) => {
        item.entidades_relacionadas.forEach((rel: any) => {
          if (allowedEntityTypes.includes(rel.tipos_entidad?.nombre)) {
            const key = `${item.id}-${rel.id_tipo_entidad}`;
            if (!entityMap.has(key)) {
              entityMap.set(key, {
                id: item.id,
                nombre_legal: item.nombre_legal,
                email: item.email,
                telefono: item.telefono,
                tipo_entidad_id: rel.id_tipo_entidad,
                tipo_entidad_nombre: rel.tipos_entidad?.nombre,
              });
            }
          }
        });
      });
      
      return Array.from(entityMap.values());
    },
  });

  // Fetch project's current legal entities (only allowed types)
  const { data: projectLegalEntities = [] } = useQuery({
    queryKey: ["project-legal-entities", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const allowedEntityTypes = [
        "Administrador",
        "Aportante", 
        "Contratista",
        "Desarrollador",
        "Dueño Vendedor",
        "Inmobiliaria",
        "Inversionista",
        "Proveedor",
        "Socio"
      ];
      
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          id_tipo_entidad,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal,
            email,
            telefono
          ),
          tipos_entidad!entidades_relacionadas_id_tipo_entidad_fkey (
            id,
            nombre
          )
        `)
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .eq("tipos_entidad.padre", "p")
        .eq("tipos_entidad.activo", true)
        .in("tipos_entidad.nombre", allowedEntityTypes);
      
      if (error) throw error;
      
      // Filter out any entries where tipos_entidad is null
      return (data || []).filter(item => item.tipos_entidad !== null);
    },
    enabled: !!projectId,
  });

  // Add legal entity to project
  const addEntityMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntityId || !selectedEntityTypeId || !projectId) {
        throw new Error("Faltan datos requeridos");
      }

      // Check if project already has an entity of this type
      const existingEntity = projectLegalEntities.find(
        (entity) => entity.id_tipo_entidad === parseInt(selectedEntityTypeId)
      );

      if (existingEntity) {
        throw new Error("El proyecto ya tiene una entidad legal de este tipo");
      }

      // Create a new entidades_relacionadas record for this project
      const { error } = await supabase
        .from("entidades_relacionadas")
        .insert({
          id_persona: parseInt(selectedEntityId),
          id_tipo_entidad: parseInt(selectedEntityTypeId),
          id_proyecto: projectId,
          activo: true
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Entidad agregada",
        description: "La entidad legal se agregó al proyecto exitosamente.",
      });
      setSelectedEntityId("");
      setSelectedEntityTypeId("");
      queryClient.invalidateQueries({ queryKey: ["project-legal-entities", projectId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Hubo un error al agregar la entidad legal.",
        variant: "destructive",
      });
    },
  });

  // Remove legal entity from project
  const removeEntityMutation = useMutation({
    mutationFn: async (entityRelationId: number) => {
      const { error } = await supabase
        .from("entidades_relacionadas")
        .update({ activo: false })
        .eq("id", entityRelationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Entidad removida",
        description: "La entidad legal se removió del proyecto exitosamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["project-legal-entities", projectId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al remover la entidad legal.",
        variant: "destructive",
      });
    },
  });

  // Filter available entities by selected type
  const filteredEntities = selectedEntityTypeId
    ? availableLegalEntities.filter(
        entity => entity.tipo_entidad_id === parseInt(selectedEntityTypeId)
      )
    : [];

  // Get used entity types for this specific project
  const usedEntityTypes = new Set(
    projectLegalEntities.map(entity => entity.id_tipo_entidad)
  );


  if (isCreating) {
    return (
      <div className="space-y-4">
        <div className="text-center text-muted-foreground py-8">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Las entidades legales se pueden agregar después de crear el proyecto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new legal entity section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Agregar Entidad Legal
          </CardTitle>
          <CardDescription>
            Selecciona una entidad legal para agregar al proyecto. Solo puede haber una entidad por tipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Tipo de Entidad</label>
              <Select
                value={selectedEntityTypeId}
                onValueChange={(value) => {
                  setSelectedEntityTypeId(value);
                  setSelectedEntityId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {legalEntityTypes.map((type) => (
                    <SelectItem 
                      key={type.id} 
                      value={type.id.toString()}
                      disabled={usedEntityTypes.has(type.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{type.nombre}</span>
                        {usedEntityTypes.has(type.id) && (
                          <Badge variant="secondary" className="ml-2">Ya asignado</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Entidad Legal</label>
              <Select
                value={selectedEntityId}
                onValueChange={setSelectedEntityId}
                disabled={!selectedEntityTypeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una entidad" />
                </SelectTrigger>
                 <SelectContent>
                   {filteredEntities.map((entity) => (
                     <SelectItem key={entity.id} value={entity.id.toString()}>
                       <div>
                         <div className="font-medium">{entity.nombre_legal}</div>
                         <div className="text-xs text-muted-foreground">
                           {entity.email}
                         </div>
                       </div>
                     </SelectItem>
                   ))}
                 </SelectContent>
              </Select>
            </div>
          </div>

           <Button
             onClick={() => addEntityMutation.mutate()}
             disabled={!selectedEntityId || !selectedEntityTypeId || addEntityMutation.isPending || filteredEntities.length === 0}
             className="w-full"
           >
             {addEntityMutation.isPending ? "Agregando..." : "Agregar Entidad"}
           </Button>
           {selectedEntityTypeId && filteredEntities.length === 0 && (
             <p className="text-sm text-muted-foreground text-center">
               No hay entidades legales disponibles para este tipo.
             </p>
           )}
        </CardContent>
      </Card>

      {/* Current legal entities */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Entidades Legales Asignadas ({projectLegalEntities.length})
        </h3>

        {projectLegalEntities.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                No hay entidades legales asignadas a este proyecto.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {projectLegalEntities.map((entity) => (
              <Card key={entity.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            {entity.personas?.nombre_legal}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">
                              {entity.tipos_entidad?.nombre}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <div>Email: {entity.personas?.email}</div>
                        {entity.personas?.telefono && (
                          <div>Teléfono: {entity.personas.telefono}</div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntityMutation.mutate(entity.id)}
                      disabled={removeEntityMutation.isPending}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};