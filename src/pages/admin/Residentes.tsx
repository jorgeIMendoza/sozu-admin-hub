import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, UserX, RotateCcw } from "lucide-react";
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
import { usePagePermissions } from "@/hooks/usePagePermissions";

type Residente = {
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

export default function Residentes() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/residentes');
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingResidente, setEditingResidente] = useState<Residente | null>(null);
  const [selectedResidenteForBankAccounts, setSelectedResidenteForBankAccounts] = useState<Residente | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [residenteToDelete, setResidenteToDelete] = useState<Residente | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [residenteToRestore, setResidenteToRestore] = useState<Residente | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: activeResidentes = [], isLoading: loadingActive } = useQuery({
    queryKey: ['residentes', 'active'],
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
        .eq('entidades_relacionadas.id_tipo_entidad', 18)
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
      })) as (Residente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const { data: deletedResidentes = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['residentes', 'deleted'],
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
        .eq('entidades_relacionadas.id_tipo_entidad', 18)
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
      })) as (Residente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const residentes = activeTab === 'active' ? activeResidentes : deletedResidentes;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([cleanPersonData])
        .select()
        .single();
      
      if (personError) throw personError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 18, // Residente
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
      queryClient.invalidateQueries({ queryKey: ['residentes'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Residente creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el residente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingResidente?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingResidente?.id);
          
        if (repError) throw repError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residentes'] });
      setIsEditDialogOpen(false);
      setEditingResidente(null);
      toast({
        title: "Éxito",
        description: "Residente actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el residente: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['residentes'] });
      toast({
        title: "Éxito",
        description: "Residente eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el residente: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['residentes'] });
      toast({
        title: "Éxito",
        description: "Residente restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el residente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredResidentes = residentes.filter(residente => 
    residente.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    residente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    residente.telefono?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (residente: Residente) => {
    setEditingResidente(residente);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (residente: Residente) => {
    setResidenteToDelete(residente);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (residenteToDelete) {
      deleteMutation.mutate(residenteToDelete.id);
      setDeleteDialogOpen(false);
      setResidenteToDelete(null);
    }
  };

  const handleRestore = (residente: Residente) => {
    setResidenteToRestore(residente);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (residenteToRestore) {
      restoreMutation.mutate(residenteToRestore.id);
      setRestoreDialogOpen(false);
      setResidenteToRestore(null);
    }
  };

  const handleBankAccounts = (residente: Residente) => {
    setSelectedResidenteForBankAccounts(residente);
    setIsBankAccountsDialogOpen(true);
  };

  function renderTable() {
    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando residentes...</p>
        </div>
      );
    }

    if (filteredResidentes.length === 0) {
      return (
        <div className="text-center py-12">
          <UserX className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No hay residentes</h3>
          <p className="mt-2 text-muted-foreground">
            {searchTerm ? 'No se encontraron residentes que coincidan con tu búsqueda.' : 'Comienza creando tu primer residente.'}
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
            {filteredResidentes.map((residente) => (
              <TableRow key={residente.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {residente.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {residente.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {residente.telefono || 'N/A'}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    residente.tipo_persona === 'pf' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  }`}>
                    {residente.tipo_persona === 'pf' ? 'Física' : 'Moral'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {residente.rfc || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {residente.curp || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {residente.representante_legal_nombre || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(residente)}
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(residente)}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBankAccounts(residente)}
                          className="h-8 px-2 text-xs hover:bg-accent"
                        >
                          Cuentas
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"  
                        size="sm"
                        onClick={() => handleRestore(residente)}
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
                Residentes
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los residentes
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Residente
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeResidentes.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedResidentes.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, CURP, RFC..."
                  ref={searchInputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
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

      {/* Dialog para nuevo residente */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Residente</DialogTitle>
          </DialogHeader>
           <PersonForm
             onSubmit={(data) => createMutation.mutate(data)}
             isLoading={createMutation.isPending}
             onCancel={() => setIsNewDialogOpen(false)}
              entityType="residente"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar residente */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Residente</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingResidente,
               representativeId: editingResidente?.id_entidad_relacionada_rep_leg
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingResidente(null);
             }}
             entityType="residente"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para cuentas bancarias */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedResidenteForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedResidenteForBankAccounts && (
            <BankAccountsSection
              personId={selectedResidenteForBankAccounts.id}
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
        title="Eliminar Residente"
        description={`¿Estás seguro de que deseas eliminar al residente "${residenteToDelete?.nombre_legal}"? Esta acción se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Residente"
        description={`¿Estás seguro de que deseas restaurar al residente "${residenteToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}