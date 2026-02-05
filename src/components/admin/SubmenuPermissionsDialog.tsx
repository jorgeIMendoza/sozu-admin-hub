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
  solo_usuarioA?: boolean;
}

interface Role {
  id: number;
  nombre: string;
  es_rol_interno: boolean;
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
  const [selectedPermissions, setSelectedPermissions] = useState<Record<number, Set<number>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles-for-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre, es_rol_interno')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data as Role[];
    },
  });

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

  const { data: currentPermissions = [], isLoading: loadingCurrentPermissions } = useQuery({
    queryKey: ['submenu-permissions', submenu?.id],
    queryFn: async () => {
      if (!submenu) return [];
      const { data, error } = await supabase
        .from('submenus_permisos')
        .select('rol_id, permiso_id')
        .eq('submenu_id', submenu.id)
        .eq('activo', true);
      if (error) throw error;
      return data;
    },
    enabled: !!submenu,
  });

  // Initialize selected permissions when data loads
  useEffect(() => {
    if (currentPermissions.length > 0) {
      const permMap: Record<number, Set<number>> = {};
      currentPermissions.forEach(cp => {
        if (!permMap[cp.rol_id]) {
          permMap[cp.rol_id] = new Set();
        }
        permMap[cp.rol_id].add(cp.permiso_id);
      });
      setSelectedPermissions(permMap);
    } else {
      setSelectedPermissions({});
    }
  }, [currentPermissions]);

  const togglePermission = (roleId: number, permissionId: number) => {
    setSelectedPermissions(prev => {
      const newMap = { ...prev };
      if (!newMap[roleId]) {
        newMap[roleId] = new Set();
      } else {
        newMap[roleId] = new Set(newMap[roleId]);
      }
      
      if (newMap[roleId].has(permissionId)) {
        newMap[roleId].delete(permissionId);
      } else {
        newMap[roleId].add(permissionId);
      }
      
      return newMap;
    });
  };

  const toggleAllForRole = (roleId: number) => {
    setSelectedPermissions(prev => {
      const newMap = { ...prev };
      const currentSet = prev[roleId] || new Set();
      const allSelected = permissions.every(p => currentSet.has(p.id));
      
      if (allSelected) {
        newMap[roleId] = new Set();
      } else {
        newMap[roleId] = new Set(permissions.map(p => p.id));
      }
      
      return newMap;
    });
  };

  const handleSave = async () => {
    if (!submenu) return;
    
    setIsSaving(true);
    try {
      // Delete all existing permissions for this submenu
      await supabase
        .from('submenus_permisos')
        .delete()
        .eq('submenu_id', submenu.id);
      
      // Build new permissions array
      const newPermissions: { submenu_id: number; rol_id: number; permiso_id: number; activo: boolean }[] = [];
      
      Object.entries(selectedPermissions).forEach(([roleIdStr, permissionSet]) => {
        const roleId = parseInt(roleIdStr);
        permissionSet.forEach(permissionId => {
          newPermissions.push({
            submenu_id: submenu.id,
            rol_id: roleId,
            permiso_id: permissionId,
            activo: true,
          });
        });
      });
      
      if (newPermissions.length > 0) {
        const { error } = await supabase
          .from('submenus_permisos')
          .insert(newPermissions);
        
        if (error) throw error;
      }
      
      toast.success('Permisos actualizados');
      queryClient.invalidateQueries({ queryKey: ['submenu-permissions', submenu.id] });
      onClose();
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast.error('Error al guardar permisos');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter to only show internal roles (es_rol_interno = true)
  const internalRoles = roles.filter(r => r.es_rol_interno);

  return (
    <Dialog open={!!submenu} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Permisos: {submenu?.nombre}
          </DialogTitle>
        </DialogHeader>
        
        {loadingCurrentPermissions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Rol</th>
                  {permissions.map(perm => (
                    <th key={perm.id} className="p-2 text-center font-medium capitalize text-xs">
                      {perm.nombre}
                    </th>
                  ))}
                  <th className="p-2 text-center font-medium text-xs">Todos</th>
                </tr>
              </thead>
              <tbody>
                {internalRoles.map(role => {
                  const rolePerms = selectedPermissions[role.id] || new Set();
                  const allSelected = permissions.every(p => rolePerms.has(p.id));
                  
                  return (
                    <tr key={role.id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{role.nombre}</td>
                      {permissions.map(perm => (
                        <td key={perm.id} className="p-2 text-center">
                          <Checkbox
                            checked={rolePerms.has(perm.id)}
                            onCheckedChange={() => togglePermission(role.id, perm.id)}
                          />
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleAllForRole(role.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
