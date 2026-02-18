import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Building2, Loader2 } from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { StandardizedBankAccountsButton } from "@/components/admin/StandardizedBankAccountsButton";

type EntidadLegal = {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  rfc?: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  id_entidad_relacionada_rep_com?: number;
  representante_legal_nombre?: string;
  representante_comercial_nombre?: string;
  numero_proyectos: number;
  entidad_relacionada_id: number;
  id_tipo_entidad: number;
  tipo_entidad_nombre: string;
};

export default function EntidadesLegales() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/entidades-legales');
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Initialize search term from URL parameters
  useEffect(() => {
    const urlSearchTerm = searchParams.get('search');
    if (urlSearchTerm) {
      setSearchTerm(urlSearchTerm);
    }
  }, [searchParams]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntidadLegal | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<EntidadLegal | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<EntidadLegal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Full fetch persona data when editing (prevents overwriting fiscal/address data with nulls)
  const { data: fullEditingPersona, isLoading: loadingFullPersona } = useQuery({
    queryKey: ['entidad-legal-full-edit', editingEntity?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          nombre_comercial,
          email,
          telefono,
          clave_pais_telefono,
          rfc,
          curp,
          tipo_persona,
          sexo,
          fecha_nacimiento,
          id_estado_civil,
          ocupacion,
          id_pais_nacimiento,
          id_estado_nacimiento,
          id_municipio_nacimiento,
          direccion_calle,
          direccion_num_ext,
          direccion_num_int,
          direccion_colonia,
          direccion_codigo_postal,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          direccion_fiscal_calle,
          direccion_fiscal_num_ext,
          direccion_fiscal_num_int,
          direccion_fiscal_colonia,
          direccion_fiscal_codigo_postal,
          direccion_fiscal_id_pais,
          direccion_fiscal_id_estado,
          direccion_fiscal_id_municipio,
          uso_cfdi,
          regimen,
          numero_escritura,
          numero_libro,
          folio_mercantil,
          fecha_escritura,
          fecha_registro,
          id_notario,
          url_logo,
          activo,
          id_entidad_relacionada_rep_leg,
          id_entidad_relacionada_rep_com
        `)
        .eq('id', editingEntity!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!editingEntity?.id && isEditDialogOpen,
  });
  
  const itemsPerPage = 10;

  const { data: activeEntidades = [], isLoading: loadingActiveEntidades } = useQuery({
    queryKey: ['entidades_legales', 'active'],
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
        .eq('activo', true)
        .eq('tipo_persona', 'pm')
        .eq('entidades_relacionadas.activo', true)
        .neq('entidades_relacionadas.tipos_entidad.padre', 'c')
        .not('entidades_relacionadas.id_tipo_entidad', 'in', '(3,5,6)') // Excluir: Desarrollador, Inmobiliaria, Administradora
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
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
        id_entidad_relacionada_rep_com: item.id_entidad_relacionada_rep_com,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        representante_comercial_nombre: item.representante_comercial?.personas?.nombre_legal,
        numero_proyectos: 0,
        tipo_entidad_nombre: item.entidades_relacionadas[0]?.tipos_entidad?.nombre || '',
      })) as EntidadLegal[];
    },
  });

  const { data: deletedEntidades = [], isLoading: loadingDeletedEntidades } = useQuery({
    queryKey: ['entidades_legales', 'deleted'],
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
        .eq('activo', false)
        .eq('tipo_persona', 'pm')
        .eq('entidades_relacionadas.activo', true)
        .neq('entidades_relacionadas.tipos_entidad.padre', 'c')
        .not('entidades_relacionadas.id_tipo_entidad', 'in', '(3,5,6)') // Excluir: Desarrollador, Inmobiliaria, Administradora
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
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
        id_entidad_relacionada_rep_com: item.id_entidad_relacionada_rep_com,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        representante_comercial_nombre: item.representante_comercial?.personas?.nombre_legal,
        numero_proyectos: 0,
        tipo_entidad_nombre: item.entidades_relacionadas[0]?.tipos_entidad?.nombre || '',
      })) as EntidadLegal[];
    },
  });

  const entidades = activeTab === 'active' ? activeEntidades : deletedEntidades;
  const isLoading = activeTab === 'active' ? loadingActiveEntidades : loadingDeletedEntidades;

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

  // Helper function to translate database errors to user-friendly messages
  const getFriendlyErrorMessage = (error: any): string => {
    const message = error?.message || '';
    
    if (message.includes('inmobiliariaId')) {
      return 'Error interno de configuración. Por favor contacte al administrador.';
    }
    if (message.includes('duplicate key') || message.includes('already exists')) {
      if (message.includes('email')) {
        return 'Ya existe una entidad legal con este correo electrónico.';
      }
      if (message.includes('rfc')) {
        return 'Ya existe una entidad legal con este RFC.';
      }
      return 'Ya existe un registro con estos datos.';
    }
    if (message.includes('violates foreign key')) {
      return 'Uno de los registros relacionados no existe o fue eliminado.';
    }
    if (message.includes('null value in column')) {
      const match = message.match(/column "(\w+)"/);
      const field = match ? match[1] : 'campo requerido';
      const fieldNames: Record<string, string> = {
        nombre_legal: 'Razón Social',
        email: 'Email',
        telefono: 'Teléfono',
        rfc: 'RFC',
      };
      return `El campo "${fieldNames[field] || field}" es obligatorio.`;
    }
    if (message.includes('schema cache')) {
      return 'Error de configuración interna. Por favor intente de nuevo.';
    }
    
    return 'Ocurrió un error inesperado. Por favor intente de nuevo.';
  };

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Extract entity type, representatives, and frontend-only fields from personData
      const { 
        entityType, 
        representativeId, 
        commercialRepresentativeId, 
        inmobiliariaId, // Exclude this field - it's not in the personas schema
        tempBankAccounts, 
        tempBeneficiaries, 
        pendingDocuments, 
        ...cleanPersonData 
      } = personData;
      
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
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
      
      // If representatives were selected, update the person record
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

      // Crear usuario para el representante legal si se asignó
      if (representativeId) {
        try {
          const { data: repLegalData, error: repLegalError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', representativeId)
            .single();
          
          if (!repLegalError && repLegalData?.personas) {
            const repPersona = repLegalData.personas as any;
            
            // Verificar si ya existe un usuario con ese email
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser) {
              // Crear usuario para el representante legal con rol Representante Legal (id: 14)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 14, // Representante comercial
                  id_persona: repPersona.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante legal:', repUserError);
              }
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante legal:', e);
        }
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
              // Crear usuario para el representante comercial con rol Representante comercial (id: 14)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 14, // Representante comercial
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
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Entidad legal creada correctamente.",
      });
    },
    onError: (error: any) => {
      console.error('Error creating entidad legal:', error);
      toast({
        title: "Error",
        description: getFriendlyErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      // Extract entity type, representatives, and frontend-only fields from personData
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      // First, update the basic person data
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingEntity?.id);
      
      if (updateError) throw updateError;
      
      // Then, update the representatives if provided
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

      // Crear usuario para el representante legal si se asignó uno nuevo
      if (representativeId && representativeId !== editingEntity?.id_entidad_relacionada_rep_leg) {
        try {
          const { data: repLegalData, error: repLegalError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', representativeId)
            .single();
          
          if (!repLegalError && repLegalData?.personas) {
            const repPersona = repLegalData.personas as any;
            
            // Verificar si ya existe un usuario con ese email
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser) {
              // Crear usuario para el representante legal con rol Representante comercial (id: 14)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 14, // Representante comercial
                  id_persona: repPersona.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante legal:', repUserError);
              }
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante legal:', e);
        }
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
              // Crear usuario para el representante comercial con rol Representante comercial (id: 14)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 14, // Representante comercial
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
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      toast({
        title: "Éxito",
        description: "Entidad legal actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      console.error('Error updating entidad legal:', error);
      toast({
        title: "Error",
        description: getFriendlyErrorMessage(error),
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

  // Pagination logic
  const totalPages = Math.ceil(filteredEntidades.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEntidades = filteredEntidades.slice(startIndex, endIndex);

  // Reset to first page when changing tabs or search
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

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

  const handleRestore = (entidad: EntidadLegal) => {
    setEntityToRestore(entidad);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (entityToRestore) {
      restoreMutation.mutate(entityToRestore.id);
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
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
    if (paginatedEntidades.length === 0 && filteredEntidades.length === 0) {
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
              <TableHead className="font-semibold text-foreground">Nombre Comercial</TableHead>
              <TableHead className="font-semibold text-foreground">Tipo Entidad</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Legal</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Comercial</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedEntidades.map((entidad) => (
              <TableRow key={entidad.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium text-foreground">
                  <div>
                    <div className="font-semibold">{entidad.nombre_comercial || entidad.nombre_legal}</div>
                    {entidad.nombre_comercial && (
                      <div className="text-sm text-muted-foreground">{entidad.nombre_legal}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entidad.tipo_entidad_nombre}
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
                <TableCell className="text-muted-foreground">
                  {entidad.representante_comercial_nombre || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(entidad)}
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <StandardizedBankAccountsButton
                          personId={entidad.id}
                          personName={entidad.nombre_comercial || entidad.nombre_legal}
                          showStpCheckbox={entidad.id_tipo_entidad === 4 || entidad.id_tipo_entidad === 15}
                        />
                        {(canDelete || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDelete(entidad)}
                            disabled={!canDeleteEntity(entidad.entidad_relacionada_id)}
                            className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!canDeleteEntity(entidad.entidad_relacionada_id) ? "No se puede eliminar: tiene proyectos relacionados" : "Eliminar entidad legal"}
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
                          onClick={() => handleRestore(entidad)}
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
                Gestiona la información de las entidades legales
              </p>
            </div>
            {(canCreate || isSuperAdmin) && (
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Entidad Legal
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`grid w-full mb-6 ${(canDelete || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TabsTrigger value="active">Activos ({activeEntidades.length})</TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">Eliminados ({deletedEntidades.length})</TabsTrigger>
              )}
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
          {loadingFullPersona ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : fullEditingPersona ? (
            <PersonForm
              initialData={{
                ...fullEditingPersona,
                id_tipo_entidad: editingEntity?.id_tipo_entidad,
                representativeId: fullEditingPersona.id_entidad_relacionada_rep_leg,
                id_entidad_relacionada_rep_com: fullEditingPersona.id_entidad_relacionada_rep_com,
              }}
              onSubmit={(data) => updateMutation.mutate(data)}
              isLoading={updateMutation.isPending}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingEntity(null);
              }}
              entityType="legal"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar eliminación */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Entidad Legal"
        description={`¿Estás seguro de que deseas eliminar la entidad legal "${entityToDelete?.nombre_comercial || entityToDelete?.nombre_legal}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Dialog para confirmar restauración */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Entidad Legal"
        description={`¿Estás seguro de que deseas restaurar la entidad legal "${entityToRestore?.nombre_comercial || entityToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />

    </div>
  );
}