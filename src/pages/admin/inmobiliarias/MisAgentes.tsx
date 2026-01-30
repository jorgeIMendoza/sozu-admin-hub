import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, CreditCard, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

type Agente = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  clave_pais_telefono?: string;
  rfc?: string;
  activo: boolean;
  entidad_relacionada_id?: number;
};

const ITEMS_PER_PAGE = 50;

export default function MisAgentes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgente, setEditingAgente] = useState<Agente | null>(null);
  const [selectedAgenteForBankAccounts, setSelectedAgenteForBankAccounts] = useState<Agente | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agenteToDelete, setAgenteToDelete] = useState<Agente | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdate, canDelete, canExport } = usePagePermissions('/admin/inmobiliarias/mis-agentes');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();

  // Get the inmobiliaria ID for the current user
  const { data: inmobiliariaId, isLoading: loadingInmobiliaria } = useQuery({
    queryKey: ['current-user-inmobiliaria', profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return null;
      
      // Get the entidades_relacionadas for type 5 (Inmobiliaria) where id_persona matches
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_persona', profile.id_persona)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .single();
      
      if (error || !data) {
        // If not found directly, the user might be linked to a persona that is the inmobiliaria
        return profile.id_persona;
      }
      
      return data.id_persona;
    },
    enabled: !!profile?.id_persona,
  });

  const { data: agentes = [], isLoading: loadingAgentes } = useQuery({
    queryKey: ['mis-agentes', inmobiliariaId],
    queryFn: async () => {
      if (!inmobiliariaId) return [];

      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          clave_pais_telefono,
          rfc,
          activo,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_persona_duena_lead
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 19)
        .eq('entidades_relacionadas.id_persona_duena_lead', inmobiliariaId)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0]?.id,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        clave_pais_telefono: item.clave_pais_telefono,
        rfc: item.rfc,
        activo: item.activo,
      })) as Agente[];
    },
    enabled: !!inmobiliariaId,
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId: _, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingAgente?.id);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-agentes'] });
      setIsEditDialogOpen(false);
      setEditingAgente(null);
      toast({
        title: "Éxito",
        description: "Agente actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el agente: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['mis-agentes'] });
      toast({
        title: "Éxito",
        description: "Agente eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el agente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredAgentes = useMemo(() => {
    return agentes.filter(agente =>
      agente.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [agentes, searchTerm]);

  const totalPages = Math.ceil(filteredAgentes.length / ITEMS_PER_PAGE);
  const paginatedAgentes = filteredAgentes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleExport = async () => {
    const exportData = filteredAgentes.map(agente => ({
      'Nombre': agente.nombre_legal,
      'Email': agente.email,
      'Teléfono': agente.telefono || '',
      'RFC': agente.rfc || '',
    }));

    await exportToExcel({ data: exportData, filename: 'Mis_Agentes' });
  };

  const isLoading = loadingInmobiliaria || loadingAgentes;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Agentes</h1>
          <p className="text-muted-foreground">
            Gestiona los agentes de tu inmobiliaria
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || filteredAgentes.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Exportar'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agentes ({filteredAgentes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por nombre, email, teléfono o RFC..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAgentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No se encontraron agentes
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedAgentes.map((agente) => (
                    <TableRow key={agente.id}>
                      <TableCell className="font-medium">{agente.nombre_legal}</TableCell>
                      <TableCell>{agente.email}</TableCell>
                      <TableCell>
                        <PhoneDisplay
                          clavePaisTelefono={agente.clave_pais_telefono}
                          telefono={agente.telefono}
                        />
                      </TableCell>
                      <TableCell>{agente.rfc || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canUpdate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingAgente(agente);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedAgenteForBankAccounts(agente);
                              setIsBankAccountsDialogOpen(true);
                            }}
                          >
                            <CreditCard className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setAgenteToDelete(agente);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAgentes.length)} de {filteredAgentes.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agente</DialogTitle>
          </DialogHeader>
          <PersonForm
            entityType="agente"
            initialData={editingAgente ? {
              ...editingAgente,
              tipo_persona: 'pf',
            } : undefined}
            onSubmit={(data) => updateMutation.mutate(data)}
            onCancel={() => setIsEditDialogOpen(false)}
            isLoading={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Bank Accounts Dialog */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedAgenteForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedAgenteForBankAccounts && (
            <BankAccountsSection personId={selectedAgenteForBankAccounts.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => {
          if (agenteToDelete) {
            deleteMutation.mutate(agenteToDelete.id);
            setDeleteDialogOpen(false);
            setAgenteToDelete(null);
          }
        }}
        title="Eliminar Agente"
        description={`¿Estás seguro de que deseas eliminar al agente "${agenteToDelete?.nombre_legal}"? Esta acción también desactivará su usuario del sistema.`}
      />
    </div>
  );
}
