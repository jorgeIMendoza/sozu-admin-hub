import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Building2, Users, Edit2, Save, X } from "lucide-react";
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
  isProductosOrServicios?: boolean;
}

export const ProjectLegalEntitiesSection = ({ 
  projectId, 
  isCreating = false,
  isProductosOrServicios = false
}: ProjectLegalEntitiesSectionProps) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  // Para Productos o Servicios, preseleccionar "Dueño Vendedor" (id=4)
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>(isProductosOrServicios ? "4" : "");
  const [editingCuentaMadre, setEditingCuentaMadre] = useState<number | null>(null);
  const [tempCuentaMadre, setTempCuentaMadre] = useState<string>("");
  const [editingApiKey, setEditingApiKey] = useState<number | null>(null);
  const [tempApiKeyName, setTempApiKeyName] = useState<string>("");
  const [tempApiKeyValue, setTempApiKeyValue] = useState<string>("");
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
          cuenta_madre_stp,
          facturar,
          nombre_api_key,
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

      // Para proyectos de tipo Productos o Servicios, permitir múltiples entidades del mismo tipo
      if (!isProductosOrServicios) {
        // Check if project already has an entity of this type (solo para otros tipos de proyectos)
        const existingEntity = projectLegalEntities.find(
          (entity) => entity.id_tipo_entidad === parseInt(selectedEntityTypeId)
        );

        if (existingEntity) {
          throw new Error("El proyecto ya tiene una entidad legal de este tipo");
        }
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
    onSuccess: async () => {
      toast({
        title: "Entidad agregada",
        description: "La entidad legal se agregó al proyecto exitosamente.",
      });
      setSelectedEntityId("");
      setSelectedEntityTypeId("");
      
      // Refetch solo la query de entidades legales sin afectar otras queries
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
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
    onSuccess: async () => {
      toast({
        title: "Entidad removida",
        description: "La entidad legal se removió del proyecto exitosamente.",
      });
      
      // Refetch solo la query de entidades legales sin afectar otras queries
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
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

  // Get used entity IDs (personas) for this specific project to avoid duplicates
  const usedEntityIds = new Set(
    projectLegalEntities.map(entity => entity.personas?.id)
  );

  // Filter out already selected entities
  const availableFilteredEntities = filteredEntities.filter(
    entity => !usedEntityIds.has(entity.id)
  );

  // Check if entity has generated STP accounts (first 14 digits match)
  const { data: entitiesWithAccounts = [] } = useQuery({
    queryKey: ["entities-with-accounts", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      // Get all entities with their cuenta_madre_stp for this project
      const { data: entities, error: entitiesError } = await supabase
        .from("entidades_relacionadas")
        .select("id, cuenta_madre_stp")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .not("cuenta_madre_stp", "is", null);
      
      if (entitiesError) throw entitiesError;
      if (!entities || entities.length === 0) return [];

      const entityIdsWithAccounts = new Set<number>();

      // Check each entity's cuenta_madre_stp against all tables
      for (const entity of entities) {
        const cuentaMadrePrefix = entity.cuenta_madre_stp?.substring(0, 14);
        if (!cuentaMadrePrefix) continue;

        // Check propiedades.clabe_stp_tmp_apartado
        const { data: propiedades } = await supabase
          .from("propiedades")
          .select("id, clabe_stp_tmp_apartado")
          .eq("id_entidad_relacionada_dueno", entity.id)
          .eq("activo", true)
          .not("clabe_stp_tmp_apartado", "is", null);

        if (propiedades?.some((p: any) => p.clabe_stp_tmp_apartado?.substring(0, 14) === cuentaMadrePrefix)) {
          entityIdsWithAccounts.add(entity.id);
          continue;
        }

        // Get propiedades for this entity to check other tables
        const { data: propiedadesForEntity } = await supabase
          .from("propiedades")
          .select("id")
          .eq("id_entidad_relacionada_dueno", entity.id)
          .eq("activo", true);

        if (propiedadesForEntity && propiedadesForEntity.length > 0) {
          const propiedadIds = propiedadesForEntity.map(p => p.id);
          
          // Get ofertas for these properties
          const { data: ofertasData } = await supabase
            .from("ofertas")
            .select("*")
            .in("id_propiedad", propiedadIds)
            .eq("activo", true);

          // Check ofertas.clabe_stp_tmp_producto
          if (ofertasData?.some((o: any) => o.clabe_stp_tmp_producto?.substring(0, 14) === cuentaMadrePrefix)) {
            entityIdsWithAccounts.add(entity.id);
            continue;
          }

          if (ofertasData && ofertasData.length > 0) {
            const ofertaIds = ofertasData.map((o: any) => o.id);
            
            // Check cuentas_cobranza.clabe_stp
            const { data: cuentasData } = await supabase
              .from("cuentas_cobranza")
              .select("id, clabe_stp")
              .in("id_oferta", ofertaIds)
              .eq("activo", true)
              .not("clabe_stp", "is", null);

            if (cuentasData?.some((c: any) => c.clabe_stp?.substring(0, 14) === cuentaMadrePrefix)) {
              entityIdsWithAccounts.add(entity.id);
              continue;
            }

            // TODO: Add check for cuentas_cobranza_mantenimiento.clabe_stp_mantenimiento
            // when Supabase types are regenerated
          }
        }
      }
      
      return Array.from(entityIdsWithAccounts);
    },
    enabled: !!projectId,
  });

  // Check if entity has assigned properties
  const { data: entitiesWithProperties = [] } = useQuery({
    queryKey: ["entities-with-properties", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from("propiedades")
        .select("id_entidad_relacionada_dueno")
        .eq("activo", true);
      
      if (error) throw error;
      
      // Get unique entity IDs that have properties
      const entityIds = new Set(data?.map(p => p.id_entidad_relacionada_dueno) || []);
      return Array.from(entityIds);
    },
    enabled: !!projectId,
  });

  // Update cuenta madre STP mutation
  const updateCuentaMadreMutation = useMutation({
    mutationFn: async ({ entityId, cuentaMadre }: { entityId: number; cuentaMadre: string }) => {
      // Validate format (14 digits)
      if (cuentaMadre && !/^\d{14}$/.test(cuentaMadre)) {
        throw new Error("La cuenta madre STP debe tener exactamente 14 dígitos");
      }

      const { error } = await supabase
        .from("entidades_relacionadas")
        .update({ cuenta_madre_stp: cuentaMadre || null })
        .eq("id", entityId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({
        title: "Cuenta actualizada",
        description: "La cuenta madre STP se actualizó exitosamente.",
      });
      setEditingCuentaMadre(null);
      setTempCuentaMadre("");
      
      // Refetch solo la query de entidades legales sin afectar otras queries
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Hubo un error al actualizar la cuenta madre STP.",
        variant: "destructive",
      });
    },
  });

  // Update facturar mutation
  const updateFacturarMutation = useMutation({
    mutationFn: async ({ entityId, facturar, entity }: { entityId: number; facturar: boolean; entity: any }) => {
      // If trying to enable facturar, validate that API key name exists
      if (facturar && !entity.nombre_api_key) {
        throw new Error("Debes asignar un nombre de API Key antes de habilitar facturación");
      }

      const { error } = await supabase
        .from("entidades_relacionadas")
        .update({ facturar })
        .eq("id", entityId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({
        title: "Configuración actualizada",
        description: "La configuración de facturación se actualizó exitosamente.",
      });
      
      // Refetch solo la query de entidades legales sin afectar otras queries
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Hubo un error al actualizar la configuración.",
        variant: "destructive",
      });
    },
  });

  // Update API key name mutation
  const updateApiKeyMutation = useMutation({
    mutationFn: async ({ entityId, apiKeyName, apiKeyValue }: { entityId: number; apiKeyName: string; apiKeyValue?: string }) => {
      if (!apiKeyName || apiKeyName.trim() === "") {
        throw new Error("El nombre de la API Key es obligatorio");
      }

      const { error } = await supabase
        .from("entidades_relacionadas")
        .update({ nombre_api_key: apiKeyName })
        .eq("id", entityId);

      if (error) throw error;

      // If API key value is provided, save it to Supabase secrets
      // Note: This would typically be done through an edge function for security
      if (apiKeyValue) {
        // TODO: Call edge function to store API key value in Supabase secrets
        // For now, just log it (in production, this should call an edge function)
        console.log(`API Key value for ${apiKeyName} should be stored in secrets`);
      }
    },
    onSuccess: async () => {
      toast({
        title: "API Key actualizada",
        description: "El nombre de la API Key se actualizó exitosamente.",
      });
      setEditingApiKey(null);
      setTempApiKeyName("");
      setTempApiKeyValue("");
      
      // Refetch solo la query de entidades legales sin afectar otras queries
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Hubo un error al actualizar la API Key.",
        variant: "destructive",
      });
    },
  });


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
            Selecciona una entidad legal para agregar al proyecto. {!isProductosOrServicios && "Solo puede haber una entidad por tipo."}
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
                disabled={isProductosOrServicios}
              >
                <SelectTrigger className={isProductosOrServicios ? "bg-muted cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {legalEntityTypes.map((type) => (
                    <SelectItem 
                      key={type.id} 
                      value={type.id.toString()}
                      disabled={!isProductosOrServicios && usedEntityTypes.has(type.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{type.nombre}</span>
                        {!isProductosOrServicios && usedEntityTypes.has(type.id) && (
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
                   {availableFilteredEntities.map((entity) => (
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
             type="button"
             onClick={() => addEntityMutation.mutate()}
             disabled={!selectedEntityId || !selectedEntityTypeId || addEntityMutation.isPending || availableFilteredEntities.length === 0}
             className="w-full"
           >
             {addEntityMutation.isPending ? "Agregando..." : "Agregar Entidad"}
           </Button>
           {selectedEntityTypeId && availableFilteredEntities.length === 0 && (
             <p className="text-sm text-muted-foreground text-center">
               {filteredEntities.length > 0 
                 ? "Todas las entidades de este tipo ya fueron asignadas al proyecto."
                 : "No hay entidades legales disponibles para este tipo."}
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
            {projectLegalEntities.map((entity) => {
              const hasAccounts = entitiesWithAccounts.includes(entity.id);
              const hasProperties = entitiesWithProperties.includes(entity.id);
              const isEditing = editingCuentaMadre === entity.id;
              
              return (
                <Card key={entity.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
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
                        
                        {/* Cuenta Madre STP Field - Only for Dueño Vendedor and Aportante */}
                        {(entity.tipos_entidad?.nombre === "Dueño Vendedor" || entity.tipos_entidad?.nombre === "Aportante") && (
                          <div className="mt-3 pt-3 border-t space-y-3">
                            <div>
                              <label className="text-sm font-medium">Cuenta Madre STP:</label>
                              {isEditing ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    value={tempCuentaMadre}
                                    onChange={(e) => setTempCuentaMadre(e.target.value)}
                                    placeholder="14 dígitos"
                                    maxLength={14}
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      updateCuentaMadreMutation.mutate({
                                        entityId: entity.id,
                                        cuentaMadre: tempCuentaMadre
                                      });
                                    }}
                                    disabled={updateCuentaMadreMutation.isPending}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingCuentaMadre(null);
                                      setTempCuentaMadre("");
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-sm font-mono flex-1">
                                    {entity.cuenta_madre_stp ? (
                                      <>
                                        <span>{entity.cuenta_madre_stp.substring(0, 10)}</span>
                                        <span className="font-bold text-base text-primary">{entity.cuenta_madre_stp.substring(10)}</span>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground italic">No asignada</span>
                                    )}
                                  </span>
                                   {!hasAccounts && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingCuentaMadre(entity.id);
                                        setTempCuentaMadre(entity.cuenta_madre_stp || "");
                                      }}
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {hasAccounts && (
                                    <Badge variant="secondary" className="text-xs">
                                      Con cuentas generadas
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Facturar checkbox and API Key field */}
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`facturar-${entity.id}`}
                                  checked={entity.facturar || false}
                                  onCheckedChange={(checked) => {
                                    updateFacturarMutation.mutate({
                                      entityId: entity.id,
                                      facturar: checked as boolean,
                                      entity: entity
                                    });
                                  }}
                                  disabled={updateFacturarMutation.isPending}
                                />
                                <Label
                                  htmlFor={`facturar-${entity.id}`}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  Facturar
                                </Label>
                              </div>

                              {/* API Key Name and Value fields - shown only when facturar is checked */}
                              {entity.facturar && (
                                <div className="space-y-3">
                                  {/* API Key Name */}
                                  <div>
                                    <label className="text-sm font-medium">
                                      Nombre de API Key: <span className="text-destructive">*</span>
                                    </label>
                                    {editingApiKey === entity.id ? (
                                      <div className="space-y-2 mt-1">
                                        <Input
                                          value={tempApiKeyName}
                                          onChange={(e) => {
                                            // Only allow uppercase letters, no spaces, no numbers, no special characters
                                            const cleanValue = e.target.value
                                              .replace(/[^a-zA-Z]/g, '') // Remove everything except letters
                                              .toUpperCase(); // Convert to uppercase
                                            setTempApiKeyName(cleanValue);
                                          }}
                                          placeholder="NOMBREDEAPIKEY"
                                          className="w-full"
                                        />
                                        
                                        {/* API Key Value */}
                                        <div>
                                          <label className="text-sm font-medium">
                                            Valor de API Key: <span className="text-destructive">*</span>
                                          </label>
                                          <Input
                                            type="password"
                                            value={tempApiKeyValue}
                                            onChange={(e) => setTempApiKeyValue(e.target.value)}
                                            placeholder="Ingresa el valor de la API Key"
                                            className="w-full mt-1"
                                          />
                                        </div>

                                        <div className="flex gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              updateApiKeyMutation.mutate({
                                                entityId: entity.id,
                                                apiKeyName: tempApiKeyName,
                                                apiKeyValue: tempApiKeyValue
                                              });
                                            }}
                                            disabled={updateApiKeyMutation.isPending || !tempApiKeyName || !tempApiKeyValue}
                                          >
                                            <Save className="h-4 w-4 mr-1" />
                                            Guardar
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setEditingApiKey(null);
                                              setTempApiKeyName("");
                                              setTempApiKeyValue("");
                                            }}
                                          >
                                            <X className="h-4 w-4 mr-1" />
                                            Cancelar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm flex-1">
                                          {entity.nombre_api_key ? (
                                            <>
                                              <span className="font-mono">{entity.nombre_api_key}</span>
                                              <Badge variant="secondary" className="ml-2 text-xs">
                                                Configurada
                                              </Badge>
                                            </>
                                          ) : (
                                            <span className="text-destructive italic">
                                              No asignada (requerida)
                                            </span>
                                          )}
                                        </span>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setEditingApiKey(entity.id);
                                            setTempApiKeyName(entity.nombre_api_key || "");
                                            setTempApiKeyValue("");
                                          }}
                                        >
                                          <Edit2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntityMutation.mutate(entity.id)}
                        disabled={removeEntityMutation.isPending || hasAccounts || hasProperties}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title={
                          hasAccounts 
                            ? "No se puede eliminar: tiene cuentas STP generadas" 
                            : hasProperties 
                              ? "No se puede eliminar: tiene propiedades asignadas"
                              : "Eliminar entidad"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};