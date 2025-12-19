import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, UserX, RotateCcw } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
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
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";

type Administrador = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  rfc?: string;
  tipo_persona: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  representante_legal_nombre?: string;
};

export default function AdministradoresPersonas() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/administradores-personas');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAdministrador, setEditingAdministrador] = useState<Administrador | null>(null);
  const [selectedAdministradorForBankAccounts, setSelectedAdministradorForBankAccounts] = useState<Administrador | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [administradorToDelete, setAdministradorToDelete] = useState<Administrador | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [administradorToRestore, setAdministradorToRestore] = useState<Administrador | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeAdministradores = [], isLoading: loadingActive } = useQuery({
    queryKey: ['administradores-personas', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          curp,
          rfc,
          tipo_persona,
          activo,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad
          ),
          representante_legal:entidades_relacionadas!fk_personas_entidad_relacionada_rep_leg (
            id,
            personas!entidades_relacionadas_id_persona_fkey (
              id,
              nombre_legal
            )
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 20)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0].id,
        id_tipo_entidad: item.entidades_relacionadas[0].id_tipo_entidad,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        curp: item.curp,
        rfc: item.rfc,
        tipo_persona: item.tipo_persona,
        activo: item.activo,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
      })) as (Administrador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const { data: deletedAdministradores = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['administradores-personas', 'deleted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          curp,
          rfc,
          tipo_persona,
          activo,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad
          ),
          representante_legal:entidades_relacionadas!fk_personas_entidad_relacionada_rep_leg (
            id,
            personas!entidades_relacionadas_id_persona_fkey (
              id,
              nombre_legal
            )
          )
        `)
        .eq('activo', false)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 20)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0].id,
        id_tipo_entidad: item.entidades_relacionadas[0].id_tipo_entidad,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        curp: item.curp,
        rfc: item.rfc,
        tipo_persona: item.tipo_persona,
        activo: item.activo,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
      })) as (Administrador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const administradores = activeTab === 'active' ? activeAdministradores : deletedAdministradores;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Remove fields that don't belong to personas table
      const { 
        entityType, 
        representativeId, 
        pendingDocuments, 
        tempBankAccounts, 
        tempBeneficiaries,
        ...cleanPersonData 
      } = personData;
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert(cleanPersonData)
        .select('*')
        .single();
      
      if (personError) throw personError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 20, // Administrador
          id_proyecto: null,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;

      if (representativeId && cleanPersonData.tipo_persona === 'pm') {
        const { error: updateError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId })
          .eq('id', personResult.id);
          
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradores-personas'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Administrador creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el administrador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Remove fields that don't belong to personas table
      const { 
        entityType, 
        representativeId, 
        pendingDocuments, 
        tempBankAccounts, 
        tempBeneficiaries,
        ...cleanPersonData 
      } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingAdministrador?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingAdministrador?.id);
          
        if (repError) throw repError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administradores-personas'] });
      setIsEditDialogOpen(false);
      setEditingAdministrador(null);
      toast({
        title: "Éxito",
        description: "Administrador actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el administrador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['administradores-personas'] });
      toast({
        title: "Éxito",
        description: "Administrador eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el administrador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['administradores-personas'] });
      toast({
        title: "Éxito",
        description: "Administrador restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el administrador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredAdministradores = administradores.filter(administrador => 
    administrador.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    administrador.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    administrador.telefono?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (administrador: Administrador) => {
    setEditingAdministrador(administrador);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (administrador: Administrador) => {
    setAdministradorToDelete(administrador);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (administradorToDelete) {
      deleteMutation.mutate(administradorToDelete.id);
      setDeleteDialogOpen(false);
      setAdministradorToDelete(null);
    }
  };

  const handleRestore = (administrador: Administrador) => {
    setAdministradorToRestore(administrador);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (administradorToRestore) {
      restoreMutation.mutate(administradorToRestore.id);
      setRestoreDialogOpen(false);
      setAdministradorToRestore(null);
    }
  };

  const handleBankAccounts = (administrador: Administrador) => {
    setSelectedAdministradorForBankAccounts(administrador);
    setIsBankAccountsDialogOpen(true);
  };

  function renderTable() {
    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando administradores...</p>
        </div>
      );
    }

    if (filteredAdministradores.length === 0) {
      return (
        <div className="text-center py-12">
          <UserX className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No hay administradores</h3>
          <p className="mt-2 text-muted-foreground">
            {searchTerm ? 'No se encontraron administradores que coincidan con tu búsqueda.' : 'Comienza creando tu primer administrador.'}
          </p>
        </div>
      );
    }

    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-foreground">Nombre</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Tipo persona</TableHead>
              <TableHead className="font-semibold text-foreground">RFC</TableHead>
              <TableHead className="font-semibold text-foreground">CURP</TableHead>
              <TableHead className="font-semibold text-foreground">Representante legal</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAdministradores.map((administrador) => (
              <TableRow key={administrador.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {administrador.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {administrador.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {administrador.telefono || 'N/A'}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    administrador.tipo_persona === 'pf' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  }`}>
                    {administrador.tipo_persona === 'pf' ? 'Física' : 'Moral'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {administrador.rfc || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {administrador.curp || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {administrador.representante_legal_nombre || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(administrador)}
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(administrador)}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBankAccounts(administrador)}
                          className="h-8 px-2 text-xs hover:bg-accent"
                        >
                          Cuentas
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"  
                        size="sm"
                        onClick={() => handleRestore(administrador)}
                        className="h-8 w-8 p-0 hover:bg-success/10 hover:text-success"
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

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Administradores
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los administradores
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Administrador
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeAdministradores.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedAdministradores.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, CURP, RFC..."
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

      {/* Dialog para nuevo administrador */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Administrador</DialogTitle>
          </DialogHeader>
           <PersonForm
             onSubmit={(data) => createMutation.mutate(data)}
             isLoading={createMutation.isPending}
             onCancel={() => setIsNewDialogOpen(false)}
             entityType="administrador"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar administrador */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Administrador</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingAdministrador,
               representativeId: editingAdministrador?.id_entidad_relacionada_rep_leg
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingAdministrador(null);
             }}
              entityType="administrador"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para cuentas bancarias */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedAdministradorForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedAdministradorForBankAccounts && (
            <BankAccountsSection
              personId={selectedAdministradorForBankAccounts.id}
              showStpCheckbox={false}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Administrador"
        description={`¿Estás seguro de que deseas eliminar al administrador "${administradorToDelete?.nombre_legal}"? Esta acción se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Administrador"
        description={`¿Estás seguro de que deseas restaurar al administrador "${administradorToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}