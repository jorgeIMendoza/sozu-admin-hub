import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Building, Users, Copy, UserPlus, CheckCircle, FileCheck } from "lucide-react";
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
import { BankAccountsSection } from "@/components/admin/BankAccountsSection";
import { Badge } from "@/components/ui/badge";
import { useActivityLogger } from "@/hooks/useActivityLogger";

import { UserConfirmationDialog } from "@/components/admin/UserConfirmationDialog";

type UserToCreate = {
  email: string;
  nombre: string;
  rol: string;
  tipo: 'inmobiliaria' | 'rep_legal' | 'rep_comercial';
};

type Inmobiliaria = {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  clave_pais_telefono?: string;
  rfc?: string;
  activo: boolean;
  es_draft?: boolean;
  id_entidad_relacionada_rep_leg?: number;
  id_entidad_relacionada_rep_com?: number;
  representante_legal_nombre?: string;
  representante_comercial_nombre?: string;
  numero_proyectos: number;
  numero_agentes: number;
  numero_usuarios: number; // Count of users associated with this inmobiliaria
  entidad_relacionada_id: number;
  id_tipo_entidad: number;
  url_logo?: string;
  usuario_email?: string; // Email of the user with Inmobiliaria role (4) linked to this entity
  porcentaje_comision?: number; // Commission percentage
};

type Agente = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
};

export default function Inmobiliarias() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin } = usePagePermissions('/admin/inmobiliarias');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Inmobiliaria | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<Inmobiliaria | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [entityToRestore, setEntityToRestore] = useState<Inmobiliaria | null>(null);
  const [selectedEntityForBankAccounts, setSelectedEntityForBankAccounts] = useState<Inmobiliaria | null>(null);
  const [isBankAccountsDialogOpen, setIsBankAccountsDialogOpen] = useState(false);
  const [isAgentesDialogOpen, setIsAgentesDialogOpen] = useState(false);
  const [selectedInmobiliariaForAgentes, setSelectedInmobiliariaForAgentes] = useState<Inmobiliaria | null>(null);
  // User confirmation dialog states
  const [showUserConfirmationDialog, setShowUserConfirmationDialog] = useState(false);
  const [pendingInmobiliariaData, setPendingInmobiliariaData] = useState<any>(null);
  const [usersToCreate, setUsersToCreate] = useState<UserToCreate[]>([]);
  // Migration states
  const [isMigrationLoading, setIsMigrationLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();
  
  const itemsPerPage = 10;

  const fetchInmobiliarias = async (activo: boolean, isDraft: boolean = false) => {
    // First get all personas that have an entidades_relacionadas record with id_tipo_entidad = 5
    const { data: entidadesData, error: entidadesError } = await supabase
      .from('entidades_relacionadas')
      .select('id, id_persona, porcentaje_comision')
      .eq('id_tipo_entidad', 5) // Inmobiliaria
      .eq('activo', true);
    
    if (entidadesError) {
      console.error('Error fetching entidades:', entidadesError);
      throw entidadesError;
    }
    
    const personaIds = (entidadesData || []).map(e => e.id_persona).filter(Boolean);
    
    console.log('Inmobiliarias - personaIds found:', personaIds.length);
    
    if (personaIds.length === 0) {
      return [];
    }
    
    // Build query based on tab type
    let query = supabase
      .from('personas')
      .select(`
        id,
        nombre_legal,
        nombre_comercial,
        email,
        telefono,
        clave_pais_telefono,
        rfc,
        activo,
        es_draft,
        url_logo,
        id_entidad_relacionada_rep_leg,
        id_entidad_relacionada_rep_com
      `)
      .eq('activo', activo)
      .eq('tipo_persona', 'pm')
      .in('id', personaIds)
      .order('nombre_legal', { ascending: true });
    
    // For active tab: only non-draft records
    // For draft tab: only draft records
    // For deleted tab: all deleted records regardless of draft status
    if (activo) {
      query = query.eq('es_draft', isDraft);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching personas:', error);
      throw error;
    }
    
    console.log('Inmobiliarias - personas found:', data?.length || 0, 'for activo:', activo, 'isDraft:', isDraft);

    // Fetch representative names from entidades_relacionadas -> personas
    const repLegIds = (data || [])
      .map(i => i.id_entidad_relacionada_rep_leg)
      .filter(Boolean) as number[];
    const repComIds = (data || [])
      .map(i => i.id_entidad_relacionada_rep_com)
      .filter(Boolean) as number[];

    const allRepIds = [...new Set([...repLegIds, ...repComIds])];

    let repsMap = new Map<number, string>();

    if (allRepIds.length > 0) {
      const { data: repsData, error: repsError } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .in('id', allRepIds);
      
      if (!repsError && repsData) {
        (repsData as any[]).forEach((r: any) => {
          if (r.id && r.personas?.nombre_legal) {
            repsMap.set(r.id, r.personas.nombre_legal);
          }
        });
      }
    }
    
    
    // Map to include entidad_relacionada_id and porcentaje_comision
    const entidadMap = new Map(entidadesData?.map(e => [e.id_persona, { id: e.id, porcentaje_comision: e.porcentaje_comision }]) || []);
    
    // Get all persona IDs to find users linked to inmobiliarias via id_persona
    const inmobiliariaPersonaIds = (data || []).map(item => item.id).filter(Boolean);
    
    // Get users with Inmobiliaria role (4) and their project access in batch queries
    let projectCounts: { [personaId: number]: number } = {};
    let userCounts: { [personaId: number]: number } = {};
    let userEmailsByPersonaId: { [personaId: number]: string } = {};
    
    if (inmobiliariaPersonaIds.length > 0) {
      // Get users with rol_id = 4 (Inmobiliaria) whose id_persona matches the inmobiliaria persona id
      const { data: inmobiliariaUsers, error: usersError } = await supabase
        .from('usuarios')
        .select('email, id_persona')
        .eq('rol_id', 4)
        .eq('activo', true)
        .in('id_persona', inmobiliariaPersonaIds);
      
      if (!usersError && inmobiliariaUsers && inmobiliariaUsers.length > 0) {
        // Map user emails by persona id
        inmobiliariaUsers.forEach(u => {
          if (u.id_persona) {
            userEmailsByPersonaId[u.id_persona] = u.email;
            userCounts[u.id_persona] = (userCounts[u.id_persona] || 0) + 1;
          }
        });
        
        const userEmails = inmobiliariaUsers.map(u => u.email);
        
        // Get project access for these users
        const { data: projectAccessData, error: projectAccessError } = await supabase
          .from('proyectos_acceso')
          .select('usuario_id, proyecto_id')
          .in('usuario_id', userEmails)
          .eq('activo', true);
        
        if (!projectAccessError && projectAccessData) {
          // Count unique projects per user email, then map back to persona id
          const projectsByEmail: { [email: string]: Set<number> } = {};
          projectAccessData.forEach(pa => {
            if (!projectsByEmail[pa.usuario_id]) {
              projectsByEmail[pa.usuario_id] = new Set();
            }
            projectsByEmail[pa.usuario_id].add(pa.proyecto_id);
          });
          
          // Map projects count by persona id
          inmobiliariaUsers.forEach(u => {
            if (u.id_persona && projectsByEmail[u.email]) {
              projectCounts[u.id_persona] = projectsByEmail[u.email].size;
            }
          });
        }
      }
    }

    // Get agent counts for each inmobiliaria in a single query
    let agentCounts: { [key: number]: number } = {};
    
    if (inmobiliariaPersonaIds.length > 0) {
      const { data: agentData, error: agentError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona_duena_lead')
        .in('id_persona_duena_lead', inmobiliariaPersonaIds)
        .eq('id_tipo_entidad', 19) // Agentes (tipo_entidad 19)
        .eq('activo', true);
      
      if (!agentError && agentData) {
        agentCounts = agentData.reduce((acc, item) => {
          if (item.id_persona_duena_lead) {
            acc[item.id_persona_duena_lead] = (acc[item.id_persona_duena_lead] || 0) + 1;
          }
          return acc;
        }, {} as { [key: number]: number });
      }
    }
    
    return (data || []).map((item: any) => {
      const entidadInfo = entidadMap.get(item.id);
      return {
        id: item.id,
        entidad_relacionada_id: entidadInfo?.id,
        id_tipo_entidad: 5, // Inmobiliaria
        nombre_legal: item.nombre_legal,
        nombre_comercial: item.nombre_comercial,
        email: item.email,
        telefono: item.telefono,
        clave_pais_telefono: item.clave_pais_telefono,
        rfc: item.rfc,
        activo: item.activo,
        es_draft: item.es_draft,
        id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
        id_entidad_relacionada_rep_com: item.id_entidad_relacionada_rep_com,
        representante_legal_nombre: item.id_entidad_relacionada_rep_leg ? repsMap.get(item.id_entidad_relacionada_rep_leg) || null : null,
        representante_comercial_nombre: item.id_entidad_relacionada_rep_com ? repsMap.get(item.id_entidad_relacionada_rep_com) || null : null,
        numero_proyectos: projectCounts[item.id] || 0,
        numero_agentes: agentCounts[item.id] || 0,
        numero_usuarios: userCounts[item.id] || 0,
        usuario_email: userEmailsByPersonaId[item.id] || null,
        url_logo: item.url_logo,
        porcentaje_comision: entidadInfo?.porcentaje_comision,
      } as Inmobiliaria;
    });
  };

  const { data: activeInmobiliarias = [], isLoading: loadingActive } = useQuery({
    queryKey: ['inmobiliarias', 'active'],
    queryFn: () => fetchInmobiliarias(true, false),
  });

  const { data: draftInmobiliarias = [], isLoading: loadingDraft } = useQuery({
    queryKey: ['inmobiliarias', 'draft'],
    queryFn: () => fetchInmobiliarias(true, true),
  });

  const { data: deletedInmobiliarias = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['inmobiliarias', 'deleted'],
    queryFn: () => fetchInmobiliarias(false),
  });

  // Query to fetch agents for a specific inmobiliaria
  const { data: agentesDeInmobiliaria = [], isLoading: loadingAgentes } = useQuery({
    queryKey: ['agentes_inmobiliaria', selectedInmobiliariaForAgentes?.id],
    queryFn: async () => {
      if (!selectedInmobiliariaForAgentes) return [];
      
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          telefono,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad,
            id_persona_duena_lead
          )
        `)
        .eq('activo', true)
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 19) // Agentes
        .eq('entidades_relacionadas.id_persona_duena_lead', selectedInmobiliariaForAgentes.id)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        nombre_legal: item.nombre_legal,
        email: item.email,
        telefono: item.telefono,
      })) as Agente[];
    },
    enabled: !!selectedInmobiliariaForAgentes && isAgentesDialogOpen,
  });

  const normalizedSearchTerm = searchTerm.toLowerCase().trim();

  const matchesInmobiliariaSearch = (inmob: Inmobiliaria) =>
    !normalizedSearchTerm ||
    inmob.nombre_legal?.toLowerCase().includes(normalizedSearchTerm) ||
    inmob.nombre_comercial?.toLowerCase().includes(normalizedSearchTerm) ||
    inmob.rfc?.toLowerCase().includes(normalizedSearchTerm) ||
    inmob.email?.toLowerCase().includes(normalizedSearchTerm) ||
    inmob.usuario_email?.toLowerCase().includes(normalizedSearchTerm);

  const inmobiliarias = activeTab === 'active' 
    ? activeInmobiliarias 
    : activeTab === 'draft' 
      ? draftInmobiliarias 
      : deletedInmobiliarias;
  const filteredInmobiliarias = inmobiliarias.filter(matchesInmobiliariaSearch);

  // Pagination logic
  const totalPages = Math.ceil(filteredInmobiliarias.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInmobiliarias = filteredInmobiliarias.slice(startIndex, endIndex);

  // Reset to first page when changing tabs or search
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const buildEmailInUseMessage = async (email: string, excludePersonaId?: number) => {
    const normalizedEmail = email.toLowerCase().trim();

    const { data: personaExistente } = await supabase
      .from('personas')
      .select('id, email, nombre_legal')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (!personaExistente || (excludePersonaId && personaExistente.id === excludePersonaId)) {
      return `El correo ${normalizedEmail} ya está registrado en el sistema.`;
    }

    const [{ data: entidadesRelacionadas }, { data: usuariosRelacionados }] = await Promise.all([
      supabase
        .from('entidades_relacionadas')
        .select('id_tipo_entidad, tipos_entidad(nombre)')
        .eq('id_persona', personaExistente.id)
        .eq('activo', true),
      supabase
        .from('usuarios')
        .select('rol_id, roles(nombre)')
        .ilike('email', normalizedEmail)
        .eq('activo', true)
    ]);

    const tiposEntidad = [...new Set((entidadesRelacionadas || [])
      .map((item: any) => item.tipos_entidad?.nombre)
      .filter(Boolean))];
    const rolesUsuario = [...new Set((usuariosRelacionados || [])
      .map((item: any) => item.roles?.nombre)
      .filter(Boolean))];

    const etiquetas = [...tiposEntidad, ...rolesUsuario];
    const descripcion = etiquetas.length > 0 ? etiquetas.join(', ') : 'sin rol identificado';

    return `El correo ${normalizedEmail} ya está dado de alta para \"${personaExistente.nombre_legal}\" con: ${descripcion}.`;
  };

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const {
        representativeId,
        commercialRepresentativeId,
        entityType,
        tempBankAccounts,
        tempBeneficiaries,
        pendingDocuments,
        inmobiliariaId,
        porcentaje_comision,
        ...cleanPersonData
      } = personData;
      
      // Validate email uniqueness before creating
      if (cleanPersonData.email) {
        const emailLower = cleanPersonData.email.toLowerCase().trim();

        const { data: existingPersona } = await supabase
          .from('personas')
          .select('id')
          .ilike('email', emailLower)
          .maybeSingle();

        if (existingPersona) {
          throw new Error(await buildEmailInUseMessage(emailLower));
        }
      }
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pm' }])
        .select()
        .single();
      
      if (personError) {
        if (personError.code === '23505' && personError.message?.includes('personas_email_key') && cleanPersonData.email) {
          throw new Error(await buildEmailInUseMessage(cleanPersonData.email));
        }
        throw personError;
      }
      
      // Get the Inmobiliaria entity type ID
      const { data: tipoEntidad, error: tipoError } = await supabase
        .from('tipos_entidad')
        .select('id')
        .eq('nombre', 'Inmobiliaria')
        .single();
      
      if (tipoError) throw tipoError;
      
      const { error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: tipoEntidad.id,
          porcentaje_comision: porcentaje_comision ?? 2.00,
          activo: true
        }]);
      
      if (entidadError) throw entidadError;
      
      // Update representantes if provided
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

      // Crear usuario automáticamente con rol Inmobiliaria (id: 4)
      // Using auto_create flag to bypass Super Admin check
      try {
        const { error: userError } = await supabase.functions.invoke('create-user', {
          body: {
            email: cleanPersonData.email,
            nombre: cleanPersonData.nombre_legal,
            rol_id: 4, // Inmobiliaria
            id_persona: personResult.id,
            telefono: cleanPersonData.telefono || null,
            clave_pais_telefono: cleanPersonData.clave_pais_telefono || null,
            auto_create: true // Flag to bypass Super Admin check for automatic inmobiliaria user creation
          }
        });
        
        if (userError) {
          console.error('Error al crear usuario automático para inmobiliaria:', userError);
        }
      } catch (e) {
        console.error('Error al crear usuario automático para inmobiliaria:', e);
      }

      // Enviar notificación via edge function segura
      try {
        
        // Obtener usuarios con rol Super Administrador (rol_id = 1)
        const { data: superAdmins } = await supabase
          .from('usuarios')
          .select('email, telefono, clave_pais_telefono, roles(nombre)')
          .eq('rol_id', 1)
          .eq('activo', true);
        
        // Obtener usuarios con rol Administrador de Proyecto (rol_id = 2)
        const { data: adminProyecto } = await supabase
          .from('usuarios')
          .select('email, telefono, clave_pais_telefono, roles(nombre)')
          .eq('rol_id', 2)
          .eq('activo', true);
        
        // Formatear correos de super admins
        const correosSuperAdmin = (superAdmins || [])
          .map(u => u.email)
          .filter(Boolean)
          .join(',');
        
        // Formatear correos de admin proyecto
        const correosAdminProy = (adminProyecto || [])
          .map(u => u.email)
          .filter(Boolean)
          .join(',');
        
        // Obtener códigos telefónicos de países desde la BD
        const { data: paises } = await supabase
          .from('paises')
          .select('id, clave_pais_telefono')
          .eq('activo', true);
        
        const codigosPorPais = new Map(
          (paises || []).map(p => [p.id.trim(), p.clave_pais_telefono?.trim()])
        );
        
        // Helper para formatear teléfonos con código de país desde BD
        const formatearTelefonos = (usuarios: any[]) => {
          return (usuarios || [])
            .filter(u => u.telefono)
            .map(u => {
              const clavePais = (u.clave_pais_telefono || 'MX').trim();
              const codigoPais = codigosPorPais.get(clavePais) || '+52';
              return `${codigoPais}${u.telefono}`;
            })
            .join(',');
        };
        
        // Formatear teléfonos de admin proyecto, con fallback a super admins
        const numerosAdminProy = formatearTelefonos(adminProyecto) || formatearTelefonos(superAdmins);
        
        // Nombre fijo para el payload de notificación
        const rolUsuario = 'Administrador';
        
        const notificationPayload = {
          tipo: "ambos",
          from: "Notificaciones Sozu <notificaciones@sozu.com>",
          email: correosAdminProy || correosSuperAdmin,
          cc: correosSuperAdmin,
          telefono: numerosAdminProy,
          mensajeWA: `Se ha creado la Inmobiliaria *${cleanPersonData.nombre_legal}*, con el usuario: *${cleanPersonData.email}*`,
          asunto: "Alta de Inmobiliaria",
          mensaje: {
            nombre: rolUsuario,
            actividad: "Alta de inmobiliaria",
            detalles: `<tr><td class='label'>Nombre:</td> <td class='value'>${cleanPersonData.nombre_legal}</td> </tr><tr><td class='label'>Usuario:</td><td class='value'>${cleanPersonData.email}</td></tr>`
          },
          templateId: 41353048
        };

        console.log('Payload de notificación:', notificationPayload);

        const { error: notifError } = await supabase.functions.invoke('enviar-notificacion', {
          body: notificationPayload
        });

        if (notifError) {
          console.error('Error al enviar notificación de nueva inmobiliaria:', notifError);
        } else {
          console.log('Notificación de nueva inmobiliaria enviada correctamente');
        }
      } catch (notificationError) {
        console.error('Error al enviar notificación de nueva inmobiliaria:', notificationError);
        // No lanzar error para no bloquear la creación de la inmobiliaria
      }

      // Crear usuario para el representante legal si existe
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
            
            if (!existingUser && repPersona.email) {
              // Crear usuario para el representante legal con rol Agente Inmobiliario (id: 3)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 3, // Agente Inmobiliario
                  id_persona: repPersona.id,
                  id_inmobiliaria: personResult.id, // Link to the new inmobiliaria
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null,
                  auto_create: true // Bypass Super Admin check for automatic agent creation
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante legal:', repUserError);
              }
            }
            
            // Also update/create entidad_relacionada to link representative to inmobiliaria
            const { data: existingAgentEntidad } = await supabase
              .from('entidades_relacionadas')
              .select('id')
              .eq('id_persona', repPersona.id)
              .eq('id_tipo_entidad', 19) // Agente
              .eq('activo', true)
              .maybeSingle();
            
            if (existingAgentEntidad) {
              // Update existing to link to inmobiliaria
              await supabase
                .from('entidades_relacionadas')
                .update({ id_persona_duena_lead: personResult.id })
                .eq('id', existingAgentEntidad.id);
            } else {
              // Create new entidad_relacionada
              await supabase
                .from('entidades_relacionadas')
                .insert({
                  id_persona: repPersona.id,
                  id_tipo_entidad: 19, // Agente
                  id_persona_duena_lead: personResult.id,
                  activo: true
                });
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante legal:', e);
        }
      }

      // Crear usuario para el representante comercial si existe
      if (commercialRepresentativeId) {
        try {
          // Obtener la información del representante comercial desde entidades_relacionadas -> personas
          const { data: repComercialData, error: repComercialError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', commercialRepresentativeId)
            .single();
          
          if (!repComercialError && repComercialData?.personas) {
            const repPersona = repComercialData.personas as any;
            
            // Verificar si ya existe un usuario con ese email
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser && repPersona.email) {
              // Crear usuario para el representante comercial con rol Agente Inmobiliario (id: 3)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 3, // Agente Inmobiliario
                  id_persona: repPersona.id,
                  id_inmobiliaria: personResult.id, // Link to the new inmobiliaria
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null,
                  auto_create: true // Bypass Super Admin check for automatic agent creation
                }
              });
              
              if (repUserError) {
                console.error('Error al crear usuario para representante comercial:', repUserError);
              }
            }
            
            // Also update/create entidad_relacionada to link representative to inmobiliaria
            const { data: existingAgentEntidad } = await supabase
              .from('entidades_relacionadas')
              .select('id')
              .eq('id_persona', repPersona.id)
              .eq('id_tipo_entidad', 19) // Agente
              .eq('activo', true)
              .maybeSingle();
            
            if (existingAgentEntidad) {
              // Update existing to link to inmobiliaria
              await supabase
                .from('entidades_relacionadas')
                .update({ id_persona_duena_lead: personResult.id })
                .eq('id', existingAgentEntidad.id);
            } else {
              // Create new entidad_relacionada
              await supabase
                .from('entidades_relacionadas')
                .insert({
                  id_persona: repPersona.id,
                  id_tipo_entidad: 19, // Agente
                  id_persona_duena_lead: personResult.id,
                  activo: true
                });
            }
          }
        } catch (e) {
          console.error('Error al crear usuario para representante comercial:', e);
        }
      }
    },
    onSuccess: (_, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewDialogOpen(false);
      
      // Registrar actividad
      registrarCreacion('inmobiliaria', {
        nombre_legal: variables.nombre_legal,
        email: variables.email,
        rfc: variables.rfc
      });
      
      toast({
        title: "Éxito",
        description: "Inmobiliaria y usuarios creados correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear la inmobiliaria: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { representativeId, commercialRepresentativeId, entityType, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, porcentaje_comision, ...cleanPersonData } = personData;
      
      // Update porcentaje_comision in entidades_relacionadas if provided
      if (porcentaje_comision !== undefined && editingEntity?.id) {
        const { error: comisionError } = await supabase
          .from('entidades_relacionadas')
          .update({ porcentaje_comision })
          .eq('id_persona', editingEntity.id)
          .eq('id_tipo_entidad', 5)
          .eq('activo', true);
        
        if (comisionError) throw comisionError;
      }
      
      // Validate email uniqueness if email is being changed
      if (cleanPersonData.email && editingEntity) {
        const emailLower = cleanPersonData.email.toLowerCase().trim();
        const currentEmail = editingEntity.email?.toLowerCase().trim();
        
        // Only validate if email is actually being changed
        if (emailLower !== currentEmail) {
          const { data: existingPersona } = await supabase
            .from('personas')
            .select('id')
            .ilike('email', emailLower)
            .maybeSingle();

          if (existingPersona && existingPersona.id !== editingEntity.id) {
            throw new Error(await buildEmailInUseMessage(emailLower, editingEntity.id));
          }
        }
      }
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingEntity?.id);
      
      if (updateError) {
        if (updateError.code === '23505' && updateError.message?.includes('personas_email_key') && cleanPersonData.email) {
          throw new Error(await buildEmailInUseMessage(cleanPersonData.email, editingEntity?.id));
        }
        throw updateError;
      }
      
      // Sincronizar teléfono con usuarios si la inmobiliaria tiene usuario asociado
      if (editingEntity?.id && (cleanPersonData.telefono !== undefined || cleanPersonData.clave_pais_telefono !== undefined)) {
        const { data: usuarioData } = await supabase
          .from('usuarios')
          .select('email')
          .eq('id_persona', editingEntity.id)
          .maybeSingle();
          
        if (usuarioData?.email) {
          const phoneUpdateData: Record<string, any> = {
            fecha_actualizacion: new Date().toISOString()
          };
          if (cleanPersonData.telefono !== undefined) {
            phoneUpdateData.telefono = cleanPersonData.telefono;
          }
          if (cleanPersonData.clave_pais_telefono !== undefined) {
            phoneUpdateData.clave_pais_telefono = cleanPersonData.clave_pais_telefono;
          }
          await supabase
            .from('usuarios')
            .update(phoneUpdateData)
            .eq('email', usuarioData.email);
        }
      }
      
      // Update representantes
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

      // Update porcentaje_comision in entidades_relacionadas if provided
      if (personData.porcentaje_comision !== undefined && editingEntity?.entidad_relacionada_id) {
        const { error: comisionError } = await supabase
          .from('entidades_relacionadas')
          .update({ porcentaje_comision: personData.porcentaje_comision })
          .eq('id', editingEntity.entidad_relacionada_id);
        
        if (comisionError) {
          console.error('Error updating porcentaje_comision:', comisionError);
        }
      }
    },
    onSuccess: (_, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      
      // Registrar actividad
      registrarActualizacion('inmobiliaria', 
        { id: editingEntity?.id, nombre_legal: editingEntity?.nombre_legal, email: editingEntity?.email }, 
        { id: editingEntity?.id, nombre_legal: variables.nombre_legal, email: variables.email }
      );
      
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      toast({
        title: "Éxito",
        description: "Inmobiliaria actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar la inmobiliaria: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      
      // Registrar actividad
      if (entityToDelete) {
        registrarEliminacion('inmobiliaria', {
          id: entityToDelete.id,
          nombre_legal: entityToDelete.nombre_legal,
          email: entityToDelete.email
        });
      }
      
      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      toast({
        title: "Éxito",
        description: "Inmobiliaria eliminada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar la inmobiliaria: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      
      // Registrar actividad
      if (entityToRestore) {
        registrarRestauracion('inmobiliaria', 
          { id: entityToRestore.id, nombre_legal: entityToRestore.nombre_legal, activo: false },
          { id: entityToRestore.id, nombre_legal: entityToRestore.nombre_legal, activo: true }
        );
      }
      
      setRestoreDialogOpen(false);
      setEntityToRestore(null);
      toast({
        title: "Éxito",
        description: "Inmobiliaria restaurada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al restaurar la inmobiliaria: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation to approve a draft inmobiliaria
  const approveMutation = useMutation({
    mutationFn: async (inmobiliaria: Inmobiliaria) => {
      // 1. Update es_draft to false
      const { error: updateError } = await supabase
        .from('personas')
        .update({ es_draft: false })
        .eq('id', inmobiliaria.id);
      
      if (updateError) throw updateError;
      
      // 2. Create user for the inmobiliaria
      const { error: userError, data: userResult } = await supabase.functions.invoke('create-user', {
        body: {
          email: inmobiliaria.email,
          nombre: inmobiliaria.nombre_legal,
          rol_id: 4, // Inmobiliaria
          id_persona: inmobiliaria.id,
          telefono: inmobiliaria.telefono || null,
          clave_pais_telefono: inmobiliaria.clave_pais_telefono || null,
          auto_create: true
        }
      });
      
      if (userError) {
        console.error('Error creating user for approved inmobiliaria:', userError);
        // Don't throw - we still want to approve even if user creation fails
      }

      // 3. Create user for legal representative if exists
      if (inmobiliaria.id_entidad_relacionada_rep_leg) {
        try {
          const { data: repLegalData, error: repLegalError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', inmobiliaria.id_entidad_relacionada_rep_leg)
            .single();
          
          if (!repLegalError && repLegalData?.personas) {
            const repPersona = repLegalData.personas as any;
            
            // Check if user already exists
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser && repPersona.email) {
              // Create user for legal rep with role Agente Inmobiliario (id: 3)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 3, // Agente Inmobiliario
                  id_persona: repPersona.id,
                  id_inmobiliaria: inmobiliaria.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null,
                  auto_create: true
                }
              });
              
              if (repUserError) {
                console.error('Error creating user for legal representative:', repUserError);
              }
            }
            
            // Update/create entidad_relacionada to link rep to inmobiliaria
            const { data: existingAgentEntidad } = await supabase
              .from('entidades_relacionadas')
              .select('id')
              .eq('id_persona', repPersona.id)
              .eq('id_tipo_entidad', 19) // Agente
              .eq('activo', true)
              .maybeSingle();
            
            if (existingAgentEntidad) {
              await supabase
                .from('entidades_relacionadas')
                .update({ id_persona_duena_lead: inmobiliaria.id })
                .eq('id', existingAgentEntidad.id);
            } else {
              await supabase
                .from('entidades_relacionadas')
                .insert({
                  id_persona: repPersona.id,
                  id_tipo_entidad: 19, // Agente
                  id_persona_duena_lead: inmobiliaria.id,
                  activo: true
                });
            }
          }
        } catch (e) {
          console.error('Error creating user for legal representative:', e);
        }
      }

      // 4. Create user for commercial representative if exists
      if (inmobiliaria.id_entidad_relacionada_rep_com) {
        try {
          const { data: repComercialData, error: repComercialError } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
            .eq('id', inmobiliaria.id_entidad_relacionada_rep_com)
            .single();
          
          if (!repComercialError && repComercialData?.personas) {
            const repPersona = repComercialData.personas as any;
            
            // Check if user already exists
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser && repPersona.email) {
              // Create user for commercial rep with role Agente Inmobiliario (id: 3)
              const { error: repUserError } = await supabase.functions.invoke('create-user', {
                body: {
                  email: repPersona.email,
                  nombre: repPersona.nombre_legal,
                  rol_id: 3, // Agente Inmobiliario
                  id_persona: repPersona.id,
                  id_inmobiliaria: inmobiliaria.id,
                  telefono: repPersona.telefono || null,
                  clave_pais_telefono: repPersona.clave_pais_telefono || null,
                  auto_create: true
                }
              });
              
              if (repUserError) {
                console.error('Error creating user for commercial representative:', repUserError);
              }
            }
            
            // Update/create entidad_relacionada to link rep to inmobiliaria
            const { data: existingAgentEntidad } = await supabase
              .from('entidades_relacionadas')
              .select('id')
              .eq('id_persona', repPersona.id)
              .eq('id_tipo_entidad', 19) // Agente
              .eq('activo', true)
              .maybeSingle();
            
            if (existingAgentEntidad) {
              await supabase
                .from('entidades_relacionadas')
                .update({ id_persona_duena_lead: inmobiliaria.id })
                .eq('id', existingAgentEntidad.id);
            } else {
              await supabase
                .from('entidades_relacionadas')
                .insert({
                  id_persona: repPersona.id,
                  id_tipo_entidad: 19, // Agente
                  id_persona_duena_lead: inmobiliaria.id,
                  activo: true
                });
            }
          }
        } catch (e) {
          console.error('Error creating user for commercial representative:', e);
        }
      }

      // 5. Send notification via edge function
      try {
        
        // Get country codes from paises table
        const { data: paises } = await supabase
          .from('paises')
          .select('id, clave_pais_telefono')
          .eq('activo', true);
        
        const codigosPorPais = new Map(
          (paises || []).map(p => [p.id.trim(), p.clave_pais_telefono?.trim()])
        );
        
        // Format inmobiliaria phone with country code
        const clavePaisInmobiliaria = (inmobiliaria.clave_pais_telefono || 'MX').trim();
        const codigoPaisInmobiliaria = codigosPorPais.get(clavePaisInmobiliaria) || '+52';
        const telefonoFormateado = inmobiliaria.telefono 
          ? `${codigoPaisInmobiliaria}${inmobiliaria.telefono}` 
          : '';
        
        const notificationPayload = {
          tipo: "ambos",
          from: "Notificaciones Sozu <notificaciones@sozu.com>",
          email: inmobiliaria.email,
          telefono: telefonoFormateado,
          mensajeWA: `Tu inmobiliaria *${inmobiliaria.nombre_legal}* ha sido aprobada.\nLink: admin.sozu.com\nUsuario: ${inmobiliaria.email}\nPassword: Temporal123!`,
          asunto: "Aprobación de Inmobiliaria",
          mensaje: {
            nombre: inmobiliaria.nombre_legal || inmobiliaria.nombre_comercial,
            actividad: "Aprobación de inmobiliaria",
            detalles: `<tr><td class='label'>Link:</td><td class='value'>admin.sozu.com</td></tr><tr><td class='label'>Usuario:</td><td class='value'>${inmobiliaria.email}</td></tr><tr><td class='label'>Password:</td><td class='value'>Temporal123!</td></tr>`
          },
          templateId: 41353048
        };

        console.log('Notification payload:', notificationPayload);
        
        await supabase.functions.invoke('enviar-notificacion', {
          body: notificationPayload
        });
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
      }
      
      return inmobiliaria;
    },
    onSuccess: (inmobiliaria) => {
      queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      
      toast({
        title: "Inmobiliaria aprobada",
        description: `${inmobiliaria.nombre_legal} ha sido aprobada y se han creado los usuarios correspondientes.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al aprobar la inmobiliaria: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = async (inmobiliaria: Inmobiliaria) => {
    // Fetch all persona fields for editing
    try {
      const { data: fullPersonaData, error } = await supabase
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
          es_draft,
          id_entidad_relacionada_rep_leg,
          id_entidad_relacionada_rep_com
        `)
        .eq('id', inmobiliaria.id)
        .single();
      
      if (error) throw error;
      
      // Fetch porcentaje_comision from entidades_relacionadas
      const { data: entidadData } = await supabase
        .from('entidades_relacionadas')
        .select('porcentaje_comision')
        .eq('id', inmobiliaria.entidad_relacionada_id)
        .single();

      // Merge with inmobiliaria data (to keep additional computed fields like entidad_relacionada_id)
      setEditingEntity({
        ...inmobiliaria,
        ...fullPersonaData,
        porcentaje_comision: entidadData?.porcentaje_comision ?? 2.00,
      } as Inmobiliaria);
      setIsEditDialogOpen(true);
    } catch (error) {
      console.error('Error fetching full persona data:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos completos de la inmobiliaria.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (inmobiliaria: Inmobiliaria) => {
    setEntityToDelete(inmobiliaria);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (entityToDelete) {
      deleteMutation.mutate(entityToDelete.id);
    }
  };

  const handleRestore = (inmobiliaria: Inmobiliaria) => {
    setEntityToRestore(inmobiliaria);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (entityToRestore) {
      restoreMutation.mutate(entityToRestore.id);
    }
  };

  // State for approval confirmation dialog
  const [approveConfirmDialog, setApproveConfirmDialog] = useState<{
    isOpen: boolean;
    inmobiliaria: Inmobiliaria | null;
    usersToCreate: UserToCreate[];
    isLoading: boolean;
  }>({ isOpen: false, inmobiliaria: null, usersToCreate: [], isLoading: false });

  const handlePrepareApproval = async (inmobiliaria: Inmobiliaria) => {
    setApproveConfirmDialog({ isOpen: true, inmobiliaria, usersToCreate: [], isLoading: true });
    
    const usersToCreate: UserToCreate[] = [];
    
    // User for inmobiliaria
    usersToCreate.push({
      email: inmobiliaria.email,
      nombre: inmobiliaria.nombre_legal,
      rol: 'Inmobiliaria',
      tipo: 'inmobiliaria'
    });
    
    // Check legal representative
    if (inmobiliaria.id_entidad_relacionada_rep_leg) {
      try {
        const { data } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal, email)')
          .eq('id', inmobiliaria.id_entidad_relacionada_rep_leg)
          .single();
        
        if (data?.personas) {
          const persona = data.personas as any;
          if (persona.email) {
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', persona.email)
              .maybeSingle();
            
            if (!existingUser) {
              usersToCreate.push({
                email: persona.email,
                nombre: persona.nombre_legal,
                rol: 'Agente Inmobiliario',
                tipo: 'rep_legal'
              });
            }
          }
        }
      } catch (e) {
        console.error('Error fetching legal representative:', e);
      }
    }
    
    // Check commercial representative
    if (inmobiliaria.id_entidad_relacionada_rep_com) {
      try {
        const { data } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal, email)')
          .eq('id', inmobiliaria.id_entidad_relacionada_rep_com)
          .single();
        
        if (data?.personas) {
          const persona = data.personas as any;
          if (persona.email) {
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', persona.email)
              .maybeSingle();
            
            if (!existingUser) {
              usersToCreate.push({
                email: persona.email,
                nombre: persona.nombre_legal,
                rol: 'Agente Inmobiliario',
                tipo: 'rep_comercial'
              });
            }
          }
        }
      } catch (e) {
        console.error('Error fetching commercial representative:', e);
      }
    }
    
    setApproveConfirmDialog({ isOpen: true, inmobiliaria, usersToCreate, isLoading: false });
  };

  const handleConfirmApproval = () => {
    if (approveConfirmDialog.inmobiliaria) {
      approveMutation.mutate(approveConfirmDialog.inmobiliaria);
      setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [], isLoading: false });
    }
  };

  const handleApproveDraft = (inmobiliaria: Inmobiliaria) => {
    handlePrepareApproval(inmobiliaria);
  };

  // Prepare user confirmation - detect users that will be created
  const handlePrepareUserConfirmation = async (data: any) => {
    const users: UserToCreate[] = [];
    
    // User for inmobiliaria
    if (data.email) {
      users.push({
        email: data.email,
        nombre: data.nombre_legal,
        rol: 'Inmobiliaria',
        tipo: 'inmobiliaria'
      });
    }
    
    // User for legal representative
    if (data.representativeId) {
      try {
        const { data: repLegalData, error } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal, email)')
          .eq('id', data.representativeId)
          .single();
        
        if (!error && repLegalData?.personas) {
          const repPersona = repLegalData.personas as any;
          if (repPersona.email) {
            // Check if user already exists
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            if (!existingUser) {
              users.push({
                email: repPersona.email,
                nombre: repPersona.nombre_legal,
                rol: 'Agente Inmobiliario',
                tipo: 'rep_legal'
              });
            }
          }
        }
      } catch (e) {
        console.error('Error fetching legal representative:', e);
      }
    }
    
    // User for commercial representative
    if (data.commercialRepresentativeId) {
      try {
        const { data: repComercialData, error } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal, email)')
          .eq('id', data.commercialRepresentativeId)
          .single();
        
        if (!error && repComercialData?.personas) {
          const repPersona = repComercialData.personas as any;
          if (repPersona.email) {
            // Check if user already exists and is not the same as legal rep
            const { data: existingUser } = await supabase
              .from('usuarios')
              .select('email')
              .eq('email', repPersona.email)
              .maybeSingle();
            
            // Don't add if it's the same email as the legal rep
            const alreadyInList = users.some(u => u.email.toLowerCase() === repPersona.email.toLowerCase());
            
            if (!existingUser && !alreadyInList) {
              users.push({
                email: repPersona.email,
                nombre: repPersona.nombre_legal,
                rol: 'Agente Inmobiliario',
                tipo: 'rep_comercial'
              });
            }
          }
        }
      } catch (e) {
        console.error('Error fetching commercial representative:', e);
      }
    }
    
    // Store the data and show confirmation dialog
    setPendingInmobiliariaData(data);
    setUsersToCreate(users);
    setShowUserConfirmationDialog(true);
  };

  // Confirm and execute the creation
  const handleConfirmUserCreation = () => {
    if (pendingInmobiliariaData) {
      createMutation.mutate(pendingInmobiliariaData, {
        onSuccess: () => {
          setShowUserConfirmationDialog(false);
          setPendingInmobiliariaData(null);
          setUsersToCreate([]);
        }
      });
    }
  };

  // Migration function for missing users
  const handleMigrateMissingUsers = async (dryRun: boolean) => {
    setIsMigrationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('migrate-missing-users', {
        body: { dry_run: dryRun }
      });
      
      if (error) throw error;
      
      setMigrationResult(data);
      
      if (!dryRun && data.summary) {
        toast({
          title: "Migración completada",
          description: `${data.summary.created} usuarios creados, ${data.summary.failed} fallidos.`,
        });
        queryClient.invalidateQueries({ queryKey: ['inmobiliarias'] });
      }
    } catch (error: any) {
      toast({
        title: "Error en migración",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsMigrationLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Inmobiliarias
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de las inmobiliarias
              </p>
            </div>
            <div className="flex gap-2">
              {isSuperAdmin && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowMigrationDialog(true);
                    handleMigrateMissingUsers(true);
                  }}
                  disabled={isMigrationLoading}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Migrar Usuarios Faltantes
                </Button>
              )}
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Inmobiliaria
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`grid w-full mb-6 ${(canDelete || isSuperAdmin) ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="active">
                Activos ({searchTerm ? `${activeInmobiliarias.filter(matchesInmobiliariaSearch).length} de ${activeInmobiliarias.length}` : activeInmobiliarias.length})
              </TabsTrigger>
              <TabsTrigger value="draft">
                <FileCheck className="w-4 h-4 mr-1" />
                Draft ({searchTerm ? `${draftInmobiliarias.filter(matchesInmobiliariaSearch).length} de ${draftInmobiliarias.length}` : draftInmobiliarias.length})
              </TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">
                  Eliminados ({searchTerm ? `${deletedInmobiliarias.filter(matchesInmobiliariaSearch).length} de ${deletedInmobiliarias.length}` : deletedInmobiliarias.length})
                </TabsTrigger>
              )}
            </TabsList>
            
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre, correo o RFC..."
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

            <TabsContent value="draft" className="mt-6">
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
            <DialogTitle>Nueva Inmobiliaria</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={handlePrepareUserConfirmation}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="inmobiliaria"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación de usuarios */}
      <UserConfirmationDialog
        open={showUserConfirmationDialog}
        onOpenChange={(open) => {
          setShowUserConfirmationDialog(open);
          if (!open) {
            setPendingInmobiliariaData(null);
            setUsersToCreate([]);
          }
        }}
        onConfirm={handleConfirmUserCreation}
        usersToCreate={usersToCreate}
        isLoading={createMutation.isPending}
        inmobiliariaNombre={pendingInmobiliariaData?.nombre_legal || ''}
      />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Inmobiliaria</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={{
              ...editingEntity,
              representativeId: editingEntity?.id_entidad_relacionada_rep_leg,
              id_entidad_relacionada_rep_com: editingEntity?.id_entidad_relacionada_rep_com
            }}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingEntity(null);
            }}
            entityType="inmobiliaria"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Eliminar Inmobiliaria"
        description={`¿Estás seguro de que deseas eliminar la inmobiliaria "${entityToDelete?.nombre_comercial || entityToDelete?.nombre_legal}"? Esta acción se puede revertir.`}
        isLoading={deleteMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
        title="Restaurar Inmobiliaria"
        description={`¿Estás seguro de que deseas restaurar la inmobiliaria "${entityToRestore?.nombre_comercial || entityToRestore?.nombre_legal}"?`}
        isLoading={restoreMutation.isPending}
        actionType="restore"
      />

      {/* Modal de Agentes */}
      <Dialog open={isAgentesDialogOpen} onOpenChange={(open) => {
        setIsAgentesDialogOpen(open);
        if (!open) setSelectedInmobiliariaForAgentes(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agentes de {selectedInmobiliariaForAgentes?.nombre_comercial || selectedInmobiliariaForAgentes?.nombre_legal}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {loadingAgentes ? (
              <div className="text-center py-8 text-muted-foreground">Cargando agentes...</div>
            ) : agentesDeInmobiliaria.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No hay agentes asignados a esta inmobiliaria</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentesDeInmobiliaria.map((agente) => (
                    <TableRow key={agente.id}>
                      <TableCell className="font-medium">{agente.nombre_legal}</TableCell>
                      <TableCell className="text-muted-foreground">{agente.email}</TableCell>
                      <TableCell className="text-muted-foreground">{agente.telefono || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <Dialog 
        open={approveConfirmDialog.isOpen} 
        onOpenChange={(open) => !open && setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [], isLoading: false })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Confirmar Aprobación
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {approveConfirmDialog.isLoading ? (
              <div className="text-center py-4 text-muted-foreground">
                Cargando información de usuarios...
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Se crearán los siguientes usuarios:
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {approveConfirmDialog.usersToCreate.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{user.nombre}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant={user.tipo === 'inmobiliaria' ? 'default' : 'secondary'}>
                        {user.rol}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    <strong>Password temporal:</strong> <code className="bg-background px-1 rounded">Temporal123!</code>
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setApproveConfirmDialog({ isOpen: false, inmobiliaria: null, usersToCreate: [], isLoading: false })}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmApproval}
              disabled={approveMutation.isPending || approveConfirmDialog.isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? 'Aprobando...' : 'Confirmar Aprobación'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Migration Dialog */}
      <Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Migrar Usuarios Faltantes
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            {isMigrationLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Analizando usuarios faltantes...
              </div>
            ) : migrationResult?.dry_run ? (
              <>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="font-medium mb-2">
                    Se encontraron {migrationResult.total} usuarios faltantes:
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {migrationResult.users_to_create?.map((user: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-background p-3 rounded border">
                        <div>
                          <p className="font-medium">{user.nombre}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={user.tipo === 'inmobiliaria' ? 'default' : 'secondary'}>
                            {user.rol}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {user.tipo === 'inmobiliaria' ? 'Inmobiliaria' : 
                             user.tipo === 'rep_legal' ? 'Rep. Legal' : 'Rep. Comercial'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {migrationResult.total === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No hay usuarios faltantes. ¡Todo está sincronizado!
                    </p>
                  )}
                </div>
                
                {migrationResult.total > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      <strong>Contraseña temporal:</strong> Temporal123!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Los usuarios deberán cambiar su contraseña en el primer inicio de sesión.
                    </p>
                  </div>
                )}
                
                <div className="flex gap-3 justify-end pt-4">
                  <Button variant="outline" onClick={() => setShowMigrationDialog(false)}>
                    Cancelar
                  </Button>
                  {migrationResult.total > 0 && (
                    <Button 
                      onClick={() => handleMigrateMissingUsers(false)}
                      disabled={isMigrationLoading}
                      className="bg-primary"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Crear {migrationResult.total} Usuarios
                    </Button>
                  )}
                </div>
              </>
            ) : migrationResult?.summary ? (
              <>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="font-medium text-green-600 dark:text-green-400">
                    Migración completada
                  </p>
                  <p className="text-sm mt-1">
                    {migrationResult.summary.created} usuarios creados, {migrationResult.summary.failed} fallidos
                  </p>
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {migrationResult.results?.map((result: any, idx: number) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded border ${
                      result.success ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'
                    }`}>
                      <div>
                        <p className="font-medium">{result.nombre}</p>
                        <p className="text-sm text-muted-foreground">{result.email}</p>
                      </div>
                      <Badge variant={result.success ? 'default' : 'destructive'}>
                        {result.success ? 'Creado' : 'Error'}
                      </Badge>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-end pt-4">
                  <Button onClick={() => {
                    setShowMigrationDialog(false);
                    setMigrationResult(null);
                  }}>
                    Cerrar
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderPagination() {
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
  }

  function renderTable() {
    if (paginatedInmobiliarias.length === 0 && filteredInmobiliarias.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg mb-2">
            {activeTab === 'active' 
              ? 'No hay inmobiliarias activas' 
              : activeTab === 'draft'
                ? 'No hay inmobiliarias en draft'
                : 'No hay inmobiliarias eliminadas'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' 
              ? 'Agrega tu primera inmobiliaria para comenzar' 
              : activeTab === 'draft'
                ? 'Las inmobiliarias registradas por el formulario público aparecerán aquí'
                : 'Las inmobiliarias eliminadas aparecerán aquí'}
          </p>
          {activeTab === 'active' && (
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primera Inmobiliaria
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
              <TableHead className="font-semibold text-foreground">Agentes</TableHead>
              <TableHead className="font-semibold text-foreground">Usuario</TableHead>
              <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
              <TableHead className="font-semibold text-foreground">Comisión (%)</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Legal</TableHead>
              <TableHead className="font-semibold text-foreground">Rep. Comercial</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInmobiliarias.map((inmobiliaria) => (
              <TableRow key={inmobiliaria.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
                    {inmobiliaria.url_logo ? (
                      <img 
                        src={inmobiliaria.url_logo} 
                        alt={`Logo de ${inmobiliaria.nombre_comercial || inmobiliaria.nombre_legal}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Building className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div>
                    <div className="font-semibold">{inmobiliaria.nombre_comercial || inmobiliaria.nombre_legal}</div>
                    {inmobiliaria.nombre_comercial && (
                      <div className="text-sm text-muted-foreground">{inmobiliaria.nombre_legal}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.numero_proyectos} proyecto{inmobiliaria.numero_proyectos !== 1 ? 's' : ''}
                </TableCell>
                <TableCell>
                  {inmobiliaria.numero_agentes > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary/80 hover:bg-primary/10 p-0 h-auto font-normal"
                      onClick={() => {
                        setSelectedInmobiliariaForAgentes(inmobiliaria);
                        setIsAgentesDialogOpen(true);
                      }}
                    >
                      <Users className="h-4 w-4 mr-1" />
                      {inmobiliaria.numero_agentes} agente{inmobiliaria.numero_agentes !== 1 ? 's' : ''}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">0 agentes</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.usuario_email ? (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inmobiliaria.usuario_email!);
                        toast({
                          title: "Copiado",
                          description: "Email copiado al portapapeles",
                        });
                      }}
                      className="flex items-center gap-1 hover:text-primary cursor-pointer transition-colors"
                      title="Clic para copiar"
                    >
                      {inmobiliaria.usuario_email}
                      <Copy className="h-3 w-3 opacity-50" />
                    </button>
                  ) : activeTab === 'draft' ? (
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">{inmobiliaria.email}</span>
                      <span className="text-xs text-muted-foreground/50">(Sin usuario)</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50">Sin usuario</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.telefono || '-'}
                </TableCell>
                <TableCell>
                  {inmobiliaria.porcentaje_comision != null ? (
                    <Badge variant="secondary" className="text-sm px-2 py-1">
                      {inmobiliaria.porcentaje_comision}%
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.representante_legal_nombre || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.representante_comercial_nombre || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {activeTab === 'active' ? (
                      <>
                        {(canUpdate || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(inmobiliaria)}
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDelete(inmobiliaria)}
                            disabled={inmobiliaria.numero_usuarios > 0 || inmobiliaria.numero_agentes > 0}
                            className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              inmobiliaria.numero_usuarios > 0 
                                ? "No se puede eliminar: tiene usuarios asignados" 
                                : inmobiliaria.numero_agentes > 0
                                  ? "No se puede eliminar: tiene agentes asignados"
                                  : "Eliminar inmobiliaria"
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    ) : activeTab === 'draft' ? (
                      <>
                        {(canApprove || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleApproveDraft(inmobiliaria)}
                            disabled={approveMutation.isPending}
                            className="hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-colors"
                            title="Aprobar y crear usuario"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Aprobar
                          </Button>
                        )}
                        {(canUpdate || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(inmobiliaria)}
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(canDelete || isSuperAdmin) && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDelete(inmobiliaria)}
                            className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                            title="Eliminar inmobiliaria"
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
                          onClick={() => handleRestore(inmobiliaria)}
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