import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";

type Producto = {
  id: number;
  nombre: string;
  descripcion?: string;
  sat_id?: string;
  id_unidad_sat?: string;
  id_categoria: number;
  id_persona: number;
  stock: number;
  activo: boolean;
  categoria_nombre?: string;
  persona_nombre?: string;
  unidad_sat_descripcion?: string;
};

export default function Productos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Producto | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Producto | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Producto | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    sat_id: "",
    id_unidad_sat: "",
    id_categoria: "",
    id_persona: "",
    stock: 0,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const itemsPerPage = 10;

  const fetchProductos = async (activo: boolean) => {
    const { data, error } = await supabase
      .from('productos_servicios')
      .select(`
        *,
        categorias_producto (nombre),
        personas (nombre_legal),
        unidades_sat (descripcion)
      `)
      .eq('activo', activo)
      .eq('es_producto', true)
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    
    return (data || []).map((item: any) => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      sat_id: item.sat_id,
      id_unidad_sat: item.id_unidad_sat,
      id_categoria: item.id_categoria,
      id_persona: item.id_persona,
      stock: item.stock,
      activo: item.activo,
      categoria_nombre: item.categorias_producto?.nombre,
      persona_nombre: item.personas?.nombre_legal,
      unidad_sat_descripcion: item.unidades_sat?.descripcion,
    })) as Producto[];
  };

  // Fetch categorías
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_producto')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch personas
  const { data: personas = [] } = useQuery({
    queryKey: ['personas-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal')
        .eq('activo', true)
        .order('nombre_legal');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch unidades SAT
  const { data: unidadesSat = [] } = useQuery({
    queryKey: ['unidades-sat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unidades_sat')
        .select('*')
        .eq('activo', true)
        .order('descripcion');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeProductos = [], isLoading: loadingActive } = useQuery({
    queryKey: ['productos', 'active'],
    queryFn: () => fetchProductos(true),
  });

  const { data: deletedProductos = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['productos', 'deleted'],
    queryFn: () => fetchProductos(false),
  });

  const productos = activeTab === 'active' ? activeProductos : deletedProductos;
  const filteredProductos = productos.filter(producto => 
    producto.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    producto.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    producto.sat_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProductos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProductos = filteredProductos.slice(startIndex, endIndex);

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
      descripcion: "",
      sat_id: "",
      id_unidad_sat: "",
      id_categoria: "",
      id_persona: "",
      stock: 0,
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('productos_servicios')
        .insert([{
          ...data,
          es_producto: true,
          id_categoria: parseInt(data.id_categoria),
          id_persona: parseInt(data.id_persona),
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setIsNewDialogOpen(false);
      resetForm();
      toast({
        title: "Éxito",
        description: "Producto creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('productos_servicios')
        .update({
          ...data,
          id_categoria: parseInt(data.id_categoria),
          id_persona: parseInt(data.id_persona),
        })
        .eq('id', editingEntity?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      resetForm();
      toast({
        title: "Éxito",
        description: "Producto actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('productos_servicios')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Producto eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('productos_servicios')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Producto restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el producto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (producto: Producto) => {
    setEditingEntity(producto);
    setFormData({
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      sat_id: producto.sat_id || "",
      id_unidad_sat: producto.id_unidad_sat || "",
      id_categoria: producto.id_categoria.toString(),
      id_persona: producto.id_persona.toString(),
      stock: producto.stock,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (producto: Producto) => {
    setEntityToDelete(producto);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (producto: Producto) => {
    setEntityToRestore(producto);
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
            <div className="text-muted-foreground">Obteniendo productos</div>
          </div>
        </div>
      );
    }

    if (paginatedProductos.length === 0) {
      return (
        <div className="text-center py-8">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-lg font-medium mb-2">
            {searchTerm ? "No se encontraron resultados" : "No hay productos"}
          </div>
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Intenta con otros términos de búsqueda" 
              : "Comienza agregando tu primer producto"
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
              <TableHead className="font-semibold">Descripción</TableHead>
              <TableHead className="font-semibold">Categoría</TableHead>
              <TableHead className="font-semibold">Stock</TableHead>
              <TableHead className="font-semibold">SAT ID</TableHead>
              <TableHead className="font-semibold">Unidad SAT</TableHead>
              <TableHead className="font-semibold">Persona</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProductos.map((producto) => (
              <TableRow 
                key={producto.id} 
                className={`hover:bg-muted/30 transition-colors ${!producto.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-medium">{producto.nombre}</TableCell>
                <TableCell className="max-w-xs truncate">{producto.descripcion || '-'}</TableCell>
                <TableCell>{producto.categoria_nombre || '-'}</TableCell>
                <TableCell>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                    {producto.stock}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{producto.sat_id || '-'}</TableCell>
                <TableCell>{producto.unidad_sat_descripcion || '-'}</TableCell>
                <TableCell>{producto.persona_nombre || '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    {producto.activo ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(producto)}
                          className="hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(producto)}
                          className="hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(producto)}
                        className="hover:bg-green-50 hover:text-green-600"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
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
          <h1 className="text-3xl font-bold text-foreground">Productos</h1>
          <p className="text-muted-foreground">Gestiona los productos del sistema</p>
        </div>
        <Button onClick={() => {
          resetForm();
          setIsNewDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Producto
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Lista de Productos</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="active">Activos ({activeProductos.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedProductos.length})</TabsTrigger>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sat_id">SAT ID</Label>
                <Input
                  id="sat_id"
                  value={formData.sat_id}
                  onChange={(e) => setFormData({ ...formData, sat_id: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id_categoria">Categoría *</Label>
                <Select
                  value={formData.id_categoria}
                  onValueChange={(value) => setFormData({ ...formData, id_categoria: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="id_unidad_sat">Unidad SAT</Label>
                <Select
                  value={formData.id_unidad_sat}
                  onValueChange={(value) => setFormData({ ...formData, id_unidad_sat: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona unidad SAT" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesSat.map((unidad: any) => (
                      <SelectItem key={unidad.clave} value={unidad.clave}>
                        {unidad.descripcion} ({unidad.clave})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id_persona">Persona *</Label>
                <Select
                  value={formData.id_persona}
                  onValueChange={(value) => setFormData({ ...formData, id_persona: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona: any) => (
                      <SelectItem key={persona.id} value={persona.id.toString()}>
                        {persona.nombre_legal}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                />
              </div>
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
        title="Eliminar Producto"
        description={`¿Estás seguro de que deseas eliminar el producto "${entityToDelete?.nombre}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Producto"
        description={`¿Estás seguro de que deseas restaurar el producto "${entityToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}