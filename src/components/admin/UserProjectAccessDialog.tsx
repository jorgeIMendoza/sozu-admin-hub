import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Loader2, Search, Filter } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';

interface UserProjectAccessDialogProps {
  userId: string;
  userName: string;
  userEmail: string;
  userRole?: string;
}

interface Proyecto {
  id: number;
  nombre: string;
}

interface ProyectoAcceso {
  proyecto_id: number;
}

export function UserProjectAccessDialog({ userId, userName, userEmail, userRole }: UserProjectAccessDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const queryClient = useQueryClient();

  // Check if user is Super Admin
  const isSuperAdmin = userRole === 'Super Administrador';

  // Fetch all active projects (paginating to get all)
  const { data: proyectos, isLoading: loadingProyectos } = useQuery({
    queryKey: ['proyectos-list'],
    queryFn: async () => {
      // Fetch all projects using pagination to bypass the 1000 limit
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
    enabled: open && !isSuperAdmin,
  });

  // Fetch user's current project access (using email as FK, not UUID)
  const { data: userAccess, isLoading: loadingAccess } = useQuery({
    queryKey: ['user-project-access', userEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', userEmail)
        .eq('activo', true);
      
      if (error) throw error;
      return data as ProyectoAcceso[];
    },
    enabled: open && !isSuperAdmin && !!userEmail,
  });

  // Update selected projects when data loads
  useEffect(() => {
    if (userAccess) {
      setSelectedProjects(userAccess.map(a => a.proyecto_id));
    }
  }, [userAccess]);

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

  // Mutation to save access (using email as FK, not UUID)
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
        const accessRecords = projectIds.map(projectId => ({
          usuario_id: userEmail,
          proyecto_id: projectId,
          activo: true,
          fecha_actualizacion: new Date().toISOString(),
        }));

        // For each project, try to update existing or insert new
        for (const record of accessRecords) {
          const { data: existing } = await supabase
            .from('proyectos_acceso')
            .select('usuario_id')
            .eq('usuario_id', userEmail)
            .eq('proyecto_id', record.proyecto_id)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('proyectos_acceso')
              .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
              .eq('usuario_id', userEmail)
              .eq('proyecto_id', record.proyecto_id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('proyectos_acceso')
              .insert(record);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Accesos actualizados correctamente');
      queryClient.invalidateQueries({ queryKey: ['user-project-access', userEmail] });
      setOpen(false);
    },
    onError: (error) => {
      console.error('Error saving access:', error);
      toast.error('Error al guardar los accesos');
    },
  });

  const handleProjectToggle = (projectId: number) => {
    setSelectedProjects(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSelectAll = () => {
    if (proyectos) {
      setSelectedProjects(proyectos.map(p => p.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedProjects([]);
  };

  const handleSave = () => {
    saveAccessMutation.mutate(selectedProjects);
  };

  const isLoading = loadingProyectos || loadingAccess;

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Acceso a Proyectos
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {userName} ({userEmail})
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
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

            <ScrollArea className="h-[280px] border rounded-md p-3">
              <div className="space-y-2">
                {filteredProyectos.map((proyecto) => {
                  const isSelected = selectedProjects.includes(proyecto.id);
                  return (
                    <div 
                      key={proyecto.id} 
                      className={`flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }`}
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
