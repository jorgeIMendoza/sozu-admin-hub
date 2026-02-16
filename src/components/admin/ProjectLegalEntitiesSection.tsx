import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SUPABASE_PROJECT_ID } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Building2, Users, Edit2, Save, X, Info, ExternalLink, Copy, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";

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
  const [generatingComisiones, setGeneratingComisiones] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available legal entity types (only specific allowed types)
  const { data: legalEntityTypes = [] } = useQuery({
    queryKey: ["legal-entity-types"],
    queryFn: async () => {
      const allowedEntityTypeIds = [3, 4, 5, 6, 8, 9, 10, 13, 15]; // Desarrollador, Dueño Vendedor, Inmobiliaria, Administradora, Proveedor, Socio, Inversionista, Contratista, Aportante

      const { data, error } = await supabase
        .from("tipos_entidad")
        .select("id, nombre")
        .eq("padre", "p")
        .eq("activo", true)
        .in("id", allowedEntityTypeIds)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch available legal entities based on selected entity type
  const { data: availableLegalEntities = [], isLoading: isLoadingEntities } = useQuery({
    queryKey: ["available-legal-entities-by-type", selectedEntityTypeId],
    enabled: !!selectedEntityTypeId,
    queryFn: async () => {
      if (!selectedEntityTypeId) return [];
      
      const tipoEntidadId = parseInt(selectedEntityTypeId);
      
      // Query entidades_relacionadas filtered by selected tipo_entidad
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          id_tipo_entidad,
          id_persona,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal,
            email,
            telefono,
            tipo_persona,
            activo
          ),
          tipos_entidad (
            id,
            nombre
          )
        `)
        .eq("activo", true)
        .eq("id_tipo_entidad", tipoEntidadId)
        .is("id_proyecto", null);
      
      if (error) throw error;
      
      // Transform to expected format, filtering for PM personas activas
      const results: any[] = [];
      (data || []).forEach((rel: any) => {
        const persona = rel.personas;
        if (persona && persona.activo && persona.tipo_persona === 'pm') {
          results.push({
            id: persona.id,
            nombre_legal: persona.nombre_legal,
            email: persona.email,
            telefono: persona.telefono,
            tipo_entidad_id: rel.id_tipo_entidad,
            tipo_entidad_nombre: rel.tipos_entidad?.nombre,
          });
        }
      });
      
      return results;
    },
  });

  // Fetch project's current legal entities (only allowed types)
  const { data: projectLegalEntities = [] } = useQuery({
    queryKey: ["project-legal-entities", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const allowedEntityTypeIds = [3, 4, 5, 6, 8, 9, 10, 13, 15]; // Desarrollador, Dueño Vendedor, Inmobiliaria, Administradora, Proveedor, Socio, Inversionista, Contratista, Aportante
      
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          *,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal,
            nombre_comercial,
            email,
            telefono
          ),
          tipos_entidad!entidades_relacionadas_id_tipo_entidad_fkey (
            id,
            nombre
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id,
            nombre
          )
        `)
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .eq("tipos_entidad.padre", "p")
        .eq("tipos_entidad.activo", true)
        .in("tipos_entidad.id", allowedEntityTypeIds);
      
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

      // IDs de tipos de entidad que permiten múltiples entidades
      const TIPOS_PERMITEN_MULTIPLES = [4, 15]; // 4 = Dueño Vendedor, 15 = Aportante
      
      const tipoEntidadSeleccionado = parseInt(selectedEntityTypeId);
      
      // Permitir múltiples entidades si:
      // 1. Es un proyecto de Productos/Servicios, O
      // 2. El tipo de entidad es Dueño Vendedor (4) o Aportante (15)
      const permiteMultiples = isProductosOrServicios || TIPOS_PERMITEN_MULTIPLES.includes(tipoEntidadSeleccionado);
      
      if (!permiteMultiples) {
        // Check if project already has an entity of this type
        const existingEntity = projectLegalEntities.find(
          (entity) => entity.id_tipo_entidad === tipoEntidadSeleccionado
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

  // availableLegalEntities is already filtered by selected type from the query
  // For Productos/Servicios/Mantenimientos projects, allow adding the same persona multiple times
  // (to support different cuenta_madre_stp values). For other projects, filter out already assigned entities.
  const usedEntityIds = new Set(
    projectLegalEntities.map(entity => entity.personas?.id)
  );

  // Filter out already selected entities (only for non-Productos/Servicios projects)
  const availableFilteredEntities = isProductosOrServicios 
    ? availableLegalEntities // Allow adding same persona multiple times
    : availableLegalEntities.filter(entity => !usedEntityIds.has(entity.id));

  // Get used entity types for this specific project (for reference/display)
  const usedEntityTypes = new Set(
    projectLegalEntities.map(entity => entity.id_tipo_entidad)
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

      if (cuentaMadre) {
        // IDs for special projects: Productos (9), Servicios (10), Mantenimientos (11)
        const SPECIAL_PROJECT_TYPES = [9, 10, 11];

        // First, get the current project's id_tipo_uso to determine validation rules
        let currentProjectTipoUso: number | null = null;
        if (projectId) {
          const { data: currentProject, error: projectError } = await supabase
            .from("proyectos")
            .select("id_tipo_uso")
            .eq("id", projectId)
            .single();
          
          if (projectError) throw projectError;
          currentProjectTipoUso = currentProject?.id_tipo_uso;
        }

        const isCurrentProjectSpecial = currentProjectTipoUso !== null && SPECIAL_PROJECT_TYPES.includes(currentProjectTipoUso);

        // Fetch all entities with this cuenta_madre_stp (except the current one)
        const { data: existingEntities, error: checkError } = await supabase
          .from("entidades_relacionadas")
          .select(`
            id, 
            id_proyecto, 
            proyectos!entidades_relacionadas_id_proyecto_fkey (
              id,
              nombre,
              id_tipo_uso
            )
          `)
          .eq("cuenta_madre_stp", cuentaMadre)
          .eq("activo", true)
          .neq("id", entityId);

        if (checkError) throw checkError;

        if (isCurrentProjectSpecial) {
          // For Productos/Servicios/Mantenimientos projects:
          // Only validate against OTHER Productos/Servicios/Mantenimientos projects
          const conflictingEntities = (existingEntities || []).filter((e: any) => 
            e.proyectos && SPECIAL_PROJECT_TYPES.includes(e.proyectos.id_tipo_uso)
          );

          if (conflictingEntities.length > 0) {
            const otherProject = conflictingEntities[0].proyectos?.nombre || "otro proyecto";
            throw new Error(
              `Esta cuenta madre STP ya está asignada a otra entidad en "${otherProject}". ` +
              `Para evitar colisiones de CLABE, cada entidad de productos/servicios debe tener una cuenta madre única.`
            );
          }
        } else {
          // For regular projects:
          // Validate against entities in OTHER regular projects (exclude Productos/Servicios/Mantenimientos)
          const conflictingEntities = (existingEntities || []).filter((e: any) => 
            e.proyectos && !SPECIAL_PROJECT_TYPES.includes(e.proyectos.id_tipo_uso)
          );

          if (conflictingEntities.length > 0) {
            const otherProject = conflictingEntities[0].proyectos?.nombre || "otro proyecto";
            throw new Error(
              `Esta cuenta madre STP ya está asignada a otra entidad en el proyecto "${otherProject}". ` +
              `No se puede reutilizar la misma cuenta madre en diferentes proyectos regulares.`
            );
          }
        }
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

  // Generate cuenta de comisiones mutation
  const generateCuentaComisionesMutation = useMutation({
    mutationFn: async (entityId: number) => {
      setGeneratingComisiones(entityId);
      
      // Find the Inmobiliaria entity for this project
      const inmobiliariaEntity = projectLegalEntities.find(
        (e: any) => e.tipos_entidad?.id === 5
      );
      
      if (!inmobiliariaEntity) {
        throw new Error("No se encontró una entidad tipo Inmobiliaria en este proyecto");
      }
      
      const { data, error } = await supabase
        .rpc('crear_referencia_bancaria', { id_er_dueno: inmobiliariaEntity.id });

      if (error) throw error;
      if (!data) throw new Error("No se pudo generar la cuenta de comisiones");

      // Save the generated CLABE
      const { error: updateError } = await supabase
        .from("entidades_relacionadas")
        .update({ cuenta_stp_comisiones: data } as any)
        .eq("id", entityId);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: async () => {
      toast({
        title: "Cuenta generada",
        description: "La cuenta de comisiones se generó exitosamente.",
      });
      setGeneratingComisiones(null);
      
      await queryClient.refetchQueries({ 
        queryKey: ["project-legal-entities", projectId],
        exact: true
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Hubo un error al generar la cuenta de comisiones.",
        variant: "destructive",
      });
      setGeneratingComisiones(null);
    },
  });

  // Generate API key name from project and entity names
  const generateApiKeyName = (projectName: string, entityName: string): string => {
    const cleanName = (name: string) => {
      return name
        .trim()
        .toUpperCase()
        .replace(/\./g, '') // Remove dots
        .replace(/[^A-Z0-9\s]/g, '') // Remove special characters except spaces
        .replace(/\s+/g, '_'); // Replace spaces with underscores
    };
    
    const cleanProject = cleanName(projectName);
    const cleanEntity = cleanName(entityName);
    
    return `${cleanProject}_${cleanEntity}_API_KEY`;
  };

  // Update facturar mutation
  const updateFacturarMutation = useMutation({
    mutationFn: async ({ entityId, facturar, entity }: { entityId: number; facturar: boolean; entity: any }) => {
      let apiKeyName = entity.nombre_api_key;
      let apiKeyNameDraft = entity.nombre_api_key_draft;
      
      // Generate API key name if not exists and facturar is being enabled
      if (facturar && !apiKeyName && entity.proyectos && entity.personas) {
        apiKeyName = generateApiKeyName(entity.proyectos.nombre, entity.personas.nombre_legal);
      }
      
      // Generate draft API key name if not exists (even if apiKeyName already exists)
      if (facturar && apiKeyName && !apiKeyNameDraft) {
        apiKeyNameDraft = `${apiKeyName}_DRAFT`;
      }
      
      // If trying to enable facturar, ensure API key name exists
      if (facturar && !apiKeyName) {
        throw new Error("No se pudo generar el nombre de la API Key");
      }

      const updateData: any = { facturar };
      
      if (facturar && apiKeyName) {
        // Si se habilita facturar, agregar los API keys
        updateData.nombre_api_key = apiKeyName;
        if (apiKeyNameDraft) {
          updateData.nombre_api_key_draft = apiKeyNameDraft;
        }
      } else if (!facturar) {
        // Si se deshabilita facturar, poner los API keys en null
        updateData.nombre_api_key = null;
        updateData.nombre_api_key_draft = null;
      }

      const { error } = await supabase
        .from("entidades_relacionadas")
        .update(updateData)
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
              <Combobox
                value={selectedEntityId}
                onValueChange={setSelectedEntityId}
                options={availableFilteredEntities.map((entity) => ({
                  value: entity.id.toString(),
                  label: `${entity.nombre_legal} - ${entity.email}`
                }))}
                placeholder="Selecciona una entidad"
                emptyText="No se encontraron entidades"
                searchPlaceholder="Buscar entidad..."
                disabled={!selectedEntityTypeId}
              />
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
                {isLoadingEntities 
                  ? "Cargando entidades..."
                  : availableLegalEntities.length > 0 
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
              const hasInmobiliaria = projectLegalEntities.some((e: any) => e.tipos_entidad?.id === 5);
              
              return (
                <Card key={entity.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            {(entity.personas as any)?.nombre_comercial ? (
                              <>
                                <h4 className="font-semibold text-lg">
                                  {(entity.personas as any).nombre_comercial}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {entity.personas?.nombre_legal}
                                </p>
                              </>
                            ) : (
                              <h4 className="font-semibold text-lg">
                                {entity.personas?.nombre_legal}
                              </h4>
                            )}
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
                        
                        {/* Cuenta para cobrar comisiones y Cuenta Madre STP - For Dueño Vendedor, Inmobiliaria, Administradora, Proveedor, and Aportante */}
                        {([4, 5, 6, 8, 15].includes(entity.tipos_entidad?.id || 0)) && (
                          <div className="mt-3 pt-3 border-t space-y-3">
                            {/* Cuenta para Cobrar Comisiones - Only for Dueño Vendedor, Administradora, Proveedor, and Aportante (not Inmobiliaria) */}
                            {([4, 6, 8, 15].includes(entity.tipos_entidad?.id || 0)) && (
                              <div>
                                <label className="text-sm font-medium">Cuenta para Cobrar Comisiones:</label>
                                {!(entity as any).cuenta_stp_comisiones ? (
                                  <div className="mt-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="inline-block">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (hasInmobiliaria) {
                                                  generateCuentaComisionesMutation.mutate(entity.id);
                                                }
                                              }}
                                              disabled={!hasInmobiliaria || generatingComisiones === entity.id || generateCuentaComisionesMutation.isPending}
                                              className={!hasInmobiliaria ? "cursor-not-allowed opacity-50" : ""}
                                            >
                                              {generatingComisiones === entity.id ? "Generando..." : "Generar Cuenta de Comisiones"}
                                            </Button>
                                          </div>
                                        </TooltipTrigger>
                                        {!hasInmobiliaria && (
                                          <TooltipContent side="top" className="max-w-xs">
                                            <div className="flex items-start gap-2">
                                              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                              <p className="text-sm">
                                                Para generar cuentas de comisiones, el proyecto debe tener asignada una entidad de tipo <strong>Inmobiliaria</strong>.
                                              </p>
                                            </div>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                ) : (
                                  <div className="mt-1">
                                    <span className="text-sm font-mono">
                                      {(entity as any).cuenta_stp_comisiones || (
                                        <span className="text-muted-foreground italic">No asignada</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            
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

                            {/* Facturar checkbox and API Key field - Only for Dueño Vendedor, Administradora, Proveedor, and Aportante (not Inmobiliaria) */}
                            {([4, 6, 8, 15].includes(entity.tipos_entidad?.id || 0)) && (
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
                                     Facturar propiedades
                                  </Label>
                                </div>

                                {/* Facturar Comisión Sozu checkbox */}
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`facturar-comision-sozu-${entity.id}`}
                                    checked={(entity as any).facturar_comision_sozu || false}
                                    onCheckedChange={async (checked) => {
                                      try {
                                        const { error } = await supabase
                                          .from("entidades_relacionadas")
                                          .update({ facturar_comision_sozu: checked } as any)
                                          .eq("id", entity.id);
                                        if (error) throw error;
                                        toast({
                                          title: "Configuración actualizada",
                                          description: "La configuración de facturación de comisión Sozu se actualizó.",
                                        });
                                        await queryClient.refetchQueries({
                                          queryKey: ["project-legal-entities", projectId],
                                          exact: true,
                                        });
                                      } catch (err: any) {
                                        toast({
                                          title: "Error",
                                          description: err.message || "Error al actualizar.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  />
                                  <Label
                                    htmlFor={`facturar-comision-sozu-${entity.id}`}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    Facturar Comisión Sozu
                                  </Label>
                                </div>

                                {/* API Key configuration - shown only when facturar is checked */}
                                {entity.facturar && entity.nombre_api_key && (
                                  <div className="mt-3 p-4 border rounded-lg bg-muted/30">
                                    <div className="space-y-4">
                                      {/* API Key Principal */}
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Nombre del Secret</Label>
                                        <div className="flex gap-2 mt-1">
                                          <Input
                                            value={entity.nombre_api_key}
                                            readOnly
                                            className="flex-1 bg-background font-mono text-sm"
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              navigator.clipboard.writeText(entity.nombre_api_key || '');
                                              toast({
                                                title: "Copiado",
                                                description: "Nombre del secret copiado al portapapeles",
                                              });
                                            }}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>

                                      {/* API Key Draft */}
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Nombre del Secret (Draft)</Label>
                                        <div className="flex gap-2 mt-1">
                                          <Input
                                            value={(entity as any).nombre_api_key_draft || `${entity.nombre_api_key}_DRAFT`}
                                            readOnly
                                            className="flex-1 bg-background font-mono text-sm"
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const draftKey = (entity as any).nombre_api_key_draft || `${entity.nombre_api_key}_DRAFT`;
                                              navigator.clipboard.writeText(draftKey);
                                              toast({
                                                title: "Copiado",
                                                description: "Nombre del secret draft copiado al portapapeles",
                                              });
                                            }}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                                        <div className="flex gap-2 mb-2">
                                          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                          <div className="text-sm space-y-2">
                                            <p className="font-medium text-blue-900 dark:text-blue-100">Instrucciones para configurar los Secrets:</p>
                                            <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                                              <li>Copia los nombres de los secrets mostrados arriba</li>
                                              <li><strong>Contacta al administrador del proyecto de Supabase</strong></li>
                                              <li>El administrador debe ir al Dashboard de Supabase → Edge Functions → Secrets</li>
                                              <li>Crear los secrets con los nombres copiados</li>
                                              <li>Ingresar los valores correspondientes de las API keys</li>
                                            </ol>
                                          </div>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="mt-2 w-full"
                                          onClick={() => window.open(`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/functions`, '_blank')}
                                        >
                                          <ExternalLink className="h-4 w-4 mr-2" />
                                          Abrir Configuración de Secrets en Supabase
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
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