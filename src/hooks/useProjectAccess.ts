import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

interface ProjectAccess {
  proyecto_id: number;
}

interface RoleConfig {
  ver_todos_proyectos_propiedades: boolean;
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
      queryClient.invalidateQueries({ queryKey: ['user-entity-data'] });
    }
  }, [permissionVersion, queryClient]);

  // Fetch role configuration to check if ver_todos_proyectos_propiedades is enabled
  const { data: roleConfig, isLoading: isLoadingRoleConfig } = useQuery({
    queryKey: ['role-project-config', rolId, permissionVersion],
    queryFn: async () => {
      if (!rolId) return null;
      const { data, error } = await supabase
        .from('roles')
        .select('ver_todos_proyectos_propiedades')
        .eq('id', rolId)
        .single();
      
      if (error) throw error;
      return data as RoleConfig;
    },
    enabled: !!rolId && !isSuperAdmin && !isAdminProyecto && !isAuthLoading,
  });

  const hasVerTodosProyectos = roleConfig?.ver_todos_proyectos_propiedades || false;
  const hasUnrestrictedAccess = isSuperAdmin || isAdminProyecto || hasVerTodosProyectos;

  // Fetch the entity that the user represents (for special roles)
  const { data: userEntityData, isLoading: isLoadingUserEntity } = useQuery({
    queryKey: ['user-entity-data', userPersonaId, hasEntityBasedAccess, permissionVersion],
    queryFn: async () => {
      if (!userPersonaId) return null;
      
      // Get the persona to find which entity they represent
      const { data: persona, error } = await supabase
        .from('personas')
        .select('id_entidad_relacionada_rep_leg, id_entidad_relacionada_rep_com')
        .eq('id', userPersonaId)
        .single();
      
      if (error) throw error;
      
      // The user represents an entity via rep_leg or rep_com
      const entityId = persona?.id_entidad_relacionada_rep_leg || persona?.id_entidad_relacionada_rep_com;
      
      if (!entityId) return null;
      
      // Get all entidades_relacionadas entries for this entity
      // This gives us the entity's roles in different projects
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
    enabled: !!userPersonaId && hasEntityBasedAccess && !hasUnrestrictedAccess && !isAuthLoading,
  });

  // Get ownership entity IDs (for Representante de empresa dueña)
  // These are the entidades_relacionadas IDs where the entity is Dueño Vendedor, Aportante, or Dueño
  const ownershipEntityIds = isRepresentanteEmpresaDuena && userEntityData?.entityRelations
    ? userEntityData.entityRelations
        .filter(er => [TIPO_DUENO_VENDEDOR, TIPO_APORTANTE, TIPO_DUENO].includes(er.id_tipo_entidad))
        .map(er => er.id)
    : [];

  // Get developer projects (for Desarrollador role)
  // These are project IDs where the entity is a Desarrollador
  const developerProjectIds = isDesarrollador && userEntityData?.entityRelations
    ? userEntityData.entityRelations
        .filter(er => er.id_tipo_entidad === TIPO_DESARROLLADOR && er.id_proyecto)
        .map(er => er.id_proyecto!)
    : [];

  // Fetch user's project access (using email as FK, not UUID)
  const { data: projectAccess, isLoading: isLoadingQuery } = useQuery({
    queryKey: ['user-project-access', userEmail, permissionVersion],
    queryFn: async () => {
      if (!userEmail) return [];
      
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', userEmail)
        .eq('activo', true);
      
      if (error) throw error;
      return data as ProjectAccess[];
    },
    enabled: !!userEmail && !hasUnrestrictedAccess && !isAuthLoading && !isLoadingRoleConfig,
  });

  // Get list of accessible project IDs
  let accessibleProjectIds = projectAccess?.map(a => a.proyecto_id) || [];
  
  // For Desarrollador role, further filter to only projects where they're the developer
  if (isDesarrollador && developerProjectIds.length > 0) {
    accessibleProjectIds = accessibleProjectIds.filter(pid => developerProjectIds.includes(pid));
  }

  // Helper function to check if user has access to a specific project
  const hasAccessToProject = (projectId: number): boolean => {
    if (hasUnrestrictedAccess) return true;
    if (!projectAccess || projectAccess.length === 0) return false;
    return accessibleProjectIds.includes(projectId);
  };

  // Helper function to filter an array of items by project ID
  const filterByProjectAccess = <T extends { id_proyecto?: number; proyecto_id?: number }>(
    items: T[]
  ): T[] => {
    if (hasUnrestrictedAccess) return items;
    if (!projectAccess || projectAccess.length === 0) return [];
    
    return items.filter(item => {
      const projectId = item.id_proyecto || item.proyecto_id;
      return projectId && accessibleProjectIds.includes(projectId);
    });
  };

  // Get a filter clause for Supabase queries
  const getProjectFilter = () => {
    if (hasUnrestrictedAccess) return null;
    return accessibleProjectIds;
  };

  // Loading = auth loading OR role config loading OR query loading OR entity loading
  const isLoading = isAuthLoading || isLoadingRoleConfig || 
    (!hasUnrestrictedAccess && isLoadingQuery) ||
    (hasEntityBasedAccess && !hasUnrestrictedAccess && isLoadingUserEntity);

  return {
    accessibleProjectIds,
    hasAccessToProject,
    filterByProjectAccess,
    getProjectFilter,
    hasUnrestrictedAccess,
    isLoading,
    hasNoAccess: !isAuthLoading && !isLoadingRoleConfig && !hasUnrestrictedAccess && !isLoadingQuery && accessibleProjectIds.length === 0,
    // New properties for entity-based access control
    isRepresentanteEmpresaDuena,
    isDesarrollador,
    ownershipEntityIds, // Use to filter properties by id_entidad_relacionada_dueno for Representante de empresa dueña
    userEntityId: userEntityData?.entityId || null,
  };
}
