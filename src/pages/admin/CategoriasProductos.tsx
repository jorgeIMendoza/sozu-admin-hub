import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, FolderOpen } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";

type Categoria = {
  id: number;
  nombre: string;
  activo: boolean;
  productos_count: number;
  servicios_count: number;
};

export default function CategoriasProductos() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin, isLoading: permissionsLoading } = 
    usePagePermissions('/admin/categorias-productos');
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Categoria | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Categoria | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Categoria | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const showDeletedTab = canDelete || isSuperAdmin;
  
  const itemsPerPage = 10;

  const fetchCategorias = async (activo: boolean) => {
    const { data, error } = await supabase
      .from('categorias_producto')
      .select('*')
      .eq('activo', activo)
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    
    // Get product and service counts
    const categoriaIds = (data || []).map(cat => cat.id);
    let counts: { [key: number]: { productos: number; servicios: number } } = {};
    
    if (categoriaIds.length > 0) {
      const { data: productosData, error: productosError } = await supabase
        .from('productos_servicios')
        .select('id_categoria, es_producto')
        .in('id_categoria', categoriaIds)
        .eq('activo', true);
      
      if (!productosError && productosData) {
        productosData.forEach(item => {
          if (!counts[item.id_categoria]) {
            counts[item.id_categoria] = { productos: 0, servicios: 0 };
          }
          if (item.es_producto) {
            counts[item.id_categoria].productos += 1;
          } else {
            counts[item.id_categoria].servicios += 1;
          }
        });
      }
    }
    
    return (data || []).map((item: any) => ({
      id: item.id,
      nombre: item.nombre,
      activo: item.activo,
      productos_count: counts[item.id]?.productos || 0,
      servicios_count: counts[item.id]?.servicios || 0,
    })) as Categoria[];
  };

  const { data: activeCategorias = [], isLoading: loadingActive } = useQuery({
    queryKey: ['categorias', 'active'],
    queryFn: () => fetchCategorias(true),
  });

  const { data: deletedCategorias = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['categorias', 'deleted'],
    queryFn: () => fetchCategorias(false),
  });

  const categorias = activeTab === 'active' ? activeCategorias : deletedCategorias;
  const filteredCategorias = categorias.filter(categoria => 
    categoria.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredCategorias.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCategorias = filteredCategorias.slice(startIndex, endIndex);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const resetForm = () => {
    setFormData({
      nombre: "",
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('categorias_producto')
        .insert([data]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setIsNewDialogOpen(false);
      resetForm();
      toast({
        title: "Éxito",
        description: "Categoría creada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear la categoría: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('categorias_producto')
        .update(data)
        .eq('id', editingEntity?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      resetForm();
      toast({
        title: "Éxito",
        description: "Categoría actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar la categoría: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('categorias_producto')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Categoría eliminada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar la categoría: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('categorias_producto')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Categoría restaurada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar la categoría: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (categoria: Categoria) => {
    setEditingEntity(categoria);
    setFormData({
      nombre: categoria.nombre,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (categoria: Categoria) => {
    setEntityToDelete(categoria);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (categoria: Categoria) => {
    setEntityToRestore(categoria);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (entityToRestore) {
      restoreMutation.mutate(entityToRestore.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEntity) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  function renderTable() {
    if (loadingActive || loadingDeleted) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-center">
            <div className="text-lg mb-2">Cargando...</div>
            <div className="text-muted-foreground">Obteniendo categorías</div>
          </div>
        </div>
      );
    }

    if (paginatedCategorias.length === 0) {
      return (
        <div className="text-center py-8">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-lg font-medium mb-2">
            {searchTerm ? "No se encontraron resultados" : "No hay categorías"}
          </div>
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Intenta con otros términos de búsqueda" 
              : "Comienza agregando tu primera categoría"
            }
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Nombre</TableHead>
              <TableHead className="font-semibold">Productos</TableHead>
              <TableHead className="font-semibold">Servicios</TableHead>
              <TableHead className="font-semibold">Total Items</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCategorias.map((categoria) => (
              <TableRow 
                key={categoria.id} 
                className={`hover:bg-muted/30 transition-colors ${!categoria.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-medium">{categoria.nombre}</TableCell>
                <TableCell>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                    {categoria.productos_count}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">
                    {categoria.servicios_count}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                    {categoria.productos_count + categoria.servicios_count}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    {categoria.activo ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(categoria)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(categoria)}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      (canApprove || isSuperAdmin) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(categoria)}
                          className="hover:bg-green-50 hover:text-green-600"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderPagination() {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-6 flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(pageNum);
                    }}
                    isActive={currentPage === pageNum}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            
            <PaginationItem>
              <PaginationNext 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                }}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Categorías de Productos</h1>
          <p className="text-muted-foreground">Gestiona las categorías de productos y servicios</p>
        </div>
        {(canCreate || isSuperAdmin) && (
          <Button onClick={() => {
            resetForm();
            setIsNewDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Categoría
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Lista de Categorías</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar categorías..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className={`grid w-full ${showDeletedTab ? 'grid-cols-2' : 'grid-cols-1'} mb-4`}>
              <TabsTrigger value="active">Activas ({activeCategorias.length})</TabsTrigger>
              {showDeletedTab && (
                <TabsTrigger value="deleted">Eliminadas ({deletedCategorias.length})</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="active">
              {renderTable()}
              {renderPagination()}
            </TabsContent>
            
            <TabsContent value="deleted">
              {renderTable()}
              {renderPagination()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isNewDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsNewDialogOpen(false);
          setIsEditDialogOpen(false);
          setEditingEntity(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                required
                placeholder="Ej: Electrodomésticos, Herramientas, etc."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setIsNewDialogOpen(false);
                setIsEditDialogOpen(false);
                setEditingEntity(null);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingEntity ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Categoría"
        description={`¿Estás seguro de que deseas eliminar la categoría "${entityToDelete?.nombre}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Categoría"
        description={`¿Estás seguro de que deseas restaurar la categoría "${entityToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}