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
  id_entidad_relacionada_dueno: number;
  stock: number;
  activo: boolean;
  precio_lista: number;
  categoria_nombre?: string;
  dueno_nombre?: string;
  unidad_sat_descripcion?: string;
};

export default function Productos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
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
    id_entidad_relacionada_dueno: "",
    stock: 0,
    precio_lista: 0,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const itemsPerPage = 20;
  const currentPage = activeTab === 'active' ? currentPageActive : currentPageDeleted;

  const fetchProductos = async (activo: boolean) => {
    const { data, error } = await supabase
      .from('productos_servicios')
      .select(`
        *,
        categorias_producto!productos_servicios_id_categoria_fkey (nombre),
        entidades_relacionadas!productos_servicios_id_entidad_relacionada_dueno_fkey (
          personas!entidades_relacionadas_id_persona_fkey (nombre_legal)
        ),
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
      id_entidad_relacionada_dueno: item.id_entidad_relacionada_dueno,
      stock: item.stock,
      activo: item.activo,
      precio_lista: item.precio_lista || 0,
      categoria_nombre: item.categorias_producto?.nombre,
      dueno_nombre: item.entidades_relacionadas?.personas?.nombre_legal,
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

  // Fetch entidades relacionadas - solo entidades legales de tipo Contratista (13), Dueño Vendedor (4), Proveedor (8)
  // filtradas por proyectos de tipo "Productos" (id_tipo_uso = 9)
  const { data: entidadesRelacionadas = [] } = useQuery({
    queryKey: ['entidades-relacionadas-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            nombre_legal
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id_tipo_uso
          )
        `)
        .in('id_tipo_entidad', [4, 8, 13])
        .eq('activo', true)
        .not('id_proyecto', 'is', null);
      if (error) throw error;
      
      // Filtrar solo entidades de proyectos de tipo "Productos" (id_tipo_uso = 9)
      const filteredData = (data || []).filter((item: any) => 
        item.proyectos && item.proyectos.id_tipo_uso === 9
      );
      
      return filteredData.map((item: any) => ({
        id: item.id,
        nombre_legal: item.personas?.nombre_legal || 'Sin nombre'
      })).sort((a, b) => 
        a.nombre_legal.localeCompare(b.nombre_legal)
      );
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

  const { data: activeProductosData, isLoading: loadingActive } = useQuery({
    queryKey: ['productos', 'active', currentPageActive, searchTerm],
    queryFn: async () => {
      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('productos_servicios')
        .select(`
          *,
          categorias_producto!productos_servicios_id_categoria_fkey (nombre),
          entidades_relacionadas!productos_servicios_id_entidad_relacionada_dueno_fkey (
            personas!entidades_relacionadas_id_persona_fkey (nombre_legal)
          ),
          unidades_sat (descripcion)
        `, { count: 'exact' })
        .eq('activo', true)
        .eq('es_producto', true);
      
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,sat_id.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre', { ascending: true })
        .range(from, to);
      
      if (error) throw error;
      
      const productos = (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        sat_id: item.sat_id,
        id_unidad_sat: item.id_unidad_sat,
        id_categoria: item.id_categoria,
        id_entidad_relacionada_dueno: item.id_entidad_relacionada_dueno,
        stock: item.stock,
        activo: item.activo,
        precio_lista: item.precio_lista || 0,
        categoria_nombre: item.categorias_producto?.nombre,
        dueno_nombre: item.entidades_relacionadas?.personas?.nombre_legal,
        unidad_sat_descripcion: item.unidades_sat?.descripcion,
      })) as Producto[];

      return { productos, count: count || 0 };
    },
  });

  const { data: deletedProductosData, isLoading: loadingDeleted } = useQuery({
    queryKey: ['productos', 'deleted', currentPageDeleted, searchTerm],
    queryFn: async () => {
      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('productos_servicios')
        .select(`
          *,
          categorias_producto!productos_servicios_id_categoria_fkey (nombre),
          entidades_relacionadas!productos_servicios_id_entidad_relacionada_dueno_fkey (
            personas!entidades_relacionadas_id_persona_fkey (nombre_legal)
          ),
          unidades_sat (descripcion)
        `, { count: 'exact' })
        .eq('activo', false)
        .eq('es_producto', true);
      
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,sat_id.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre', { ascending: true })
        .range(from, to);
      
      if (error) throw error;
      
      const productos = (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        sat_id: item.sat_id,
        id_unidad_sat: item.id_unidad_sat,
        id_categoria: item.id_categoria,
        id_entidad_relacionada_dueno: item.id_entidad_relacionada_dueno,
        stock: item.stock,
        activo: item.activo,
        precio_lista: item.precio_lista || 0,
        categoria_nombre: item.categorias_producto?.nombre,
        dueno_nombre: item.entidades_relacionadas?.personas?.nombre_legal,
        unidad_sat_descripcion: item.unidades_sat?.descripcion,
      })) as Producto[];

      return { productos, count: count || 0 };
    },
    enabled: activeTab === 'deleted',
  });

  const activeProductos = activeProductosData?.productos || [];
  const totalActivosCount = activeProductosData?.count || 0;
  const deletedProductos = deletedProductosData?.productos || [];
  const totalEliminadosCount = deletedProductosData?.count || 0;

  const productos = activeTab === 'active' ? activeProductos : deletedProductos;
  const totalCount = activeTab === 'active' ? totalActivosCount : totalEliminadosCount;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'active') {
      setCurrentPageActive(1);
    } else {
      setCurrentPageDeleted(1);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPageActive(1);
    setCurrentPageDeleted(1);
  };

  const setCurrentPage = (page: number) => {
    if (activeTab === 'active') {
      setCurrentPageActive(page);
    } else {
      setCurrentPageDeleted(page);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: "",
      descripcion: "",
      sat_id: "",
      id_unidad_sat: "",
      id_categoria: "",
      id_entidad_relacionada_dueno: "",
      stock: 0,
      precio_lista: 0,
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
          id_entidad_relacionada_dueno: parseInt(data.id_entidad_relacionada_dueno),
          id_unidad_sat: data.id_unidad_sat === "" ? null : data.id_unidad_sat,
          sat_id: data.sat_id === "" ? null : data.sat_id,
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
          id_entidad_relacionada_dueno: parseInt(data.id_entidad_relacionada_dueno),
          id_unidad_sat: data.id_unidad_sat === "" ? null : data.id_unidad_sat,
          sat_id: data.sat_id === "" ? null : data.sat_id,
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
      id_entidad_relacionada_dueno: producto.id_entidad_relacionada_dueno.toString(),
      stock: producto.stock,
      precio_lista: producto.precio_lista || 0,
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

    if (productos.length === 0) {
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
              <TableHead className="font-semibold">Precio Lista</TableHead>
              <TableHead className="font-semibold">Stock</TableHead>
              <TableHead className="font-semibold">SAT ID</TableHead>
              <TableHead className="font-semibold">Unidad SAT</TableHead>
              <TableHead className="font-semibold">Dueño</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((producto) => (
              <TableRow 
                key={producto.id} 
                className={`hover:bg-muted/30 transition-colors ${!producto.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-medium">{producto.nombre}</TableCell>
                <TableCell className="max-w-xs truncate">{producto.descripcion || '-'}</TableCell>
                <TableCell>{producto.categoria_nombre || '-'}</TableCell>
                <TableCell>
                  <span className="font-semibold">
                    ${parseFloat(producto.precio_lista.toString()).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                    {producto.stock}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{producto.sat_id || '-'}</TableCell>
                <TableCell>{producto.unidad_sat_descripcion || '-'}</TableCell>
                <TableCell>{producto.dueno_nombre || '-'}</TableCell>
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
      <div className="mt-6 flex justify-center flex-col items-center gap-2">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                    className="cursor-pointer"
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
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <div className="text-sm text-muted-foreground">
          Página {currentPage} de {totalPages} ({totalCount} productos)
        </div>
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
              <TabsTrigger value="active">Activos ({totalActivosCount})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({totalEliminadosCount})</TabsTrigger>
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
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                required
              />
            </div>

            {/* Categoría */}
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

            {/* Dueño */}
            <div className="space-y-2">
              <Label htmlFor="id_entidad_relacionada_dueno">Dueño *</Label>
              <Select
                value={formData.id_entidad_relacionada_dueno}
                onValueChange={(value) => setFormData({ ...formData, id_entidad_relacionada_dueno: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un dueño" />
                </SelectTrigger>
                <SelectContent>
                  {entidadesRelacionadas.map((entidad: any) => (
                    <SelectItem key={entidad.id} value={entidad.id.toString()}>
                      {entidad.nombre_legal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={3}
              />
            </div>

            {/* SAT ID */}
            <div className="space-y-2">
              <Label htmlFor="sat_id">SAT ID</Label>
              <Input
                id="sat_id"
                value={formData.sat_id}
                onChange={(e) => setFormData({ ...formData, sat_id: e.target.value })}
              />
            </div>

            {/* Unidad SAT */}
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

            {/* Stock */}
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

            {/* Precio Lista */}
            <div className="space-y-2">
              <Label htmlFor="precio_lista">
                {categorias.find((cat: any) => cat.id.toString() === formData.id_categoria)?.tiene_metraje 
                  ? "Precio por m²" 
                  : "Precio Lista"}
              </Label>
              <Input
                id="precio_lista"
                type="number"
                min="0"
                step="0.01"
                value={formData.precio_lista}
                onChange={(e) => setFormData({ ...formData, precio_lista: parseFloat(e.target.value) || 0 })}
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