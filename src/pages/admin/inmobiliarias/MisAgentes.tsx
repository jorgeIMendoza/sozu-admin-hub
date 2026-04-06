import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, FileSpreadsheet, RotateCcw, UserX, Plus, Upload } from "lucide-react";
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
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { InmobiliariaHeader } from "@/components/admin/InmobiliariaHeader";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { BulkUploadMisAgentesDialog } from "@/components/admin/BulkUploadMisAgentesDialog";

type Agente = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  clave_pais_telefono?: string;
  rfc?: string;
  activo: boolean;
  entidad_relacionada_id?: number;
  usuario_activo?: boolean | null;
};

const ITEMS_PER_PAGE = 50;

export default function MisAgentes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgente, setEditingAgente] = useState<Agente | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [agenteToDelete, setAgenteToDelete] = useState<Agente | null>(null);
  const [agenteToRestore, setAgenteToRestore] = useState<Agente | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("activos");
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<number | null>(null);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canUpdate, canDelete, canExport, canApprove } = usePagePermissions('/admin/inmobiliarias/mis-agentes');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();

  const inmobiliariaId = selectedInmobiliariaId;

  // Get inmobiliaria name for bulk upload
  const { data: inmobiliariaData } = useQuery({
    queryKey: ['inmobiliaria-nombre', inmobiliariaId],
    queryFn: async () => {
      if (!inmobiliariaId) return null;
      const { data, error } = await supabase
        .from('personas')
        .select('nombre_legal, nombre_comercial')
        .eq('id', inmobiliariaId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!inmobiliariaId,
  });

  const inmobiliariaNombre = inmobiliariaData?.nombre_comercial || inmobiliariaData?.nombre_legal || 'Inmobiliaria';

  // Query for active agents
  const { data: agentesActivos = [], isLoading: loadingActivos } = useQuery({
    queryKey: ['mis-agentes-activos', inmobiliariaId],
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

      // Get user status for agents
      const personaIds = (data || []).map((item: any) => item.id);
      let userStatusMap: Record<number, boolean | null> = {};
      
      if (personaIds.length > 0) {
        const { data: usuariosData } = await supabase
          .from('usuarios')
          .select('id_persona, activo')
          .in('id_persona', personaIds);
        
        if (usuariosData) {
          usuariosData.forEach((u: any) => {
            if (u.id_persona) {
              userStatusMap[u.id_persona] = u.activo;
            }
          });
        }
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0]?.id,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        clave_pais_telefono: item.clave_pais_telefono,
        rfc: item.rfc,
        activo: item.activo,
        usuario_activo: userStatusMap[item.id] ?? null,
      })) as Agente[];
    },
    enabled: !!inmobiliariaId,
  });

  // Query for inactive (deleted) agents
  const { data: agentesEliminados = [], isLoading: loadingEliminados } = useQuery({
    queryKey: ['mis-agentes-eliminados', inmobiliariaId],
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
        .eq('activo', false)
        .eq('entidades_relacionadas.id_tipo_entidad', 19)
        .eq('entidades_relacionadas.id_persona_duena_lead', inmobiliariaId)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });

      if (error) throw error;

      // Get user status for agents
      const personaIds = (data || []).map((item: any) => item.id);
      let userStatusMap: Record<number, boolean | null> = {};
      
      if (personaIds.length > 0) {
        const { data: usuariosData } = await supabase
          .from('usuarios')
          .select('id_persona, activo')
          .in('id_persona', personaIds);
        
        if (usuariosData) {
          usuariosData.forEach((u: any) => {
            if (u.id_persona) {
              userStatusMap[u.id_persona] = u.activo;
            }
          });
        }
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0]?.id,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        clave_pais_telefono: item.clave_pais_telefono,
        rfc: item.rfc,
        activo: item.activo,
        usuario_activo: userStatusMap[item.id] ?? null,
      })) as Agente[];
    },
    enabled: !!inmobiliariaId && canDelete,
  });

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId: formInmobiliariaId, ...cleanPersonData } = personData;
      
      // Create the persona
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([cleanPersonData])
        .select()
        .single();
      
      if (personError) throw personError;
      
      // Create the entidad_relacionada linking to the inmobiliaria
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 19, // Agente
          id_proyecto: null,
          id_persona_duena_lead: inmobiliariaId,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;

      // Set representative if provided
      if (representativeId && cleanPersonData.tipo_persona === 'pm') {
        const { error: updateError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId })
          .eq('id', personResult.id);
          
        if (updateError) throw updateError;
      }

      // Automatically create user with role Agente Inmobiliario (3)
      try {
        const { error: userError } = await supabase.functions.invoke('create-user', {
          body: {
            email: cleanPersonData.email,
            nombre: cleanPersonData.nombre_legal,
            rol_id: 3, // Agente Inmobiliario
            id_persona: personResult.id,
            telefono: cleanPersonData.telefono || null,
            clave_pais_telefono: cleanPersonData.clave_pais_telefono || null,
            id_inmobiliaria: inmobiliariaId,
            auto_create: true // Required to bypass Super Admin check for automated agent creation
          }
        });
        
        if (userError) {
          console.error('Error al crear usuario automático:', userError);
        }
      } catch (e) {
        console.error('Error al crear usuario automático:', e);
      }
    },
    onSuccess: (_, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-activos'] });
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-eliminados'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewDialogOpen(false);
      
      // Registrar actividad
      registrarCreacion('agente', {
        nombre_legal: variables.nombre_legal,
        email: variables.email,
        inmobiliaria_id: inmobiliariaId
      });
      
      toast({
        title: "Éxito",
        description: "Agente y usuario creados correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el agente: ${error.message}`,
        variant: "destructive",
      });
    },
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
    onSuccess: (_, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-activos'] });
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-eliminados'] });
      
      // Registrar actividad
      registrarActualizacion('agente', 
        { id: editingAgente?.id, nombre_legal: editingAgente?.nombre_legal }, 
        { id: editingAgente?.id, nombre_legal: variables.nombre_legal, email: variables.email }
      );
      
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
      // Deactivate the persona
      const { error } = await supabase
        .from('personas')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
      // Note: User deactivation is handled by database trigger
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-activos'] });
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-eliminados'] });
      
      // Registrar actividad
      if (agenteToDelete) {
        registrarEliminacion('agente', {
          id: agenteToDelete.id,
          nombre_legal: agenteToDelete.nombre_legal,
          email: agenteToDelete.email
        });
      }
      
      setDeleteDialogOpen(false);
      setAgenteToDelete(null);
      toast({
        title: "Éxito",
        description: "Agente eliminado y usuario desactivado correctamente.",
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

  const restoreMutation = useMutation({
    mutationFn: async (agente: Agente) => {
      // Reactivate the persona
      const { error: personaError } = await supabase
        .from('personas')
        .update({ activo: true })
        .eq('id', agente.id);
      
      if (personaError) throw personaError;

      // Reactivate the user if exists
      const { error: userError } = await supabase
        .from('usuarios')
        .update({ activo: true })
        .eq('id_persona', agente.id);
      
      if (userError) throw userError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-activos'] });
      queryClient.invalidateQueries({ queryKey: ['mis-agentes-eliminados'] });
      
      // Registrar actividad
      if (agenteToRestore) {
        registrarRestauracion('agente', 
          { id: agenteToRestore.id, nombre_legal: agenteToRestore.nombre_legal, activo: false },
          { id: agenteToRestore.id, nombre_legal: agenteToRestore.nombre_legal, activo: true }
        );
      }
      
      setRestoreDialogOpen(false);
      setAgenteToRestore(null);
      toast({
        title: "Éxito",
        description: "Agente restaurado y usuario reactivado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el agente: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const currentAgentes = activeTab === "activos" ? agentesActivos : agentesEliminados;

  const filteredAgentes = useMemo(() => {
    return currentAgentes.filter(agente =>
      agente.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentAgentes, searchTerm]);

  const totalPages = Math.ceil(filteredAgentes.length / ITEMS_PER_PAGE);
  const paginatedAgentes = filteredAgentes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Count helpers for tab display
  const filteredActivosCount = useMemo(() => {
    if (!searchTerm) return agentesActivos.length;
    return agentesActivos.filter(a =>
      a.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
    ).length;
  }, [agentesActivos, searchTerm]);

  const filteredEliminadosCount = useMemo(() => {
    if (!searchTerm) return agentesEliminados.length;
    return agentesEliminados.filter(a =>
      a.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
    ).length;
  }, [agentesEliminados, searchTerm]);

  const handleExport = async () => {
    const exportData = filteredAgentes.map(agente => ({
      'Nombre': agente.nombre_legal,
      'Email': agente.email,
      'Teléfono': agente.telefono || '',
      'RFC': agente.rfc || '',
    }));

    await exportToExcel({ data: exportData, filename: 'Mis_Agentes' });
  };

  const isLoading = loadingActivos || loadingEliminados;

  if (isLoading && !selectedInmobiliariaId) {
    return (
      <div className="space-y-6">
        <InmobiliariaHeader
          selectedInmobiliariaId={selectedInmobiliariaId}
          onInmobiliariaChange={setSelectedInmobiliariaId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InmobiliariaHeader
        selectedInmobiliariaId={selectedInmobiliariaId}
        onInmobiliariaChange={setSelectedInmobiliariaId}
      />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Agentes</h1>
          <p className="text-muted-foreground">
            Gestiona los agentes de tu inmobiliaria
          </p>
        </div>
        <div className="flex gap-2">
          {canCreate && inmobiliariaId && (
            <>
              <Button onClick={() => setIsNewDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Agente
              </Button>
              <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Carga Masiva
              </Button>
            </>
          )}
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agentes</CardTitle>
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

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentPage(1); }}>
            <TabsList>
              <TabsTrigger value="activos">
                Activos {searchTerm ? `(${filteredActivosCount} de ${agentesActivos.length})` : `(${agentesActivos.length})`}
              </TabsTrigger>
              {canDelete && (
                <TabsTrigger value="eliminados">
                  Eliminados {searchTerm ? `(${filteredEliminadosCount} de ${agentesEliminados.length})` : `(${agentesEliminados.length})`}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="activos" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Estado Usuario</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAgentes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No se encontraron agentes
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedAgentes.map((agente) => (
                        <TableRow key={agente.id}>
                          <TableCell className="font-medium">{agente.nombre_legal}</TableCell>
                          <TableCell>
                            {agente.usuario_activo === false ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                <UserX className="h-3 w-3" />
                                Usuario desactivado
                              </span>
                            ) : agente.usuario_activo === true ? (
                              <span className="text-xs text-muted-foreground">Activo</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin usuario</span>
                            )}
                          </TableCell>
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
                                  onClick={async () => {
                                    const { data: fullPersona } = await supabase
                                      .from('personas')
                                      .select('*')
                                      .eq('id', agente.id)
                                      .single();
                                    setEditingAgente(fullPersona ? { ...agente, ...fullPersona, id_inmobiliaria: agente.id_inmobiliaria } as any : agente);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
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
            </TabsContent>

            {canDelete && (
              <TabsContent value="eliminados" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Estado Usuario</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedAgentes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No se encontraron agentes eliminados
                        </TableCell>
                      </TableRow>
                    ) : (
                        paginatedAgentes.map((agente) => (
                        <TableRow key={agente.id}>
                          <TableCell className="font-medium">{agente.nombre_legal}</TableCell>
                          <TableCell>
                            {agente.usuario_activo === false ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                <UserX className="h-3 w-3" />
                                Usuario desactivado
                              </span>
                            ) : agente.usuario_activo === true ? (
                              <span className="text-xs text-muted-foreground">Activo</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin usuario</span>
                            )}
                          </TableCell>
                          <TableCell>{agente.email}</TableCell>
                          <TableCell>
                            <PhoneDisplay
                              clavePaisTelefono={agente.clave_pais_telefono}
                              telefono={agente.telefono}
                            />
                          </TableCell>
                          <TableCell>{agente.rfc || '-'}</TableCell>
                            <TableCell className="text-right">
                              {canApprove && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setAgenteToRestore(agente);
                                    setRestoreDialogOpen(true);
                                  }}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>

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

      {/* New Agent Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Agente</DialogTitle>
          </DialogHeader>
          <PersonForm
            entityType="agente"
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setIsNewDialogOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

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


      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => {
          if (agenteToDelete) {
            deleteMutation.mutate(agenteToDelete.id);
          }
        }}
        isLoading={deleteMutation.isPending}
        title="Eliminar Agente"
        description={`¿Estás seguro de que deseas eliminar al agente "${agenteToDelete?.nombre_legal}"?`}
        warningMessage="Esta acción también desactivará el acceso del usuario asociado al sistema."
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={() => {
          if (agenteToRestore) {
            restoreMutation.mutate(agenteToRestore);
          }
        }}
        isLoading={restoreMutation.isPending}
        title="Restaurar Agente"
        description={`¿Estás seguro de que deseas restaurar al agente "${agenteToRestore?.nombre_legal}"?`}
        warningMessage="Esta acción también reactivará el acceso del usuario asociado al sistema."
        actionType="restore"
      />

      {/* Bulk Upload Dialog */}
      {inmobiliariaId && (
        <BulkUploadMisAgentesDialog
          open={isBulkUploadOpen}
          onClose={() => setIsBulkUploadOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['mis-agentes-activos'] });
            queryClient.invalidateQueries({ queryKey: ['mis-agentes-eliminados'] });
          }}
          inmobiliariaId={inmobiliariaId}
          inmobiliariaNombre={inmobiliariaNombre}
        />
      )}
    </div>
  );
}
