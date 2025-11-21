import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Users, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { BeneficiariosForm } from "@/components/admin/BeneficiariosForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { format } from "date-fns";

type Prospecto = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  rfc?: string;
  tipo_persona: string;
  activo: boolean;
  fecha_creacion: string;
  id_entidad_relacionada_rep_leg?: number;
  representante_legal_nombre?: string;
  estatus_nombre?: string;
  id_estatus_persona?: number;
  proyecto_nombre?: string;
  id_proyecto?: number;
};

export default function Prospectos() {
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBeneficiariosDialogOpen, setIsBeneficiariosDialogOpen] = useState(false);
  const [editingProspecto, setEditingProspecto] = useState<Prospecto | null>(null);
  const [selectedProspectoForBeneficiarios, setSelectedProspectoForBeneficiarios] = useState<Prospecto | null>(null);
  const [selectedProspectoForBankAccounts, setSelectedProspectoForBankAccounts] = useState<Prospecto | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prospectoToDelete, setProspectoToDelete] = useState<Prospecto | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [prospectoToRestore, setProspectoToRestore] = useState<Prospecto | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeProspectos = [], isLoading: loadingActive } = useQuery({
    queryKey: ['prospectos', 'active'],
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
          fecha_creacion,
          id_entidad_relacionada_rep_leg,
          id_estado_civil,
          id_conyuge,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_estatus_persona,
            id_proyecto,
            activo
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
          ),
          estatus_persona!fk_entidades_relacionadas_estatus_persona (
            id,
            nombre
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 7)
        .order('nombre_legal', { ascending: true });
      
      if (error) {
        console.error("Error cargando prospectos activos:", error);
        throw error;
      }
      
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
      
      return (data || []).map((item: any) => {
        const entidadRelacionada = item.entidades_relacionadas[0];
        
        return {
          id: item.id,
          entidad_relacionada_id: entidadRelacionada.id,
          id_tipo_entidad: entidadRelacionada.id_tipo_entidad,
          nombre_legal: item.nombre_legal,
          email: item.email,
          telefono: item.telefono,
          curp: item.curp,
          rfc: item.rfc,
          tipo_persona: item.tipo_persona,
          activo: item.activo,
          fecha_creacion: item.fecha_creacion,
          id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
          id_estado_civil: item.id_estado_civil,
          id_conyuge: item.id_conyuge,
          representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
          estado_civil_nombre: item.estados_civil?.nombre,
          conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
          id_estatus_persona: entidadRelacionada.id_estatus_persona,
          estatus_nombre: item.estatus_persona?.nombre,
          id_proyecto: entidadRelacionada.id_proyecto,
          proyecto_nombre: null, // Will be populated from proyectos query
        } as Prospecto & { entidad_relacionada_id: number; id_tipo_entidad: number };
      });
    },
  });

  const { data: deletedProspectos = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['prospectos', 'deleted'],
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
          fecha_creacion,
          id_entidad_relacionada_rep_leg,
          id_estado_civil,
          id_conyuge,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_estatus_persona,
            id_proyecto,
            activo
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
          ),
          estatus_persona!fk_entidades_relacionadas_estatus_persona (
            id,
            nombre
          )
        `)
        .eq('activo', false)
        .eq('entidades_relacionadas.activo', false)
        .eq('entidades_relacionadas.id_tipo_entidad', 7)
        .order('nombre_legal', { ascending: true });
      
      if (error) {
        console.error("Error cargando prospectos eliminados:", error);
        throw error;
      }
      
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
      
      return (data || []).map((item: any) => {
        const entidadRelacionada = item.entidades_relacionadas[0];
        
        return {
          id: item.id,
          entidad_relacionada_id: entidadRelacionada.id,
          id_tipo_entidad: entidadRelacionada.id_tipo_entidad,
          nombre_legal: item.nombre_legal,
          email: item.email,
          telefono: item.telefono,
          curp: item.curp,
          rfc: item.rfc,
          tipo_persona: item.tipo_persona,
          activo: item.activo,
          fecha_creacion: item.fecha_creacion,
          id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
          id_estado_civil: item.id_estado_civil,
          id_conyuge: item.id_conyuge,
          representante_legal_nombre: item.representante_legal?.personas?.nombre_legal,
          estado_civil_nombre: item.estados_civil?.nombre,
          conyuge_nombre: item.id_conyuge ? conyugesMap.get(item.id_conyuge) : null,
          id_estatus_persona: entidadRelacionada.id_estatus_persona,
          estatus_nombre: item.estatus_persona?.nombre,
          id_proyecto: entidadRelacionada.id_proyecto,
          proyecto_nombre: null, // Will be populated from proyectos query
        } as Prospecto & { entidad_relacionada_id: number; id_tipo_entidad: number };
      });
    },
  });

  const prospectos = activeTab === "active" ? activeProspectos : deletedProspectos;
  const isLoading = activeTab === "active" ? loadingActive : loadingDeleted;

  // Query for available projects
  const { data: proyectos = [] } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Query for available status for prospects
  const { data: estatusPersona = [] } = useQuery({
    queryKey: ['estatus_persona_prospects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_persona')
        .select('id, nombre')
        .eq('activo', true)
        .eq('id_tipo_entidad', 7) // Prospecto type
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Check if prospect can be deleted (not in any offers)
  const { data: canDeleteData = [] } = useQuery({
    queryKey: ['prospect_offers', prospectos.map(c => c.id)],
    queryFn: async () => {
      if (!prospectos.length) return [];
      
      const prospectIds = prospectos.map(c => c.id);
      
      const { data, error } = await supabase
        .from('ofertas')
        .select('id, id_persona_lead')
        .in('id_persona_lead', prospectIds)
        .eq('activo', true);
      
      if (error) throw error;
      
      return prospectIds.map(prospectId => ({
        prospectId,
        canDelete: !data?.some(offer => offer.id_persona_lead === prospectId)
      }));
    },
    enabled: prospectos.length > 0
  });

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, pendingDocuments, id_proyecto, ...cleanPersonData } = personData;
      
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
          id_tipo_entidad: 7, // Prospecto
          id_proyecto: id_proyecto !== "null" && id_proyecto ? parseInt(id_proyecto) : null,
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

      // Handle pending documents
      if (pendingDocuments && pendingDocuments.length > 0) {
        for (let i = 0; i < pendingDocuments.length; i++) {
          const doc = pendingDocuments[i];
          try {
            // Upload file to Supabase Storage
            const fileExt = doc.file.name.split('.').pop();
            const fileName = `persona_${personResult.id}_${Date.now()}_${i}.${fileExt}`;
            const filePath = `documentos/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('documentos')
              .upload(filePath, doc.file);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
              .from('documentos')
              .getPublicUrl(filePath);

            // Save document record
            const { error: dbError } = await supabase
              .from('documentos')
              .insert({
                numero: (i + 1).toString(),
                url: urlData.publicUrl,
                es_verificado: false,
                activo: true,
                id_tipo_documento: parseInt(doc.tipoDocumento),
                id_persona: personResult.id
              });

            if (dbError) throw dbError;
          } catch (docError) {
            console.error('Error uploading document:', docError);
            // Continue with other documents even if one fails
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Prospecto creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el prospecto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, id_proyecto, ...cleanPersonData } = personData;
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingProspecto?.id);
      
      if (updateError) throw updateError;
      
      if (representativeId !== undefined && cleanPersonData.tipo_persona === 'pm') {
        const { error: repError } = await supabase
          .from('personas')
          .update({ id_entidad_relacionada_rep_leg: representativeId || null })
          .eq('id', editingProspecto?.id);
          
        if (repError) throw repError;
      }

      // Handle project assignment update for prospects
      if (id_proyecto !== undefined) {
        const { error: projectError } = await supabase
          .from('entidades_relacionadas')
          .update({ id_proyecto: id_proyecto })
          .eq('id_persona', editingProspecto?.id)
          .eq('id_tipo_entidad', 7); // Prospecto type
          
        if (projectError) throw projectError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      setIsEditDialogOpen(false);
      setEditingProspecto(null);
      toast({
        title: "Éxito",
        description: "Prospecto actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el prospecto: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      toast({
        title: "Éxito",
        description: "Prospecto eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el prospecto: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      toast({
        title: "Éxito",
        description: "Prospecto restaurado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar el prospecto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to update project assignment
  const updateProjectMutation = useMutation({
    mutationFn: async ({ entidadRelacionadaId, proyectoId }: { entidadRelacionadaId: number; proyectoId: number | null }) => {
      const { error } = await supabase
        .from('entidades_relacionadas')
        .update({ id_proyecto: proyectoId })
        .eq('id', entidadRelacionadaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      toast({
        title: "Éxito",
        description: "Proyecto asignado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al asignar el proyecto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to update status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ entidadRelacionadaId, estatusId }: { entidadRelacionadaId: number; estatusId: number | null }) => {
      const { error } = await supabase
        .from('entidades_relacionadas')
        .update({ id_estatus_persona: estatusId })
        .eq('id', entidadRelacionadaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospectos'] });
      toast({
        title: "Éxito",
        description: "Estatus actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el estatus: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredProspectos = prospectos.filter(prospecto => 
    prospecto.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prospecto.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prospecto.telefono?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper function to get status badge variant and color
  const getStatusBadge = (statusId?: number, statusName?: string) => {
    if (!statusName) return null;
    
    // Define color variants based on status ID or name
    const getVariantFromId = (id?: number) => {
      switch (id) {
        case 1: return { variant: "default" as const, className: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300" };
        case 2: return { variant: "secondary" as const, className: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300" };
        case 3: return { variant: "destructive" as const, className: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300" };
        case 4: return { variant: "outline" as const, className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300" };
        case 5: return { variant: "default" as const, className: "bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300" };
        default: return { variant: "outline" as const, className: "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-300" };
      }
    };
    
    const { variant, className } = getVariantFromId(statusId);
    
    return (
      <Badge variant={variant} className={className}>
        {statusName}
      </Badge>
    );
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} de ${month} de ${year}`;
  };

  const canDeleteProspect = (prospectId: number) => {
    const canDeleteInfo = canDeleteData.find(c => c.prospectId === prospectId);
    return canDeleteInfo?.canDelete ?? false;
  };

  const handleEdit = (prospecto: Prospecto) => {
    setEditingProspecto(prospecto);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (prospecto: Prospecto) => {
    setProspectoToDelete(prospecto);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (prospectoToDelete) {
      deleteMutation.mutate(prospectoToDelete.id);
      setDeleteDialogOpen(false);
      setProspectoToDelete(null);
    }
  };

  const handleRestore = (prospecto: Prospecto) => {
    setProspectoToRestore(prospecto);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (prospectoToRestore) {
      restoreMutation.mutate(prospectoToRestore.id);
      setRestoreDialogOpen(false);
      setProspectoToRestore(null);
    }
  };

  const handleBeneficiarios = (prospecto: Prospecto) => {
    setSelectedProspectoForBeneficiarios(prospecto);
    setIsBeneficiariosDialogOpen(true);
  };

  const handleBankAccounts = (prospecto: Prospecto) => {
    setSelectedProspectoForBankAccounts(prospecto);
    setIsBankAccountsDialogOpen(true);
  };

  function renderTable() {
    const isInitialLoading = isLoading && prospectos.length === 0;

    if (isInitialLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando prospectos...</p>
        </div>
      );
    }

    if (filteredProspectos.length === 0) {
      return (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No hay prospectos</h3>
          <p className="mt-2 text-muted-foreground">
            {searchTerm ? 'No se encontraron prospectos que coincidan con tu búsqueda.' : 'Comienza creando tu primer prospecto.'}
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
              <TableHead className="font-semibold text-foreground">RFC</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground w-40">Estatus</TableHead>
              <TableHead className="font-semibold text-foreground">Proyecto de Interés</TableHead>
              <TableHead className="font-semibold text-foreground">Fecha de Creación</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProspectos.map((prospecto) => (
              <TableRow key={prospecto.id} className="hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium text-foreground">
                  {prospecto.nombre_legal}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {prospecto.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {prospecto.rfc || 'N/A'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {prospecto.telefono || 'N/A'}
                </TableCell>
                <TableCell>
                  <Select
                    value={prospecto.id_estatus_persona?.toString() || "null"}
                    onValueChange={(value) => {
                      const estatusId = value === "null" ? null : parseInt(value);
                      updateStatusMutation.mutate({
                        entidadRelacionadaId: (prospecto as any).entidad_relacionada_id,
                        estatusId
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin estatus asignado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">Sin estatus</SelectItem>
                      {estatusPersona.map((estatus) => (
                        <SelectItem key={estatus.id} value={estatus.id.toString()}>
                          {estatus.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={prospecto.id_proyecto?.toString() || "null"}
                    onValueChange={(value) => {
                      const proyectoId = value === "null" ? null : parseInt(value);
                      updateProjectMutation.mutate({
                        entidadRelacionadaId: (prospecto as any).entidad_relacionada_id,
                        proyectoId
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin proyecto asignado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">Sin proyecto</SelectItem>
                      {proyectos.map((proyecto) => (
                        <SelectItem key={proyecto.id} value={proyecto.id.toString()}>
                          {proyecto.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(prospecto.fecha_creacion)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(prospecto)}
                          className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {canDeleteProspect(prospecto.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(prospecto)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(prospecto)}
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
                Prospectos
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los prospectos
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Prospecto
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active">Activos ({activeProspectos.length})</TabsTrigger>
              <TabsTrigger value="deleted">Eliminados ({deletedProspectos.length})</TabsTrigger>
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, correo y teléfono..."
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

      {/* Dialog para nuevo prospecto */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Prospecto</DialogTitle>
          </DialogHeader>
           <PersonForm
             onSubmit={(data) => createMutation.mutate(data)}
             isLoading={createMutation.isPending}
             onCancel={() => setIsNewDialogOpen(false)}
             entityType="client"
           />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar prospecto */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Prospecto</DialogTitle>
          </DialogHeader>
           <PersonForm
             initialData={{
               ...editingProspecto,
               representativeId: editingProspecto?.id_entidad_relacionada_rep_leg,
               id_proyecto: editingProspecto?.id_proyecto
             }}
             onSubmit={(data) => updateMutation.mutate(data)}
             isLoading={updateMutation.isPending}
             onCancel={() => {
               setIsEditDialogOpen(false);
               setEditingProspecto(null);
             }}
             entityType="client"
           />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Prospecto"
        description={`¿Estás seguro de que deseas eliminar al prospecto "${prospectoToDelete?.nombre_legal}"? Esta acción se puede deshacer.`}
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Prospecto"
        description={`¿Estás seguro de que deseas restaurar al prospecto "${prospectoToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />
    </div>
  );
}