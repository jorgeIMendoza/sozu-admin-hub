import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, CreditCard, UserX, HeartHandshake, RefreshCw, UserPlus, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { ConvertirProspectoDialog } from "@/components/admin/ConvertirProspectoDialog";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { useActivityLogger } from "@/hooks/useActivityLogger";

type Comprador = {
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
  id_estado_civil?: number;
  id_conyuge?: number;
  representante_legal_nombre?: string;
  estado_civil_nombre?: string;
  conyuge_nombre?: string;
};

export default function Compradores() {
  const { canCreate, canUpdate, canDelete, canApprove, canExport, isSuperAdmin } = usePagePermissions('/admin/compradores');
  const { exportToExcel, isExporting } = useExportToExcel();
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize search term from URL parameters
  useEffect(() => {
    const urlSearchTerm = searchParams.get('search');
    if (urlSearchTerm) {
      setInputValue(urlSearchTerm);
      setSearchTerm(urlSearchTerm);
    }
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
      // Reset to page 1 when search term changes
      setCurrentPageActive(1);
      setCurrentPageDeleted(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingComprador, setEditingComprador] = useState<Comprador | null>(null);
  const [selectedCompradorForBankAccounts, setSelectedCompradorForBankAccounts] = useState<Comprador | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [compradorToDelete, setCompradorToDelete] = useState<Comprador | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [compradorToRestore, setCompradorToRestore] = useState<Comprador | null>(null);
  const [isConvertirDialogOpen, setIsConvertirDialogOpen] = useState(false);
  // Using sonner toast imported at line 9
  const queryClient = useQueryClient();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();

  const { data: activeCompradoresData, isLoading: loadingActive } = useQuery({
    queryKey: ['compradores', 'active', currentPageActive, searchTerm],
    queryFn: async () => {
      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
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
        `, { count: 'exact' })
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 2)
        .is('entidades_relacionadas.id_proyecto', null);

      // Apply search filters
      if (searchTerm) {
        query = query.or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%,curp.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre_legal', { ascending: true })
        .range(from, to);
      
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
      
      const compradores = (data || []).map((item: any) => ({
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
        id_estado_civil: item.id_estado_civil,
        id_conyuge: item.id_conyuge,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        estado_civil_nombre: item.estados_civil?.nombre,
        conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
      })) as (Comprador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];

      return { compradores, count: count || 0 };
    },
  });

  const { data: deletedCompradoresData, isLoading: loadingDeleted } = useQuery({
    queryKey: ['compradores', 'deleted', currentPageDeleted, searchTerm],
    queryFn: async () => {
      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
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
        `, { count: 'exact' })
        .eq('activo', false)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 2)
        .is('entidades_relacionadas.id_proyecto', null);

      // Apply search filters
      if (searchTerm) {
        query = query.or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%,curp.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre_legal', { ascending: true })
        .range(from, to);
      
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
      
      const compradores = (data || []).map((item: any) => ({
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
        id_estado_civil: item.id_estado_civil,
        id_conyuge: item.id_conyuge,
        representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
        estado_civil_nombre: item.estados_civil?.nombre,
        conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
      })) as (Comprador & { entidad_relacionada_id: number; id_tipo_entidad: number })[];

      return { compradores, count: count || 0 };
    },
  });

  const activeCompradores = activeCompradoresData?.compradores || [];
  const deletedCompradores = deletedCompradoresData?.compradores || [];
  const activeCount = activeCompradoresData?.count || 0;
  const deletedCount = deletedCompradoresData?.count || 0;

  const compradores = activeTab === 'active' ? activeCompradores : deletedCompradores;
  const isLoading = activeTab === 'active' ? loadingActive : loadingDeleted;
  const currentPage = activeTab === 'active' ? currentPageActive : currentPageDeleted;
  const setCurrentPage = activeTab === 'active' ? setCurrentPageActive : setCurrentPageDeleted;
  const totalCount = activeTab === 'active' ? activeCount : deletedCount;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, porcentaje_comision, ...cleanPersonData } = personData;
      
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

      // Guardar representante legal para cualquier tipo de persona (PF o PM)
      if (representativeId) {
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
      toast.success("Comprador creado correctamente.");
      registrarCreacion('comprador', { workflow: 'crear_comprador' });
    },
    onError: (error: any) => {
      let errorMessage = `Error al crear el comprador: ${error.message}`;
      
      // Manejar error de email duplicado
      if (error.code === '23505' && error.message?.includes('personas_email_key')) {
        errorMessage = "El correo electrónico ingresado ya está registrado en el sistema. Por favor, utilice un correo diferente o busque al comprador existente.";
      }
      
      toast.error(errorMessage, {
        duration: 10000, // 10 segundos para que sea más visible
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, porcentaje_comision, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingComprador?.id);
      
      if (updateError) throw updateError;
      
      // Actualizar representante legal para cualquier tipo de persona (PF o PM)
      if (representativeId !== undefined) {
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
      registrarActualizacion('comprador',
        { id: editingComprador?.id, nombre_legal: editingComprador?.nombre_legal },
        { id: editingComprador?.id }
      );
      setEditingComprador(null);
      toast.success("Comprador actualizado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar el comprador: ${error.message}`);
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
      registrarEliminacion('comprador', { id: compradorToDelete?.id, nombre_legal: compradorToDelete?.nombre_legal });
      toast.success("Comprador eliminado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al eliminar el comprador: ${error.message}`);
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
      registrarRestauracion('comprador',
        { id: compradorToRestore?.id, activo: false },
        { id: compradorToRestore?.id, activo: true, nombre_legal: compradorToRestore?.nombre_legal }
      );
      toast.success("Comprador restaurado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al restaurar el comprador: ${error.message}`);
    },
  });

  // Mutation para verificar estatus de escrituración manualmente
  const verificarEscrituracionMutation = useMutation({
    mutationFn: async (compradorId: number) => {
      // Primero obtener las cuentas de cobranza donde este comprador participa
      const { data: cuentas, error: cuentasError } = await supabase
        .from('compradores')
        .select('id_cuenta_cobranza')
        .eq('id_persona', compradorId)
        .eq('activo', true);

      if (cuentasError) throw cuentasError;
      if (!cuentas || cuentas.length === 0) {
        throw new Error('El comprador no tiene cuentas de cobranza activas');
      }

      // Invocar el Edge Function para cada cuenta
      const results = await Promise.all(
        cuentas.map(async (cuenta) => {
          const { data, error } = await supabase.functions.invoke(
            'check-property-escrituracion-status',
            { body: { id_cuenta_cobranza: cuenta.id_cuenta_cobranza } }
          );
          if (error) throw error;
          return { cuenta_id: cuenta.id_cuenta_cobranza, ...data };
        })
      );

      return results;
    },
    onSuccess: (results) => {
      const cambiosRealizados = results.filter((r: any) => r.status_changed);
      const mensaje = cambiosRealizados.length > 0
        ? `✅ ${cambiosRealizados.length} propiedad(es) actualizadas a Escrituración`
        : 'ℹ️ No se cumplieron las condiciones en ninguna propiedad';
      
      if (cambiosRealizados.length > 0) {
        toast.success(mensaje);
      } else {
        toast.info(mensaje);
      }
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
    },
    onError: (error: any) => {
      toast.error(`Error al verificar estatus: ${error.message}`);
    },
  });


  const handleEdit = async (comprador: Comprador) => {
    // Fetch full persona data including address fields
    const { data: fullPersonaData, error } = await supabase
      .from('personas')
      .select('*')
      .eq('id', comprador.id)
      .single();
    
    if (error) {
      toast.error("No se pudo cargar la información completa del comprador");
      return;
    }
    
    setEditingComprador(fullPersonaData);
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

    if (compradores.length === 0) {
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
            {compradores.map((comprador) => (
              <TableRow key={comprador.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {comprador.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {comprador.email}
                </TableCell>
                <TableCell>
                  <PhoneDisplay telefono={comprador.telefono} clavePaisTelefono={comprador.clave_pais_telefono} />
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
                              <HeartHandshake className="h-7 w-7 text-pink-500 cursor-help" />
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
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(comprador)}
                            className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(comprador)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => verificarEscrituracionMutation.mutate(comprador.id)}
                                disabled={verificarEscrituracionMutation.isPending}
                                className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30"
                              >
                                <RefreshCw className={`h-4 w-4 ${verificarEscrituracionMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Verificar estatus de escrituración</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    ) : (
                      (canApprove || isSuperAdmin) && (
                        <Button
                          variant="ghost"  
                          size="sm"
                          onClick={() => handleRestore(comprador)}
                          className="h-8 w-8 p-0 hover:bg-success/10 hover:text-success"
                        >
                          <RotateCcw className="h-4 w-4" />
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
            <div className="flex gap-2 flex-wrap">
              {(canExport || isSuperAdmin) && activeCompradores.length > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const exportData = activeCompradores.map(c => ({
                      'Nombre': c.nombre_legal,
                      'Email': c.email,
                      'Teléfono': c.telefono || '',
                      'Tipo Persona': c.tipo_persona === 'pf' ? 'Física' : 'Moral',
                      'RFC': c.rfc || '',
                      'CURP': c.curp || '',
                      'Estado Civil': c.estado_civil_nombre || '',
                      'Cónyuge': c.conyuge_nombre || '',
                      'Representante Legal': c.representante_legal_nombre || '',
                    }));
                    exportToExcel({ data: exportData, filename: 'compradores' });
                  }}
                  disabled={isExporting}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {isExporting ? 'Exportando...' : 'Exportar Excel'}
                </Button>
              )}
              {(canCreate || isSuperAdmin) && (
                <Button 
                  onClick={() => setIsNewDialogOpen(true)}
                  className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Comprador
                </Button>
              )}
              {(canCreate || isSuperAdmin) && (
                <Button 
                  variant="outline"
                  onClick={() => setIsConvertirDialogOpen(true)}
                  className="border-primary text-primary hover:bg-primary/10 font-semibold px-6"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convertir a Comprador
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${(canDelete || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1'} mb-6`}>
              <TabsTrigger value="active">Activos ({activeCount})</TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">Eliminados ({deletedCount})</TabsTrigger>
              )}
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, email, CURP, RFC..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="pl-10 border-border focus:ring-primary/20"
                />
              </div>
            </div>

            <TabsContent value="active" className="mt-6">
              {renderTable()}
              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPageActive(Math.max(1, currentPageActive - 1))}
                          className={currentPageActive === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = idx + 1;
                        } else if (currentPageActive <= 3) {
                          pageNumber = idx + 1;
                        } else if (currentPageActive >= totalPages - 2) {
                          pageNumber = totalPages - 4 + idx;
                        } else {
                          pageNumber = currentPageActive - 2 + idx;
                        }

                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              onClick={() => setCurrentPageActive(pageNumber)}
                              isActive={currentPageActive === pageNumber}
                              className="cursor-pointer"
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      
                      {totalPages > 5 && currentPageActive < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPageActive(Math.min(totalPages, currentPageActive + 1))}
                          className={currentPageActive === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>

            <TabsContent value="deleted" className="mt-6">
              {renderTable()}
              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPageDeleted(Math.max(1, currentPageDeleted - 1))}
                          className={currentPageDeleted === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = idx + 1;
                        } else if (currentPageDeleted <= 3) {
                          pageNumber = idx + 1;
                        } else if (currentPageDeleted >= totalPages - 2) {
                          pageNumber = totalPages - 4 + idx;
                        } else {
                          pageNumber = currentPageDeleted - 2 + idx;
                        }

                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              onClick={() => setCurrentPageDeleted(pageNumber)}
                              isActive={currentPageDeleted === pageNumber}
                              className="cursor-pointer"
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      
                      {totalPages > 5 && currentPageDeleted < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPageDeleted(Math.min(totalPages, currentPageDeleted + 1))}
                          className={currentPageDeleted === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
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

      {/* Convertir Prospecto Dialog */}
      <ConvertirProspectoDialog
        open={isConvertirDialogOpen}
        onOpenChange={setIsConvertirDialogOpen}
      />
    </div>
  );
}