import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Building2 } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";

type Desarrollador = {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  rfc?: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  representante_legal_nombre?: string;
  id_entidad_relacionada_rep_com?: number;
  representante_comercial_nombre?: string;
  numero_proyectos: number;
  url_logo?: string;
};

export default function Desarrolladores() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/desarrolladores');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Desarrollador | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Desarrollador | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Desarrollador | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const itemsPerPage = 10;

  const fetchDesarrolladores = async (activo: boolean) => {
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
        url_logo,
        id_entidad_relacionada_rep_leg,
        id_entidad_relacionada_rep_com,
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
        ),
        representante_comercial:entidades_relacionadas!personas_id_entidad_relacionada_rep_com_fkey (
          id,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal
          )
        )
      `)
      .eq('activo', activo)
      .eq('tipo_persona', 'pm')
      .eq('entidades_relacionadas.activo', true)
      .neq('entidades_relacionadas.tipos_entidad.padre', 'c')
      .eq('entidades_relacionadas.tipos_entidad.nombre', 'Desarrollador')
      .order('nombre_legal', { ascending: true });
    
    if (error) throw error;
    
    // Get project counts for each desarrollador
    const desarrolladorIds = (data || []).map(item => item.entidades_relacionadas[0]?.id).filter(Boolean);
    let projectCounts: { [key: number]: number } = {};
    
    if (desarrolladorIds.length > 0) {
      const { data: projectData, error: projectError } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_proyecto')
        .in('id', desarrolladorIds)
        .not('id_proyecto', 'is', null)
        .eq('activo', true);
      
      if (!projectError && projectData) {
        projectCounts = projectData.reduce((acc, item) => {
          acc[item.id] = (acc[item.id] || 0) + 1;
          return acc;
        }, {} as { [key: number]: number });
      }
    }
    
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
      id_entidad_relacionada_rep_com: item.id_entidad_relacionada_rep_com,
      representante_comercial_nombre: item.representante_comercial?.personas?.nombre_legal,
      numero_proyectos: projectCounts[item.entidades_relacionadas[0]?.id] || 0,
      url_logo: item.url_logo,
    })) as Desarrollador[];
  };

  const { data: activeDesarrolladores = [], isLoading: loadingActive } = useQuery({
    queryKey: ['desarrolladores', 'active'],
    queryFn: () => fetchDesarrolladores(true),
  });

  const { data: deletedDesarrolladores = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['desarrolladores', 'deleted'],
    queryFn: () => fetchDesarrolladores(false),
  });

  const desarrolladores = activeTab === 'active' ? activeDesarrolladores : deletedDesarrolladores;
  const filteredDesarrolladores = desarrolladores.filter(dev => 
    dev.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dev.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dev.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredDesarrolladores.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDesarrolladores = filteredDesarrolladores.slice(startIndex, endIndex);

  // Reset to first page when changing tabs or search
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { representativeId, commercialRepresentativeId, ...cleanPersonData } = personData;
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pm' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
      // Get the Desarrollador entity type ID
      const { data: tipoEntidad, error: tipoError } = await supabase
        .from('tipos_entidad')
        .select('id')
        .eq('nombre', 'Desarrollador')
        .single();
      
      if (tipoError) throw tipoError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: tipoEntidad.id,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
      
      // Update representatives if provided
      if (representativeId || commercialRepresentativeId) {
        const updateData: any = {};
        if (representativeId) updateData.id_entidad_relacionada_rep_leg = representativeId;
        if (commercialRepresentativeId) updateData.id_entidad_relacionada_rep_com = commercialRepresentativeId;
        
        const { error: updateError } = await supabase
          .from('personas')
          .update(updateData)
          .eq('id', personResult.id);
          
        if (updateError) throw updateError;
      }

      // Crear usuario para el representante comercial si se asignó
      if (commercialRepresentativeId) {
        try {
          const { data: repComData, error: repComError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', commercialRepresentativeId)
            .single();
          
          if (!repComError && repComData?.personas) {
            const repPersona = repComData.personas as any;
            
            // Verificar si ya existe un usuario con ese email
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser) {
              // Crear usuario para el representante comercial con rol Desarrollador (id: 15)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 15, // Desarrollador
                  id_persona: repPersona.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante comercial:', repUserError);
              }
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante comercial:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['desarrolladores'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Desarrollador creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el desarrollador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { representativeId, commercialRepresentativeId, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingEntity?.id);
      
      if (updateError) throw updateError;
      
      // Update representatives
      const repUpdateData: any = {};
      if (representativeId !== undefined) {
        repUpdateData.id_entidad_relacionada_rep_leg = representativeId || null;
      }
      if (commercialRepresentativeId !== undefined) {
        repUpdateData.id_entidad_relacionada_rep_com = commercialRepresentativeId || null;
      }
      
      if (Object.keys(repUpdateData).length > 0) {
        const { error: repError } = await supabase
          .from('personas')
          .update(repUpdateData)
          .eq('id', editingEntity?.id);
          
        if (repError) throw repError;
      }

      // Crear usuario para el representante comercial si se asignó uno nuevo
      if (commercialRepresentativeId && commercialRepresentativeId !== editingEntity?.id_entidad_relacionada_rep_com) {
        try {
          const { data: repComData, error: repComError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', commercialRepresentativeId)
            .single();
          
          if (!repComError && repComData?.personas) {
            const repPersona = repComData.personas as any;
            
            // Verificar si ya existe un usuario con ese email
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser) {
              // Crear usuario para el representante comercial con rol Desarrollador (id: 15)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 15, // Desarrollador
                  id_persona: repPersona.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante comercial:', repUserError);
              }
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante comercial:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['desarrolladores'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      toast({
        title: "Éxito",
        description: "Desarrollador actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el desarrollador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['desarrolladores'] });
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Desarrollador eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el desarrollador: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['desarrolladores'] });
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Desarrollador restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el desarrollador: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (desarrollador: Desarrollador) => {
    setEditingEntity(desarrollador);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (desarrollador: Desarrollador) => {
    setEntityToDelete(desarrollador);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (desarrollador: Desarrollador) => {
    setEntityToRestore(desarrollador);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (entityToRestore) {
      restoreMutation.mutate(entityToRestore.id);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-6 flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(pageNum);
                    }}
                    isActive={currentPage === pageNum}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            
            <PaginationItem>
              <PaginationNext 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                }}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  const renderTable = () => {
    if (paginatedDesarrolladores.length === 0 && filteredDesarrolladores.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' ? 'No hay desarrolladores activos' : 'No hay desarrolladores eliminados'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primer desarrollador para comenzar' : 'Los desarrolladores eliminados aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Desarrollador
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
              <TableHead className="font-semibold text-foreground w-16">Logo</TableHead>
              <TableHead className="font-semibold text-foreground">Nombre Comercial</TableHead>
              <TableHead className="font-semibold text-foreground">Proyectos</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Legal</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Comercial</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDesarrolladores.map((desarrollador) => (
              <TableRow key={desarrollador.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
                    {desarrollador.url_logo ? (
                      <img 
                        src={desarrollador.url_logo} 
                        alt={`Logo de ${desarrollador.nombre_comercial || desarrollador.nombre_legal}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Building2 className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div>
                    <div className="font-semibold">{desarrollador.nombre_comercial || desarrollador.nombre_legal}</div>
                    {desarrollador.nombre_comercial && (
                      <div className="text-sm text-muted-foreground">{desarrollador.nombre_legal}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {desarrollador.numero_proyectos} proyecto{desarrollador.numero_proyectos !== 1 ? 's' : ''}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {desarrollador.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {desarrollador.telefono || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {desarrollador.representante_legal_nombre || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {desarrollador.representante_comercial_nombre || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(desarrollador)}
                          className="hover:bg-primary/10 hover:border-primary transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(desarrollador)}
                          disabled={desarrollador.numero_proyectos > 0}
                          className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={desarrollador.numero_proyectos > 0 ? "No se puede eliminar: tiene proyectos relacionados" : "Eliminar desarrollador"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRestore(desarrollador)}
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
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Desarrolladores
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los desarrolladores
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Desarrollador
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeDesarrolladores.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedDesarrolladores.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, RFC..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 border-border focus:ring-primary/20"
                />
              </div>
            </div>

            <TabsContent value="active" className="mt-6">
              {renderTable()}
              {renderPagination()}
            </TabsContent>

            <TabsContent value="deleted" className="mt-6">
              {renderTable()}
              {renderPagination()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Desarrollador</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="desarrollador"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Desarrollador</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={{
              ...editingEntity,
              representativeId: editingEntity?.id_entidad_relacionada_rep_leg,
              commercialRepresentativeId: editingEntity?.id_entidad_relacionada_rep_com
            }}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingEntity(null);
            }}
            entityType="desarrollador"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Desarrollador"
        description={`¿Estás seguro de que deseas eliminar el desarrollador "${entityToDelete?.nombre_comercial || entityToDelete?.nombre_legal}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Desarrollador"
        description={`¿Estás seguro de que deseas restaurar el desarrollador "${entityToRestore?.nombre_comercial || entityToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}