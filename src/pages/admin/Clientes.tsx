import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Users, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { BeneficiariosForm } from "@/components/admin/BeneficiariosForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { usePagePermissions } from "@/hooks/usePagePermissions";

type Cliente = {
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

export default function Clientes() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/clientes');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBeneficiariosDialogOpen, setIsBeneficiariosDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [selectedClientForBeneficiarios, setSelectedClientForBeneficiarios] = useState<Cliente | null>(null);
  const [selectedClientForBankAccounts, setSelectedClientForBankAccounts] = useState<Cliente | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Cliente | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [clientToRestore, setClientToRestore] = useState<Cliente | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();

  const { data: activeClientes = [], isLoading: loadingActive } = useQuery({
    queryKey: ['clientes', 'active'],
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
            id_tipo_entidad,
            tipos_entidad!inner (
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
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.tipos_entidad.padre', 'c')
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
      })) as (Cliente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const { data: deletedClientes = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['clientes', 'deleted'],
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
            id_tipo_entidad,
            tipos_entidad!inner (
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
        .eq('activo', false)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.tipos_entidad.padre', 'c')
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
      })) as (Cliente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const clientes = activeTab === 'active' ? activeClientes : deletedClientes;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;

  // Check if client can be deleted (not in any offers)  
  const { data: canDeleteData = [] } = useQuery({
    queryKey: ['client_offers', clientes.map(c => c.id)],
    queryFn: async () => {
      if (!clientes.length) return [];
      
      const clientIds = clientes.map(c => c.id);
      
      const { data, error } = await supabase
        .from('ofertas')
        .select('id, id_persona_lead')
        .in('id_persona_lead', clientIds)
        .eq('activo', true);
      
      if (error) throw error;
      
      return clientIds.map(clientId => ({
        clientId,
        canDelete: !data?.some(offer => offer.id_persona_lead === clientId)
      }));
    },
    enabled: clientes.length > 0
  });

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
          id_tipo_entidad: entityType,
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setIsNewDialogOpen(false);
      
      // Registrar actividad
      registrarCreacion('cliente', {
        nombre_legal: variables.nombre_legal,
        email: variables.email,
        tipo_persona: variables.tipo_persona
      });
      
      toast({
        title: "Éxito",
        description: "Cliente creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el cliente: ${error.message}`,
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
        .eq('id', editingClient?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingClient?.id);
          
        if (repError) throw repError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      
      // Registrar actividad
      registrarActualizacion('cliente', 
        { id: editingClient?.id, nombre_legal: editingClient?.nombre_legal },
        { id: editingClient?.id, ...variables }
      );
      
      setIsEditDialogOpen(false);
      setEditingClient(null);
      toast({
        title: "Éxito",
        description: "Cliente actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el cliente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (cliente: Cliente) => {
      const { error } = await supabase
        .from('personas')
        .update({ activo: false })
        .eq('id', cliente.id);
      
      if (error) throw error;
      return cliente;
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      
      // Registrar actividad
      registrarEliminacion('cliente', {
        id: cliente.id,
        nombre_legal: cliente.nombre_legal,
        email: cliente.email
      });
      
      toast({
        title: "Éxito",
        description: "Cliente eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el cliente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (cliente: Cliente) => {
      const { error } = await supabase
        .from('personas')
        .update({ activo: true })
        .eq('id', cliente.id);
      
      if (error) throw error;
      return cliente;
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      
      // Registrar actividad
      registrarRestauracion('cliente', 
        { id: cliente.id, activo: false },
        { id: cliente.id, nombre_legal: cliente.nombre_legal, activo: true }
      );
      
      toast({
        title: "Éxito",
        description: "Cliente restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el cliente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredClientes = clientes.filter(cliente => 
    cliente.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.curp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canDeleteClient = (clientId: number) => {
    const canDeleteInfo = canDeleteData.find(c => c.clientId === clientId);
    return canDeleteInfo?.canDelete ?? false;
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingClient(cliente);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (cliente: Cliente) => {
    setClientToDelete(cliente);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (clientToDelete) {
      deleteMutation.mutate(clientToDelete);
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    }
  };

  const handleRestore = (cliente: Cliente) => {
    setClientToRestore(cliente);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (clientToRestore) {
      restoreMutation.mutate(clientToRestore);
      setRestoreDialogOpen(false);
      setClientToRestore(null);
    }
  };

  const handleBeneficiarios = (cliente: Cliente) => {
    setSelectedClientForBeneficiarios(cliente);
    setIsBeneficiariosDialogOpen(true);
  };

  const handleBankAccounts = (cliente: Cliente) => {
    setSelectedClientForBankAccounts(cliente);
    setIsBankAccountsDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Clientes
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los clientes
              </p>
            </div>
            {(canCreate || isSuperAdmin) && (
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Cliente
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${(canDelete || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1'} mb-6`}>
              <TabsTrigger value="active">Activos ({activeClientes.length})</TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">Eliminados ({deletedClientes.length})</TabsTrigger>
              )}
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

      {/* Dialog para nuevo cliente */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
          </DialogHeader>
           <PersonForm
             onSubmit={(data) => createMutation.mutate(data)}
             isLoading={createMutation.isPending}
             onCancel={() => setIsNewDialogOpen(false)}
             entityType="client"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar cliente */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingClient,
               representativeId: editingClient?.id_entidad_relacionada_rep_leg
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingClient(null);
             }}
             entityType="client"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para gestionar beneficiarios */}
      <Dialog open={isBeneficiariosDialogOpen} onOpenChange={setIsBeneficiariosDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar Beneficiarios - {selectedClientForBeneficiarios?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedClientForBeneficiarios && (
            <BeneficiariosForm
              personaId={selectedClientForBeneficiarios.id}
              personaNombre={selectedClientForBeneficiarios.nombre_legal}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para cuentas bancarias */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedClientForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedClientForBankAccounts && (
            <BankAccountsSection
              personId={selectedClientForBankAccounts.id}
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
        title="Eliminar Cliente"
        description={`¿Estás seguro de que quieres eliminar al cliente "${clientToDelete?.nombre_legal}"? Esta acción no se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Cliente"
        description={`¿Estás seguro de que quieres restaurar al cliente "${clientToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );

  function renderTable() {
    if (filteredClientes.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' ? 'No hay clientes activos' : 'No hay clientes eliminados'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primer cliente para comenzar' : 'Los clientes eliminados aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Cliente
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
               <TableHead className="font-semibold text-foreground">Tipo</TableHead>
               <TableHead className="font-semibold text-foreground">Email</TableHead>
               <TableHead className="font-semibold text-foreground">RFC</TableHead>
               <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
               <TableHead className="font-semibold text-foreground">CURP</TableHead>
               <TableHead className="font-semibold text-foreground">Representante Legal</TableHead>
               <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClientes.map((cliente) => (
              <TableRow key={cliente.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {cliente.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cliente.tipo_persona === 'pf' ? 'Persona Física' : 'Persona Moral'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cliente.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cliente.rfc || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cliente.telefono || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cliente.curp || '-'}
                </TableCell>
                 <TableCell className="text-muted-foreground">
                   {cliente.tipo_persona === 'pm' ? (cliente.representante_legal_nombre || '-') : '-'}
                 </TableCell>
                 <TableCell className="text-right">
                   <div className="flex gap-2 justify-end">
                     {activeTab === 'active' ? (
                       <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleBeneficiarios(cliente)}
                            className="hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors"
                            title="Gestionar Beneficiarios"
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleBankAccounts(cliente)}
                            className="hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                            title="Gestionar cuentas bancarias"
                          >
                            💳
                          </Button>
                         {(canUpdate || isSuperAdmin) && (
                           <Button 
                             variant="outline" 
                             size="sm"
                             onClick={() => handleEdit(cliente)}
                             className="hover:bg-primary/10 hover:border-primary transition-colors"
                           >
                             <Edit className="h-4 w-4" />
                           </Button>
                         )}
                         {(canDelete || isSuperAdmin) && (
                           <Button 
                             variant="outline" 
                             size="sm"
                             onClick={() => handleDelete(cliente)}
                             disabled={!canDeleteClient(cliente.id)}
                             className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                             title={!canDeleteClient(cliente.id) ? "No se puede eliminar: tiene ofertas activas" : "Eliminar cliente"}
                           >
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         )}
                       </>
                     ) : (
                       (canApprove || isSuperAdmin) && (
                         <Button 
                           variant="outline" 
                           size="sm"
                           onClick={() => handleRestore(cliente)}
                           className="hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                         >
                           <RotateCcw className="w-4 h-4" />
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
