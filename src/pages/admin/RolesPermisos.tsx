import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ChevronDown, ChevronRight, Loader2, Save, Plus, Pencil, Trash2, Search, Lock, XCircle, CheckCircle2, ChevronsUpDown, Check, RotateCcw } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface Role {
  id: number;
  nombre: string;
  activo: boolean;
  ver_todos_prospectos_compradores: boolean;
  ver_todos_proyectos_propiedades: boolean;
  ver_filtros_avanzados_eliminados: boolean;
  ver_todos_duenos: boolean;
  configurar_citas: boolean;
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

// Note: Menus are no longer hidden by ID. Instead, submenus with solo_usuarioa=true
// are filtered out in the query, and menus without visible submenus are excluded.

// Component for managing report access per role
const ReportesSelector = ({ rolId, isSuperAdmin }: { rolId: number; isSuperAdmin: boolean }) => {
  const queryClient = useQueryClient();

  // Fetch all active reports
  const { data: reportes = [] } = useQuery({
    queryKey: ['reportes-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reportes')
        .select('id, nombre, descripcion')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch report permissions for selected role
  const { data: rolReportes = [], refetch: refetchRolReportes } = useQuery({
    queryKey: ['rol-reportes', rolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles_reportes')
        .select('reporte_id')
        .eq('rol_id', rolId)
        .eq('activo', true);
      if (error) throw error;
      return data?.map(r => r.reporte_id) || [];
    },
    enabled: !!rolId && !isSuperAdmin,
  });

  // Toggle individual report mutation
  const toggleReporteMutation = useMutation({
    mutationFn: async ({ reporteId, isActive }: { reporteId: number; isActive: boolean }) => {
      if (isActive) {
        const { error } = await supabase
          .from('roles_reportes')
          .delete()
          .eq('rol_id', rolId)
          .eq('reporte_id', reporteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('roles_reportes')
          .upsert({ 
            rol_id: rolId, 
            reporte_id: reporteId,
            activo: true
          }, { 
            onConflict: 'rol_id,reporte_id' 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchRolReportes();
      queryClient.invalidateQueries({ queryKey: ['rol-reportes'] });
    },
    onError: (error) => {
      toast.error(`Error al actualizar reporte: ${error.message}`);
    },
  });

  // Select all mutation
  const selectAllMutation = useMutation({
    mutationFn: async () => {
      const inserts = reportes.map(r => ({
        rol_id: rolId,
        reporte_id: r.id,
        activo: true
      }));
      
      const { error } = await supabase
        .from('roles_reportes')
        .upsert(inserts, { onConflict: 'rol_id,reporte_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchRolReportes();
      toast.success('Todos los reportes seleccionados');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Deselect all mutation
  const deselectAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('roles_reportes')
        .delete()
        .eq('rol_id', rolId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchRolReportes();
      toast.success('Todos los reportes deseleccionados');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  if (isSuperAdmin) return null;

  const hasReporte = (reporteId: number) => rolReportes.includes(reporteId);
  const isLoading = toggleReporteMutation.isPending || selectAllMutation.isPending || deselectAllMutation.isPending;

  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedLabels = reportes
    .filter(r => rolReportes.includes(r.id))
    .map(r => r.nombre);

  const displayText = selectedLabels.length === 0
    ? "Seleccionar reportes..."
    : selectedLabels.length === reportes.length
    ? "Todos los reportes"
    : `${selectedLabels.length} reportes seleccionados`;

  const filteredReportes = reportes.filter(r =>
    r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.descripcion && r.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium">Reportes accesibles</span>
          <p className="text-xs text-muted-foreground">
            Define qué reportes puede ver este rol
          </p>
        </div>
      </div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearchTerm(''); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={isLoading}
          >
            <span className="truncate">{displayText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex flex-col">
            {/* Search input */}
            <div className="p-2 border-b">
              <Input
                placeholder="Buscar reporte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8"
              />
            </div>
            {/* Quick actions */}
            <div className="flex border-b px-2 py-2 gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8"
                onClick={() => selectAllMutation.mutate()}
                disabled={isLoading}
              >
                Seleccionar todos
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8"
                onClick={() => deselectAllMutation.mutate()}
                disabled={isLoading}
              >
                Quitar todos
              </Button>
            </div>
            {/* Options list */}
            <ScrollArea className="h-[300px]">
              <div className="p-1">
                {filteredReportes.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No se encontraron reportes
                  </div>
                ) : (
                  filteredReportes.map((reporte) => (
                    <div
                      key={reporte.id}
                      onClick={() => toggleReporteMutation.mutate({ 
                        reporteId: reporte.id, 
                        isActive: hasReporte(reporte.id)
                      })}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        hasReporte(reporte.id) && "bg-accent/50"
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          hasReporte(reporte.id) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{reporte.nombre}</span>
                        {reporte.descripcion && (
                          <span className="text-xs text-muted-foreground">{reporte.descripcion}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground mt-2">
        Seleccionados: {rolReportes.length} de {reportes.length}
      </p>
    </div>
  );
};

// Component for managing availability status permissions per role
const EstatusDisponibilidadSelector = ({ rolId, isSuperAdmin }: { rolId: number; isSuperAdmin: boolean }) => {
  const queryClient = useQueryClient();

  // Fetch all active availability statuses
  const { data: estatusDisponibilidad = [] } = useQuery({
    queryKey: ['estatus-disponibilidad-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch status permissions for selected role
  const { data: rolEstatus = [], refetch: refetchRolEstatus } = useQuery({
    queryKey: ['rol-estatus-disponibilidad', rolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles_estatus_disponibilidad')
        .select('id_estatus_disponibilidad')
        .eq('id_rol', rolId)
        .eq('activo', true);
      if (error) throw error;
      return data?.map(r => r.id_estatus_disponibilidad) || [];
    },
    enabled: !!rolId && !isSuperAdmin,
  });

  // Toggle individual status mutation
  const toggleEstatusMutation = useMutation({
    mutationFn: async ({ estatusId, isActive }: { estatusId: number; isActive: boolean }) => {
      if (isActive) {
        const { error } = await supabase
          .from('roles_estatus_disponibilidad')
          .delete()
          .eq('id_rol', rolId)
          .eq('id_estatus_disponibilidad', estatusId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('roles_estatus_disponibilidad')
          .upsert({ 
            id_rol: rolId, 
            id_estatus_disponibilidad: estatusId,
            activo: true
          }, { 
            onConflict: 'id_rol,id_estatus_disponibilidad' 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchRolEstatus();
      queryClient.invalidateQueries({ queryKey: ['rol-estatus-disponibilidad'] });
    },
    onError: (error) => {
      toast.error(`Error al actualizar estatus: ${error.message}`);
    },
  });

  // Select all mutation
  const selectAllMutation = useMutation({
    mutationFn: async () => {
      const inserts = estatusDisponibilidad.map(e => ({
        id_rol: rolId,
        id_estatus_disponibilidad: e.id,
        activo: true
      }));
      
      const { error } = await supabase
        .from('roles_estatus_disponibilidad')
        .upsert(inserts, { onConflict: 'id_rol,id_estatus_disponibilidad' });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchRolEstatus();
      toast.success('Todos los estatus seleccionados');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Deselect all mutation
  const deselectAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('roles_estatus_disponibilidad')
        .delete()
        .eq('id_rol', rolId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchRolEstatus();
      toast.success('Todos los estatus deseleccionados');
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  if (isSuperAdmin) return null;

  const hasEstatus = (estatusId: number) => rolEstatus.includes(estatusId);
  const isLoading = toggleEstatusMutation.isPending || selectAllMutation.isPending || deselectAllMutation.isPending;

  const [open, setOpen] = useState(false);

  const selectedLabels = estatusDisponibilidad
    .filter(e => rolEstatus.includes(e.id))
    .map(e => e.nombre);

  const displayText = selectedLabels.length === 0
    ? "Seleccionar estatus..."
    : selectedLabels.length === estatusDisponibilidad.length
    ? "Todos los estatus"
    : `${selectedLabels.length} estatus seleccionados`;

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium">Estatus de disponibilidad visibles</span>
          <p className="text-xs text-muted-foreground">
            Define qué estatus de propiedades puede ver este rol
          </p>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={isLoading}
          >
            <span className="truncate">{displayText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex flex-col">
            {/* Quick actions */}
            <div className="flex border-b px-2 py-2 gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8"
                onClick={() => selectAllMutation.mutate()}
                disabled={isLoading}
              >
                Seleccionar todos
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-1 h-8"
                onClick={() => deselectAllMutation.mutate()}
                disabled={isLoading}
              >
                Quitar todos
              </Button>
            </div>
            {/* Options list */}
            <ScrollArea className="max-h-[320px]">
              <div className="p-1">
                {estatusDisponibilidad.map((estatus) => (
                  <div
                    key={estatus.id}
                    onClick={() => toggleEstatusMutation.mutate({ 
                      estatusId: estatus.id, 
                      isActive: hasEstatus(estatus.id)
                    })}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      hasEstatus(estatus.id) && "bg-accent/50"
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        hasEstatus(estatus.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>{estatus.nombre}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground mt-2">
        Seleccionados: {rolEstatus.length} de {estatusDisponibilidad.length}
      </p>
    </div>
  );
};

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
  const [roleTab, setRoleTab] = useState<"activos" | "eliminados">("activos");
  
  const queryClient = useQueryClient();
  const { triggerPermissionRefresh } = useAuth();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();
  const isSuperAdminSelected = selectedRoleId === SUPER_ADMIN_ROLE_ID;

  // Fetch roles (only internal roles)
  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['roles-management'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre, activo, ver_todos_prospectos_compradores, ver_todos_proyectos_propiedades, ver_filtros_avanzados_eliminados, ver_todos_duenos, configurar_citas')
        .eq('es_rol_interno', true)
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
        .select('id, nombre, orden')
        .eq('activo', true)
        .order('orden');
      
      if (menusError) throw menusError;

      const { data: submenusData, error: submenusError } = await supabase
        .from('submenus')
        .select('id, nombre, menu_id, orden')
        .eq('activo', true)
        .or('solo_usuarioa.is.null,solo_usuarioa.eq.false')
        .order('orden');
      
      if (submenusError) throw submenusError;

      return (menusData || []).map(menu => ({
        ...menu,
        submenus: (submenusData || []).filter(s => s.menu_id === menu.id).sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100))
      })).filter(menu => menu.submenus.length > 0) as Menu[];
    },
  });

  // Fetch available permissions per submenu from submenus_permisos_disponibles
  const { data: availablePermissions = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ['available-permissions-per-submenu'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('submenus_permisos_disponibles')
        .select('submenu_id, permiso_id')
        .eq('activo', true);
      
      if (error) throw error;
      
      // Create a Set of "submenu_id-permiso_id" combinations that exist
      const permissionSet = new Set<string>();
      (data || []).forEach((item: { submenu_id: number; permiso_id: number }) => {
        permissionSet.add(`${item.submenu_id}-${item.permiso_id}`);
      });
      
      return permissionSet;
    },
  });

  // Check if a permission is available for a submenu
  const isPermissionAvailableForSubmenu = (submenuId: number, permisoId: number): boolean => {
    return availablePermissions.has(`${submenuId}-${permisoId}`);
  };

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
        .insert({ nombre, activo: true, es_rol_interno: true })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await registrarCreacion('rol', { id: data.id, nombre: data.nombre }, 'crear_rol');
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol creado correctamente');
      setIsNewRoleDialogOpen(false);
      setNewRoleName("");
    },
    onError: async (error) => {
      await registrarCreacion('rol', { nombre: newRoleName }, 'crear_rol', 'error', error.message);
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
      return { id, nombre };
    },
    onSuccess: async (data) => {
      await registrarActualizacion('rol', { id: data.id, nombre: editingRole?.nombre }, { id: data.id, nombre: data.nombre }, 'actualizar_rol');
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol actualizado correctamente');
      setIsEditRoleDialogOpen(false);
      setEditingRole(null);
    },
    onError: async (error) => {
      await registrarActualizacion('rol', { nombre: editingRole?.nombre }, { nombre: editingRole?.nombre }, 'actualizar_rol', 'error', error.message);
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
      return id;
    },
    onSuccess: async (id) => {
      await registrarEliminacion('rol', { id, nombre: roleToDelete?.nombre }, 'eliminar_rol');
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol eliminado correctamente');
      setIsDeleteDialogOpen(false);
      setRoleToDelete(null);
      if (selectedRoleId === roleToDelete?.id) {
        setSelectedRoleId(null);
      }
    },
    onError: async (error) => {
      await registrarEliminacion('rol', { id: roleToDelete?.id, nombre: roleToDelete?.nombre }, 'eliminar_rol', 'error', error.message);
      toast.error(`Error al eliminar el rol: ${error.message}`);
    },
  });

  // Reactivate role mutation
  const reactivateRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const role = roles.find(r => r.id === id);
      const { error } = await supabase
        .from('roles')
        .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
      return { id, nombre: role?.nombre };
    },
    onSuccess: async (data) => {
      await registrarRestauracion('rol', { id: data.id, activo: false }, { id: data.id, activo: true, nombre: data.nombre }, 'reactivar_rol');
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      toast.success('Rol reactivado correctamente');
    },
    onError: async (error) => {
      await registrarRestauracion('rol', { activo: false }, { activo: true }, 'reactivar_rol', 'error', error.message);
      toast.error(`Error al reactivar el rol: ${error.message}`);
    },
  });

  // Query to get users count per role (for delete warning)
  const { data: usersCountByRole = {} } = useQuery({
    queryKey: ['users-count-by-role'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('rol_id')
        .eq('activo', true);
      
      if (error) throw error;
      
      const counts: Record<number, number> = {};
      (data || []).forEach((u: { rol_id: number }) => {
        counts[u.rol_id] = (counts[u.rol_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Update ver_todos_prospectos_compradores mutation
  const updateVerTodosProspectosMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from('roles')
        .update({ 
          ver_todos_prospectos_compradores: value,
          fecha_actualizacion: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      triggerPermissionRefresh();
      toast.success('Configuración actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // Update ver_todos_proyectos_propiedades mutation
  const updateVerTodosProyectosMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from('roles')
        .update({ 
          ver_todos_proyectos_propiedades: value,
          fecha_actualizacion: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      triggerPermissionRefresh();
      toast.success('Configuración actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // Update ver_todos_duenos mutation
  const updateVerTodosDuenosMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from('roles')
        .update({ 
          ver_todos_duenos: value,
          fecha_actualizacion: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      triggerPermissionRefresh();
      toast.success('Configuración actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // Update ver_filtros_avanzados_eliminados mutation
  const updateVerFiltrosAvanzadosMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from('roles')
        .update({
          ver_filtros_avanzados_eliminados: value,
          fecha_actualizacion: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      triggerPermissionRefresh();
      toast.success('Configuración actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // Update configurar_citas mutation
  const updateConfigurarCitasMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const { error } = await supabase
        .from('roles')
        .update({
          configurar_citas: value,
          fecha_actualizacion: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles-management'] });
      triggerPermissionRefresh();
      toast.success('Configuración actualizada');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
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
    onSuccess: async () => {
      const selectedRole = roles.find(r => r.id === selectedRoleId);
      const cambios = Object.fromEntries(pendingChanges);
      await registrarActualizacion('submenus_permisos', 
        { rol_id: selectedRoleId, rol_nombre: selectedRole?.nombre }, 
        { rol_id: selectedRoleId, rol_nombre: selectedRole?.nombre, cambios }, 
        'guardar_permisos_rol'
      );
      // Invalidar permisos del rol actual
      queryClient.invalidateQueries({ queryKey: ['role-permisos', selectedRoleId] });
      // Invalidar queries de permisos de usuario para que se reflejen los cambios inmediatamente
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['allowed-menus'] });
      queryClient.invalidateQueries({ queryKey: ['page-permissions'] });
      // Trigger refresh de permisos en el contexto de autenticación
      triggerPermissionRefresh();
      toast.success('Permisos guardados correctamente');
      setPendingChanges(new Map());
    },
    onError: async (error) => {
      const selectedRole = roles.find(r => r.id === selectedRoleId);
      await registrarActualizacion('submenus_permisos', 
        { rol_id: selectedRoleId, rol_nombre: selectedRole?.nombre }, 
        {}, 
        'guardar_permisos_rol',
        'error',
        error.message
      );
      toast.error(`Error al guardar permisos: ${error.message}`);
    },
  });

  // Check if permission is active for current role
  const hasPermission = (submenuId: number, permisoId: number): boolean => {
    // Super Admin has all permissions implicitly
    if (isSuperAdminSelected) {
      return true;
    }
    
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

  // Check if all available permissions are active for a submenu
  const areAllPermissionsActiveForSubmenu = (submenuId: number): boolean => {
    const availablePermisos = permisos.filter(permiso => 
      isPermissionAvailableForSubmenu(submenuId, permiso.id)
    );
    if (availablePermisos.length === 0) return false;
    return availablePermisos.every(permiso => hasPermission(submenuId, permiso.id));
  };

  // Toggle all available permissions for a submenu (row)
  const toggleAllPermissionsForSubmenu = (submenuId: number) => {
    if (isSuperAdminSelected) return;
    
    const availablePermisos = permisos.filter(permiso => 
      isPermissionAvailableForSubmenu(submenuId, permiso.id)
    );
    
    const allActive = areAllPermissionsActiveForSubmenu(submenuId);
    const newChanges = new Map(pendingChanges);
    
    availablePermisos.forEach(permiso => {
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

  // Check if all available permissions are active for a menu (module)
  const areAllPermissionsActiveForMenu = (menuId: number): boolean => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return false;
    
    return menu.submenus.every(submenu => {
      const availablePermisos = permisos.filter(permiso => 
        isPermissionAvailableForSubmenu(submenu.id, permiso.id)
      );
      if (availablePermisos.length === 0) return true;
      return availablePermisos.every(permiso => hasPermission(submenu.id, permiso.id));
    });
  };

  // Toggle all available permissions for a menu (module)
  const toggleAllPermissionsForMenu = (menuId: number) => {
    if (isSuperAdminSelected) return;
    
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;
    
    const allActive = areAllPermissionsActiveForMenu(menuId);
    const newChanges = new Map(pendingChanges);
    
    menu.submenus.forEach(submenu => {
      const availablePermisos = permisos.filter(permiso => 
        isPermissionAvailableForSubmenu(submenu.id, permiso.id)
      );
      
      availablePermisos.forEach(permiso => {
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

  // Deselect ALL available permissions globally
  const deselectAllPermissions = () => {
    if (isSuperAdminSelected) return;
    
    const newChanges = new Map(pendingChanges);
    
    menus.forEach(menu => {
      menu.submenus.forEach(submenu => {
        const availablePermisos = permisos.filter(permiso => 
          isPermissionAvailableForSubmenu(submenu.id, permiso.id)
        );
        
        availablePermisos.forEach(permiso => {
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
  const deletedRoles = roles.filter(r => !r.activo);
  
  // Filter and sort roles: Super Admin first, then alphabetically
  const filteredActiveRoles = useMemo(() => {
    let filtered = activeRoles;
    if (searchRoleName.trim()) {
      filtered = activeRoles.filter(role => 
        role.nombre.toLowerCase().includes(searchRoleName.toLowerCase())
      );
    }
    // Sort: Super Admin first, then alphabetically
    return filtered.sort((a, b) => {
      if (a.id === SUPER_ADMIN_ROLE_ID) return -1;
      if (b.id === SUPER_ADMIN_ROLE_ID) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [activeRoles, searchRoleName]);

  const filteredDeletedRoles = useMemo(() => {
    let filtered = deletedRoles;
    if (searchRoleName.trim()) {
      filtered = deletedRoles.filter(role => 
        role.nombre.toLowerCase().includes(searchRoleName.toLowerCase())
      );
    }
    return filtered.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [deletedRoles, searchRoleName]);

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
            <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as "activos" | "eliminados")} className="w-full">
              <div className="px-3">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="activos" className="text-xs">
                    Activos ({activeRoles.length})
                  </TabsTrigger>
                  <TabsTrigger value="eliminados" className="text-xs">
                    Eliminados ({deletedRoles.length})
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="activos" className="mt-0">
                <ScrollArea className="h-[450px]">
                  <div className="space-y-1 p-3">
                    {loadingRoles ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredActiveRoles.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No se encontraron roles
                      </div>
                    ) : (
                      filteredActiveRoles.map((role) => {
                        const isSuperAdmin = role.id === SUPER_ADMIN_ROLE_ID;
                        
                        return (
                          <div
                            key={role.id}
                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedRoleId === role.id
                                ? 'bg-primary text-primary-foreground'
                                : isSuperAdmin 
                                  ? 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700'
                                  : 'hover:bg-muted'
                            }`}
                            onClick={() => {
                              setSelectedRoleId(role.id);
                              setPendingChanges(new Map());
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {isSuperAdmin ? (
                                <Lock className={`h-4 w-4 ${selectedRoleId !== role.id ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                              ) : (
                                <Shield className="h-4 w-4" />
                              )}
                              <span className={`text-sm font-medium ${isSuperAdmin && selectedRoleId !== role.id ? 'text-amber-800 dark:text-amber-200' : ''}`}>
                                {role.nombre}
                              </span>
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
              </TabsContent>

              <TabsContent value="eliminados" className="mt-0">
                <ScrollArea className="h-[450px]">
                  <div className="space-y-1 p-3">
                    {loadingRoles ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredDeletedRoles.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No hay roles eliminados
                      </div>
                    ) : (
                      filteredDeletedRoles.map((role) => (
                        <div
                          key={role.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 opacity-70"
                        >
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">
                              {role.nombre}
                            </span>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/30"
                                  onClick={() => reactivateRoleMutation.mutate(role.id)}
                                  disabled={reactivateRoleMutation.isPending}
                                >
                                  {reactivateRoleMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reactivar rol</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
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
                
                {/* Special permissions section */}
                {!isSuperAdminSelected && selectedRole && (
                  <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
                    <h4 className="text-sm font-semibold mb-3">Configuración especial</h4>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedRole.ver_todos_prospectos_compradores || false}
                          onCheckedChange={(checked) => {
                            updateVerTodosProspectosMutation.mutate({
                              id: selectedRole.id,
                              value: checked === true
                            });
                          }}
                          disabled={updateVerTodosProspectosMutation.isPending}
                        />
                        <div>
                          <span className="text-sm font-medium">Ver todos los prospectos/compradores</span>
                          <p className="text-xs text-muted-foreground">
                            Permite ver prospectos y compradores creados por otros usuarios
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedRole.ver_todos_proyectos_propiedades || false}
                          onCheckedChange={(checked) => {
                            updateVerTodosProyectosMutation.mutate({
                              id: selectedRole.id,
                              value: checked === true
                            });
                          }}
                          disabled={updateVerTodosProyectosMutation.isPending}
                        />
                        <div>
                      <span className="text-sm font-medium">Ver todos los proyectos/propiedades</span>
                          <p className="text-xs text-muted-foreground">
                            Permite ver todos los proyectos y propiedades sin necesidad de asignación específica
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedRole.ver_todos_duenos || false}
                          onCheckedChange={(checked) => {
                            updateVerTodosDuenosMutation.mutate({
                              id: selectedRole.id,
                              value: checked === true
                            });
                          }}
                          disabled={updateVerTodosDuenosMutation.isPending}
                        />
                        <div>
                          <span className="text-sm font-medium">Ver todos los dueños</span>
                          <p className="text-xs text-muted-foreground">
                            Permite ver datos de todos los dueños del proyecto sin restricción específica
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedRole.ver_filtros_avanzados_eliminados || false}
                          onCheckedChange={(checked) => {
                            updateVerFiltrosAvanzadosMutation.mutate({
                              id: selectedRole.id,
                              value: checked === true
                            });
                          }}
                          disabled={updateVerFiltrosAvanzadosMutation.isPending}
                        />
                        <div>
                          <span className="text-sm font-medium">Ver filtros avanzados y pestaña eliminados</span>
                          <p className="text-xs text-muted-foreground">
                            Permite ver filtros avanzados (recámaras, baños, área, precio, etc.) y la pestaña de eliminados en propiedades
                          </p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedRole.configurar_citas || false}
                          onCheckedChange={(checked) => {
                            updateConfigurarCitasMutation.mutate({
                              id: selectedRole.id,
                              value: checked === true
                            });
                          }}
                          disabled={updateConfigurarCitasMutation.isPending}
                        />
                        <div>
                          <span className="text-sm font-medium">Configurar citas</span>
                          <p className="text-xs text-muted-foreground">
                            Permite configurar los horarios disponibles para agendar citas
                          </p>
                        </div>
                      </label>
                      
                      {/* Estatus de disponibilidad visibles */}
                      <EstatusDisponibilidadSelector 
                        rolId={selectedRole.id}
                        isSuperAdmin={isSuperAdminSelected}
                      />
                      
                      {/* Reportes accesibles */}
                      <ReportesSelector 
                        rolId={selectedRole.id}
                        isSuperAdmin={isSuperAdminSelected}
                      />
                    </div>
                  </div>
                )}
                <div className="h-[500px] overflow-auto">
                  {/* Menus and submenus - no fixed header */}
                  <div className="space-y-2">
                    {menus.map(menu => (
                      <Collapsible 
                        key={menu.id} 
                        open={expandedMenus.has(menu.id)}
                        onOpenChange={() => toggleMenu(menu.id)}
                      >
                        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-muted/80 transition-colors rounded px-2 py-1">
                              {expandedMenus.has(menu.id) ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              )}
                              <span className="font-semibold">{menu.nombre}</span>
                              <Badge variant="secondary" className="text-xs ml-auto">
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
                                    size="sm"
                                    className={`h-8 px-2 ${areAllPermissionsActiveForMenu(menu.id) ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
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
                          <div className="mt-2 space-y-1 pl-4">
                            {menu.submenus.map(submenu => {
                              const availablePermisos = permisos.filter(p => 
                                isPermissionAvailableForSubmenu(submenu.id, p.id)
                              );
                              
                              return (
                                <div 
                                  key={submenu.id} 
                                  className="flex items-center gap-3 py-2 px-3 rounded-md border border-border/50 bg-background hover:bg-muted/30 transition-colors"
                                >
                                  {/* Toggle all button */}
                                  {!isSuperAdminSelected && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className={`h-6 w-6 shrink-0 ${areAllPermissionsActiveForSubmenu(submenu.id) ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
                                            onClick={() => toggleAllPermissionsForSubmenu(submenu.id)}
                                          >
                                            {areAllPermissionsActiveForSubmenu(submenu.id) ? (
                                              <XCircle className="h-3.5 w-3.5" />
                                            ) : (
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                            )}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {areAllPermissionsActiveForSubmenu(submenu.id)
                                            ? 'Quitar todos'
                                            : 'Seleccionar todos'
                                          }
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  
                                  {/* Submenu name */}
                                  <span className="text-sm font-medium min-w-[140px] shrink-0">
                                    {submenu.nombre}
                                  </span>
                                  
                                  {/* Permissions as compact badges with checkboxes */}
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    {availablePermisos.map(permiso => {
                                      const isChecked = hasPermission(submenu.id, permiso.id);
                                      const key = `${submenu.id}-${permiso.id}`;
                                      const hasChange = pendingChanges.has(key);
                                      
                                      return (
                                        <label
                                          key={permiso.id}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs cursor-pointer transition-colors select-none ${
                                            isChecked 
                                              ? hasChange 
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700' 
                                                : 'bg-primary/10 text-primary border border-primary/30'
                                              : hasChange
                                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/10 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                                : 'bg-muted text-muted-foreground border border-transparent hover:border-border'
                                          } ${isSuperAdminSelected ? 'cursor-default' : 'hover:bg-muted/80'}`}
                                        >
                                          <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={() => togglePermission(submenu.id, permiso.id)}
                                            disabled={isSuperAdminSelected}
                                            className="h-3 w-3 border-current"
                                          />
                                          <span className="capitalize">{permiso.nombre.replace('_', ' ')}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </div>
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
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  ¿Estás seguro de que deseas eliminar el rol "{roleToDelete?.nombre}"?
                </p>
                {roleToDelete && usersCountByRole[roleToDelete.id] > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription className="flex items-center gap-2">
                      <XCircle className="h-4 w-4" />
                      <span>
                        <strong>{usersCountByRole[roleToDelete.id]}</strong> usuario(s) tienen asignado este rol y perderán acceso al sistema.
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-sm">
                  Podrás reactivar el rol desde la pestaña "Eliminados".
                </p>
              </div>
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
