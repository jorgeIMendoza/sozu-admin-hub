import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, CreditCard, UserX, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Comprador = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  rfc?: string;
  tipo_persona: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  id_estado_civil?: number;
  id_conyuge?: number;
  representante_legal_nombre?: string;
  estado_civil_nombre?: string;
  conyuge_nombre?: string;
};

export default function Compradores() {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  
  // Initialize search term from URL parameters
  useEffect(() => {
    const urlSearchTerm = searchParams.get('search');
    if (urlSearchTerm) {
      setSearchTerm(urlSearchTerm);
    }
  }, [searchParams]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingComprador, setEditingComprador] = useState<Comprador | null>(null);
  const [selectedCompradorForBankAccounts, setSelectedCompradorForBankAccounts] = useState<Comprador | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [compradorToDelete, setCompradorToDelete] = useState<Comprador | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [compradorToRestore, setCompradorToRestore] = useState<Comprador | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeCompradores = [], isLoading: loadingActive } = useQuery({
    queryKey: ['compradores', 'active'],
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
          id_estado_civil,
          id_conyuge,
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
          ),
          estados_civil (
            nombre
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 2)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      if (error) throw error;
      
      // Obtener nombres de cónyuges en una segunda consulta
      const personasConConyuge = data?.filter((p: any) => p.id_conyuge) || [];
      const idsConyuges = personasConConyuge.map((p: any) => p.id_conyuge);
      
      let conyugesMap = new Map();
      if (idsConyuges.length > 0) {
        const { data: conyugesData } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .in('id', idsConyuges);
        
        conyugesMap = new Map(conyugesData?.map((c: any) => [c.id, c.nombre_legal]) || []);
      }
      
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
        id_estado_civil: item.id_estado_civil,
        id_conyuge: item.id_conyuge,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        estado_civil_nombre: item.estados_civil?.nombre,
        conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
      })) as (Comprador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const { data: deletedCompradores = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['compradores', 'deleted'],
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
          id_estado_civil,
          id_conyuge,
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
          ),
          estados_civil (
            nombre
          )
        `)
        .eq('activo', false)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 2)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      if (error) throw error;
      
      // Obtener nombres de cónyuges en una segunda consulta
      const personasConConyuge = data?.filter((p: any) => p.id_conyuge) || [];
      const idsConyuges = personasConConyuge.map((p: any) => p.id_conyuge);
      
      let conyugesMap = new Map();
      if (idsConyuges.length > 0) {
        const { data: conyugesData } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .in('id', idsConyuges);
        
        conyugesMap = new Map(conyugesData?.map((c: any) => [c.id, c.nombre_legal]) || []);
      }
      
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
        id_estado_civil: item.id_estado_civil,
        id_conyuge: item.id_conyuge,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        estado_civil_nombre: item.estados_civil?.nombre,
        conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
      })) as (Comprador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const compradores = activeTab === 'active' ? activeCompradores : deletedCompradores;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
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
          id_tipo_entidad: 2, // Comprador
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

      // Si se creó con id_conyuge, sincronizar cuentas de compradores
      if (cleanPersonData.id_conyuge && personResult.id) {
        const { data: syncResult, error: syncError } = await supabase
          .rpc('sync_conyuge_compradores', {
            p_id_persona: personResult.id
          });
        
        if (syncError) {
          console.error('Error al sincronizar cónyuge en compradores:', syncError);
          throw new Error(`Error al sincronizar compradores: ${syncError.message}`);
        }
        
        console.log('Sincronización de cónyuge completada:', syncResult);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Comprador creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el comprador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingComprador?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingComprador?.id);
          
        if (repError) throw repError;
      }

      // Si se actualizó el id_conyuge, sincronizar cuentas de compradores
      if (cleanPersonData.id_conyuge !== undefined && editingComprador?.id) {
        const { data: syncResult, error: syncError } = await supabase
          .rpc('sync_conyuge_compradores', {
            p_id_persona: editingComprador.id
          });
        
        if (syncError) {
          console.error('Error al sincronizar cónyuge en compradores:', syncError);
          throw new Error(`Error al sincronizar compradores: ${syncError.message}`);
        }
        
        console.log('Sincronización de cónyuge completada:', syncResult);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      setIsEditDialogOpen(false);
      setEditingComprador(null);
      toast({
        title: "Éxito",
        description: "Comprador actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el comprador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      toast({
        title: "Éxito",
        description: "Comprador eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el comprador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      toast({
        title: "Éxito",
        description: "Comprador restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el comprador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredCompradores = compradores.filter(comprador => 
    comprador.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comprador.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comprador.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comprador.rfc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comprador.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (comprador: Comprador) => {
    setEditingComprador(comprador);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (comprador: Comprador) => {
    setCompradorToDelete(comprador);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (compradorToDelete) {
      deleteMutation.mutate(compradorToDelete.id);
      setDeleteDialogOpen(false);
      setCompradorToDelete(null);
    }
  };

  const handleRestore = (comprador: Comprador) => {
    setCompradorToRestore(comprador);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (compradorToRestore) {
      restoreMutation.mutate(compradorToRestore.id);
      setRestoreDialogOpen(false);
      setCompradorToRestore(null);
    }
  };

  const handleBankAccounts = (comprador: Comprador) => {
    setSelectedCompradorForBankAccounts(comprador);
    setIsBankAccountsDialogOpen(true);
  };

  function renderTable() {
    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando compradores...</p>
        </div>
      );
    }

    if (filteredCompradores.length === 0) {
      return (
        <div className="text-center py-12">
          <UserX className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No hay compradores</h3>
          <p className="mt-2 text-muted-foreground">
            {searchTerm ? 'No se encontraron compradores que coincidan con tu búsqueda.' : 'Comienza creando tu primer comprador.'}
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
              <TableHead className="font-semibold text-foreground">Estado civil</TableHead>
              <TableHead className="font-semibold text-foreground">Representante legal</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCompradores.map((comprador) => (
              <TableRow key={comprador.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {comprador.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.telefono || 'N/A'}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    comprador.tipo_persona === 'pf' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  }`}>
                    {comprador.tipo_persona === 'pf' ? 'Física' : 'Moral'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.rfc || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.curp || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.tipo_persona === 'pf' ? (
                    <div className="flex items-center gap-2">
                      <span>{comprador.estado_civil_nombre || 'N/A'}</span>
                      {comprador.id_estado_civil === 2 && comprador.conyuge_nombre && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HeartHandshake className="h-5 w-5 text-pink-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Cónyuge: {comprador.conyuge_nombre}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.representante_legal_nombre || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(comprador)}
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(comprador)}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleBankAccounts(comprador)}
                                className="h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground"
                              >
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Gestionar cuentas bancarias</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    ) : (
                      <Button
                        variant="ghost"  
                        size="sm"
                        onClick={() => handleRestore(comprador)}
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
                Compradores
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los compradores
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Comprador
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeCompradores.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedCompradores.length})</TabsTrigger>
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

      {/* Dialog para nuevo comprador */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Comprador</DialogTitle>
          </DialogHeader>
            <PersonForm
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              onCancel={() => setIsNewDialogOpen(false)}
              entityType="comprador"
            />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar comprador */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Comprador</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingComprador,
               representativeId: editingComprador?.id_entidad_relacionada_rep_leg
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingComprador(null);
             }}
             entityType="comprador"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para cuentas bancarias */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedCompradorForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedCompradorForBankAccounts && (
            <BankAccountsSection
              personId={selectedCompradorForBankAccounts.id}
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
        title="Eliminar Comprador"
        description={`¿Estás seguro de que deseas eliminar al comprador "${compradorToDelete?.nombre_legal}"? Esta acción se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Comprador"
        description={`¿Estás seguro de que deseas restaurar al comprador "${compradorToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}