import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Users, RotateCcw, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";
import { BeneficiariosForm } from "@/components/admin/BeneficiariosForm";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { 
  Pagination, 
  PaginationContent, 
  PaginationEllipsis, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { format } from "date-fns";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";

type Prospecto = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  clave_pais_telefono?: string;
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
  id_persona_duena_lead?: number;
  agente_nombre?: string;
};

export default function Prospectos() {
  const { canCreate, canUpdate, canDelete, canApprove, canExport, isSuperAdmin } = usePagePermissions('/admin/prospectos');
  const { exportToExcel, isExporting } = useExportToExcel();
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
      setCurrentPageActive(1);
      setCurrentPageDeleted(1);
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
  const [newProspectoProyecto, setNewProspectoProyecto] = useState("");
  const [newProspectoAgente, setNewProspectoAgente] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeProspectosData, isLoading: loadingActive } = useQuery({
    queryKey: ['prospectos', 'active', currentPageActive, searchTerm],
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
          fecha_creacion,
          id_entidad_relacionada_rep_leg,
          id_estado_civil,
          id_conyuge,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_estatus_persona,
            id_proyecto,
            id_persona_duena_lead,
            activo,
            estatus:estatus_persona!fk_entidades_relacionadas_estatus_persona (
              id,
              nombre
            ),
            agente:personas!entidades_relacionadas_id_persona_duena_lead_fkey (
              id,
              nombre_legal
            )
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
        .eq('entidades_relacionadas.id_tipo_entidad', 7);

      if (searchTerm) {
        query = query.or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre_legal', { ascending: true })
        .range(from, to);
      
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
      
      // Obtener IDs de proyectos únicos para buscar nombres
      const proyectoIds = [...new Set(
        (data || [])
          .map((item: any) => item.entidades_relacionadas[0]?.id_proyecto)
          .filter(Boolean)
      )];
      
      let proyectosMap = new Map();
      if (proyectoIds.length > 0) {
        const { data: proyectosData } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .in('id', proyectoIds);
        
        proyectosMap = new Map(proyectosData?.map((p: any) => [p.id, p.nombre]) || []);
      }
      
      return {
        prospectos: (data || []).map((item: any) => {
          const entidadRelacionada = item.entidades_relacionadas[0];
          
          return {
            id: item.id,
            entidad_relacionada_id: entidadRelacionada.id,
            id_tipo_entidad: entidadRelacionada.id_tipo_entidad,
            nombre_legal: item.nombre_legal,
            email: item.email,
            telefono: item.telefono,
            clave_pais_telefono: item.clave_pais_telefono,
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
            estatus_nombre: entidadRelacionada.estatus?.nombre,
            id_proyecto: entidadRelacionada.id_proyecto,
            proyecto_nombre: entidadRelacionada.id_proyecto ? proyectosMap.get(entidadRelacionada.id_proyecto) : null,
            id_persona_duena_lead: entidadRelacionada.id_persona_duena_lead,
            agente_nombre: entidadRelacionada.agente?.nombre_legal,
          } as Prospecto & { entidad_relacionada_id: number; id_tipo_entidad: number };
        }),
        count: count || 0
      };
    },
  });

  const { data: deletedProspectosData, isLoading: loadingDeleted } = useQuery({
    queryKey: ['prospectos', 'deleted', currentPageDeleted, searchTerm],
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
          fecha_creacion,
          id_entidad_relacionada_rep_leg,
          id_estado_civil,
          id_conyuge,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_estatus_persona,
            id_proyecto,
            id_persona_duena_lead,
            activo,
            estatus:estatus_persona!fk_entidades_relacionadas_estatus_persona (
              id,
              nombre
            ),
            agente:personas!entidades_relacionadas_id_persona_duena_lead_fkey (
              id,
              nombre_legal
            )
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
        .eq('entidades_relacionadas.activo', false)
        .eq('entidades_relacionadas.id_tipo_entidad', 7);

      if (searchTerm) {
        query = query.or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('nombre_legal', { ascending: true })
        .range(from, to);
      
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
      
      // Obtener IDs de proyectos únicos para buscar nombres
      const proyectoIds = [...new Set(
        (data || [])
          .map((item: any) => item.entidades_relacionadas[0]?.id_proyecto)
          .filter(Boolean)
      )];
      
      let proyectosMap = new Map();
      if (proyectoIds.length > 0) {
        const { data: proyectosData } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .in('id', proyectoIds);
        
        proyectosMap = new Map(proyectosData?.map((p: any) => [p.id, p.nombre]) || []);
      }
      
      return {
        prospectos: (data || []).map((item: any) => {
          const entidadRelacionada = item.entidades_relacionadas[0];
          
          return {
            id: item.id,
            entidad_relacionada_id: entidadRelacionada.id,
            id_tipo_entidad: entidadRelacionada.id_tipo_entidad,
            nombre_legal: item.nombre_legal,
            email: item.email,
            telefono: item.telefono,
            clave_pais_telefono: item.clave_pais_telefono,
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
            estatus_nombre: entidadRelacionada.estatus?.nombre,
            id_proyecto: entidadRelacionada.id_proyecto,
            proyecto_nombre: entidadRelacionada.id_proyecto ? proyectosMap.get(entidadRelacionada.id_proyecto) : null,
            id_persona_duena_lead: entidadRelacionada.id_persona_duena_lead,
            agente_nombre: entidadRelacionada.agente?.nombre_legal,
          } as Prospecto & { entidad_relacionada_id: number; id_tipo_entidad: number };
        }),
        count: count || 0
      };
    },
  });

  const activeProspectos = activeProspectosData?.prospectos || [];
  const activeCount = activeProspectosData?.count || 0;
  const deletedProspectos = deletedProspectosData?.prospectos || [];
  const deletedCount = deletedProspectosData?.count || 0;

  const prospectos = activeTab === "active" ? activeProspectos : deletedProspectos;
  const totalCount = activeTab === "active" ? activeCount : deletedCount;
  const currentPage = activeTab === "active" ? currentPageActive : currentPageDeleted;
  const setCurrentPage = activeTab === "active" ? setCurrentPageActive : setCurrentPageDeleted;
  const isLoading = activeTab === "active" ? loadingActive : loadingDeleted;
  
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Query for available projects with pagination to get ALL projects
  const { data: proyectos = [] } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      const allProyectos: any[] = [];
      const pageSize = 1000;
      let from = 0;
      let more = true;
      
      while (more) {
        const { data, error } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true })
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allProyectos.push(...data);
          from += pageSize;
          more = data.length === pageSize;
        } else {
          more = false;
        }
      }
      
      return allProyectos;
    },
  });

  // Query for available agents (id_tipo_entidad = 19)
  const { data: agentes = [] } = useQuery({
    queryKey: ['agentes_disponibles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 19)
        .is('entidades_relacionadas.id_proyecto', null)
        .order('nombre_legal', { ascending: true });
      
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
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, id_proyecto, id_persona_duena_lead, ...cleanPersonData } = personData;
      
      // Lista blanca de campos válidos para la tabla personas
      const validPersonaFields = [
        'tipo_persona', 'email', 'telefono', 'nombre_legal', 'nombre_comercial',
        'id_entidad_relacionada_rep_leg', 'id_entidad_relacionada_rep_com', 'sexo', 'fecha_nacimiento',
        'numero_escritura', 'numero_libro', 'fecha_escritura', 'id_notario', 'folio_mercantil',
        'fecha_registro', 'direccion_calle', 'direccion_colonia', 'direccion_codigo_postal',
        'direccion_id_pais', 'direccion_id_estado', 'direccion_id_municipio', 'direccion_num_ext',
        'direccion_num_int', 'direccion_fiscal_calle', 'direccion_fiscal_colonia',
        'direccion_fiscal_codigo_postal', 'direccion_fiscal_id_pais', 'direccion_fiscal_id_estado',
        'direccion_fiscal_id_municipio', 'direccion_fiscal_num_ext', 'direccion_fiscal_num_int',
        'curp', 'rfc', 'regimen', 'uso_cfdi', 'id_pais_nacimiento', 'id_estado_nacimiento',
        'id_municipio_nacimiento', 'id_estado_civil', 'ocupacion', 'id_tipo_identificacion',
        'activo', 'clave_pais_telefono', 'url_logo', 'id_conyuge'
      ];
      
      // Filtrar solo campos válidos para la tabla personas
      const safePersonData: Record<string, unknown> = {};
      for (const key of Object.keys(cleanPersonData)) {
        if (validPersonaFields.includes(key)) {
          safePersonData[key] = cleanPersonData[key];
        }
      }
      
      // Obtener id_persona del usuario actual si no es admin
      let finalIdPersonaDuenaLead = id_persona_duena_lead ? parseInt(id_persona_duena_lead) : null;
      
      if (!finalIdPersonaDuenaLead) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data: currentUser } = await supabase
            .from('usuarios')
            .select('id_persona, rol_id')
            .eq('auth_user_id', session.user.id)
            .single();
          
          // Si no es admin (rol 1 o 2), asignar automáticamente
          if (currentUser && currentUser.rol_id !== 1 && currentUser.rol_id !== 2 && currentUser.id_persona) {
            finalIdPersonaDuenaLead = currentUser.id_persona;
          }
        }
      }
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([safePersonData as any])
        .select()
        .single();
      
      if (personError) throw personError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 7, // Prospecto
          id_proyecto: id_proyecto !== "null" && id_proyecto ? parseInt(id_proyecto) : null,
          id_persona_duena_lead: finalIdPersonaDuenaLead,
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
                id_estatus_verificacion: 1, // 1 = Pendiente
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
      setNewProspectoProyecto("");
      setNewProspectoAgente("");
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
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, id_proyecto, id_persona_duena_lead, id, ...cleanPersonData } = personData;
      
      // Lista blanca de campos válidos para la tabla personas
      const validPersonaFields = [
        'tipo_persona', 'email', 'telefono', 'nombre_legal', 'nombre_comercial',
        'id_entidad_relacionada_rep_leg', 'id_entidad_relacionada_rep_com', 'sexo', 'fecha_nacimiento',
        'numero_escritura', 'numero_libro', 'fecha_escritura', 'id_notario', 'folio_mercantil',
        'fecha_registro', 'direccion_calle', 'direccion_colonia', 'direccion_codigo_postal',
        'direccion_id_pais', 'direccion_id_estado', 'direccion_id_municipio', 'direccion_num_ext',
        'direccion_num_int', 'direccion_fiscal_calle', 'direccion_fiscal_colonia',
        'direccion_fiscal_codigo_postal', 'direccion_fiscal_id_pais', 'direccion_fiscal_id_estado',
        'direccion_fiscal_id_municipio', 'direccion_fiscal_num_ext', 'direccion_fiscal_num_int',
        'curp', 'rfc', 'regimen', 'uso_cfdi', 'id_pais_nacimiento', 'id_estado_nacimiento',
        'id_municipio_nacimiento', 'id_estado_civil', 'ocupacion', 'id_tipo_identificacion',
        'activo', 'clave_pais_telefono', 'url_logo', 'id_conyuge'
      ];
      
      // Filtrar solo campos válidos para la tabla personas
      const safePersonData: Record<string, unknown> = {};
      for (const key of Object.keys(cleanPersonData)) {
        if (validPersonaFields.includes(key)) {
          safePersonData[key] = cleanPersonData[key];
        }
      }
      
      // Solo actualizar la tabla personas cuando se edita desde el diálogo
      if (editingProspecto) {
        const { error: updateError } = await supabase
          .from('personas')
          .update(safePersonData as any)
          .eq('id', editingProspecto.id);
        
        if (updateError) throw updateError;
        
        // Actualizar representante legal si aplica
        if (representativeId !== undefined && safePersonData.tipo_persona === 'pm') {
          const { error: repError } = await supabase
            .from('personas')
            .update({ id_entidad_relacionada_rep_leg: representativeId || null })
            .eq('id', editingProspecto.id);
            
          if (repError) throw repError;
        }
        
        // Actualizar representante comercial si aplica
        if (commercialRepresentativeId !== undefined) {
          const { error: repComError } = await supabase
            .from('personas')
            .update({ id_entidad_relacionada_rep_com: commercialRepresentativeId || null })
            .eq('id', editingProspecto.id);
            
          if (repComError) throw repComError;
        }
      }

      // Usar el entidad_relacionada_id específico para evitar violar unique constraint
      const entidadRelacionadaId = (editingProspecto as any)?.entidad_relacionada_id;

      // Construir un solo objeto de actualización para entidades_relacionadas
      // para evitar estados intermedios que violen la unique constraint
      if (entidadRelacionadaId) {
        const entidadUpdate: Record<string, unknown> = {};

        if (id_proyecto !== undefined) {
          if (id_proyecto === null || id_proyecto === '' || id_proyecto === 'null' || id_proyecto === 'undefined') {
            entidadUpdate.id_proyecto = null;
          } else if (typeof id_proyecto === 'number') {
            entidadUpdate.id_proyecto = id_proyecto;
          } else {
            const parsed = parseInt(id_proyecto as string, 10);
            entidadUpdate.id_proyecto = Number.isNaN(parsed) ? null : parsed;
          }
        }

        if (id_persona_duena_lead !== undefined) {
          let agenteValue: number | null = null;
          if (id_persona_duena_lead !== null && id_persona_duena_lead !== '' && id_persona_duena_lead !== 'undefined') {
            if (typeof id_persona_duena_lead === 'number') {
              agenteValue = id_persona_duena_lead;
            } else {
              const parsed = parseInt(id_persona_duena_lead as string, 10);
              agenteValue = Number.isNaN(parsed) ? null : parsed;
            }
          }
          entidadUpdate.id_persona_duena_lead = agenteValue;
        }

        if (Object.keys(entidadUpdate).length > 0) {
          const { error: entidadError } = await supabase
            .from('entidades_relacionadas')
            .update(entidadUpdate)
            .eq('id', entidadRelacionadaId);

          if (entidadError) throw entidadError;
        }
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

    if (prospectos.length === 0) {
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
              <TableHead className="font-semibold text-foreground">Agente</TableHead>
              <TableHead className="font-semibold text-foreground">Fecha de Creación</TableHead>
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prospectos.map((prospecto) => (
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
                <TableCell>
                  <PhoneDisplay telefono={prospecto.telefono} clavePaisTelefono={prospecto.clave_pais_telefono} />
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
                  <Combobox
                    value={prospecto.id_proyecto?.toString() || ""}
                    onValueChange={(value) => {
                      const proyectoId = value ? parseInt(value) : null;
                      updateProjectMutation.mutate({
                        entidadRelacionadaId: (prospecto as any).entidad_relacionada_id,
                        proyectoId
                      });
                    }}
                    options={(() => {
                      // Crear un Set con todos los proyectos disponibles
                      const allOptions = proyectos.map((proyecto) => ({
                        value: proyecto.id.toString(),
                        label: proyecto.nombre
                      }));
                      
                      // Si el prospecto tiene un proyecto asignado que no está en la lista, agregarlo
                      if (prospecto.id_proyecto && prospecto.proyecto_nombre) {
                        const exists = allOptions.some(opt => opt.value === prospecto.id_proyecto.toString());
                        if (!exists) {
                          allOptions.unshift({
                            value: prospecto.id_proyecto.toString(),
                            label: prospecto.proyecto_nombre
                          });
                        }
                      }
                      
                      return allOptions;
                    })()}
                    placeholder="Sin proyecto asignado"
                    emptyText="No se encontró el proyecto"
                    searchPlaceholder="Buscar proyecto..."
                    className="w-full"
                  />
                </TableCell>
                <TableCell>
                  <Combobox
                    value={prospecto.id_persona_duena_lead?.toString() || ""}
                    onValueChange={(value) => {
                      const agenteId = value ? parseInt(value) : null;
                      updateMutation.mutate({
                        id: prospecto.id,
                        id_persona_duena_lead: agenteId
                      });
                    }}
                    options={agentes.map((agente) => ({
                      value: agente.id.toString(),
                      label: agente.nombre_legal
                    }))}
                    placeholder="Sin agente asignado"
                    emptyText="No se encontró el agente"
                    searchPlaceholder="Buscar agente..."
                    className="w-full"
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(prospecto.fecha_creacion)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    {activeTab === 'active' ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(prospecto)}
                            className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && canDeleteProspect(prospecto.id) && (
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
                      (canApprove || isSuperAdmin) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(prospecto)}
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
                Prospectos
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los prospectos
              </p>
            </div>
            <div className="flex gap-2">
              {(canExport || isSuperAdmin) && activeProspectos.length > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const exportData = activeProspectos.map(p => ({
                      'Nombre': p.nombre_legal,
                      'Email': p.email,
                      'Teléfono': p.telefono || '',
                      'Tipo Persona': p.tipo_persona === 'pf' ? 'Física' : 'Moral',
                      'RFC': p.rfc || '',
                      'CURP': p.curp || '',
                      'Estatus': p.estatus_nombre || '',
                      'Proyecto': p.proyecto_nombre || '',
                      'Agente': p.agente_nombre || '',
                      'Representante Legal': p.representante_legal_nombre || '',
                    }));
                    exportToExcel({ data: exportData, filename: 'prospectos' });
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
                  Nuevo Prospecto
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
                  placeholder="Buscar por nombre, correo y teléfono..."
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
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = idx + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = idx + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + idx;
                        } else {
                          pageNumber = currentPage - 2 + idx;
                        }

                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNumber)}
                              isActive={currentPage === pageNumber}
                              className="cursor-pointer"
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = idx + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = idx + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + idx;
                        } else {
                          pageNumber = currentPage - 2 + idx;
                        }

                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNumber)}
                              isActive={currentPage === pageNumber}
                              className="cursor-pointer"
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

      {/* Dialog para nuevo prospecto */}
      <Dialog open={isNewDialogOpen} onOpenChange={(open) => {
        setIsNewDialogOpen(open);
        if (!open) {
          setNewProspectoProyecto("");
          setNewProspectoAgente("");
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Prospecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Proyecto de Interés <span className="text-destructive">*</span>
                </label>
                <Combobox
                  value={newProspectoProyecto}
                  onValueChange={setNewProspectoProyecto}
                  options={proyectos.map((proyecto) => ({
                    value: proyecto.id.toString(),
                    label: proyecto.nombre
                  }))}
                  placeholder="Seleccionar proyecto..."
                  emptyText="No se encontró el proyecto"
                  searchPlaceholder="Buscar proyecto..."
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Agente Responsable</label>
                <Combobox
                  value={newProspectoAgente}
                  onValueChange={setNewProspectoAgente}
                  options={agentes.map((agente) => ({
                    value: agente.id.toString(),
                    label: agente.nombre_legal
                  }))}
                  placeholder="Seleccionar agente..."
                  emptyText="No se encontró el agente"
                  searchPlaceholder="Buscar agente..."
                  className="w-full"
                />
              </div>
            </div>
            <PersonForm
              onSubmit={(data) => {
                // Validar que el proyecto esté seleccionado
                if (!newProspectoProyecto) {
                  toast({
                    title: "Error",
                    description: "Debes seleccionar un proyecto de interés",
                    variant: "destructive",
                  });
                  return;
                }
                
                // Convertir id_proyecto a número
                const proyectoId = parseInt(newProspectoProyecto, 10);
                if (isNaN(proyectoId)) {
                  toast({
                    title: "Error",
                    description: "El proyecto seleccionado no es válido",
                    variant: "destructive",
                  });
                  return;
                }
                
                createMutation.mutate({
                  ...data,
                  id_proyecto: proyectoId,
                  id_persona_duena_lead: newProspectoAgente ? parseInt(newProspectoAgente, 10) : null
                });
              }}
              isLoading={createMutation.isPending}
              onCancel={() => {
                setIsNewDialogOpen(false);
                setNewProspectoProyecto("");
                setNewProspectoAgente("");
              }}
              entityType="client"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar prospecto */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Prospecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Proyecto de Interés</label>
                <Combobox
                  value={editingProspecto?.id_proyecto?.toString() || ""}
                  onValueChange={(value) => {
                    if (editingProspecto) {
                      const proyectoId = value ? parseInt(value) : null;
                      updateProjectMutation.mutate({
                        entidadRelacionadaId: (editingProspecto as any).entidad_relacionada_id,
                        proyectoId
                      });
                    }
                  }}
                  options={proyectos.map((proyecto) => ({
                    value: proyecto.id.toString(),
                    label: proyecto.nombre
                  }))}
                  placeholder="Seleccionar proyecto..."
                  emptyText="No se encontró el proyecto"
                  searchPlaceholder="Buscar proyecto..."
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Agente Responsable</label>
                <Combobox
                  value={editingProspecto?.id_persona_duena_lead?.toString() || ""}
                  onValueChange={(value) => {
                    if (editingProspecto) {
                      const agenteId = value ? parseInt(value) : null;
                      updateMutation.mutate({
                        id: editingProspecto.id,
                        id_persona_duena_lead: agenteId
                      });
                    }
                  }}
                  options={agentes.map((agente) => ({
                    value: agente.id.toString(),
                    label: agente.nombre_legal
                  }))}
                  placeholder="Seleccionar agente..."
                  emptyText="No se encontró el agente"
                  searchPlaceholder="Buscar agente..."
                  className="w-full"
                />
              </div>
            </div>
            <PersonForm
              initialData={{
                ...editingProspecto,
                representativeId: editingProspecto?.id_entidad_relacionada_rep_leg,
                id_proyecto: editingProspecto?.id_proyecto,
                id_persona_duena_lead: editingProspecto?.id_persona_duena_lead
              }}
              onSubmit={(data) => updateMutation.mutate(data)}
              isLoading={updateMutation.isPending}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingProspecto(null);
              }}
              entityType="client"
            />
          </div>
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