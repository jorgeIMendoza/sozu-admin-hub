import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface Menu {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

interface SortableMenuCardProps {
  menu: Menu;
  onUpdate: () => void;
}

// Menu IDs that cannot be deactivated for safety
const PROTECTED_MENU_IDS = [13]; // Configuraciones/Logs

export function SortableMenuCard({ menu, onUpdate }: SortableMenuCardProps) {
  const [nombre, setNombre] = useState(menu.nombre);
  const [activo, setActivo] = useState(menu.activo);
  const [isUpdating, setIsUpdating] = useState(false);
  const { registrarActualizacion } = useActivityLogger();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menu.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    setNombre(menu.nombre);
    setActivo(menu.activo);
  }, [menu.nombre, menu.activo]);

  const handleNombreBlur = async () => {
    if (nombre === menu.nombre) return;
    
    setIsUpdating(true);
    const valorAnterior = { nombre: menu.nombre };
    const { error } = await supabase
      .from('menus')
      .update({ nombre, fecha_actualizacion: new Date().toISOString() })
      .eq('id', menu.id);

    if (error) {
      toast.error('Error al actualizar nombre');
      setNombre(menu.nombre);
      await registrarActualizacion('menu', valorAnterior, { nombre }, 'actualizar_menu', 'error', error.message);
    } else {
      await registrarActualizacion('menu', valorAnterior, { id: menu.id, nombre }, 'actualizar_menu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  const isProtectedMenu = PROTECTED_MENU_IDS.includes(menu.id);

  const handleActivoChange = async (checked: boolean) => {
    if (isProtectedMenu && !checked) {
      toast.error('Este menú no puede ser desactivado por seguridad');
      return;
    }
    
    const valorAnterior = { activo: menu.activo };
    setActivo(checked);
    setIsUpdating(true);
    
    const { error } = await supabase
      .from('menus')
      .update({ activo: checked, fecha_actualizacion: new Date().toISOString() })
      .eq('id', menu.id);

    if (error) {
      toast.error('Error al actualizar estado');
      setActivo(menu.activo);
      await registrarActualizacion('menu', valorAnterior, { activo: checked }, 'actualizar_menu', 'error', error.message);
    } else {
      await registrarActualizacion('menu', valorAnterior, { id: menu.id, activo: checked }, 'actualizar_menu');
      onUpdate();
    }
    setIsUpdating(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-card border rounded-lg shadow-sm ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      
      <div className="flex-1 flex items-center gap-3">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={handleNombreBlur}
          className="max-w-[200px] h-8"
          disabled={isUpdating}
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Activo</span>
          <Switch
            checked={activo}
            onCheckedChange={handleActivoChange}
            disabled={isUpdating || isProtectedMenu}
          />
        </div>
      </div>
      
      <span className="text-xs text-muted-foreground">Orden: {menu.orden}</span>
    </div>
  );
}
