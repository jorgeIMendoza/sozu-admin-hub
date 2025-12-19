import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Wrench } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
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

type Servicio = {
  id: number;
  nombre: string;
  descripcion?: string;
  sat_id?: string;
  id_unidad_sat?: string;
  id_categoria: number;
  id_entidad_relacionada_dueno: number;
  activo: boolean;
  precio_lista: number;
  categoria_nombre?: string;
  dueno_nombre?: string;
  unidad_sat_descripcion?: string;
};

export default function Servicios() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin, isLoading: permissionsLoading } = 
    usePagePermissions('/admin/servicios');
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Servicio | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Servicio | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Servicio | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    sat_id: "",
    id_unidad_sat: "",
    id_entidad_relacionada_dueno: "",
    precio_lista: 0,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const showDeletedTab = canDelete || isSuperAdmin;
  
  const itemsPerPage = 20;
  const currentPage = activeTab === 'active' ? currentPageActive : currentPageDeleted;

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
  // filtradas por proyectos de tipo "Servicios" (id_tipo_uso = 10)
  const { data: entidadesRelacionadas = [] } = useQuery({
    queryKey: ['entidades-relacionadas-servicios'],
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
      
      // Filtrar solo entidades de proyectos de tipo "Servicios" (id_tipo_uso = 10)
      const filteredData = (data || []).filter((item: any) => 
        item.proyectos && item.proyectos.id_tipo_uso === 10
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

  const { data: activeServiciosData, isLoading: loadingActive } = useQuery({
    queryKey: ['servicios', 'active', currentPageActive, searchTerm],
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
        .eq('es_producto', false);
      
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,sat_id.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre', { ascending: true })
        .range(from, to);
      
      if (error) throw error;
      
      const servicios = (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        sat_id: item.sat_id,
        id_unidad_sat: item.id_unidad_sat,
        id_categoria: item.id_categoria,
        id_entidad_relacionada_dueno: item.id_entidad_relacionada_dueno,
        activo: item.activo,
        precio_lista: item.precio_lista || 0,
        categoria_nombre: item.categorias_producto?.nombre,
        dueno_nombre: item.entidades_relacionadas?.personas?.nombre_legal,
        unidad_sat_descripcion: item.unidades_sat?.descripcion,
      })) as Servicio[];

      return { servicios, count: count || 0 };
    },
  });

  const { data: deletedServiciosData, isLoading: loadingDeleted } = useQuery({
    queryKey: ['servicios', 'deleted', currentPageDeleted, searchTerm],
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
        .eq('es_producto', false);
      
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,sat_id.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre', { ascending: true })
        .range(from, to);
      
      if (error) throw error;
      
      const servicios = (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        sat_id: item.sat_id,
        id_unidad_sat: item.id_unidad_sat,
        id_categoria: item.id_categoria,
        id_entidad_relacionada_dueno: item.id_entidad_relacionada_dueno,
        activo: item.activo,
        precio_lista: item.precio_lista || 0,
        categoria_nombre: item.categorias_producto?.nombre,
        dueno_nombre: item.entidades_relacionadas?.personas?.nombre_legal,
        unidad_sat_descripcion: item.unidades_sat?.descripcion,
      })) as Servicio[];

      return { servicios, count: count || 0 };
    },
    enabled: activeTab === 'deleted',
  });

  const activeServicios = activeServiciosData?.servicios || [];
  const totalActivosCount = activeServiciosData?.count || 0;
  const deletedServicios = deletedServiciosData?.servicios || [];
  const totalEliminadosCount = deletedServiciosData?.count || 0;

  const servicios = activeTab === 'active' ? activeServicios : deletedServicios;
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
      id_entidad_relacionada_dueno: "",
      precio_lista: 0,
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('productos_servicios')
        .insert([{
          ...data,
          es_producto: false,
          stock: 0,
          id_categoria: null,
          id_entidad_relacionada_dueno: parseInt(data.id_entidad_relacionada_dueno),
          id_unidad_sat: data.id_unidad_sat === "" ? null : data.id_unidad_sat,
          sat_id: data.sat_id === "" ? null : data.sat_id,
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicios'] });
      setIsNewDialogOpen(false);
      resetForm();
      toast({
        title: "Éxito",
        description: "Servicio creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el servicio: ${error.message}`,
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
          id_categoria: null,
          id_entidad_relacionada_dueno: parseInt(data.id_entidad_relacionada_dueno),
          id_unidad_sat: data.id_unidad_sat === "" ? null : data.id_unidad_sat,
          sat_id: data.sat_id === "" ? null : data.sat_id,
        })
        .eq('id', editingEntity?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicios'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      resetForm();
      toast({
        title: "Éxito",
        description: "Servicio actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el servicio: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['servicios'] });
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Servicio eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el servicio: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['servicios'] });
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Servicio restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el servicio: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (servicio: Servicio) => {
    setEditingEntity(servicio);
    setFormData({
      nombre: servicio.nombre,
      descripcion: servicio.descripcion || "",
      sat_id: servicio.sat_id || "",
      id_unidad_sat: servicio.id_unidad_sat || "",
      id_entidad_relacionada_dueno: servicio.id_entidad_relacionada_dueno.toString(),
      precio_lista: servicio.precio_lista || 0,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (servicio: Servicio) => {
    setEntityToDelete(servicio);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (servicio: Servicio) => {
    setEntityToRestore(servicio);
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
            <div className="text-muted-foreground">Obteniendo servicios</div>
          </div>
        </div>
      );
    }

    if (servicios.length === 0) {
      return (
        <div className="text-center py-8">
          <Wrench className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-lg font-medium mb-2">
            {searchTerm ? "No se encontraron resultados" : "No hay servicios"}
          </div>
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Intenta con otros términos de búsqueda" 
              : "Comienza agregando tu primer servicio"
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
              <TableHead className="font-semibold">Precio Lista</TableHead>
              <TableHead className="font-semibold">SAT ID</TableHead>
              <TableHead className="font-semibold">Unidad SAT</TableHead>
              <TableHead className="font-semibold">Dueño</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicios.map((servicio) => (
              <TableRow 
                key={servicio.id} 
                className={`hover:bg-muted/30 transition-colors ${!servicio.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-medium">{servicio.nombre}</TableCell>
                <TableCell className="max-w-xs truncate">{servicio.descripcion || '-'}</TableCell>
                <TableCell>
                  <span className="font-semibold">
                    ${parseFloat((servicio.precio_lista || 0).toString()).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{servicio.sat_id || '-'}</TableCell>
                <TableCell>{servicio.unidad_sat_descripcion || '-'}</TableCell>
                <TableCell>{servicio.dueno_nombre || '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    {servicio.activo ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(servicio)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(servicio)}
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
                          onClick={() => handleRestore(servicio)}
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
          Página {currentPage} de {totalPages} ({totalCount} servicios)
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Servicios</h1>
          <p className="text-muted-foreground">Gestiona los servicios del sistema</p>
        </div>
        {(canCreate || isSuperAdmin) && (
          <Button onClick={() => {
            resetForm();
            setIsNewDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Servicio
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Lista de Servicios</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar servicios..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className={`grid w-full ${showDeletedTab ? 'grid-cols-2' : 'grid-cols-1'} mb-4`}>
              <TabsTrigger value="active">Activos ({totalActivosCount})</TabsTrigger>
              {showDeletedTab && (
                <TabsTrigger value="deleted">Eliminados ({totalEliminadosCount})</TabsTrigger>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
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

            {/* Precio Lista */}
            <div className="space-y-2">
              <Label htmlFor="precio_lista">Precio Lista</Label>
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
        title="Eliminar Servicio"
        description={`¿Estás seguro de que deseas eliminar el servicio "${entityToDelete?.nombre}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Servicio"
        description={`¿Estás seguro de que deseas restaurar el servicio "${entityToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}