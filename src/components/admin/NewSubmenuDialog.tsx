import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isValidRoute } from '@/utils/validRoutes';

interface Menu {
  id: number;
  nombre: string;
}

interface Submenu {
  id: number;
  nombre: string;
}

interface Permiso {
  id: number;
  nombre: string;
}

interface NewSubmenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menus: Menu[];
  existingSubmenus?: Submenu[];
  preselectedMenuId?: number | null;
  onSuccess: () => void;
}

export function NewSubmenuDialog({ open, onOpenChange, menus, existingSubmenus = [], preselectedMenuId, onSuccess }: NewSubmenuDialogProps) {
  const [menuId, setMenuId] = useState<string>('');
  const [nombre, setNombre] = useState('');
  const [vistaFrontEnd, setVistaFrontEnd] = useState('');
  const [soloUsuarioA, setSoloUsuarioA] = useState(false);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [selectedPermisos, setSelectedPermisos] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchPermisos = async () => {
      const { data } = await supabase.from('permisos').select('id, nombre').eq('activo', true);
      if (data) setPermisos(data);
    };
    if (open) {
      fetchPermisos();
      // Set preselected menu if provided
      if (preselectedMenuId) {
        setMenuId(preselectedMenuId.toString());
      }
    }
  }, [open, preselectedMenuId]);

  const resetForm = () => {
    setMenuId('');
    setNombre('');
    setVistaFrontEnd('');
    setSoloUsuarioA(false);
    setSelectedPermisos([]);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  // Validar nombre duplicado
  const isNameDuplicate = () => {
    const normalizedName = nombre.trim().toLowerCase();
    // Verificar contra submenus existentes
    const duplicateSubmenu = existingSubmenus.find(
      s => s.nombre.trim().toLowerCase() === normalizedName
    );
    // Verificar contra menus
    const duplicateMenu = menus.find(
      m => m.nombre.trim().toLowerCase() === normalizedName
    );
    return duplicateSubmenu || duplicateMenu;
  };

  const routeIsValid = isValidRoute(vistaFrontEnd);
  const nameDuplicate = isNameDuplicate();
  const isFormValid = menuId && nombre.length >= 3 && vistaFrontEnd.startsWith('/admin/') && selectedPermisos.length > 0 && !nameDuplicate;

  const handlePermisoToggle = (permisoId: number) => {
    setSelectedPermisos(prev => 
      prev.includes(permisoId) 
        ? prev.filter(id => id !== permisoId)
        : [...prev, permisoId]
    );
  };

  const handleCreate = async () => {
    setIsLoading(true);
    
    try {
      // Get max orden for the selected menu
      const { data: maxOrdenData } = await supabase
        .from('submenus')
        .select('orden')
        .eq('menu_id', parseInt(menuId))
        .order('orden', { ascending: false })
        .limit(1);
      
      const nextOrden = (maxOrdenData?.[0]?.orden || 0) + 1;
      
      // Insert submenu
      const { data: submenuData, error: submenuError } = await supabase
        .from('submenus')
        .insert({
          nombre,
          menu_id: parseInt(menuId),
          vista_front_end: vistaFrontEnd,
          orden: nextOrden,
          activo: true,
          solo_usuarioA: soloUsuarioA,
        })
        .select('id')
        .single();

      if (submenuError) throw submenuError;

      // Insert permissions for Super Admin (rol_id = 1)
      const permissionsToInsert = selectedPermisos.map(permisoId => ({
        submenu_id: submenuData.id,
        permiso_id: permisoId,
        rol_id: 1,
        activo: true,
      }));

      const { error: permisosError } = await supabase
        .from('submenus_permisos')
        .insert(permissionsToInsert);

      if (permisosError) throw permisosError;

      toast.success('Submenu creado exitosamente');
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating submenu:', error);
      toast.error('Error al crear submenu');
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  const getSelectedMenuName = () => {
    const menu = menus.find(m => m.id.toString() === menuId);
    return menu?.nombre || '';
  };

  const getSelectedPermisosNames = () => {
    return permisos
      .filter(p => selectedPermisos.includes(p.id))
      .map(p => p.nombre)
      .join(', ');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Submenu</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Menu padre *</Label>
              <Select value={menuId} onValueChange={setMenuId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar menu" />
                </SelectTrigger>
                <SelectContent>
                  {menus.map(menu => (
                    <SelectItem key={menu.id} value={menu.id.toString()}>
                      {menu.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del submenu"
              />
              {nombre.length > 0 && nombre.length < 3 && (
                <p className="text-xs text-destructive">Mínimo 3 caracteres</p>
              )}
              {nombre.length >= 3 && nameDuplicate && (
                <p className="text-xs text-destructive">Ya existe un menú o submenú con ese nombre</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Ruta frontend *</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={vistaFrontEnd}
                  onChange={(e) => setVistaFrontEnd(e.target.value)}
                  placeholder="/admin/mi-nueva-ruta"
                />
                {vistaFrontEnd && !routeIsValid && (
                  <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                )}
              </div>
              {vistaFrontEnd && !vistaFrontEnd.startsWith('/admin/') && (
                <p className="text-xs text-destructive">Debe empezar con /admin/</p>
              )}
              {vistaFrontEnd && !routeIsValid && vistaFrontEnd.startsWith('/admin/') && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  ⚠️ Esta ruta no existe en el código. Deberás crear la página en src/pages/admin/ y registrar la ruta en src/App.tsx
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <Label>Solo Usuario A</Label>
              <Switch
                checked={soloUsuarioA}
                onCheckedChange={setSoloUsuarioA}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Permisos para Super Admin *</Label>
              <div className="flex flex-wrap gap-3 p-3 border rounded-md">
                {permisos.map(permiso => (
                  <div key={permiso.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`permiso-${permiso.id}`}
                      checked={selectedPermisos.includes(permiso.id)}
                      onCheckedChange={() => handlePermisoToggle(permiso.id)}
                    />
                    <label htmlFor={`permiso-${permiso.id}`} className="text-sm capitalize">
                      {permiso.nombre}
                    </label>
                  </div>
                ))}
              </div>
              {selectedPermisos.length === 0 && (
                <p className="text-xs text-muted-foreground">Selecciona al menos 1 permiso</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              onClick={() => setShowConfirm(true)} 
              disabled={!isFormValid || isLoading}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar creación</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>¿Crear submenu con estos detalles?</p>
                <ul className="text-sm space-y-1 mt-2">
                  <li><strong>Menu:</strong> {getSelectedMenuName()}</li>
                  <li><strong>Nombre:</strong> {nombre}</li>
                  <li><strong>Ruta:</strong> {vistaFrontEnd}</li>
                  <li><strong>Solo Usuario A:</strong> {soloUsuarioA ? 'Sí' : 'No'}</li>
                  <li><strong>Permisos:</strong> {getSelectedPermisosNames()}</li>
                </ul>
                {!routeIsValid && (
                  <p className="text-amber-600 dark:text-amber-500 text-xs mt-3">
                    ⚠️ Recuerda crear la página manualmente después
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={isLoading}>
              {isLoading ? 'Creando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
