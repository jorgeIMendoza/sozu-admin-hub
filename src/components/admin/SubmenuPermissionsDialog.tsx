import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Submenu {
  id: number;
  nombre: string;
  vista_front_end: string | null;
  menu_id: number;
  orden: number;
  activo: boolean;
  solo_usuarioa?: boolean;
}

interface Permission {
  id: number;
  nombre: string;
}

interface SubmenuPermissionsDialogProps {
  submenu: Submenu | null;
  onClose: () => void;
}

export function SubmenuPermissionsDialog({ submenu, onClose }: SubmenuPermissionsDialogProps) {
  const queryClient = useQueryClient();
  const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: permissions = [] } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permisos')
        .select('id, nombre')
        .eq('activo', true)
        .order('id');
      if (error) throw error;
      return data as Permission[];
    },
  });

  const { data: availablePermissions = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ['submenu-available-permissions', submenu?.id],
    queryFn: async () => {
      if (!submenu) return [];
      const { data, error } = await supabase
        .from('submenus_permisos_disponibles')
        .select('permiso_id')
        .eq('submenu_id', submenu.id)
        .eq('activo', true);
      if (error) throw error;
      return data.map(d => d.permiso_id);
    },
    enabled: !!submenu,
  });

  // Reset initialization when submenu changes
  useEffect(() => {
    setInitialized(false);
  }, [submenu?.id]);

  // Initialize selected permissions when data loads
  useEffect(() => {
    if (!submenu || loadingAvailable || initialized) return;
    
    setSelectedPermissions(new Set(availablePermissions));
    setInitialized(true);
  }, [submenu?.id, loadingAvailable, availablePermissions, initialized]);

  const togglePermission = (permissionId: number) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (selectedPermissions.size === permissions.length) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(permissions.map(p => p.id)));
    }
  };

  const handleSave = async () => {
    if (!submenu) return;
    
    setIsSaving(true);
    try {
      // Delete all existing available permissions for this submenu
      await supabase
        .from('submenus_permisos_disponibles')
        .delete()
        .eq('submenu_id', submenu.id);
      
      // Insert new available permissions
      if (selectedPermissions.size > 0) {
        const newRecords = Array.from(selectedPermissions).map(permiso_id => ({
          submenu_id: submenu.id,
          permiso_id,
          activo: true,
        }));
        
        const { error } = await supabase
          .from('submenus_permisos_disponibles')
          .insert(newRecords);
        
        if (error) throw error;
      }
      
      toast.success('Permisos disponibles actualizados');
      queryClient.invalidateQueries({ queryKey: ['submenu-available-permissions', submenu.id] });
      queryClient.invalidateQueries({ queryKey: ['available-permissions-per-submenu'] });
      onClose();
    } catch (error) {
      console.error('Error saving available permissions:', error);
      toast.error('Error al guardar permisos');
    } finally {
      setIsSaving(false);
    }
  };

  const allSelected = selectedPermissions.size === permissions.length;

  return (
    <Dialog open={!!submenu} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Permisos disponibles: {submenu?.nombre}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Selecciona qué permisos estarán disponibles para este submenú en la configuración de roles.
          </p>
        </DialogHeader>
        
        {loadingAvailable ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {permissions.map(perm => (
              <div key={perm.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  id={`perm-${perm.id}`}
                  checked={selectedPermissions.has(perm.id)}
                  onCheckedChange={() => togglePermission(perm.id)}
                />
                <label 
                  htmlFor={`perm-${perm.id}`}
                  className="flex-1 cursor-pointer capitalize"
                >
                  {perm.nombre}
                </label>
              </div>
            ))}
            
            <div className="border-t pt-3">
              <div className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  id="perm-all"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
                <label 
                  htmlFor="perm-all"
                  className="flex-1 cursor-pointer font-medium"
                >
                  Seleccionar todos
                </label>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
