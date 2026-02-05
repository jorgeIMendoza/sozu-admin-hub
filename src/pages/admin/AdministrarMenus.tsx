import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Plus, Settings, Shield } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { SortableMenuCard } from '@/components/admin/SortableMenuCard';
import { SortableSubmenuRow } from '@/components/admin/SortableSubmenuRow';
import { NewSubmenuDialog } from '@/components/admin/NewSubmenuDialog';
import { SubmenuPermissionsDialog } from '@/components/admin/SubmenuPermissionsDialog';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface Menu {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

interface Submenu {
  id: number;
  nombre: string;
  vista_front_end: string | null;
  menu_id: number;
  orden: number;
  activo: boolean;
  solo_usuarioa?: boolean;
}

export default function AdministrarMenus() {
  const queryClient = useQueryClient();
  const [expandedMenus, setExpandedMenus] = useState<Set<number>>(new Set());
  const [showNewSubmenuDialog, setShowNewSubmenuDialog] = useState(false);
  const [selectedMenuForNewSubmenu, setSelectedMenuForNewSubmenu] = useState<number | null>(null);
  const [selectedSubmenuForPermissions, setSelectedSubmenuForPermissions] = useState<Submenu | null>(null);
  const { registrarActualizacion } = useActivityLogger();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: menus = [], isLoading: loadingMenus } = useQuery({
    queryKey: ['admin-menus'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menus')
        .select('id, nombre, orden, activo')
        .order('orden');
      if (error) throw error;
      return data as Menu[];
    },
  });

  const { data: submenus = [], isLoading: loadingSubmenus } = useQuery({
    queryKey: ['admin-submenus'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submenus')
        .select('id, nombre, vista_front_end, menu_id, orden, activo, solo_usuarioa')
        .order('orden');
      if (error) throw error;
      return data as unknown as Submenu[];
    },
  });

  const toggleMenu = (menuId: number) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuId)) {
        newSet.delete(menuId);
      } else {
        newSet.add(menuId);
      }
      return newSet;
    });
  };

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
    queryClient.invalidateQueries({ queryKey: ['admin-submenus'] });
  };

  const handleMenuDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = menus.findIndex(m => m.id === active.id);
    const newIndex = menus.findIndex(m => m.id === over.id);
    
    const newMenus = arrayMove(menus, oldIndex, newIndex);
    const valorAnterior = { orden: menus.map(m => ({ id: m.id, orden: m.orden })) };
    
    try {
      const updates = newMenus.map((menu, index) => 
        supabase
          .from('menus')
          .update({ orden: index + 1 })
          .eq('id', menu.id)
      );
      await Promise.all(updates);
      await registrarActualizacion('menus', valorAnterior, { orden: newMenus.map((m, i) => ({ id: m.id, orden: i + 1 })) }, 'reordenar_menus');
      toast.success('Orden actualizado');
      refetch();
    } catch (error) {
      await registrarActualizacion('menus', valorAnterior, {}, 'reordenar_menus', 'error', error instanceof Error ? error.message : 'Error');
      toast.error('Error al reordenar');
    }
  };

  const handleSubmenuDragEnd = async (event: DragEndEvent, menuId: number) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const menuSubmenus = submenus.filter(s => s.menu_id === menuId);
    const oldIndex = menuSubmenus.findIndex(s => `submenu-${s.id}` === active.id);
    const newIndex = menuSubmenus.findIndex(s => `submenu-${s.id}` === over.id);
    
    const newSubmenus = arrayMove(menuSubmenus, oldIndex, newIndex);
    const valorAnterior = { menu_id: menuId, orden: menuSubmenus.map(s => ({ id: s.id, orden: s.orden })) };
    
    try {
      const updates = newSubmenus.map((submenu, index) => 
        supabase
          .from('submenus')
          .update({ orden: index + 1 })
          .eq('id', submenu.id)
      );
      await Promise.all(updates);
      await registrarActualizacion('submenus', valorAnterior, { menu_id: menuId, orden: newSubmenus.map((s, i) => ({ id: s.id, orden: i + 1 })) }, 'reordenar_submenus');
      toast.success('Orden actualizado');
      refetch();
    } catch (error) {
      await registrarActualizacion('submenus', valorAnterior, {}, 'reordenar_submenus', 'error', error instanceof Error ? error.message : 'Error');
      toast.error('Error al reordenar');
    }
  };

  const handleAddSubmenu = (menuId: number) => {
    setSelectedMenuForNewSubmenu(menuId);
    setShowNewSubmenuDialog(true);
  };

  const isLoading = loadingMenus || loadingSubmenus;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Administrar Menus</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estructura de Navegación</CardTitle>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleMenuDragEnd}
            >
              <SortableContext
                items={menus.map(m => m.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {menus.map(menu => {
                    const menuSubmenus = submenus.filter(s => s.menu_id === menu.id);
                    const isExpanded = expandedMenus.has(menu.id);
                    
                    return (
                      <div key={menu.id} className="border rounded-lg overflow-hidden">
                        {/* Menu Header - Sortable */}
                        <div className="flex items-center gap-2 bg-card">
                          <div className="flex-1">
                            <SortableMenuCard
                              menu={menu}
                              onUpdate={refetch}
                            />
                          </div>
                          <Collapsible open={isExpanded} onOpenChange={() => toggleMenu(menu.id)}>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mr-2"
                              >
                                <span className="text-xs text-muted-foreground mr-1">
                                  ({menuSubmenus.length})
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </Collapsible>
                        </div>
                        
                        {/* Submenus - Collapsible */}
                        <Collapsible open={isExpanded}>
                          <CollapsibleContent>
                            <div className="border-t bg-muted/30 p-3 space-y-2">
                              {menuSubmenus.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2 text-center">
                                  Sin submenus
                                </p>
                              ) : (
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(e) => handleSubmenuDragEnd(e, menu.id)}
                                >
                                  <SortableContext
                                    items={menuSubmenus.map(s => `submenu-${s.id}`)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    {menuSubmenus.map(submenu => (
                                      <div key={submenu.id} className="flex items-center gap-1">
                                        <div className="flex-1">
                                          <SortableSubmenuRow
                                            submenu={submenu}
                                            menus={menus}
                                            allSubmenus={submenus}
                                            onUpdate={refetch}
                                          />
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => setSelectedSubmenuForPermissions(submenu)}
                                          title="Configurar permisos"
                                        >
                                          <Shield className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ))}
                                  </SortableContext>
                                </DndContext>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2"
                                onClick={() => handleAddSubmenu(menu.id)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Agregar Submenu
                              </Button>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      )}

      <NewSubmenuDialog
        open={showNewSubmenuDialog}
        onOpenChange={setShowNewSubmenuDialog}
        menus={menus}
        existingSubmenus={submenus}
        preselectedMenuId={selectedMenuForNewSubmenu}
        onSuccess={refetch}
      />

      <SubmenuPermissionsDialog
        submenu={selectedSubmenuForPermissions}
        onClose={() => setSelectedSubmenuForPermissions(null)}
      />
    </div>
  );
}
