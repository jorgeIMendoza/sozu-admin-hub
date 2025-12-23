import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { usePagePermissions } from "@/hooks/usePagePermissions";

type RepresentanteComercial = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  activo: boolean;
  entidad_relacionada_id: number;
};

export default function RepresentantesComerciales() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/representantes-comerciales');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRepresentant, setEditingRepresentant] = useState<RepresentanteComercial | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [representantToDelete, setRepresentantToDelete] = useState<RepresentanteComercial | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [representantToRestore, setRepresentantToRestore] = useState<RepresentanteComercial | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeRepresentantes = [], isLoading: loadingActiveRepresentantes } = useQuery({
    queryKey: ['representantes_comerciales', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            nombre_legal,
            email,
            telefono,
            curp,
            activo
          )
        `)
        .eq('personas.activo', true)
        .eq('activo', true)
        .eq('id_tipo_entidad', 21) // Representante Comercial
        .is('id_proyecto', null)
        .order('personas(nombre_legal)', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        id: item.personas.id,
        entidad_relacionada_id: item.id,
        nombre_legal: item.personas.nombre_legal,
        email: item.personas.email,
        telefono: item.personas.telefono,
        curp: item.personas.curp,
        activo: item.personas.activo,
      })) as RepresentanteComercial[];
    },
  });

  const { data: deletedRepresentantes = [], isLoading: loadingDeletedRepresentantes } = useQuery({
    queryKey: ['representantes_comerciales', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            nombre_legal,
            email,
            telefono,
            curp,
            activo
          )
        `)
        .eq('personas.activo', false)
        .eq('activo', true)
        .eq('id_tipo_entidad', 21)
        .is('id_proyecto', null)
        .order('personas(nombre_legal)', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        id: item.personas.id,
        entidad_relacionada_id: item.id,
        nombre_legal: item.personas.nombre_legal,
        email: item.personas.email,
        telefono: item.personas.telefono,
        curp: item.personas.curp,
        activo: item.personas.activo,
      })) as RepresentanteComercial[];
    },
  });

  const representantes = activeTab === 'active' ? activeRepresentantes : deletedRepresentantes;
  const isLoading = activeTab === 'active' ? loadingActiveRepresentantes : loadingDeletedRepresentantes;

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pf' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 21, // Representante Comercial
          id_proyecto: null,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Representante comercial creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el representante comercial: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      const { error } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingRepresentant?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales'] });
      setIsEditDialogOpen(false);
      setEditingRepresentant(null);
      toast({
        title: "Éxito",
        description: "Representante comercial actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el representante comercial: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('personas')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales'] });
      setDeleteDialogOpen(false);
      setRepresentantToDelete(null);
      toast({
        title: "Éxito",
        description: "Representante comercial eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el representante comercial: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('personas')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales'] });
      setRestoreDialogOpen(false);
      setRepresentantToRestore(null);
      toast({
        title: "Éxito",
        description: "Representante comercial restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el representante comercial: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredRepresentantes = representantes.filter(representante => 
    representante.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (representante: RepresentanteComercial) => {
    setEditingRepresentant(representante);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (representant: RepresentanteComercial) => {
    setRepresentantToDelete(representant);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (representantToDelete) {
      deleteMutation.mutate(representantToDelete.id);
    }
  };

  const handleRestore = (representante: RepresentanteComercial) => {
    setRepresentantToRestore(representante);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (representantToRestore) {
      restoreMutation.mutate(representantToRestore.id);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Representantes Comerciales
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los representantes comerciales
              </p>
            </div>
            {(canCreate || isSuperAdmin) && (
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Representante Comercial
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${(canDelete || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1'} mb-6`}>
              <TabsTrigger value="active">Activos ({activeRepresentantes.length})</TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">Eliminados ({deletedRepresentantes.length})</TabsTrigger>
              )}
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, CURP..."
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

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Representante Comercial</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="representante_legal"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Representante Comercial</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={editingRepresentant}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingRepresentant(null);
            }}
            entityType="representante_legal"
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Representante Comercial"
        description={`¿Estás seguro de que quieres eliminar a "${representantToDelete?.nombre_legal}"? Esta acción no se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Representante Comercial"
        description={`¿Estás seguro de que quieres restaurar a "${representantToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );

  function renderTable() {
    if (filteredRepresentantes.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' ? 'No hay representantes comerciales activos' : 'No hay representantes comerciales eliminados'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primer representante comercial para comenzar' : 'Los representantes eliminados aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Representante Comercial
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
              <TableHead className="font-semibold text-foreground">Nombre Completo</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">CURP</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRepresentantes.map((representante) => (
              <TableRow key={representante.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {representante.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {representante.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {representante.telefono || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {representante.curp || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(representante)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(representante)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      (canApprove || isSuperAdmin) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(representante)}
                          className="text-green-600 hover:text-green-700"
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
}
