import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Loader2, Search, Filter, AlertTriangle, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LinkedAgent {
  id: number;
  persona: {
    id: number;
    nombre_legal: string;
    email: string | null;
  } | null;
}

interface UserProjectAccessDialogProps {
  userId: string;
  userName: string;
  userEmail: string;
  userRole?: string;
  userRoleId?: number;
  userPersonaId?: number;
  isUsuarioPrincipal?: boolean; // For Inmobiliaria role: indicates if this is the main agency user
}

interface Proyecto {
  id: number;
  nombre: string;
}

interface ProyectoAcceso {
  proyecto_id: number;
  id_entidad_relacionada_dueno: number | null;
}

interface RoleConfig {
  ver_todos_proyectos_propiedades: boolean;
  ver_todos_duenos: boolean;
}

interface EntidadDueno {
  id: number;
  id_proyecto: number;
  id_tipo_entidad: number;
  persona: {
    id: number;
    nombre_legal: string;
  } | null;
}

interface AgentReadOnlyAccessProps {
  userPersonaId?: number;
  isSecondaryInmobiliaria: boolean;
  isAgenteInterno: boolean;
  userRole?: string;
  proyectos?: Proyecto[];
  selectedProjects: number[];
  onClose: () => void;
}

function AgentReadOnlyAccess({ userPersonaId, isSecondaryInmobiliaria, isAgenteInterno, userRole, proyectos, selectedProjects, onClose }: AgentReadOnlyAccessProps) {
  const { data: hasInmobiliaria, isLoading } = useQuery({
    queryKey: ['agent-has-inmobiliaria', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return false;
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona_duena_lead')
        .eq('id_persona', userPersonaId)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true)
        .maybeSingle();
      return !!data?.id_persona_duena_lead;
    },
    enabled: !!userPersonaId && !isSecondaryInmobiliaria,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showInheritedDisclaimer = isSecondaryInmobiliaria || hasInmobiliaria;

  return (
    <div className="space-y-4">
      <Alert variant="default" className={showInheritedDisclaimer ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-green-500 bg-green-50 dark:bg-green-950/20"}>
        {showInheritedDisclaimer ? (
          <Users className="h-4 w-4 text-blue-600" />
        ) : (
          <Building2 className="h-4 w-4 text-green-600" />
        )}
        <AlertDescription className={showInheritedDisclaimer ? "text-blue-800 dark:text-blue-200" : "text-green-800 dark:text-green-200"}>
          {showInheritedDisclaimer ? (
            <>
              <strong>El acceso a proyectos se hereda del usuario principal</strong>
              <p className="mt-1 text-sm">
                {isSecondaryInmobiliaria
                  ? 'Los usuarios secundarios de Inmobiliaria heredan automáticamente el acceso a proyectos del usuario principal de la agencia. Para modificar los accesos, edita los permisos del usuario principal.'
                  : `Los ${isAgenteInterno ? 'Agentes Internos' : 'Agentes Inmobiliarios'} heredan automáticamente el acceso a proyectos de su Inmobiliaria padre. Para modificar los accesos, edita los permisos del usuario con rol "Inmobiliaria" correspondiente.`
                }
              </p>
            </>
          ) : (
            <>
              <strong>Acceso a proyectos públicos</strong>
              <p className="mt-1 text-sm">
                Este agente no tiene una Inmobiliaria asignada, por lo que se le otorga acceso automático a todos los proyectos publicados en Sozu.
              </p>
            </>
          )}
        </AlertDescription>
      </Alert>
      
      <div className="space-y-2">
        <Label className="text-sm font-medium">Proyectos con acceso actual:</Label>
        <ScrollArea className="h-[200px] border rounded-md p-3">
          <div className="space-y-1">
            {proyectos?.filter(p => selectedProjects.includes(p.id)).map(proyecto => (
              <div key={proyecto.id} className="flex items-center gap-2 py-1">
                <Badge variant="secondary" className="text-xs">
                  {proyecto.nombre}
                </Badge>
              </div>
            ))}
            {selectedProjects.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin acceso a proyectos</p>
            )}
          </div>
        </ScrollArea>
      </div>
      
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

export function UserProjectAccessDialog({ userId, userName, userEmail, userRole, userRoleId, userPersonaId, isUsuarioPrincipal }: UserProjectAccessDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  // Map: projectId -> ownerId (null means all owners)
  const [ownerSelections, setOwnerSelections] = useState<Record<number, number | null>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [agentsModalOpen, setAgentsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Check if user is Super Admin
  const isSuperAdmin = userRole === 'Super Administrador';
  
  // Check if user is Agente Inmobiliario (role 3) or Agente Interno (role 9) - they inherit access from parent Inmobiliaria
  const isAgenteInmobiliario = userRoleId === 3;
  const isAgenteInterno = userRoleId === 9;
  const isAgente = isAgenteInmobiliario || isAgenteInterno;
  
  // Check if user is Inmobiliaria (role 4) - their changes propagate to agents
  const isInmobiliaria = userRoleId === 4;
  
  // Check if user is a secondary Inmobiliaria user (not the principal) - they should see read-only view
  const isSecondaryInmobiliaria = isInmobiliaria && isUsuarioPrincipal !== true;

  // Query to get agent count for this inmobiliaria
  const { data: agentCount } = useQuery({
    queryKey: ['inmobiliaria-agent-count', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return 0;
      const { count, error } = await supabase
        .from('entidades_relacionadas')
        .select('*', { count: 'exact', head: true })
        .eq('id_persona_duena_lead', userPersonaId)
        .eq('id_tipo_entidad', 19) // Agente
        .eq('activo', true);
      if (error) return 0;
      return count || 0;
    },
    enabled: open && isInmobiliaria && !!userPersonaId,
  });

  // Query to get agent list for this inmobiliaria (only when modal is open)
  const { data: agentsList, isLoading: loadingAgents } = useQuery({
    queryKey: ['inmobiliaria-agents-list', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return [];
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          persona:personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email)
        `)
        .eq('id_persona_duena_lead', userPersonaId)
        .eq('id_tipo_entidad', 19) // Agente
        .eq('activo', true);
      if (error) return [];
      return data as unknown as LinkedAgent[];
    },
    enabled: agentsModalOpen && isInmobiliaria && !!userPersonaId,
  });

  // Fetch role configuration to check if ver_todos_proyectos_propiedades and ver_todos_duenos are enabled
  const { data: roleConfig, isLoading: loadingRoleConfig } = useQuery({
    queryKey: ['role-config-full', userRoleId],
    queryFn: async () => {
      if (!userRoleId) return null;
      const { data, error } = await supabase
        .from('roles')
        .select('ver_todos_proyectos_propiedades, ver_todos_duenos')
        .eq('id', userRoleId)
        .single();
      
      if (error) throw error;
      return data as RoleConfig;
    },
    enabled: open && !isSuperAdmin && !!userRoleId,
  });

  const hasUnrestrictedProjectAccess = roleConfig?.ver_todos_proyectos_propiedades || false;
  const hasVerTodosDuenos = roleConfig?.ver_todos_duenos ?? true; // Default to true if not set

  // Fetch the legal entity associated with this user (if they're a commercial representative)
  // This finds legal entities that have this user's persona as their commercial representative
  const { data: linkedLegalEntity, isLoading: loadingLinkedEntity } = useQuery({
    queryKey: ['user-linked-legal-entity', userPersonaId],
    queryFn: async () => {
      if (!userPersonaId) return null;
      
      // First, find the entidad_relacionada for this persona as commercial rep (tipo 21)
      const { data: comercialEntity, error: comercialError } = await supabase
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', userPersonaId)
        .eq('id_tipo_entidad', 21) // Representante Comercial
        .eq('activo', true)
        .maybeSingle();
      
      if (comercialError || !comercialEntity) return null;
      
      // Then, find legal entities (personas) that have this commercial rep assigned
      const { data: legalEntityPersona, error: legalError } = await supabase
        .from('personas')
        .select('id, nombre_legal')
        .eq('id_entidad_relacionada_rep_com', comercialEntity.id)
        .eq('activo', true)
        .maybeSingle();
      
      if (legalError || !legalEntityPersona) return null;
      
      // Finally, get the entidades_relacionadas (Dueño) entries for this legal entity
      const { data: ownerEntities, error: ownerError } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_proyecto')
        .eq('id_persona', legalEntityPersona.id)
        .in('id_tipo_entidad', [4, 15]) // Dueño Vendedor, Aportante
        .eq('activo', true);
      
      if (ownerError) return null;
      
      return {
        personaId: legalEntityPersona.id,
        nombreLegal: legalEntityPersona.nombre_legal,
        ownerEntityIds: ownerEntities?.map(e => e.id) || [],
        // Map project to owner entity for auto-selection
        projectToOwnerMap: ownerEntities?.reduce((acc, e) => {
          if (e.id_proyecto) acc[e.id_proyecto] = e.id;
          return acc;
        }, {} as Record<number, number>) || {}
      };
    },
    enabled: open && !!userPersonaId && !hasVerTodosDuenos,
  });

  // Fetch all active projects (paginating to get all)
  const { data: proyectos, isLoading: loadingProyectos } = useQuery({
    queryKey: ['proyectos-list'],
    queryFn: async () => {
      const allProjects: Proyecto[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre')
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allProjects.push(...data);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      
      return allProjects;
    },
    enabled: open && !isSuperAdmin && !hasUnrestrictedProjectAccess,
  });

  // Fetch user's current project access (including owner selection)
  const { data: userAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ['user-project-access-with-owner', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id, id_entidad_relacionada_dueno')
        .eq('usuario_id', userEmail)
        .eq('activo', true);
      
      if (error) throw error;
      return data as ProyectoAcceso[];
    },
    enabled: open && !isSuperAdmin && !!userEmail && !hasUnrestrictedProjectAccess,
  });

  // Fetch owners (Dueño Vendedor = 4, Aportante = 15) for selected projects
  const { data: duenosData, isLoading: loadingDuenos } = useQuery({
    queryKey: ['project-owners', selectedProjects],
    queryFn: async () => {
      if (selectedProjects.length === 0) return [];
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_proyecto,
          id_tipo_entidad,
          persona:personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal)
        `)
        .in('id_proyecto', selectedProjects)
        .in('id_tipo_entidad', [4, 15]) // Dueño Vendedor, Aportante
        .eq('activo', true);
      
      if (error) throw error;
      return data as unknown as EntidadDueno[];
    },
    enabled: open && !hasVerTodosDuenos && selectedProjects.length > 0,
  });

  // Group owners by project - filter by linked legal entity if user is a commercial rep
  const ownersByProject = useMemo(() => {
    const map: Record<number, EntidadDueno[]> = {};
    if (duenosData) {
      for (const dueno of duenosData) {
        // If user has a linked legal entity, only show that entity's owners
        if (linkedLegalEntity && linkedLegalEntity.ownerEntityIds.length > 0) {
          if (!linkedLegalEntity.ownerEntityIds.includes(dueno.id)) {
            continue; // Skip owners not linked to the user's legal entity
          }
        }
        
        if (!map[dueno.id_proyecto]) {
          map[dueno.id_proyecto] = [];
        }
        map[dueno.id_proyecto].push(dueno);
      }
    }
    return map;
  }, [duenosData, linkedLegalEntity]);

  // Update selected projects and owner selections when data loads
  useEffect(() => {
    if (userAccess) {
      setSelectedProjects(userAccess.map(a => a.proyecto_id));
      const selections: Record<number, number | null> = {};
      for (const access of userAccess) {
        selections[access.proyecto_id] = access.id_entidad_relacionada_dueno;
      }
      setOwnerSelections(selections);
    }
  }, [userAccess]);

  // Auto-select the linked legal entity's owner for each project when user is a commercial rep
  useEffect(() => {
    if (linkedLegalEntity && linkedLegalEntity.projectToOwnerMap && selectedProjects.length > 0) {
      setOwnerSelections(prev => {
        const updated = { ...prev };
        for (const projectId of selectedProjects) {
          // If no owner is selected yet and there's a linked owner for this project, auto-select it
          if (updated[projectId] === undefined || updated[projectId] === null) {
            const linkedOwnerId = linkedLegalEntity.projectToOwnerMap[projectId];
            if (linkedOwnerId) {
              updated[projectId] = linkedOwnerId;
            }
          }
        }
        return updated;
      });
    }
  }, [linkedLegalEntity, selectedProjects]);

  // Reset search and filter when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setShowOnlySelected(false);
    }
  }, [open]);

  // Filter projects based on search term and selected filter
  const filteredProyectos = useMemo(() => {
    if (!proyectos) return [];
    
    let filtered = proyectos;
    
    // Filter by selected if enabled
    if (showOnlySelected) {
      filtered = filtered.filter(p => selectedProjects.includes(p.id));
    }
    
    // Filter by search term
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.nombre.toLowerCase().includes(lowerSearch)
      );
    }
    
    return filtered;
  }, [proyectos, searchTerm, showOnlySelected, selectedProjects]);

  // Mutation to save access (including owner selection)
  const saveAccessMutation = useMutation({
    mutationFn: async (projectIds: number[]) => {
      // First, deactivate all current access
      const { error: deactivateError } = await supabase
        .from('proyectos_acceso')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .eq('usuario_id', userEmail);
      
      if (deactivateError) throw deactivateError;

      // Then, upsert the new access
      if (projectIds.length > 0) {
        for (const projectId of projectIds) {
          const ownerId = ownerSelections[projectId] ?? null;
          
          const { data: existing } = await supabase
            .from('proyectos_acceso')
            .select('usuario_id')
            .eq('usuario_id', userEmail)
            .eq('proyecto_id', projectId)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('proyectos_acceso')
              .update({ 
                activo: true, 
                fecha_actualizacion: new Date().toISOString(),
                id_entidad_relacionada_dueno: ownerId
              })
              .eq('usuario_id', userEmail)
              .eq('proyecto_id', projectId);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('proyectos_acceso')
              .insert({
                usuario_id: userEmail,
                proyecto_id: projectId,
                activo: true,
                id_entidad_relacionada_dueno: ownerId,
              });
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Accesos actualizados correctamente');
      queryClient.invalidateQueries({ queryKey: ['user-project-access-with-owner', userEmail] });
      queryClient.invalidateQueries({ queryKey: ['user-project-access', userEmail] });
      setOpen(false);
    },
    onError: (error) => {
      console.error('Error saving access:', error);
      toast.error('Error al guardar los accesos');
    },
  });

  const handleProjectToggle = (projectId: number) => {
    setSelectedProjects(prev => {
      if (prev.includes(projectId)) {
        // Remove project - also remove owner selection
        setOwnerSelections(prevOwners => {
          const { [projectId]: _, ...rest } = prevOwners;
          return rest;
        });
        return prev.filter(id => id !== projectId);
      } else {
        return [...prev, projectId];
      }
    });
  };

  const handleOwnerChange = (projectId: number, ownerIdStr: string) => {
    const ownerId = ownerIdStr === 'all' ? null : parseInt(ownerIdStr);
    setOwnerSelections(prev => ({
      ...prev,
      [projectId]: ownerId
    }));
  };

  const handleSelectAll = () => {
    if (proyectos) {
      setSelectedProjects(proyectos.map(p => p.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedProjects([]);
    setOwnerSelections({});
  };

  const handleSave = () => {
    saveAccessMutation.mutate(selectedProjects);
  };

  const isLoading = loadingProyectos || loadingAccess || loadingRoleConfig || loadingLinkedEntity;

  // Don't show button for Super Admins
  if (isSuperAdmin) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          title="Gestionar acceso a proyectos"
          className="gap-1"
        >
          <Building2 className="h-4 w-4" />
          <span className="sr-only md:not-sr-only md:inline text-xs">Proyectos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Acceso a Proyectos
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {userName} ({userEmail})
          </p>
          {userRole && (
            <Badge variant="outline" className="w-fit">{userRole}</Badge>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasUnrestrictedProjectAccess ? (
          <div className="space-y-4">
            <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <strong>Este usuario tiene acceso a todos los proyectos/propiedades</strong>
                <p className="mt-1 text-sm">
                  El rol "{userRole}" tiene habilitada la opción "Ver todos los proyectos/propiedades", 
                  por lo que no es necesario asignar proyectos específicos. El usuario puede ver todos los proyectos del sistema.
                </p>
              </AlertDescription>
            </Alert>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : isAgente || isSecondaryInmobiliaria ? (
          <AgentReadOnlyAccess
            userPersonaId={userPersonaId}
            isSecondaryInmobiliaria={isSecondaryInmobiliaria}
            isAgenteInterno={isAgenteInterno}
            userRole={userRole}
            proyectos={proyectos}
            selectedProjects={selectedProjects}
            onClose={() => setOpen(false)}
          />
        ) : (
          <div className="space-y-4">
            {/* Info alert for Inmobiliaria role - changes propagate to agents */}
            {isInmobiliaria && (agentCount ?? 0) > 0 && (
              <Alert variant="default" className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <Users className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
                  Los cambios de acceso se propagarán automáticamente a los{' '}
                  <button
                    type="button"
                    onClick={() => setAgentsModalOpen(true)}
                    className="font-bold underline hover:no-underline cursor-pointer"
                  >
                    {agentCount} agente{agentCount !== 1 ? 's' : ''}
                  </button>{' '}
                  de esta inmobiliaria.
                </AlertDescription>
              </Alert>
            )}

            {/* Modal to show agents list */}
            <Dialog open={agentsModalOpen} onOpenChange={setAgentsModalOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Agentes de {userName}
                  </DialogTitle>
                  <DialogDescription>
                    Lista de agentes vinculados a esta inmobiliaria
                  </DialogDescription>
                </DialogHeader>
                
                {loadingAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : agentsList && agentsList.length > 0 ? (
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2">
                      {agentsList.map((agent) => (
                        <div 
                          key={agent.id} 
                          className="flex flex-col p-3 rounded-md bg-muted/50 border"
                        >
                          <span className="font-medium text-sm">
                            {agent.persona?.nombre_legal || 'Sin nombre'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {agent.persona?.email || 'Sin correo'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay agentes vinculados
                  </p>
                )}
                
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setAgentsModalOpen(false)}>
                    Cerrar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Info alert when role requires owner selection */}
            {!hasVerTodosDuenos && (
              <Alert variant="default" className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                <Users className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                  {linkedLegalEntity ? (
                    <>
                      Este usuario está vinculado a <strong>{linkedLegalEntity.nombreLegal}</strong>. 
                      Solo podrá ver datos de esta entidad en los proyectos asignados.
                    </>
                  ) : (
                    <>
                      Este rol requiere seleccionar un dueño específico para cada proyecto. 
                      Si no se selecciona, el usuario verá todos los dueños del proyecto.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar proyectos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Seleccionar todos
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Quitar todos
              </Button>
              <Toggle
                pressed={showOnlySelected}
                onPressedChange={setShowOnlySelected}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                <Filter className="h-3.5 w-3.5" />
                Solo seleccionados
              </Toggle>
            </div>

            <ScrollArea className="h-[320px] border rounded-md p-3">
              <div className="space-y-2">
                {filteredProyectos.map((proyecto) => {
                  const isSelected = selectedProjects.includes(proyecto.id);
                  const projectOwners = ownersByProject[proyecto.id] || [];
                  const showOwnerSelector = isSelected && !hasVerTodosDuenos;
                  
                  return (
                    <div 
                      key={proyecto.id} 
                      className={`p-2 rounded-md transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div 
                        className="flex items-center space-x-2 cursor-pointer"
                        onClick={() => handleProjectToggle(proyecto.id)}
                      >
                        <Checkbox
                          id={`project-${proyecto.id}`}
                          checked={isSelected}
                          onCheckedChange={() => handleProjectToggle(proyecto.id)}
                        />
                        <Label 
                          htmlFor={`project-${proyecto.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {proyecto.nombre}
                        </Label>
                      </div>
                      
                      {/* Owner selector - shown when role doesn't have ver_todos_duenos */}
                      {showOwnerSelector && (
                        <div className="ml-6 mt-2">
                          {/* If user has linked legal entity and only one owner, show as readonly */}
                          {linkedLegalEntity && projectOwners.length === 1 ? (
                            <div className="h-8 px-3 flex items-center text-xs bg-muted rounded-md border">
                              <Users className="h-3 w-3 mr-2 text-muted-foreground" />
                              <span>{projectOwners[0]?.persona?.nombre_legal || 'Entidad vinculada'}</span>
                            </div>
                          ) : (
                            <Select
                              value={ownerSelections[proyecto.id]?.toString() ?? 'all'}
                              onValueChange={(value) => handleOwnerChange(proyecto.id, value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <Users className="h-3 w-3 mr-1" />
                                <SelectValue placeholder="Seleccionar dueño" />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Only show "Todos los dueños" option if there's no linked legal entity */}
                                {!linkedLegalEntity && (
                                  <SelectItem value="all">
                                    <span className="flex items-center gap-1">
                                      Todos los dueños
                                    </span>
                                  </SelectItem>
                                )}
                                {projectOwners.map((dueno) => (
                                  <SelectItem key={dueno.id} value={dueno.id.toString()}>
                                    {dueno.persona?.nombre_legal || `Entidad ${dueno.id}`}
                                  </SelectItem>
                                ))}
                                {projectOwners.length === 0 && !loadingDuenos && (
                                  <SelectItem value="all" disabled>
                                    No hay dueños en este proyecto
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredProyectos.length === 0 && searchTerm && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No se encontraron proyectos con "{searchTerm}"
                  </p>
                )}
                {proyectos?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay proyectos disponibles
                  </p>
                )}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center">
              <Badge variant="secondary">
                {selectedProjects.length} seleccionado(s)
              </Badge>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={saveAccessMutation.isPending}
                >
                  {saveAccessMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
