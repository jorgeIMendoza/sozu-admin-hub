import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, AlertCircle, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isValidRoute } from '@/utils/validRoutes';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Submenu {
  id: number;
  nombre: string;
  vista_front_end: string | null;
  menu_id: number;
  orden: number;
  activo: boolean;
  solo_usuarioa?: boolean;
}

interface Menu {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

// Submenu IDs that cannot be deactivated or deleted for safety
const PROTECTED_SUBMENU_IDS = [56]; // Administrar Menus

interface SortableSubmenuRowProps {
  submenu: Submenu;
  menus: Menu[];
  allSubmenus: Submenu[];
  onUpdate: () => void;
}

export function SortableSubmenuRow({ submenu, menus, allSubmenus, onUpdate }: SortableSubmenuRowProps) {
  const [nombre, setNombre] = useState(submenu.nombre);
  const [vistaFrontEnd, setVistaFrontEnd] = useState(submenu.vista_front_end || '');
  const [activo, setActivo] = useState(submenu.activo);
  const [soloUsuarioA, setSoloUsuarioA] = useState(submenu.solo_usuarioa || false);
  const [menuId, setMenuId] = useState(submenu.menu_id);
  const [isUpdating, setIsUpdating] = useState(false);
  const { registrarActualizacion, registrarEliminacion } = useActivityLogger();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `submenu-${submenu.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    setNombre(submenu.nombre);
    setVistaFrontEnd(submenu.vista_front_end || '');
    setActivo(submenu.activo);
    setSoloUsuarioA(submenu.solo_usuarioa || false);
    setMenuId(submenu.menu_id);
  }, [submenu]);

  const routeIsValid = isValidRoute(vistaFrontEnd);

  // Validar nombre duplicado
  const isNameDuplicate = (newName: string) => {
    const normalizedName = newName.trim().toLowerCase();
    // Verificar contra otros submenus
    const duplicateSubmenu = allSubmenus.find(
      s => s.id !== submenu.id && s.nombre.trim().toLowerCase() === normalizedName
    );
    // Verificar contra menus
    const duplicateMenu = menus.find(
      m => m.nombre.trim().toLowerCase() === normalizedName
    );
    return duplicateSubmenu || duplicateMenu;
  };

  const handleNombreBlur = async () => {
    if (nombre === submenu.nombre) return;
    
    if (isNameDuplicate(nombre)) {
      toast.error('Ya existe un menú o submenú con ese nombre');
      setNombre(submenu.nombre);
      return;
    }
    
    const valorAnterior = { nombre: submenu.nombre };
    setIsUpdating(true);
    const { error } = await supabase
      .from('submenus')
      .update({ nombre, fecha_actualizacion: new Date().toISOString() })
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al actualizar nombre');
      setNombre(submenu.nombre);
      await registrarActualizacion('submenu', valorAnterior, { nombre }, 'actualizar_submenu', 'error', error.message);
    } else {
      await registrarActualizacion('submenu', valorAnterior, { id: submenu.id, nombre }, 'actualizar_submenu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const handleRutaBlur = async () => {
    if (vistaFrontEnd === (submenu.vista_front_end || '')) return;
    
    const valorAnterior = { vista_front_end: submenu.vista_front_end };
    setIsUpdating(true);
    const { error } = await supabase
      .from('submenus')
      .update({ vista_front_end: vistaFrontEnd || null, fecha_actualizacion: new Date().toISOString() })
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al actualizar ruta');
      setVistaFrontEnd(submenu.vista_front_end || '');
      await registrarActualizacion('submenu', valorAnterior, { vista_front_end: vistaFrontEnd }, 'actualizar_submenu', 'error', error.message);
    } else {
      await registrarActualizacion('submenu', valorAnterior, { id: submenu.id, vista_front_end: vistaFrontEnd }, 'actualizar_submenu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const handleMenuChange = async (newMenuId: string) => {
    const newId = parseInt(newMenuId);
    if (newId === submenu.menu_id) return;
    
    const valorAnterior = { menu_id: submenu.menu_id };
    setMenuId(newId);
    setIsUpdating(true);
    
    const { error } = await supabase
      .from('submenus')
      .update({ menu_id: newId, fecha_actualizacion: new Date().toISOString() })
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al mover submenu');
      setMenuId(submenu.menu_id);
      await registrarActualizacion('submenu', valorAnterior, { menu_id: newId }, 'mover_submenu', 'error', error.message);
    } else {
      await registrarActualizacion('submenu', valorAnterior, { id: submenu.id, menu_id: newId }, 'mover_submenu');
      toast.success('Submenu movido');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const isProtectedSubmenu = PROTECTED_SUBMENU_IDS.includes(submenu.id);

  const handleActivoChange = async (checked: boolean) => {
    if (isProtectedSubmenu && !checked) {
      toast.error('Este submenú no puede ser desactivado por seguridad');
      return;
    }
    
    const valorAnterior = { activo: submenu.activo };
    setActivo(checked);
    setIsUpdating(true);
    
    const { error } = await supabase
      .from('submenus')
      .update({ activo: checked, fecha_actualizacion: new Date().toISOString() })
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al actualizar estado');
      setActivo(submenu.activo);
      await registrarActualizacion('submenu', valorAnterior, { activo: checked }, 'actualizar_submenu', 'error', error.message);
    } else {
      await registrarActualizacion('submenu', valorAnterior, { id: submenu.id, activo: checked }, 'actualizar_submenu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const handleSoloUsuarioAChange = async (checked: boolean) => {
    const valorAnterior = { solo_usuarioa: submenu.solo_usuarioa };
    setSoloUsuarioA(checked);
    setIsUpdating(true);
    
    const { error } = await supabase
      .from('submenus')
      .update({ solo_usuarioa: checked, fecha_actualizacion: new Date().toISOString() })
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al actualizar restricción');
      setSoloUsuarioA(submenu.solo_usuarioa || false);
      await registrarActualizacion('submenu', valorAnterior, { solo_usuarioa: checked }, 'actualizar_submenu', 'error', error.message);
    } else {
      await registrarActualizacion('submenu', valorAnterior, { id: submenu.id, solo_usuarioa: checked }, 'actualizar_submenu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const handleDelete = async () => {
    if (isProtectedSubmenu) {
      toast.error('Este submenú no puede ser eliminado por seguridad');
      return;
    }
    
    setIsUpdating(true);
    const valorAnterior = { id: submenu.id, nombre: submenu.nombre, vista_front_end: submenu.vista_front_end };
    
    // First delete related permissions
    await supabase
      .from('submenus_permisos')
      .delete()
      .eq('submenu_id', submenu.id);
    
    const { error } = await supabase
      .from('submenus')
      .delete()
      .eq('id', submenu.id);

    if (error) {
      toast.error('Error al eliminar submenu');
      await registrarEliminacion('submenu', valorAnterior, 'eliminar_submenu', 'error', error.message);
    } else {
      await registrarEliminacion('submenu', valorAnterior, 'eliminar_submenu');
      toast.success('Submenu eliminado');
      onUpdate();
    }
    setIsUpdating(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 bg-muted/50 border rounded ${
        isDragging ? 'shadow-md ring-2 ring-primary' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={handleNombreBlur}
        className="max-w-[130px] h-7 text-sm"
        placeholder="Nombre"
        disabled={isUpdating}
      />
      
      <div className="flex items-center gap-1 flex-1">
        <Input
          value={vistaFrontEnd}
          onChange={(e) => setVistaFrontEnd(e.target.value)}
          onBlur={handleRutaBlur}
          className="max-w-[180px] h-7 text-sm"
          placeholder="/admin/..."
          disabled={isUpdating}
        />
        {vistaFrontEnd && !routeIsValid && (
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                Esta ruta no existe en el código. Deberás crear la página manualmente.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Select value={menuId.toString()} onValueChange={handleMenuChange} disabled={isUpdating}>
        <SelectTrigger className="w-[120px] h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {menus.map(menu => (
            <SelectItem key={menu.id} value={menu.id.toString()} className="text-xs">
              {menu.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Activo</span>
        <Switch
          checked={activo}
          onCheckedChange={handleActivoChange}
          disabled={isUpdating || isProtectedSubmenu}
          className="scale-75"
        />
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Solo Usuario A</span>
        <Switch
          checked={soloUsuarioA}
          onCheckedChange={handleSoloUsuarioAChange}
          disabled={isUpdating}
          className="scale-75"
        />
      </div>
      
      <span className="text-xs text-muted-foreground min-w-[50px] text-right">Orden: {submenu.orden}</span>
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isUpdating || isProtectedSubmenu}>
            <Trash2 className={`h-3 w-3 ${isProtectedSubmenu ? 'text-muted-foreground' : 'text-destructive'}`} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar submenu?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{submenu.nombre}" y todos sus permisos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}