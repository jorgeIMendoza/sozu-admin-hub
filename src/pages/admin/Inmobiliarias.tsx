import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, RotateCcw, Building, Users, Copy } from "lucide-react";
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
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";

type Inmobiliaria = {
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
  numero_agentes: number;
  numero_usuarios: number; // Count of users associated with this inmobiliaria
  entidad_relacionada_id: number;
  id_tipo_entidad: number;
  url_logo?: string;
  usuario_email?: string; // Email of the user with Inmobiliaria role (4) linked to this entity
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarCreacion, registrarActualizacion, registrarEliminacion, registrarRestauracion } = useActivityLogger();
  
  const itemsPerPage = 10;

  const fetchInmobiliarias = async (activo: boolean) => {
    // First get all personas that have an entidades_relacionadas record with id_tipo_entidad = 5
    const { data: entidadesData, error: entidadesError } = await supabase
      .from('entidades_relacionadas')
      .select('id, id_persona')
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
    
    // Now get personas that match these IDs and the activo status
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
        id_entidad_relacionada_rep_com
      `)
      .eq('activo', activo)
      .eq('tipo_persona', 'pm')
      .in('id', personaIds)
      .order('nombre_legal', { ascending: true });
    
    if (error) {
      console.error('Error fetching personas:', error);
      throw error;
    }
    
    console.log('Inmobiliarias - personas found:', data?.length || 0, 'for activo:', activo);
    
    // Map to include entidad_relacionada_id
    const entidadMap = new Map(entidadesData?.map(e => [e.id_persona, e.id]) || []);
    
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
    
    return (data || []).map((item: any) => ({
      id: item.id,
      entidad_relacionada_id: entidadMap.get(item.id),
      id_tipo_entidad: 5, // Inmobiliaria
      nombre_legal: item.nombre_legal,
      nombre_comercial: item.nombre_comercial,
      email: item.email,
      telefono: item.telefono,
      rfc: item.rfc,
      activo: item.activo,
      id_entidad_relacionada_rep_leg: item.id_entidad_relacionada_rep_leg,
      id_entidad_relacionada_rep_com: item.id_entidad_relacionada_rep_com,
      representante_legal_nombre: null,
      representante_comercial_nombre: null,
      numero_proyectos: projectCounts[item.id] || 0,
      numero_agentes: agentCounts[item.id] || 0,
      numero_usuarios: userCounts[item.id] || 0,
      usuario_email: userEmailsByPersonaId[item.id] || null,
      url_logo: item.url_logo,
    })) as Inmobiliaria[];
  };

  const { data: activeInmobiliarias = [], isLoading: loadingActive } = useQuery({
    queryKey: ['inmobiliarias', 'active'],
    queryFn: () => fetchInmobiliarias(true),
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

  const inmobiliarias = activeTab === 'active' ? activeInmobiliarias : deletedInmobiliarias;
  const filteredInmobiliarias = inmobiliarias.filter(inmob => 
    inmob.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inmob.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inmob.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { representativeId, commercialRepresentativeId, entityType, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, ...cleanPersonData } = personData;
      
      // Validate email uniqueness before creating
      if (cleanPersonData.email) {
        const emailLower = cleanPersonData.email.toLowerCase().trim();
        
        // Check if email is already used by a user
        const { data: existingUser } = await supabase
          .from('usuarios')
          .select('email')
          .ilike('email', emailLower)
          .maybeSingle();
        
        if (existingUser) {
          throw new Error(`El email ${emailLower} ya está registrado como usuario del sistema. No puedes usar este email para la inmobiliaria.`);
        }
        
        // Check if email is used by another inmobiliaria
        const { data: inmobiliariaPersonas } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(email, nombre_legal)')
          .eq('id_tipo_entidad', 5)
          .eq('activo', true);
        
        const existingInmobiliaria = (inmobiliariaPersonas || []).find((er: any) => 
          er.personas?.email?.toLowerCase() === emailLower
        );
        
        if (existingInmobiliaria) {
          throw new Error(`El email ${emailLower} ya pertenece a la inmobiliaria: "${(existingInmobiliaria as any).personas.nombre_legal}".`);
        }
      }
      
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pm' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
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
      try {
        const { error: userError } = await supabase.functions.invoke('create-user', {
          body: {
            email: cleanPersonData.email,
            nombre: cleanPersonData.nombre_legal,
            rol_id: 4, // Inmobiliaria
            id_persona: personResult.id,
            telefono: cleanPersonData.telefono || null,
            clave_pais_telefono: cleanPersonData.clave_pais_telefono || null
          }
        });
        
        if (userError) {
          console.error('Error al crear usuario automático para inmobiliaria:', userError);
        }
      } catch (e) {
        console.error('Error al crear usuario automático para inmobiliaria:', e);
      }

      // Enviar notificación a N8N sobre la nueva inmobiliaria
      try {
        const webhookUrl = `${N8N_WEBHOOK_BASE_URL}/manda_notificacion1`;
        console.log('Enviando notificación de nueva inmobiliaria a:', webhookUrl);
        
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

        const notificationResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-postmark-server-token': '8aac4f6f-e5af-4e2f-a318-c2723bf52bb8',
            'apikey': 'FD9481D57CC7-43E0-8ACF-01BF7B8B19B7'
          },
          body: JSON.stringify(notificationPayload)
        });

        if (!notificationResponse.ok) {
          console.error('Error al enviar notificación de nueva inmobiliaria:', notificationResponse.status);
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
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
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
                  clave_pais_telefono: repPersona.clave_pais_telefono || null
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
      const { representativeId, commercialRepresentativeId, entityType, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, ...cleanPersonData } = personData;
      
      // Validate email uniqueness if email is being changed
      if (cleanPersonData.email && editingEntity) {
        const emailLower = cleanPersonData.email.toLowerCase().trim();
        const currentEmail = editingEntity.email?.toLowerCase().trim();
        
        // Only validate if email is actually being changed
        if (emailLower !== currentEmail) {
          // Check if email is already used by another user
          const { data: existingUser } = await supabase
            .from('usuarios')
            .select('email')
            .ilike('email', emailLower)
            .maybeSingle();
          
          if (existingUser) {
            throw new Error(`El email ${emailLower} ya está registrado como usuario del sistema. No puedes usar este email para la inmobiliaria.`);
          }
        
          // Check if email is used by another inmobiliaria (excluding current one)
          const { data: inmobiliariaPersonas } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, email, nombre_legal)')
            .eq('id_tipo_entidad', 5)
            .eq('activo', true);
          
          const otherInmobiliariaWithEmail = (inmobiliariaPersonas || []).find((er: any) => 
            er.personas?.email?.toLowerCase() === emailLower && er.personas?.id !== editingEntity.id
          );
          
          if (otherInmobiliariaWithEmail) {
            throw new Error(`El email ${emailLower} ya pertenece a otra inmobiliaria: "${(otherInmobiliariaWithEmail as any).personas.nombre_legal}".`);
          }
        }
      }
      
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editingEntity?.id);
      
      if (updateError) throw updateError;
      
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

  const handleEdit = (inmobiliaria: Inmobiliaria) => {
    setEditingEntity(inmobiliaria);
    setIsEditDialogOpen(true);
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
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Inmobiliaria
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <Tabs defaultValue="active" value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`grid w-full mb-6 ${(canDelete || isSuperAdmin) ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TabsTrigger value="active">
                Activos ({searchTerm ? `${activeInmobiliarias.filter(inmob => 
                  inmob.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  inmob.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  inmob.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
                ).length} de ${activeInmobiliarias.length}` : activeInmobiliarias.length})
              </TabsTrigger>
              {(canDelete || isSuperAdmin) && (
                <TabsTrigger value="deleted">
                  Eliminados ({searchTerm ? `${deletedInmobiliarias.filter(inmob => 
                    inmob.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    inmob.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    inmob.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length} de ${deletedInmobiliarias.length}` : deletedInmobiliarias.length})
                </TabsTrigger>
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

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Inmobiliaria</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="inmobiliaria"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>

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
            {activeTab === 'active' ? 'No hay inmobiliarias activas' : 'No hay inmobiliarias eliminadas'}
          </div>
          <p className="text-muted-foreground/80 mb-4">
            {activeTab === 'active' ? 'Agrega tu primera inmobiliaria para comenzar' : 'Las inmobiliarias eliminadas aparecerán aquí'}
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
                  ) : (
                    <span className="text-muted-foreground/50">Sin usuario</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {inmobiliaria.telefono || '-'}
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