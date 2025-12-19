import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Scale, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { usePagePermissions } from "@/hooks/usePagePermissions";

type Notario = {
  id: number;
  nombre: string;
  notaria: string;
  email: string;
  telefono?: string;
  direccion?: string;
  activo: boolean;
  genera_proyecto_escritura: boolean;
  url_template_proyecto_contrato?: string;
};

export default function Notarias() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/notarias');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Notario | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Notario | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Notario | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const itemsPerPage = 10;

  // Form states
  const [formData, setFormData] = useState({
    nombre: "",
    notaria: "",
    email: "",
    telefono: "",
    direccion: "",
  });
  const [generaProyectoEscritura, setGeneraProyectoEscritura] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const resetForm = () => {
    setFormData({
      nombre: "",
      notaria: "",
      email: "",
      telefono: "",
      direccion: "",
    });
    setGeneraProyectoEscritura(false);
    setTemplateFile(null);
  };

  const fetchNotarios = async (activo: boolean) => {
    const { data, error } = await supabase
      .from('notarios')
      .select('*')
      .eq('activo', activo)
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    return data as Notario[];
  };

  const { data: activeNotarios = [], isLoading: loadingActive } = useQuery({
    queryKey: ['notarios', 'active'],
    queryFn: () => fetchNotarios(true),
  });

  const { data: deletedNotarios = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['notarios', 'deleted'],
    queryFn: () => fetchNotarios(false),
  });

  const notarios = activeTab === 'active' ? activeNotarios : deletedNotarios;
  const filteredNotarios = notarios.filter(notario => 
    notario.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notario.notaria?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notario.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredNotarios.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedNotarios = filteredNotarios.slice(startIndex, endIndex);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const createMutation = useMutation({
    mutationFn: async (notarioData: any) => {
      const { error } = await supabase
        .from('notarios')
        .insert([notarioData]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notarios'] });
      setIsNewDialogOpen(false);
      resetForm();
      toast({
        title: "Éxito",
        description: "Notario creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el notario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (notarioData: any) => {
      const { error } = await supabase
        .from('notarios')
        .update(notarioData)
        .eq('id', editingEntity?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notarios'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      resetForm();
      toast({
        title: "Éxito",
        description: "Notario actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el notario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('notarios')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notarios'] });
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Notario eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el notario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('notarios')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notarios'] });
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Notario restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el notario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (notario: Notario) => {
    setEditingEntity(notario);
    setFormData({
      nombre: notario.nombre || "",
      notaria: notario.notaria || "",
      email: notario.email || "",
      telefono: notario.telefono || "",
      direccion: notario.direccion || "",
    });
    setGeneraProyectoEscritura(notario.genera_proyecto_escritura || false);
    setTemplateFile(null);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (notario: Notario) => {
    setEntityToDelete(notario);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (notario: Notario) => {
    setEntityToRestore(notario);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (entityToRestore) {
      restoreMutation.mutate(entityToRestore.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nombre || !formData.notaria || !formData.email) {
      toast({
        title: "Error",
        description: "Los campos nombre, notaría y email son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    if (generaProyectoEscritura && templateFile && !editingEntity) {
      // Upload template file first
      setUploadingTemplate(true);
      try {
        const fileExt = templateFile.name.split('.').pop();
        const fileName = `template-${Date.now()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('templates_proyecto_escritura')
          .upload(fileName, templateFile);

        if (uploadError) throw uploadError;

        const notarioData = {
          ...formData,
          genera_proyecto_escritura: generaProyectoEscritura,
          url_template_proyecto_contrato: data.path,
        };

        createMutation.mutate(notarioData);
      } catch (error: any) {
        toast({
          title: "Error",
          description: `Error al subir el template: ${error.message}`,
          variant: "destructive",
        });
      } finally {
        setUploadingTemplate(false);
      }
    } else if (generaProyectoEscritura && templateFile && editingEntity) {
      // Update template file
      setUploadingTemplate(true);
      try {
        // Delete old file if exists
        if (editingEntity.url_template_proyecto_contrato) {
          await supabase.storage
            .from('templates_proyecto_escritura')
            .remove([editingEntity.url_template_proyecto_contrato]);
        }

        const fileExt = templateFile.name.split('.').pop();
        const fileName = `template-${Date.now()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('templates_proyecto_escritura')
          .upload(fileName, templateFile);

        if (uploadError) throw uploadError;

        const notarioData = {
          ...formData,
          genera_proyecto_escritura: generaProyectoEscritura,
          url_template_proyecto_contrato: data.path,
        };

        updateMutation.mutate(notarioData);
      } catch (error: any) {
        toast({
          title: "Error",
          description: `Error al subir el template: ${error.message}`,
          variant: "destructive",
        });
      } finally {
        setUploadingTemplate(false);
      }
    } else {
      const notarioData = {
        ...formData,
        genera_proyecto_escritura: generaProyectoEscritura,
        url_template_proyecto_contrato: editingEntity?.url_template_proyecto_contrato || null,
      };

      if (editingEntity) {
        updateMutation.mutate(notarioData);
      } else {
        createMutation.mutate(notarioData);
      }
    }
  };

  function renderForm() {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="nombre">Nombre del Notario *</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre completo del notario"
              required
            />
          </div>
          <div>
            <Label htmlFor="notaria">Notaría *</Label>
            <Input
              id="notaria"
              value={formData.notaria}
              onChange={(e) => setFormData(prev => ({ ...prev, notaria: e.target.value }))}
              placeholder="Número y nombre de la notaría"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="correo@notaria.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              value={formData.telefono}
              onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
              placeholder="Número de teléfono"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="direccion">Dirección</Label>
          <Textarea
            id="direccion"
            value={formData.direccion}
            onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
            placeholder="Dirección completa de la notaría"
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="space-y-0.5">
            <Label htmlFor="genera-proyecto">Genera Proyecto de Escritura</Label>
            <p className="text-sm text-muted-foreground">
              Habilitar si este notario genera proyectos de escritura
            </p>
          </div>
          <Switch
            id="genera-proyecto"
            checked={generaProyectoEscritura}
            onCheckedChange={setGeneraProyectoEscritura}
          />
        </div>

        {generaProyectoEscritura && (
          <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/30">
            <Label htmlFor="template">Template Proyecto de Contrato (.docx, .doc)</Label>
            <div className="flex gap-2">
              <Input
                id="template"
                type="file"
                accept=".docx,.doc"
                onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {editingEntity?.url_template_proyecto_contrato && !templateFile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const { data } = supabase.storage
                      .from('templates_proyecto_escritura')
                      .getPublicUrl(editingEntity.url_template_proyecto_contrato!);
                    window.open(data.publicUrl, '_blank');
                  }}
                >
                  Ver Actual
                </Button>
              )}
            </div>
            {templateFile && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {templateFile.name}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              if (editingEntity) {
                setIsEditDialogOpen(false);
                setEditingEntity(null);
              } else {
                setIsNewDialogOpen(false);
              }
              resetForm();
            }}
          >
            Cancelar
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending || updateMutation.isPending || uploadingTemplate}
          >
            {uploadingTemplate ? 'Subiendo template...' : createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    );
  }

  function renderTable() {
    if (loadingActive || loadingDeleted) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-center">
            <div className="text-lg mb-2">Cargando...</div>
            <div className="text-muted-foreground">Obteniendo notarios</div>
          </div>
        </div>
      );
    }

    if (paginatedNotarios.length === 0) {
      return (
        <div className="text-center py-8">
          <Scale className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-lg font-medium mb-2">
            {searchTerm ? "No se encontraron resultados" : "No hay notarios"}
          </div>
          <p className="text-muted-foreground">
            {searchTerm 
              ? "Intenta con otros términos de búsqueda" 
              : "Comienza agregando tu primer notario"
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
              <TableHead className="font-semibold">Notaría</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Teléfono</TableHead>
              <TableHead className="font-semibold">Dirección</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedNotarios.map((notario) => (
              <TableRow 
                key={notario.id} 
                className={`hover:bg-muted/30 transition-colors ${!notario.activo ? 'opacity-60' : ''}`}
              >
                <TableCell className="font-medium">
                  {notario.nombre}
                </TableCell>
                <TableCell>{notario.notaria}</TableCell>
                <TableCell>{notario.email}</TableCell>
                <TableCell>{notario.telefono || '-'}</TableCell>
                <TableCell className="max-w-xs truncate">{notario.direccion || '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    {notario.activo ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(notario)}
                          className="hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notario)}
                          className="hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(notario)}
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
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Notarías
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los notarios
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Notario
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeNotarios.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedNotarios.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, notaría, email..."
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

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Notario</DialogTitle>
          </DialogHeader>
          {renderForm()}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Notario</DialogTitle>
          </DialogHeader>
          {renderForm()}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Notario"
        description={`¿Estás seguro de que deseas eliminar al notario "${entityToDelete?.nombre}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Notario"
        description={`¿Estás seguro de que deseas restaurar al notario "${entityToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}