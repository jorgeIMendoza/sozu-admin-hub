import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
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

export default function Notarios() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/notarios');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNotario, setEditingNotario] = useState<Notario | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notarioToDelete, setNotarioToDelete] = useState<Notario | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [notarioToRestore, setNotarioToRestore] = useState<Notario | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [nombre, setNombre] = useState("");
  const [notaria, setNotaria] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [generaProyectoEscritura, setGeneraProyectoEscritura] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  const { data: activeNotarios = [], isLoading: loadingActiveNotarios } = useQuery({
    queryKey: ['notarios', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notarios')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: deletedNotarios = [], isLoading: loadingDeletedNotarios } = useQuery({
    queryKey: ['notarios', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notarios')
        .select('*')
        .eq('activo', false)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  const notarios = activeTab === 'active' ? activeNotarios : deletedNotarios;
  const isLoading = activeTab === 'active' ? loadingActiveNotarios : loadingDeletedNotarios;

  const createMutation = useMutation({
    mutationFn: async (notarioData: Omit<Notario, 'id' | 'activo'>) => {
      const { error } = await supabase
        .from('notarios')
        .insert([{ ...notarioData, activo: true }]);
      
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
    mutationFn: async (notarioData: Omit<Notario, 'id' | 'activo'>) => {
      const { error } = await supabase
        .from('notarios')
        .update(notarioData)
        .eq('id', editingNotario?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notarios'] });
      setIsEditDialogOpen(false);
      setEditingNotario(null);
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

  const filteredNotarios = notarios.filter(notario => 
    notario.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notario.notaria?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notario.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetForm = () => {
    setNombre("");
    setNotaria("");
    setEmail("");
    setTelefono("");
    setDireccion("");
    setGeneraProyectoEscritura(false);
    setTemplateFile(null);
  };

  const handleNew = () => {
    resetForm();
    setIsNewDialogOpen(true);
  };

  const handleEdit = (notario: Notario) => {
    setEditingNotario(notario);
    setNombre(notario.nombre);
    setNotaria(notario.notaria);
    setEmail(notario.email);
    setTelefono(notario.telefono || "");
    setDireccion(notario.direccion || "");
    setGeneraProyectoEscritura(notario.genera_proyecto_escritura || false);
    setTemplateFile(null);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (notario: Notario) => {
    setNotarioToDelete(notario);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (notarioToDelete) {
      deleteMutation.mutate(notarioToDelete.id);
      setDeleteDialogOpen(false);
      setNotarioToDelete(null);
    }
  };

  const handleRestore = (notario: any) => {
    setNotarioToRestore(notario);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (notarioToRestore) {
      restoreMutation.mutate(notarioToRestore.id);
      setRestoreDialogOpen(false);
      setNotarioToRestore(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nombre.trim() || !notaria.trim() || !email.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos (nombre, notaría y email).",
        variant: "destructive",
      });
      return;
    }

    if (generaProyectoEscritura && templateFile && !editingNotario) {
      // Upload template file first
      setUploadingTemplate(true);
      try {
        const fileExt = templateFile.name.split('.').pop();
        const fileName = `template-${Date.now()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('templates_proyecto_escritura')
          .upload(fileName, templateFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('templates_proyecto_escritura')
          .getPublicUrl(fileName);

        const notarioData = {
          nombre: nombre.trim(),
          notaria: notaria.trim(),
          email: email.trim(),
          telefono: telefono.trim() || null,
          direccion: direccion.trim() || null,
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
    } else if (generaProyectoEscritura && templateFile && editingNotario) {
      // Update template file
      setUploadingTemplate(true);
      try {
        // Delete old file if exists
        if (editingNotario.url_template_proyecto_contrato) {
          await supabase.storage
            .from('templates_proyecto_escritura')
            .remove([editingNotario.url_template_proyecto_contrato]);
        }

        const fileExt = templateFile.name.split('.').pop();
        const fileName = `template-${Date.now()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('templates_proyecto_escritura')
          .upload(fileName, templateFile);

        if (uploadError) throw uploadError;

        const notarioData = {
          nombre: nombre.trim(),
          notaria: notaria.trim(),
          email: email.trim(),
          telefono: telefono.trim() || null,
          direccion: direccion.trim() || null,
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
        nombre: nombre.trim(),
        notaria: notaria.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        genera_proyecto_escritura: generaProyectoEscritura,
        url_template_proyecto_contrato: editingNotario?.url_template_proyecto_contrato || null,
      };

      if (editingNotario) {
        updateMutation.mutate(notarioData);
      } else {
        createMutation.mutate(notarioData);
      }
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Notarios
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los notarios
              </p>
            </div>
            <Button 
              onClick={handleNew}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Notario
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-border focus:ring-primary/20"
                />
              </div>
            </div>

            <TabsContent value="active" className="mt-6">
              {renderTable()}
            </TabsContent>

            <TabsContent value="deleted" className="mt-6">
              {renderTable()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog para nuevo notario */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo Notario</DialogTitle>
          </DialogHeader>
          {renderForm()}
        </DialogContent>
      </Dialog>

      {/* Dialog para editar notario */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Notario</DialogTitle>
          </DialogHeader>
          {renderForm()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Notario"
        description={`¿Estás seguro de que quieres eliminar al notario "${notarioToDelete?.nombre}"? Esta acción no se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Notario"
        description={`¿Estás seguro de que quieres restaurar al notario "${notarioToRestore?.nombre}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );

  function renderTable() {
    if (filteredNotarios.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' ? 'No hay notarios activos' : 'No hay notarios eliminados'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primer notario para comenzar' : 'Los notarios eliminados aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={handleNew}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Notario
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold text-foreground">Nombre</TableHead>
              <TableHead className="font-semibold text-foreground">Notaría</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredNotarios.map((notario) => (
              <TableRow key={notario.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {notario.nombre}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {notario.notaria}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {notario.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {notario.telefono || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(notario)}
                          className="hover:bg-primary/10 hover:border-primary transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(notario)}
                          className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRestore(notario)}
                        className="hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
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

  function renderForm() {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo del notario"
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notaria">Notaría *</Label>
          <Input
            id="notaria"
            type="text"
            value={notaria}
            onChange={(e) => setNotaria(e.target.value)}
            placeholder="NOTARIA 35, ZAPOPAN"
            required
          />
        </div>

        <div>
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Número de teléfono"
          />
        </div>

        <div>
          <Label htmlFor="direccion">Dirección</Label>
          <Textarea
            id="direccion"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Dirección completa"
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
            <Label htmlFor="template">Template Proyecto de Contrato (.docx)</Label>
            <div className="flex gap-2">
              <Input
                id="template"
                type="file"
                accept=".docx,.doc"
                onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {editingNotario?.url_template_proyecto_contrato && !templateFile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const { data } = supabase.storage
                      .from('templates_proyecto_escritura')
                      .getPublicUrl(editingNotario.url_template_proyecto_contrato!);
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

        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (editingNotario) {
                setIsEditDialogOpen(false);
                setEditingNotario(null);
              } else {
                setIsNewDialogOpen(false);
              }
              resetForm();
            }}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending || uploadingTemplate}
            className="flex-1"
          >
            {uploadingTemplate ? 'Subiendo template...' : createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    );
  }
}