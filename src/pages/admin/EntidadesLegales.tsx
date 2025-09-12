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

type EntidadLegal = {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  rfc?: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  representante_legal_nombre?: string;
};

export default function EntidadesLegales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntidadLegal | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<EntidadLegal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entidades = [], isLoading } = useQuery({
    queryKey: ['entidades_legales', activeTab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          nombre_comercial,
          email,
          telefono,
          rfc,
          activo,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            tipos_entidad!inner (
              id,
              nombre,
              padre
            )
          ),
          representante_legal:entidades_relacionadas!fk_personas_entidad_relacionada_rep_leg (
            id,
            personas!entidades_relacionadas_id_persona_fkey (
              id,
              nombre_legal
            )
          )
        `)
        .eq('activo', activeTab === 'active')
        .eq('tipo_persona', 'pm')
        .eq('entidades_relacionadas.activo', true)
        .neq('entidades_relacionadas.tipos_entidad.padre', 'c') // Exclude clients
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      // Flatten the structure to match the expected format
      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0]?.id,
        id_tipo_entidad: item.entidades_relacionadas[0]?.id_tipo_entidad,
        nombre_legal: item.nombre_legal,
        nombre_comercial: item.nombre_comercial,
        email: item.email,
        telefono: item.telefono,
        rfc: item.rfc,
        activo: item.activo,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
      })) as (EntidadLegal & { 
        entidad_relacionada_id: number; 
        id_tipo_entidad: number;
        id_entidad_relacionada_rep_leg: number;
        representante_legal_nombre: string;
      })[];
    },
  });
    queryKey: ['entidades_legales', activeTab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          nombre_comercial,
          email,
          telefono,
          rfc,
          activo,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            tipos_entidad!inner (
              id,
              nombre,
              padre
            )
          ),
          representante_legal:entidades_relacionadas!fk_personas_entidad_relacionada_rep_leg (
            id,
            personas!entidades_relacionadas_id_persona_fkey (
              id,
              nombre_legal
            )
          )
        `)
        .eq('activo', activeTab === 'active')
        .eq('tipo_persona', 'pm')
        .eq('entidades_relacionadas.activo', true)
        .neq('entidades_relacionadas.tipos_entidad.padre', 'c') // Exclude clients
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      // Flatten the structure to match the expected format
      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0]?.id,
        id_tipo_entidad: item.entidades_relacionadas[0]?.id_tipo_entidad,
        nombre_legal: item.nombre_legal,
        nombre_comercial: item.nombre_comercial,
        email: item.email,
        telefono: item.telefono,
        rfc: item.rfc,
        activo: item.activo,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
      })) as (EntidadLegal & { 
        entidad_relacionada_id: number; 
        id_tipo_entidad: number;
        id_entidad_relacionada_rep_leg: number;
        representante_legal_nombre: string;
      })[];
    },
  });

  // Check if entity can be deleted (not selected in any project)
  const { data: canDeleteData = [] } = useQuery({
    queryKey: ['entity_projects', entidades],
    queryFn: async () => {
      if (!entidades.length) return [];
      
      const entityIds = entidades.map(e => e.entidad_relacionada_id);
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_persona')
        .not('id_proyecto', 'is', null)
        .in('id', entityIds)
        .eq('activo', true);
      
      if (error) throw error;
      
      return entityIds.map(entityId => ({
        entityId,
        canDelete: !data?.some(item => item.id === entityId)
      }));
    },
    enabled: entidades.length > 0
  });

  const canDeleteEntity = (entityId: number) => {
    const entity = entidades.find(e => e.entidad_relacionada_id === entityId);
    if (!entity) return false;
    
    const canDeleteInfo = canDeleteData.find(c => c.entityId === entity.entidad_relacionada_id);
    return canDeleteInfo?.canDelete ?? false;
  };

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Extract entity type and representative from personData
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
      // First, create the person record
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pm' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
      // Then, create the entidades_relacionadas record
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: entityType,
          id_proyecto: null,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
      
      // If a representative was selected, update the person record
      if (representativeId) {
        const { error: updateError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId })
          .eq('id', personResult.id);
          
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Entidad legal creada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear la entidad legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Extract entity type and representative from personData
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
      // First, update the basic person data
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingEntity?.id);
      
      if (updateError) throw updateError;
      
      // Then, update the legal representative if provided
      if (representativeId !== undefined) {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingEntity?.id);
          
        if (repError) throw repError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      toast({
        title: "Éxito",
        description: "Entidad legal actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar la entidad legal: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      toast({
        title: "Éxito",
        description: "Entidad legal eliminada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar la entidad legal: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      toast({
        title: "Éxito",
        description: "Entidad legal restaurada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar la entidad legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredEntidades = entidades.filter(entidad => 
    entidad.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entidad.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entidad.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (entidad: EntidadLegal) => {
    setEditingEntity(entidad);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (entidad: EntidadLegal) => {
    setEntityToDelete(entidad);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
    }
  };

  const handleRestore = (id: number) => {
    if (confirm('¿Estás seguro de que quieres restaurar esta entidad legal?')) {
      restoreMutation.mutate(id);
    }
  };

  const canDeleteEntity = (entityId: number) => {
    const entity = entidades.find(e => e.entidad_relacionada_id === entityId);
    if (!entity) return false;
    
    const canDeleteInfo = canDeleteData.find(c => c.entityId === entity.entidad_relacionada_id);
    return canDeleteInfo?.canDelete ?? false;
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Entidades Legales
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de las entidades legales (personas morales)
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Entidad Legal
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, RFC..."
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

      {/* Dialog para nueva entidad legal */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Entidad Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="legal"
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar entidad legal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Entidad Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={{
              ...editingEntity,
              representativeId: editingEntity?.id_entidad_relacionada_rep_leg
            }}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingEntity(null);
            }}
            entityType="legal"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Entidad Legal"
        description={`¿Estás seguro de que quieres eliminar la entidad legal "${entityToDelete?.nombre_legal}"? Esta acción no se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );

  function renderTable() {
    if (filteredEntidades.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' ? 'No hay entidades legales activas' : 'No hay entidades legales eliminadas'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primera entidad legal para comenzar' : 'Las entidades eliminadas aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primera Entidad Legal
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
              <TableHead className="font-semibold text-foreground">Razón Social</TableHead>
              <TableHead className="font-semibold text-foreground">Nombre Comercial</TableHead>
              <TableHead className="font-semibold text-foreground">RFC</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Representante Legal</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntidades.map((entidad) => (
              <TableRow key={entidad.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {entidad.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.nombre_comercial || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.rfc || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.telefono || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.representante_legal_nombre || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(entidad)}
                          className="hover:bg-primary/10 hover:border-primary transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(entidad)}
                          disabled={!canDeleteEntity(entidad.entidad_relacionada_id)}
                          className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!canDeleteEntity(entidad.entidad_relacionada_id) ? "No se puede eliminar: está seleccionada en un proyecto" : "Eliminar entidad legal"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRestore(entidad.id)}
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