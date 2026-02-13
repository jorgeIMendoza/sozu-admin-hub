import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, UserX, RotateCcw, Upload, ChevronLeft, ChevronRight, FileSpreadsheet, User } from "lucide-react";
import { Button } from "@/components/ui/button";  
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { BulkUploadAgentesDialog } from "@/components/admin/BulkUploadAgentesDialog";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { Badge } from "@/components/ui/badge";

type Agente = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  clave_pais_telefono?: string;
  curp?: string;
  rfc?: string;
  tipo_persona: string;
  activo: boolean;
  id_entidad_relacionada_rep_leg?: number;
  representante_legal_nombre?: string;
  entidad_relacionada_id?: number;
  id_inmobiliaria?: number;
  inmobiliaria_nombre?: string;
  usuario_rol_id?: number | null;
  usuario_rol_nombre?: string | null;
  usuario_activo?: boolean | null;
  porcentaje_comision?: number | null;
};

// Role IDs for agents
const ROLE_AGENTE_INTERNO = 9;
const ROLE_AGENTE_INMOBILIARIO = 3;

const ITEMS_PER_PAGE = 50;

export default function Agentes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [inmobiliariaFilter, setInmobiliariaFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("active");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgente, setEditingAgente] = useState<Agente | null>(null);
  const [selectedAgenteForBankAccounts, setSelectedAgenteForBankAccounts] = useState<Agente | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agenteToDelete, setAgenteToDelete] = useState<Agente | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [agenteToRestore, setAgenteToRestore] = useState<Agente | null>(null);
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canCreate, canUpdate, canDelete, canExport, isSuperAdmin } = usePagePermissions('/admin/agentes');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();

  const { data: activeAgentes = [], isLoading: loadingActive } = useQuery({
    queryKey: ['agentes', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          clave_pais_telefono,
          curp,
          rfc,
          tipo_persona,
          activo,
          id_entidad_relacionada_rep_leg,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_persona_duena_lead,
            porcentaje_comision
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
        .eq('entidades_relacionadas.id_tipo_entidad', 19)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      // Get inmobiliaria names for agents that have one
      // id_persona_duena_lead references personas.id, not entidades_relacionadas.id
      const inmobiliariaPersonaIds = (data || [])
        .map((item: any) => item.entidades_relacionadas[0]?.id_persona_duena_lead)
        .filter(Boolean);
      
      let inmobiliariasMap: Record<number, string> = {};
      if (inmobiliariaPersonaIds.length > 0) {
        const { data: inmobData } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .in('id', inmobiliariaPersonaIds)
          .eq('activo', true);
        
        if (inmobData) {
          inmobiliariasMap = inmobData.reduce((acc: Record<number, string>, item: any) => {
            acc[item.id] = item.nombre_legal || '';
            return acc;
          }, {});
        }
      }
      
      // Get user roles for agents (by id_persona)
      const personaIds = (data || []).map((item: any) => item.id);
      let userRolesMap: Record<number, { rol_id: number | null; rol_nombre: string | null; activo: boolean | null }> = {};
      
      if (personaIds.length > 0) {
        const { data: usuariosData } = await supabase
          .from('usuarios')
          .select('id_persona, rol_id, activo, roles(nombre)')
          .in('id_persona', personaIds);
        
        if (usuariosData) {
          usuariosData.forEach((u: any) => {
            if (u.id_persona) {
              userRolesMap[u.id_persona] = {
                rol_id: u.rol_id,
                rol_nombre: (u.roles as any)?.nombre || null,
                activo: u.activo
              };
            }
          });
        }
      }
      
      return (data || []).map((item: any) => ({
        id: item.id,
        entidad_relacionada_id: item.entidades_relacionadas[0].id,
        id_tipo_entidad: item.entidades_relacionadas[0].id_tipo_entidad,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
        clave_pais_telefono: item.clave_pais_telefono,
        curp: item.curp,
        rfc: item.rfc,
        tipo_persona: item.tipo_persona,
        activo: item.activo,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        id_inmobiliaria: item.entidades_relacionadas[0]?.id_persona_duena_lead || null,
        inmobiliaria_nombre: inmobiliariasMap[item.entidades_relacionadas[0]?.id_persona_duena_lead] || null,
        usuario_rol_id: userRolesMap[item.id]?.rol_id || null,
        usuario_rol_nombre: userRolesMap[item.id]?.rol_nombre || null,
        usuario_activo: userRolesMap[item.id]?.activo ?? null,
        porcentaje_comision: item.entidades_relacionadas[0]?.porcentaje_comision ?? null,
      })) as (Agente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const { data: deletedAgentes = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['agentes', 'deleted'],
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
            id_persona_duena_lead
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
        .eq('entidades_relacionadas.id_tipo_entidad', 19)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      
      // Get inmobiliaria names for agents that have one
      const inmobiliariaIds = (data || [])
        .map((item: any) => item.entidades_relacionadas[0]?.id_persona_duena_lead)
        .filter(Boolean);
      
      let inmobiliariasMap: Record<number, string> = {};
      if (inmobiliariaIds.length > 0) {
        const { data: inmobData } = await supabase
          .from('personas')
          .select('id, nombre_legal')
          .in('id', inmobiliariaIds)
          .eq('activo', true);
        
        if (inmobData) {
          inmobiliariasMap = inmobData.reduce((acc: Record<number, string>, item: any) => {
            acc[item.id] = item.nombre_legal || '';
            return acc;
          }, {});
        }
      }
      
      // Get user roles for agents (by id_persona)
      const personaIds = (data || []).map((item: any) => item.id);
      let userRolesMap: Record<number, { rol_id: number | null; rol_nombre: string | null; activo: boolean | null }> = {};
      
      if (personaIds.length > 0) {
        const { data: usuariosData } = await supabase
          .from('usuarios')
          .select('id_persona, rol_id, activo, roles(nombre)')
          .in('id_persona', personaIds);
        
        if (usuariosData) {
          usuariosData.forEach((u: any) => {
            if (u.id_persona) {
              userRolesMap[u.id_persona] = {
                rol_id: u.rol_id,
                rol_nombre: (u.roles as any)?.nombre || null,
                activo: u.activo
              };
            }
          });
        }
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
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        id_inmobiliaria: item.entidades_relacionadas[0]?.id_persona_duena_lead || null,
        inmobiliaria_nombre: inmobiliariasMap[item.entidades_relacionadas[0]?.id_persona_duena_lead] || null,
        usuario_rol_id: userRolesMap[item.id]?.rol_id || null,
        usuario_rol_nombre: userRolesMap[item.id]?.rol_nombre || null,
        usuario_activo: userRolesMap[item.id]?.activo ?? null,
      })) as (Agente & { entidad_relacionada_id: number; id_tipo_entidad: number })[];
    },
  });

  const agentes = activeTab === 'active' ? activeAgentes : deletedAgentes;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, porcentaje_comision, ...cleanPersonData } = personData;
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([cleanPersonData])
        .select()
        .single();
      
      if (personError) throw personError;
      
      const isInternalAgent = cleanPersonData.email?.toLowerCase().endsWith('@sozu.com');
      
      const { data: entidadResult, error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 19, // Agente
          id_proyecto: null,
          id_persona_duena_lead: inmobiliariaId || null,
          porcentaje_comision: isInternalAgent ? (porcentaje_comision || 0) : null,
          activo: true
        }])
        .select()
        .single();
      
      if (entidadError) throw entidadError;

      if (representativeId && cleanPersonData.tipo_persona === 'pm') {
        const { error: updateError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId })
          .eq('id', personResult.id);
          
        if (updateError) throw updateError;
      }

      // Determinar rol basado en el dominio del email
      const rolId = isInternalAgent ? 9 : 3; // 9 = Agente Interno, 3 = Agente Inmobiliario

      // Crear usuario automáticamente
      try {
        const { error: userError } = await supabase.functions.invoke('create-user', {
          body: {
            email: cleanPersonData.email,
            nombre: cleanPersonData.nombre_legal,
            rol_id: rolId,
            id_persona: personResult.id,
            telefono: cleanPersonData.telefono || null,
            clave_pais_telefono: cleanPersonData.clave_pais_telefono || null
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
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewDialogOpen(false);
      
      // Registrar actividad
      registrarCreacion('agente', {
        nombre_legal: variables.nombre_legal,
        email: variables.email,
        inmobiliaria_id: variables.inmobiliariaId
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
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, porcentaje_comision, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingAgente?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingAgente?.id);
          
        if (repError) throw repError;
      }

      // Update inmobiliaria and porcentaje_comision on entidades_relacionadas
      if ((editingAgente as any)?.entidad_relacionada_id) {
        const updateData: any = {};
        if (inmobiliariaId !== undefined) updateData.id_persona_duena_lead = inmobiliariaId || null;
        if (porcentaje_comision !== undefined) updateData.porcentaje_comision = porcentaje_comision;
        
        if (Object.keys(updateData).length > 0) {
          const { error: inmobError } = await supabase
            .from('entidades_relacionadas')
            .update(updateData)
            .eq('id', (editingAgente as any).entidad_relacionada_id);
          if (inmobError) throw inmobError;
        }
      }
    },
    onSuccess: (_, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      setIsEditDialogOpen(false);
      
      // Registrar actividad
      registrarActualizacion('agente', 
        { id: editingAgente?.id, nombre_legal: editingAgente?.nombre_legal }, 
        { id: editingAgente?.id, nombre_legal: variables.nombre_legal, email: variables.email }
      );
      
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
      // Deactivate agent persona
      const { error } = await supabase
        .from('personas')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;

      // Also deactivate associated user if exists
      const { error: userError } = await supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('id_persona', id);
      
      if (userError) {
        console.error('Error deactivating user:', userError);
      }
    },
    onSuccess: (_, id: number) => {
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      
      // Registrar actividad
      const agente = agenteToDelete;
      if (agente) {
        registrarEliminacion('agente', {
          id: agente.id,
          nombre_legal: agente.nombre_legal,
          email: agente.email
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
    mutationFn: async (id: number) => {
      // Reactivate agent persona
      const { error } = await supabase
        .from('personas')
        .update({ activo: true })
        .eq('id', id);
      
      if (error) throw error;

      // Also reactivate associated user if exists
      const { error: userError } = await supabase
        .from('usuarios')
        .update({ activo: true })
        .eq('id_persona', id);
      
      if (userError) {
        console.error('Error reactivating user:', userError);
      }
    },
    onSuccess: (_, id: number) => {
      queryClient.invalidateQueries({ queryKey: ['agentes'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      
      // Registrar actividad
      const agente = agenteToRestore;
      if (agente) {
        registrarRestauracion('agente', 
          { id: agente.id, nombre_legal: agente.nombre_legal, activo: false },
          { id: agente.id, nombre_legal: agente.nombre_legal, activo: true }
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

  // Get unique inmobiliarias for filter
  const uniqueInmobiliarias = useMemo(() => {
    const inmobMap = new Map<number, string>();
    activeAgentes.forEach(a => {
      if (a.id_inmobiliaria && a.inmobiliaria_nombre) {
        inmobMap.set(a.id_inmobiliaria, a.inmobiliaria_nombre);
      }
    });
    return Array.from(inmobMap.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [activeAgentes]);

  const filterAgente = (agente: Agente) => {
    const matchesSearch = 
      agente.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agente.inmobiliaria_nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesInmobiliaria = inmobiliariaFilter === "all" || 
      (inmobiliariaFilter === "none" && !agente.id_inmobiliaria) ||
      agente.id_inmobiliaria?.toString() === inmobiliariaFilter;
    
    return matchesSearch && matchesInmobiliaria;
  };

  const filteredActiveAgentes = activeAgentes.filter(filterAgente);
  const filteredDeletedAgentes = deletedAgentes.filter(filterAgente);
  const filteredAgentes = activeTab === 'active' ? filteredActiveAgentes : filteredDeletedAgentes;

  // Pagination logic
  const totalPages = Math.ceil(filteredAgentes.length / ITEMS_PER_PAGE);
  const paginatedAgentes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAgentes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAgentes, currentPage]);

  // Reset page when tab or search changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleEdit = (agente: Agente) => {
    setEditingAgente(agente);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (agente: Agente) => {
    setAgenteToDelete(agente);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (agenteToDelete) {
      deleteMutation.mutate(agenteToDelete.id);
      setDeleteDialogOpen(false);
      setAgenteToDelete(null);
    }
  };

  const handleRestore = (agente: Agente) => {
    setAgenteToRestore(agente);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (agenteToRestore) {
      restoreMutation.mutate(agenteToRestore.id);
      setRestoreDialogOpen(false);
      setAgenteToRestore(null);
    }
  };

  const handleBankAccounts = (agente: Agente) => {
    setSelectedAgenteForBankAccounts(agente);
    setIsBankAccountsDialogOpen(true);
  };

  function renderTable() {
    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando agentes...</p>
        </div>
      );
    }

    if (filteredAgentes.length === 0) {
      return (
        <div className="text-center py-12">
          <UserX className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No hay agentes</h3>
          <p className="mt-2 text-muted-foreground">
            {searchTerm ? 'No se encontraron agentes que coincidan con tu búsqueda.' : 'Comienza creando tu primer agente.'}
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
              <TableHead className="font-semibold text-foreground">Tipo Agente</TableHead>
              <TableHead className="font-semibold text-foreground">Estado Usuario</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Tipo persona</TableHead>
              <TableHead className="font-semibold text-foreground">RFC</TableHead>
              <TableHead className="font-semibold text-foreground">Inmobiliaria</TableHead>
              <TableHead className="font-semibold text-foreground">Comisión (%)</TableHead>
              <TableHead className="font-semibold text-foreground">Representante legal</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedAgentes.map((agente) => (
              <TableRow key={agente.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {agente.nombre_legal}
                </TableCell>
                <TableCell>
                  {agente.usuario_rol_id === ROLE_AGENTE_INTERNO ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 w-fit">
                      <User className="h-3 w-3" />
                      Interno
                    </span>
                  ) : agente.usuario_rol_id === ROLE_AGENTE_INMOBILIARIO ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 w-fit">
                      <User className="h-3 w-3" />
                      Inmobiliario
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin usuario</span>
                  )}
                </TableCell>
                <TableCell>
                  {agente.usuario_rol_id ? (
                    agente.usuario_activo === false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 w-fit">
                        <UserX className="h-3 w-3" />
                        Desactivado
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Activo</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {agente.email}
                </TableCell>
                <TableCell>
                  <PhoneDisplay telefono={agente.telefono} clavePaisTelefono={agente.clave_pais_telefono} />
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    agente.tipo_persona === 'pf' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                  }`}>
                    {agente.tipo_persona === 'pf' ? 'Física' : 'Moral'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {agente.rfc || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {agente.inmobiliaria_nombre || 'N/A'}
                </TableCell>
                <TableCell>
                  {agente.usuario_rol_id === ROLE_AGENTE_INTERNO && agente.porcentaje_comision != null ? (
                    <Badge variant="secondary" className="text-sm">{agente.porcentaje_comision}%</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {agente.representante_legal_nombre || 'N/A'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(agente)}
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(agente)}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBankAccounts(agente)}
                          className="h-8 px-2 text-xs hover:bg-accent"
                        >
                          Cuentas
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"  
                        size="sm"
                        onClick={() => handleRestore(agente)}
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
                Agentes
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los agentes
              </p>
            </div>
            <div className="flex gap-2">
              {(canExport || isSuperAdmin) && filteredAgentes.length > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const exportData = filteredAgentes.map(a => ({
                      'Nombre': a.nombre_legal,
                      'Email': a.email,
                      'Teléfono': a.telefono || 'N/A',
                      'Tipo Persona': a.tipo_persona === 'pf' ? 'Física' : 'Moral',
                      'RFC': a.rfc || 'N/A',
                      'CURP': a.curp || 'N/A',
                      'Representante Legal': a.representante_legal_nombre || 'N/A',
                      'Inmobiliaria': a.inmobiliaria_nombre || 'N/A',
                    }));
                    exportToExcel({ data: exportData, filename: 'agentes' });
                  }}
                  disabled={isExporting}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {isExporting ? 'Exportando...' : 'Exportar Excel'}
                </Button>
              )}
              {canCreate && (
                <>
                  <Button 
                    variant="outline"
                    onClick={() => setIsBulkUploadDialogOpen(true)}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Carga Masiva
                  </Button>
                  <Button 
                    onClick={() => setIsNewDialogOpen(true)}
                    className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Agente
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({filteredActiveAgentes.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({filteredDeletedAgentes.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6 flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[250px] max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, CURP, RFC..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 border-border focus:ring-primary/20"
                />
              </div>
              <Select value={inmobiliariaFilter} onValueChange={(value) => { setInmobiliariaFilter(value); setCurrentPage(1); }}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filtrar por inmobiliaria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las inmobiliarias</SelectItem>
                  <SelectItem value="none">Sin inmobiliaria</SelectItem>
                  {uniqueInmobiliarias.map((inmob) => (
                    <SelectItem key={inmob.id} value={inmob.id.toString()}>
                      {inmob.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="active" className="mt-6">
              {renderTable()}
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAgentes.length)} de {filteredAgentes.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="deleted" className="mt-6">
              {renderTable()}
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAgentes.length)} de {filteredAgentes.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog para nuevo agente */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Agente</DialogTitle>
          </DialogHeader>
           <PersonForm
             onSubmit={(data) => createMutation.mutate(data)}
             isLoading={createMutation.isPending}
             onCancel={() => setIsNewDialogOpen(false)}
              entityType="agente"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar agente */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agente</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingAgente,
               representativeId: editingAgente?.id_entidad_relacionada_rep_leg,
               id_inmobiliaria: editingAgente?.id_inmobiliaria
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingAgente(null);
             }}
             entityType="agente"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para cuentas bancarias */}
      <Dialog open={isBankAccountsDialogOpen} onOpenChange={setIsBankAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas Bancarias - {selectedAgenteForBankAccounts?.nombre_legal}</DialogTitle>
          </DialogHeader>
          {selectedAgenteForBankAccounts && (
            <BankAccountsSection
              personId={selectedAgenteForBankAccounts.id}
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
        title="Eliminar Agente"
        description={`¿Estás seguro de que deseas eliminar al agente "${agenteToDelete?.nombre_legal}"? Esta acción se puede deshacer.`}
        warningMessage={agenteToDelete?.usuario_rol_id ? "⚠️ El usuario asociado a este agente será desactivado y no podrá iniciar sesión en el sistema." : undefined}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Agente"
        description={`¿Estás seguro de que deseas restaurar al agente "${agenteToRestore?.nombre_legal}"?`}
        warningMessage={agenteToRestore?.usuario_rol_id ? "✅ El usuario asociado a este agente será reactivado y podrá iniciar sesión nuevamente." : undefined}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />

      {/* Bulk Upload Dialog */}
      <BulkUploadAgentesDialog
        open={isBulkUploadDialogOpen}
        onClose={() => setIsBulkUploadDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['agentes'] });
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        }}
      />
    </div>
  );
}