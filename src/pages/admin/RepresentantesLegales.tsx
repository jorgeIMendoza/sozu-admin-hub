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

type RepresentanteLegal = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  activo: boolean;
  representado?: {
    id: number;
    nombre_legal: string;
  };
};

export default function RepresentantesLegales() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/representantes-legales');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRepresentant, setEditingRepresentant] = useState<RepresentanteLegal | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [representantToDelete, setRepresentantToDelete] = useState<RepresentanteLegal | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [representantToRestore, setRepresentantToRestore] = useState<RepresentanteLegal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeRepresentantes = [], isLoading: loadingActiveRepresentantes } = useQuery({
    queryKey: ['representantes_legales', 'active'],
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
        .eq('id_tipo_entidad', 1)
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
      })) as (RepresentanteLegal & { entidad_relacionada_id: number })[];
    },
  });

  const { data: deletedRepresentantes = [], isLoading: loadingDeletedRepresentantes } = useQuery({
    queryKey: ['representantes_legales', 'deleted'],
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
        .eq('id_tipo_entidad', 1)
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
      })) as (RepresentanteLegal & { entidad_relacionada_id: number })[];
    },
  });

  const representantes = activeTab === 'active' ? activeRepresentantes : deletedRepresentantes;
  const isLoading = activeTab === 'active' ? loadingActiveRepresentantes : loadingDeletedRepresentantes;

  // Check if representant can be deleted (not referenced by any legal entity or PM client)
  const { data: canDeleteData = [] } = useQuery({
    queryKey: ['representant_references', representantes],
    queryFn: async () => {
      if (!representantes.length) return [];
      
      const representantIds = representantes.map(r => r.entidad_relacionada_id);
      
      const { data, error } = await supabase
        .from('personas')
        .select('id, id_entidad_relacionada_rep_leg')
        .in('id_entidad_relacionada_rep_leg', representantIds)
        .eq('activo', true);
      
      if (error) throw error;
      
      return representantIds.map(repId => ({
        representantId: repId,
        canDelete: !data?.some(item => item.id_entidad_relacionada_rep_leg === repId)
      }));
    },
    enabled: representantes.length > 0
  });

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Filter out fields that don't belong to personas table
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
      // First, create the person record
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pf' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
      // Then, create the entidades_relacionadas record with id_tipo_entidad = 1 (Representante Legal)
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 1, // Representante Legal
          id_proyecto: null,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Representante legal creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el representante legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Filter out fields that don't belong to personas table
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
      const { error } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingRepresentant?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsEditDialogOpen(false);
      setEditingRepresentant(null);
      toast({
        title: "Éxito",
        description: "Representante legal actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el representante legal: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      toast({
        title: "Éxito",
        description: "Representante legal eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el representante legal: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      toast({
        title: "Éxito",
        description: "Representante legal restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el representante legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredRepresentantes = representantes.filter(representante => 
    representante.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canDeleteRepresentant = (representantId: number) => {
    const representant = representantes.find(r => r.entidad_relacionada_id === representantId);
    if (!representant) return false;
    
    const canDeleteInfo = canDeleteData.find(c => c.representantId === representant.entidad_relacionada_id);
    return canDeleteInfo?.canDelete ?? false;
  };


  const handleEdit = (representante: RepresentanteLegal) => {
    setEditingRepresentant(representante);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (representant: RepresentanteLegal) => {
    setRepresentantToDelete(representant);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (representantToDelete) {
      deleteMutation.mutate(representantToDelete.id);
      setDeleteDialogOpen(false);
      setRepresentantToDelete(null);
    }
  };

  const handleRestore = (representante: RepresentanteLegal) => {
    setRepresentantToRestore(representante);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (representantToRestore) {
      restoreMutation.mutate(representantToRestore.id);
      setRestoreDialogOpen(false);
      setRepresentantToRestore(null);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Representantes Legales
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los representantes legales
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Representante Legal
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeRepresentantes.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedRepresentantes.length})</TabsTrigger>
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

      {/* Dialog para nuevo representante legal */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Representante Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="representante_legal"
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar representante legal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Representante Legal</DialogTitle>
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Representante Legal"
        description={`¿Estás seguro de que quieres eliminar a "${representantToDelete?.nombre_legal}"? Esta acción no se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Representante Legal"
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
            {activeTab === 'active' ? 'No hay representantes legales activos' : 'No hay representantes legales eliminados'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primer representante legal para comenzar' : 'Los representantes eliminados aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Representante Legal
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
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(representante)}
                          className="hover:bg-primary/10 hover:border-primary transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(representante)}
                          disabled={!canDeleteRepresentant(representante.entidad_relacionada_id)}
                          className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!canDeleteRepresentant(representante.entidad_relacionada_id) ? "No se puede eliminar: está siendo usado por una entidad legal o cliente persona moral" : "Eliminar representante legal"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRestore(representante)}
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
}