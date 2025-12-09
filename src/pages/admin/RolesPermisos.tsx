import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ChevronDown, ChevronRight, Loader2, Save, Plus, Pencil, Trash2, Search, Lock, XCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Role {
  id: number;
  nombre: string;
  activo: boolean;
}

interface Permiso {
  id: number;
  nombre: string;
  descripcion: string | null;
}

interface Menu {
  id: number;
  nombre: string;
  submenus: Submenu[];
}

interface Submenu {
  id: number;
  nombre: string;
  menu_id: number;
}

interface SubmenuPermiso {
  submenu_id: number;
  permiso_id: number;
  rol_id: number;
  activo: boolean;
}

const SUPER_ADMIN_ROLE_ID = 1;

export default function RolesPermisos() {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<Set<number>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Map<string, boolean>>(new Map());
  const [isNewRoleDialogOpen, setIsNewRoleDialogOpen] = useState(false);
  const [isEditRoleDialogOpen, setIsEditRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [searchRoleName, setSearchRoleName] = useState("");
  
  const queryClient = useQueryClient();

  const isSuperAdminSelected = selectedRoleId === SUPER_ADMIN_ROLE_ID;

  // Fetch roles
  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['roles-management'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre, activo')
        .order('id');
      
      if (error) throw error;
      return data as Role[];
    },
  });

  // Fetch permisos
  const { data: permisos = [] } = useQuery({
    queryKey: ['permisos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permisos')
        .select('id, nombre, descripcion')
        .eq('activo', true)
        .order('id');
      
      if (error) throw error;
      return data as Permiso[];
    },
  });

  // Fetch menus with submenus
  const { data: menus = [] } = useQuery({
    queryKey: ['menus-submenus'],
    queryFn: async () => {
      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('id, nombre')
        .eq('activo', true)
        .order('id');
      
      if (menusError) throw menusError;

      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('id, nombre, menu_id')
        .eq('activo', true)
        .order('id');
      
      if (submenusError) throw submenusError;

      return (menusData || []).map(menu => ({
        ...menu,
        submenus: (submenusData || []).filter(s => s.menu_id === menu.id)
      })) as Menu[];
    },
  });

  // Fetch submenus_permisos for selected role
  const { data: rolePermisos = [], isLoading: loadingPermisos } = useQuery({
    queryKey: ['role-permisos', selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) return [];
      
      const { data, error } = await supabase
        .from('submenus_permisos')
        .select('submenu_id, permiso_id, rol_id, activo')
        .eq('rol_id', selectedRoleId)
        .eq('activo', true);
      
      if (error) throw error;
      return data as SubmenuPermiso[];
    },
    enabled: !!selectedRoleId,
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (nombre: string) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({ nombre, activo: true })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol creado correctamente');
      setIsNewRoleDialogOpen(false);
      setNewRoleName("");
    },
    onError: (error) => {
      toast.error(`Error al crear el rol: ${error.message}`);
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, nombre }: { id: number; nombre: string }) => {
      const { error } = await supabase
        .from('roles')
        .update({ nombre, fecha_actualizacion: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol actualizado correctamente');
      setIsEditRoleDialogOpen(false);
      setEditingRole(null);
    },
    onError: (error) => {
      toast.error(`Error al actualizar el rol: ${error.message}`);
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('roles')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol eliminado correctamente');
      setIsDeleteDialogOpen(false);
      setRoleToDelete(null);
      if (selectedRoleId === roleToDelete?.id) {
        setSelectedRoleId(null);
      }
    },
    onError: (error) => {
      toast.error(`Error al eliminar el rol: ${error.message}`);
    },
  });

  // Save permissions mutation
  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoleId || pendingChanges.size === 0) return;

      for (const [key, shouldHave] of pendingChanges) {
        const [submenuId, permisoId] = key.split('-').map(Number);
        
        if (shouldHave) {
          const { error } = await supabase
            .from('submenus_permisos')
            .upsert({
              submenu_id: submenuId,
              permiso_id: permisoId,
              rol_id: selectedRoleId,
              activo: true,
            }, {
              onConflict: 'submenu_id,permiso_id,rol_id'
            });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('submenus_permisos')
            .update({ activo: false })
            .eq('submenu_id', submenuId)
            .eq('permiso_id', permisoId)
            .eq('rol_id', selectedRoleId);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permisos', selectedRoleId] });
      toast.success('Permisos guardados correctamente');
      setPendingChanges(new Map());
    },
    onError: (error) => {
      toast.error(`Error al guardar permisos: ${error.message}`);
    },
  });

  // Check if permission is active for current role
  const hasPermission = (submenuId: number, permisoId: number): boolean => {
    const key = `${submenuId}-${permisoId}`;
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key)!;
    }
    return rolePermisos.some(
      rp => rp.submenu_id === submenuId && rp.permiso_id === permisoId && rp.activo
    );
  };

  // Toggle permission
  const togglePermission = (submenuId: number, permisoId: number) => {
    if (isSuperAdminSelected) return;
    
    const key = `${submenuId}-${permisoId}`;
    const currentValue = hasPermission(submenuId, permisoId);
    
    const newChanges = new Map(pendingChanges);
    
    const originalValue = rolePermisos.some(
      rp => rp.submenu_id === submenuId && rp.permiso_id === permisoId && rp.activo
    );
    
    if (originalValue === !currentValue) {
      newChanges.delete(key);
    } else {
      newChanges.set(key, !currentValue);
    }
    
    setPendingChanges(newChanges);
  };

  // Check if all permissions are active for a submenu
  const areAllPermissionsActiveForSubmenu = (submenuId: number): boolean => {
    return permisos.every(permiso => hasPermission(submenuId, permiso.id));
  };

  // Toggle all permissions for a submenu (row)
  const toggleAllPermissionsForSubmenu = (submenuId: number) => {
    if (isSuperAdminSelected) return;
    
    const allActive = areAllPermissionsActiveForSubmenu(submenuId);
    const newChanges = new Map(pendingChanges);
    
    permisos.forEach(permiso => {
      const key = `${submenuId}-${permiso.id}`;
      const originalValue = rolePermisos.some(
        rp => rp.submenu_id === submenuId && rp.permiso_id === permiso.id && rp.activo
      );
      
      const newValue = !allActive;
      
      if (originalValue === newValue) {
        newChanges.delete(key);
      } else {
        newChanges.set(key, newValue);
      }
    });
    
    setPendingChanges(newChanges);
  };

  // Check if all permissions are active for a menu (module)
  const areAllPermissionsActiveForMenu = (menuId: number): boolean => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return false;
    
    return menu.submenus.every(submenu => 
      permisos.every(permiso => hasPermission(submenu.id, permiso.id))
    );
  };

  // Toggle all permissions for a menu (module)
  const toggleAllPermissionsForMenu = (menuId: number) => {
    if (isSuperAdminSelected) return;
    
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;
    
    const allActive = areAllPermissionsActiveForMenu(menuId);
    const newChanges = new Map(pendingChanges);
    
    menu.submenus.forEach(submenu => {
      permisos.forEach(permiso => {
        const key = `${submenu.id}-${permiso.id}`;
        const originalValue = rolePermisos.some(
          rp => rp.submenu_id === submenu.id && rp.permiso_id === permiso.id && rp.activo
        );
        
        const newValue = !allActive;
        
        if (originalValue === newValue) {
          newChanges.delete(key);
        } else {
          newChanges.set(key, newValue);
        }
      });
    });
    
    setPendingChanges(newChanges);
  };

  // Deselect ALL permissions globally
  const deselectAllPermissions = () => {
    if (isSuperAdminSelected) return;
    
    const newChanges = new Map(pendingChanges);
    
    menus.forEach(menu => {
      menu.submenus.forEach(submenu => {
        permisos.forEach(permiso => {
          const key = `${submenu.id}-${permiso.id}`;
          const originalValue = rolePermisos.some(
            rp => rp.submenu_id === submenu.id && rp.permiso_id === permiso.id && rp.activo
          );
          
          if (originalValue) {
            newChanges.set(key, false);
          } else {
            newChanges.delete(key);
          }
        });
      });
    });
    
    setPendingChanges(newChanges);
  };

  // Toggle menu expansion
  const toggleMenu = (menuId: number) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(menuId)) {
      newExpanded.delete(menuId);
    } else {
      newExpanded.add(menuId);
    }
    setExpandedMenus(newExpanded);
  };

  // Expand all menus
  const expandAll = () => {
    setExpandedMenus(new Set(menus.map(m => m.id)));
  };

  // Collapse all menus
  const collapseAll = () => {
    setExpandedMenus(new Set());
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const activeRoles = roles.filter(r => r.activo);
  
  // Filter roles by search term
  const filteredRoles = useMemo(() => {
    if (!searchRoleName.trim()) return activeRoles;
    return activeRoles.filter(role => 
      role.nombre.toLowerCase().includes(searchRoleName.toLowerCase())
    );
  }, [activeRoles, searchRoleName]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Roles y Permisos
          </h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los roles del sistema y sus permisos por módulo
          </p>
        </div>
        <Button onClick={() => setIsNewRoleDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Rol
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Roles</CardTitle>
            <CardDescription>
              {activeRoles.length} roles activos
            </CardDescription>
            {/* Search input */}
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar rol..."
                value={searchRoleName}
                onChange={(e) => setSearchRoleName(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1 p-3">
                {loadingRoles ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredRoles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No se encontraron roles
                  </div>
                ) : (
                  filteredRoles.map((role) => {
                    const isSuperAdmin = role.id === SUPER_ADMIN_ROLE_ID;
                    
                    return (
                      <div
                        key={role.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedRoleId === role.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => {
                          setSelectedRoleId(role.id);
                          setPendingChanges(new Map());
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isSuperAdmin ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Shield className="h-4 w-4" />
                          )}
                          <span className="text-sm font-medium">{role.nombre}</span>
                        </div>
                        <div className="flex gap-1">
                          {!isSuperAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${selectedRoleId === role.id ? 'hover:bg-primary-foreground/20' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRole(role);
                                  setIsEditRoleDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${selectedRoleId === role.id ? 'hover:bg-primary-foreground/20' : 'hover:bg-destructive/10 hover:text-destructive'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRoleToDelete(role);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Permissions Matrix */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {selectedRole ? (
                    <>
                      Permisos: {selectedRole.nombre}
                      {isSuperAdminSelected && (
                        <Badge variant="secondary" className="ml-2">
                          <Lock className="h-3 w-3 mr-1" />
                          Solo lectura
                        </Badge>
                      )}
                    </>
                  ) : (
                    'Selecciona un rol'
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedRole 
                    ? isSuperAdminSelected 
                      ? 'Los permisos de Super Admin no pueden modificarse'
                      : 'Configura los permisos por módulo para este rol'
                    : 'Selecciona un rol de la lista para configurar sus permisos'
                  }
                </CardDescription>
              </div>
              {selectedRole && (
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={expandAll}>
                    Expandir todo
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll}>
                    Colapsar todo
                  </Button>
                  {!isSuperAdminSelected && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={deselectAllPermissions}
                            className="text-destructive hover:text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Deseleccionar todos
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Quitar todos los permisos de este rol
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {pendingChanges.size > 0 && (
                    <Button 
                      size="sm" 
                      onClick={() => savePermissionsMutation.mutate()}
                      disabled={savePermissionsMutation.isPending}
                    >
                      {savePermissionsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar ({pendingChanges.size} cambios)
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedRole ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield className="h-12 w-12 mb-4 opacity-50" />
                <p>Selecciona un rol para configurar sus permisos</p>
              </div>
            ) : loadingPermisos ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {isSuperAdminSelected && (
                  <Alert className="mb-4">
                    <Lock className="h-4 w-4" />
                    <AlertDescription>
                      El rol Super Admin tiene acceso completo al sistema y no puede ser modificado.
                    </AlertDescription>
                  </Alert>
                )}
                <ScrollArea className="h-[500px]">
                  {/* Permissions header */}
                  <div className="sticky top-0 bg-background z-10 border-b pb-2 mb-2">
                    <div className="grid gap-2" style={{ gridTemplateColumns: `40px 200px repeat(${permisos.length}, 80px)` }}>
                      <div></div>
                      <div className="font-medium text-sm">Módulo</div>
                      {permisos.map(permiso => (
                        <div key={permiso.id} className="text-center">
                          <Badge variant="outline" className="text-xs capitalize">
                            {permiso.nombre}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Menus and submenus */}
                  <div className="space-y-2">
                    {menus.map(menu => (
                      <Collapsible 
                        key={menu.id} 
                        open={expandedMenus.has(menu.id)}
                        onOpenChange={() => toggleMenu(menu.id)}
                      >
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-muted transition-colors rounded px-1">
                              {expandedMenus.has(menu.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium text-sm">{menu.nombre}</span>
                              <Badge variant="secondary" className="text-xs ml-auto mr-2">
                                {menu.submenus.length} submenús
                              </Badge>
                            </div>
                          </CollapsibleTrigger>
                          {!isSuperAdminSelected && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 ${areAllPermissionsActiveForMenu(menu.id) ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleAllPermissionsForMenu(menu.id);
                                    }}
                                  >
                                    {areAllPermissionsActiveForMenu(menu.id) ? (
                                      <XCircle className="h-4 w-4" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {areAllPermissionsActiveForMenu(menu.id) 
                                    ? 'Deseleccionar todos los permisos de este módulo'
                                    : 'Seleccionar todos los permisos de este módulo'
                                  }
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <CollapsibleContent>
                          <div className="space-y-1 pl-6 pt-2">
                            {menu.submenus.map(submenu => (
                              <div 
                                key={submenu.id} 
                                className="grid gap-2 py-2 border-b border-border/50 last:border-0 items-center"
                                style={{ gridTemplateColumns: `40px 200px repeat(${permisos.length}, 80px)` }}
                              >
                                {/* Toggle row button */}
                                <div className="flex justify-center">
                                  {!isSuperAdminSelected && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className={`h-6 w-6 ${areAllPermissionsActiveForSubmenu(submenu.id) ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
                                            onClick={() => toggleAllPermissionsForSubmenu(submenu.id)}
                                          >
                                            {areAllPermissionsActiveForSubmenu(submenu.id) ? (
                                              <XCircle className="h-3 w-3" />
                                            ) : (
                                              <CheckCircle2 className="h-3 w-3" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {areAllPermissionsActiveForSubmenu(submenu.id)
                                            ? 'Deseleccionar todos los permisos de esta fila'
                                            : 'Seleccionar todos los permisos de esta fila'
                                          }
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground truncate">
                                  {submenu.nombre}
                                </div>
                                {permisos.map(permiso => {
                                  const isChecked = hasPermission(submenu.id, permiso.id);
                                  const key = `${submenu.id}-${permiso.id}`;
                                  const hasChange = pendingChanges.has(key);
                                  
                                  return (
                                    <div key={permiso.id} className="flex justify-center">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => togglePermission(submenu.id, permiso.id)}
                                        disabled={isSuperAdminSelected}
                                        className={hasChange ? 'border-amber-500 data-[state=checked]:bg-amber-500' : ''}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Role Dialog */}
      <Dialog open={isNewRoleDialogOpen} onOpenChange={setIsNewRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Rol</DialogTitle>
            <DialogDescription>
              Ingresa el nombre del nuevo rol. Podrás configurar sus permisos después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Nombre del rol</Label>
              <Input
                id="roleName"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Ej: Supervisor de ventas"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRoleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createRoleMutation.mutate(newRoleName)}
              disabled={!newRoleName.trim() || createRoleMutation.isPending}
            >
              {createRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear Rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={isEditRoleDialogOpen} onOpenChange={setIsEditRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Rol</DialogTitle>
            <DialogDescription>
              Modifica el nombre del rol.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editRoleName">Nombre del rol</Label>
              <Input
                id="editRoleName"
                value={editingRole?.nombre || ''}
                onChange={(e) => setEditingRole(prev => prev ? { ...prev, nombre: e.target.value } : null)}
                placeholder="Nombre del rol"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRoleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => editingRole && updateRoleMutation.mutate({ id: editingRole.id, nombre: editingRole.nombre })}
              disabled={!editingRole?.nombre.trim() || updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar el rol "{roleToDelete?.nombre}"? 
              Esta acción desactivará el rol y todos los usuarios con este rol perderán acceso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleToDelete && deleteRoleMutation.mutate(roleToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
