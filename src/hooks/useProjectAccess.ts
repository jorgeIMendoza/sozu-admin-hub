import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAgentImpersonation } from '@/contexts/AgentImpersonationContext';
import { useEffect, useMemo } from 'react';

interface ProjectAccess {
  proyecto_id: number;
  id_entidad_relacionada_dueno: number | null;
}

interface RoleConfig {
  ver_todos_proyectos_propiedades: boolean;
  ver_todos_duenos: boolean;
}

// Role IDs for special access control
const ROL_REPRESENTANTE_EMPRESA_DUENA = 14;
const ROL_DESARROLLADOR = 15;

// Entity types in entidades_relacionadas
const TIPO_DESARROLLADOR = 3;
const TIPO_DUENO_VENDEDOR = 4;
const TIPO_APORTANTE = 15;
const TIPO_DUENO = 17;

export function useProjectAccess() {
  const { session, profile, isLoading: isAuthLoading, permissionVersion } = useAuth();
  const { impersonatedAgentEmail, isImpersonating } = useAgentImpersonation();
  const queryClient = useQueryClient();
  const userEmail = session?.user?.email;
  const rolId = profile?.rol_id;
  const userPersonaId = profile?.id_persona;

  // Check if user is Super Admin (has access to all projects)
  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  const isAdminProyecto = profile?.rol_nombre === 'Administrador de Proyecto';

  // Check for special roles that need entity-based filtering
  const isRepresentanteEmpresaDuena = rolId === ROL_REPRESENTANTE_EMPRESA_DUENA;
  const isDesarrollador = rolId === ROL_DESARROLLADOR;
  const hasEntityBasedAccess = isRepresentanteEmpresaDuena || isDesarrollador;

  // Invalidate queries when permissionVersion changes (real-time updates)
  useEffect(() => {
    if (permissionVersion > 0) {
      queryClient.invalidateQueries({ queryKey: ['role-project-config'] });
      queryClient.invalidateQueries({ queryKey: ['user-project-access'] });
      queryClient.invalidateQueries({ queryKey: ['user-project-access-with-owner'] });
      queryClient.invalidateQueries({ queryKey: ['user-entity-data'] });
    }
  }, [permissionVersion, queryClient]);

  // Fetch role configuration to check if ver_todos_proyectos_propiedades and ver_todos_duenos are enabled
  const { data: roleConfig, isLoading: isLoadingRoleConfig } = useQuery({
    queryKey: ['role-project-config', rolId, permissionVersion],
    queryFn: async () => {
      if (!rolId) return null;
      const { data, error } = await supabase
        .from('roles')
        .select('ver_todos_proyectos_propiedades, ver_todos_duenos')
        .eq('id', rolId)
        .single();
      
      if (error) throw error;
      return data as RoleConfig;
    },
    enabled: !!rolId && !isSuperAdmin && !isAdminProyecto && !isAuthLoading,
  });

  const hasVerTodosProyectos = roleConfig?.ver_todos_proyectos_propiedades || false;
  const hasVerTodosDuenos = roleConfig?.ver_todos_duenos ?? true; // Default to true
  // When impersonating, Super Admin loses unrestricted access and uses the agent's project access
  const hasUnrestrictedAccess = (isSuperAdmin || isAdminProyecto || hasVerTodosProyectos) && !isImpersonating;

  // Fetch the entity that the user represents (for special roles)
  const { data: userEntityData, isLoading: isLoadingUserEntity } = useQuery({
    queryKey: ['user-entity-data', userPersonaId, hasEntityBasedAccess, permissionVersion],
    queryFn: async () => {
      console.log('[useProjectAccess] Fetching user entity data for persona:', userPersonaId);
      if (!userPersonaId) return null;
      
      // For "Representante de empresa dueña" role, we need to find:
      // 1. The commercial rep entity (entidades_relacionadas tipo 21) for this user's persona
      // 2. The legal entities that have this commercial rep assigned (personas.id_entidad_relacionada_rep_com)
      // 3. The owner entities (tipo 4, 15, 17) for those legal entities
      
      if (isRepresentanteEmpresaDuena) {
        // Step 1: Find the commercial rep entity for this user's persona
        const { data: comercialEntity, error: comError } = await supabase
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', userPersonaId)
          .eq('id_tipo_entidad', 21) // Representante Comercial
          .eq('activo', true)
          .maybeSingle();
        
        if (comError || !comercialEntity) {
          // Fallback: try the old method (user's persona has rep_leg or rep_com directly)
          const { data: persona, error } = await supabase
            .from('personas')
            .select('id_entidad_relacionada_rep_leg, id_entidad_relacionada_rep_com')
            .eq('id', userPersonaId)
            .single();
          
          if (error) throw error;
          
          const entityId = persona?.id_entidad_relacionada_rep_leg || persona?.id_entidad_relacionada_rep_com;
          if (!entityId) return null;
          
          // Get entity relations for this entity
          const { data: entityRelations, error: relError } = await supabase
            .from('entidades_relacionadas')
            .select('id, id_proyecto, id_tipo_entidad, id_persona')
            .eq('id_persona', entityId)
            .eq('activo', true);
          
          if (relError) throw relError;
          
          return {
            entityId,
            entityRelations: entityRelations || []
          };
        }
        
        // Step 2: Find legal entities that have this commercial rep assigned
        const { data: legalEntities, error: legalError } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .eq('id_entidad_relacionada_rep_com', comercialEntity.id)
          .eq('activo', true);
        
        if (legalError) throw legalError;
        if (!legalEntities || legalEntities.length === 0) return null;
        
        const legalEntityIds = legalEntities.map(le => le.id);
        
        // Step 3: Get owner entities for these legal entities
        const { data: ownerEntities, error: ownerError } = await supabase
          .from('entidades_relacionadas')
          .select('id, id_proyecto, id_tipo_entidad, id_persona')
          .in('id_persona', legalEntityIds)
          .in('id_tipo_entidad', [TIPO_DUENO_VENDEDOR, TIPO_APORTANTE, TIPO_DUENO])
          .eq('activo', true);
        
        if (ownerError) throw ownerError;
        
        console.log('[useProjectAccess] Rep Comercial - ownerEntities found:', ownerEntities);
        return {
          entityId: legalEntityIds[0], // Primary entity
          entityRelations: ownerEntities || [],
          legalEntityIds
        };
      }
      
      // For Desarrollador role, use the old method
      const { data: persona, error } = await supabase
        .from('personas')
        .select('id_entidad_relacionada_rep_leg, id_entidad_relacionada_rep_com')
        .eq('id', userPersonaId)
        .single();
      
      if (error) throw error;
      
      const entityId = persona?.id_entidad_relacionada_rep_leg || persona?.id_entidad_relacionada_rep_com;
      
      if (!entityId) return null;
      
      // Get all entidades_relacionadas entries for this entity
      const { data: entityRelations, error: relError } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_proyecto, id_tipo_entidad, id_persona')
        .eq('id_persona', entityId)
        .eq('activo', true);
      
      if (relError) throw relError;
      
      return {
        entityId,
        entityRelations: entityRelations || []
      };
    },
    enabled: !!userPersonaId && hasEntityBasedAccess && !hasUnrestrictedAccess && !isAuthLoading && !isLoadingRoleConfig,
  });

  // Get ownership entity IDs (for Representante de empresa dueña)
  // These are the entidades_relacionadas IDs where the entity is Dueño Vendedor, Aportante, or Dueño
  const ownershipEntityIds = useMemo(() => {
    if (!isRepresentanteEmpresaDuena || !userEntityData?.entityRelations) {
      return [];
    }
    const ids = userEntityData.entityRelations
      .filter(er => [TIPO_DUENO_VENDEDOR, TIPO_APORTANTE, TIPO_DUENO].includes(er.id_tipo_entidad))
      .map(er => er.id);
    console.log('[useProjectAccess] ownershipEntityIds:', ids, 'from entityRelations:', userEntityData.entityRelations);
    return ids;
  }, [isRepresentanteEmpresaDuena, userEntityData?.entityRelations]);

  // Get ownership persona IDs (the id_persona from owner entities - needed for report filters)
  const ownershipPersonaIds = useMemo(() => {
    if (!isRepresentanteEmpresaDuena || !userEntityData?.entityRelations) {
      return [];
    }
    const personaIds = userEntityData.entityRelations
      .filter(er => [TIPO_DUENO_VENDEDOR, TIPO_APORTANTE, TIPO_DUENO].includes(er.id_tipo_entidad) && er.id_persona)
      .map(er => er.id_persona);
    // Remove duplicates
    const uniqueIds = [...new Set(personaIds)];
    console.log('[useProjectAccess] ownershipPersonaIds:', uniqueIds);
    return uniqueIds;
  }, [isRepresentanteEmpresaDuena, userEntityData?.entityRelations]);

  // Get developer projects (for Desarrollador role)
  // These are project IDs where the entity is a Desarrollador
  const developerProjectIds = isDesarrollador && userEntityData?.entityRelations
    ? userEntityData.entityRelations
        .filter(er => er.id_tipo_entidad === TIPO_DESARROLLADOR && er.id_proyecto)
        .map(er => er.id_proyecto!)
    : [];

  // The email to use for project access lookups (impersonated agent or current user)
  const effectiveEmail = isImpersonating ? impersonatedAgentEmail : userEmail;

  // Fetch user's project access with owner information
  const { data: projectAccessData, isLoading: isLoadingQuery } = useQuery({
    queryKey: ['user-project-access-with-owner', effectiveEmail, permissionVersion, isImpersonating],
    queryFn: async () => {
      if (!effectiveEmail) return [];
      
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id, id_entidad_relacionada_dueno')
        .eq('usuario_id', effectiveEmail)
        .eq('activo', true);
      
      if (error) throw error;
      return data as ProjectAccess[];
    },
    // When impersonating, always run the query even if the real user has unrestricted access
    enabled: !!effectiveEmail && (!hasUnrestrictedAccess || isImpersonating) && !isAuthLoading && !isLoadingRoleConfig,
  });

  // Get list of accessible project IDs
  let accessibleProjectIds = projectAccessData?.map(a => a.proyecto_id) || [];
  
  // For Desarrollador role, further filter to only projects where they're the developer
  if (isDesarrollador && developerProjectIds.length > 0) {
    accessibleProjectIds = accessibleProjectIds.filter(pid => developerProjectIds.includes(pid));
  }

  // Build owner access map: projectId -> ownerId (null means all owners)
  const ownerAccessMap = useMemo(() => {
    const map: Record<number, number | null> = {};
    if (projectAccessData) {
      for (const access of projectAccessData) {
        map[access.proyecto_id] = access.id_entidad_relacionada_dueno;
      }
    }
    return map;
  }, [projectAccessData]);

  // Helper function to check if user has access to a specific project
  const hasAccessToProject = (projectId: number): boolean => {
    if (hasUnrestrictedAccess) return true;
    if (!projectAccessData || projectAccessData.length === 0) return false;
    return accessibleProjectIds.includes(projectId);
  };

  // Helper function to check if user has access to a specific owner within a project
  const hasAccessToOwner = (projectId: number, ownerId: number): boolean => {
    // Super admin, admin proyecto, or role with ver_todos_duenos sees all owners
    if (hasUnrestrictedAccess || hasVerTodosDuenos) return true;
    
    // Check if user has access to this project
    if (!hasAccessToProject(projectId)) return false;
    
    // Get the owner restriction for this project
    const restrictedOwnerId = ownerAccessMap[projectId];
    
    // If null, user can see all owners of this project
    if (restrictedOwnerId === null || restrictedOwnerId === undefined) return true;
    
    // Otherwise, only allow access to the specific owner
    return restrictedOwnerId === ownerId;
  };

  // Helper function to get the owner IDs the user can access for a project
  const getAccessibleOwnerIds = (projectId: number): number[] | null => {
    // null means all owners are accessible
    if (hasUnrestrictedAccess || hasVerTodosDuenos) return null;
    
    const restrictedOwnerId = ownerAccessMap[projectId];
    
    // If no restriction, return null (all owners)
    if (restrictedOwnerId === null || restrictedOwnerId === undefined) return null;
    
    // Otherwise return the single accessible owner
    return [restrictedOwnerId];
  };

  // Helper function to filter an array of items by project ID
  const filterByProjectAccess = <T extends { id_proyecto?: number; proyecto_id?: number }>(
    items: T[]
  ): T[] => {
    if (hasUnrestrictedAccess) return items;
    if (!projectAccessData || projectAccessData.length === 0) return [];
    
    return items.filter(item => {
      const projectId = item.id_proyecto || item.proyecto_id;
      return projectId && accessibleProjectIds.includes(projectId);
    });
  };

  // Helper function to filter items by both project and owner
  const filterByProjectAndOwnerAccess = <T extends { 
    id_proyecto?: number; 
    proyecto_id?: number;
    id_entidad_relacionada_dueno?: number;
  }>(
    items: T[]
  ): T[] => {
    if (hasUnrestrictedAccess && hasVerTodosDuenos) return items;
    
    return items.filter(item => {
      const projectId = item.id_proyecto || item.proyecto_id;
      if (!projectId) return false;
      
      // First check project access
      if (!hasUnrestrictedAccess && !accessibleProjectIds.includes(projectId)) {
        return false;
      }
      
      // Then check owner access if the role requires it
      if (!hasVerTodosDuenos && item.id_entidad_relacionada_dueno) {
        return hasAccessToOwner(projectId, item.id_entidad_relacionada_dueno);
      }
      
      return true;
    });
  };

  // Get a filter clause for Supabase queries
  const getProjectFilter = () => {
    if (hasUnrestrictedAccess) return null;
    return accessibleProjectIds;
  };

  // Get owner filter for a specific project
  const getOwnerFilter = (projectId: number): number | null => {
    if (hasUnrestrictedAccess || hasVerTodosDuenos) return null;
    return ownerAccessMap[projectId] ?? null;
  };

  // Loading = auth loading OR role config loading OR query loading OR entity loading
  const isLoading = isAuthLoading || isLoadingRoleConfig || 
    ((!hasUnrestrictedAccess || isImpersonating) && isLoadingQuery) ||
    (hasEntityBasedAccess && !hasUnrestrictedAccess && isLoadingUserEntity);

  return {
    accessibleProjectIds,
    hasAccessToProject,
    hasAccessToOwner,
    getAccessibleOwnerIds,
    filterByProjectAccess,
    filterByProjectAndOwnerAccess,
    getProjectFilter,
    getOwnerFilter,
    hasUnrestrictedAccess,
    hasVerTodosDuenos,
    ownerAccessMap,
    isLoading,
    hasNoAccess: !isAuthLoading && !isLoadingRoleConfig && !hasUnrestrictedAccess && !isLoadingQuery && accessibleProjectIds.length === 0,
    // Properties for entity-based access control
    isRepresentanteEmpresaDuena,
    isDesarrollador,
    ownershipEntityIds,
    ownershipPersonaIds,
    userEntityId: userEntityData?.entityId || null,
  };
}
