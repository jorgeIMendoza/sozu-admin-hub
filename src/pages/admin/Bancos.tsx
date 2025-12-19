import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Building } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { Label } from "@/components/ui/label";

type Banco = {
  id: number;
  nombre: string;
  activo: boolean;
};

export default function Bancos() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin, isLoading: permissionsLoading } = 
    usePagePermissions('/admin/bancos');
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bancoToDelete, setBancoToDelete] = useState<Banco | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [bancoToRestore, setBancoToRestore] = useState<Banco | null>(null);
  const [formData, setFormData] = useState({ nombre: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const showDeletedTab = canDelete || isSuperAdmin;
  
  const itemsPerPage = 10;

  const fetchBancos = async (activo: boolean) => {
    const { data, error } = await supabase
      .from('bancos')
      .select('id, nombre, activo')
      .eq('activo', activo)
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    return data as Banco[];
  };

  const { data: activeBancos = [], isLoading: loadingActive } = useQuery({
    queryKey: ['bancos', 'active'],
    queryFn: () => fetchBancos(true),
  });

  const { data: deletedBancos = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['bancos', 'deleted'],
    queryFn: () => fetchBancos(false),
  });

  const bancos = activeTab === 'active' ? activeBancos : deletedBancos;
  const filteredBancos = bancos.filter(banco => 
    banco.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredBancos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBancos = filteredBancos.slice(startIndex, endIndex);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const createMutation = useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase
        .from('bancos')
        .insert([{ nombre }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
      setIsNewDialogOpen(false);
      setFormData({ nombre: "" });
      toast({
        title: "Éxito",
        description: "Banco creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, nombre }: { id: number; nombre: string }) => {
      const { error } = await supabase
        .from('bancos')
        .update({ nombre })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
      setIsEditDialogOpen(false);
      setEditingBanco(null);
      setFormData({ nombre: "" });
      toast({
        title: "Éxito",
        description: "Banco actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('bancos')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
      setDeleteDialogOpen(false);
      setBancoToDelete(null);
      toast({
        title: "Éxito",
        description: "Banco eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('bancos')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
      setRestoreDialogOpen(false);
      setBancoToRestore(null);
      toast({
        title: "Éxito",
        description: "Banco restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el banco: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (banco: Banco) => {
    setEditingBanco(banco);
    setFormData({ nombre: banco.nombre });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (banco: Banco) => {
    setBancoToDelete(banco);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (bancoToDelete) {
      deleteMutation.mutate(bancoToDelete.id);
    }
  };

  const handleRestore = (banco: Banco) => {
    setBancoToRestore(banco);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (bancoToRestore) {
      restoreMutation.mutate(bancoToRestore.id);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nombre.trim()) {
      createMutation.mutate(formData.nombre.trim());
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBanco && formData.nombre.trim()) {
      updateMutation.mutate({ id: editingBanco.id, nombre: formData.nombre.trim() });
    }
  };

  function renderTable() {
    if (loadingActive || loadingDeleted) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-center">
            <div className="text-lg mb-2">Cargando...</div>
            <div className="text-muted-foreground">Obteniendo bancos</div>
          </div>
        </div>
      );
    }

    if (paginatedBancos.length === 0) {
      return (
        <div className="text-center py-8">
          <Building className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-lg font-medium mb-2">
            {searchTerm ? "No se encontraron resultados" : "No hay bancos"}
          </div>
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Intenta con otros términos de búsqueda" 
              : "Comienza agregando tu primer banco"
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
              <TableHead className="font-semibold w-20">ID</TableHead>
              <TableHead className="font-semibold">Nombre</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedBancos.map((banco) => (
              <TableRow 
                key={banco.id} 
                className={`hover:bg-muted/30 transition-colors ${!banco.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-mono text-sm">{banco.id}</TableCell>
                <TableCell className="font-medium">{banco.nombre}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    {banco.activo ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(banco)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(banco)}
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
                          onClick={() => handleRestore(banco)}
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
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Bancos
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los bancos
              </p>
            </div>
            {(canCreate || isSuperAdmin) && (
              <Button 
                onClick={() => {
                  setFormData({ nombre: "" });
                  setIsNewDialogOpen(true);
                }}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Banco
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`grid w-full ${showDeletedTab ? 'grid-cols-2' : 'grid-cols-1'} mb-6`}>
              <TabsTrigger value="active">Activos ({activeBancos.length})</TabsTrigger>
              {showDeletedTab && (
                <TabsTrigger value="deleted">Eliminados ({deletedBancos.length})</TabsTrigger>
              )}
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 border-border focus:ring-primary/20"
                />
              </div>
            </div>

            <TabsContent value="active" className="mt-6">
              {renderTable()}
              {renderPagination()}
            </TabsContent>

            <TabsContent value="deleted" className="mt-6">
              {renderTable()}
              {renderPagination()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Nuevo Banco Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nuevo Banco</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre del Banco</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ nombre: e.target.value })}
                  placeholder="Ingresa el nombre del banco"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsNewDialogOpen(false);
                  setFormData({ nombre: "" });
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar Banco Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Banco</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-nombre">Nombre del Banco</Label>
                <Input
                  id="edit-nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ nombre: e.target.value })}
                  placeholder="Ingresa el nombre del banco"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingBanco(null);
                  setFormData({ nombre: "" });
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Banco"
        description={`¿Estás seguro de que deseas eliminar el banco "${bancoToDelete?.nombre}"? Esta acción se puede revertir desde la pestaña de eliminados.`}
        isLoading={deleteMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Banco"
        description={`¿Estás seguro de que deseas restaurar el banco "${bancoToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
      />
    </div>
  );
}