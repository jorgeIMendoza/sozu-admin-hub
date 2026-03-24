import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, UserCheck, UserX, Key, Loader2, RotateCcw, Lock, Check, ChevronsUpDown, Pencil, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserProjectAccessDialog } from "@/components/admin/UserProjectAccessDialog";
import { ChangeUserRoleDialog } from "@/components/admin/ChangeUserRoleDialog";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import { useActivityLogger } from "@/hooks/useActivityLogger";

type Usuario = {
  email: string;
  nombre: string | null;
  rol_id: number | null;
  activo: boolean;
  auth_user_id: string | null;
  id_persona: number | null;
  debe_cambiar_password: boolean;
  email_confirmado?: boolean;
  roles?: { nombre: string } | null;
  personas?: { nombre_legal: string; email?: string | null } | null;
  inmobiliaria_nombre?: string | null;
  es_usuario_principal?: boolean;
};

type Role = {
  id: number;
  nombre: string;
};

type PersonaConTipo = {
  id: number;
  nombre_legal: string;
  email: string | null;
  tipo_entidad: string;
};

type InmobiliariaOption = {
  id: number;
  nombre: string;
};

// Role IDs
const ROLE_ADMINISTRADOR_PROYECTO = 2;
const ROLE_AGENTE_INTERNO = 9;
const ROLE_AGENTE_INMOBILIARIO = 3;
const ROLE_INMOBILIARIA = 4;

// Roles that Administrador de Proyecto can manage
const ROLES_ADMINISTRADOR_PROYECTO_PUEDE_VER = [ROLE_AGENTE_INMOBILIARIO, ROLE_INMOBILIARIA];

// Sozu inmobiliaria ID (Real Estate Ventures)
const SOZU_INMOBILIARIA_ID = 186;

// UsersTable component for reuse in tabs
interface UsersTableProps {
  users: Usuario[];
  currentUserEmail: string | undefined;
  currentUserRoleId: number | undefined;
  getRoleBadgeColor: (roleName: string | undefined) => string;
  onResetPassword: (email: string) => void;
  onActivate: (email: string) => void;
  onDeactivate: (email: string) => void;
  onChangeRole: (email: string, name: string, roleId: number | null) => void;
  onEditUser: (email: string, name: string, roleId: number | null, personaId: number | null) => void;
  isInactiveTab?: boolean;
}

function UsersTable({ 
  users, 
  currentUserEmail,
  currentUserRoleId,
  getRoleBadgeColor, 
  onResetPassword, 
  onActivate,
  onDeactivate,
  onChangeRole,
  onEditUser,
  isInactiveTab 
}: UsersTableProps) {
  // Check if current user is Administrador de Proyecto (hide Rol button for this role)
  const isAdminProyecto = currentUserRoleId === ROLE_ADMINISTRADOR_PROYECTO;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold text-foreground">Usuario</TableHead>
            <TableHead className="font-semibold text-foreground">Email</TableHead>
            <TableHead className="font-semibold text-foreground">Rol</TableHead>
            {!isInactiveTab && (
              <TableHead className="font-semibold text-foreground">Contraseña</TableHead>
            )}
            <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((usuario) => {
            const isCurrentUser = usuario.email === currentUserEmail;
            
            return (
              <TableRow 
                key={usuario.email} 
                className={`transition-colors ${
                  isCurrentUser 
                    ? 'bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary' 
                    : 'hover:bg-muted/30'
                }`}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                      isCurrentUser ? 'bg-primary/20' : 'bg-primary/10'
                    }`}>
                      <span className="text-primary font-semibold text-sm">
                        {usuario.nombre?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-2">
                        {usuario.nombre || 'Sin nombre'}
                        {isCurrentUser && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                            Tú
                          </Badge>
                        )}
                      </p>
                      {/* Mostrar inmobiliaria para Agente Inmobiliario (3), Agente Interno (9), o Inmobiliaria secundario (4) */}
                      {usuario.inmobiliaria_nombre && (usuario.rol_id === ROLE_AGENTE_INMOBILIARIO || usuario.rol_id === ROLE_AGENTE_INTERNO || usuario.rol_id === ROLE_INMOBILIARIA) ? (
                        <p className="text-xs text-muted-foreground">
                          Inmobiliaria: {usuario.inmobiliaria_nombre}
                        </p>
                      ) : usuario.rol_id === ROLE_AGENTE_INMOBILIARIO && !usuario.inmobiliaria_nombre ? (
                        <p className="text-xs text-amber-600">
                          Agente independiente
                        </p>
                      ) : usuario.personas?.nombre_legal && (usuario.rol_id === ROLE_AGENTE_INTERNO) && (
                        <p className="text-xs text-muted-foreground">
                          Persona: {usuario.personas.nombre_legal}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="relative inline-flex items-center gap-1.5">
                    {usuario.email}
                    {usuario.es_usuario_principal && (
                      <span 
                        className="relative inline-block w-0 h-0 border-l-[6px] border-l-transparent border-b-[10px] border-b-green-500 border-r-[6px] border-r-transparent" 
                        title="Usuario Principal de la Inmobiliaria"
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge 
                      variant="outline" 
                      className={getRoleBadgeColor(usuario.roles?.nombre)}
                    >
                      {usuario.roles?.nombre || 'Sin rol'}
                    </Badge>
                    {(usuario.rol_id === ROLE_AGENTE_INMOBILIARIO || usuario.rol_id === ROLE_INMOBILIARIA) && usuario.email_confirmado === false && (
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px] px-1.5">
                        ✉ Pendiente
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {!isInactiveTab && (
                  <TableCell>
                    {usuario.debe_cambiar_password ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        <Key className="h-3 w-3 mr-1" />
                        Temporal
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Personalizada</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {!isInactiveTab && usuario.auth_user_id && (
                      <UserProjectAccessDialog 
                        userId={usuario.auth_user_id}
                        userName={usuario.nombre || 'Sin nombre'}
                        userEmail={usuario.email}
                        userRole={usuario.roles?.nombre}
                        userRoleId={usuario.rol_id ?? undefined}
                        userPersonaId={usuario.id_persona ?? undefined}
                        isUsuarioPrincipal={usuario.es_usuario_principal}
                      />
                    )}
                    {!isCurrentUser && (
                      <>
                        {!isInactiveTab && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                            onClick={() => onEditUser(usuario.email, usuario.nombre || '', usuario.rol_id, usuario.id_persona)}
                            title="Editar usuario"
                              className="hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-600"
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Editar
                            </Button>
                            {!isAdminProyecto && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => onChangeRole(usuario.email, usuario.nombre || 'Sin nombre', usuario.rol_id)}
                                title="Cambiar rol"
                                className="hover:bg-purple-500/10 hover:border-purple-500 hover:text-purple-600"
                              >
                                <Shield className="h-3 w-3 mr-1" />
                                Rol
                              </Button>
                            )}
                          </>
                        )}
                        {isInactiveTab ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => onActivate(usuario.email)}
                            className="hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                          >
                            <UserCheck className="h-3 w-3 mr-1" />
                            Activar
                          </Button>
                        ) : (
                          <>
                            {/* Only show reset button when password is NOT temporary (personalizada) */}
                            {!usuario.debe_cambiar_password && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => onResetPassword(usuario.email)}
                                title="Resetear contraseña"
                                className="hover:bg-amber-500/10 hover:border-amber-500 hover:text-amber-600"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Resetear
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => onDeactivate(usuario.email)}
                              className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                            >
                              Desactivar
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Usuarios() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [selectedInmobiliariaFilter, setSelectedInmobiliariaFilter] = useState<string>("all");
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isChangeRoleDialogOpen, setIsChangeRoleDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [selectedUserRoleId, setSelectedUserRoleId] = useState<number | null>(null);
  const [selectedUserPersonaId, setSelectedUserPersonaId] = useState<number | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    nombre: "",
    rol_id: "",
    id_persona: "",
    id_inmobiliaria: "", // ID de la inmobiliaria para agentes
  });
  const [isFieldsLocked, setIsFieldsLocked] = useState(false);
  const [selectedPersonaTipo, setSelectedPersonaTipo] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  
  const [isInmobiliariaLocked, setIsInmobiliariaLocked] = useState(false);
  const [isInmobiliariaPopoverOpen, setIsInmobiliariaPopoverOpen] = useState(false);
  
  // Persona lookup state
  const [matchedPersona, setMatchedPersona] = useState<{
    id: number;
    nombre_legal: string;
    email: string;
    tipos: string[];
  } | null>(null);
  const [isPersonaLinked, setIsPersonaLinked] = useState(false);
  const [isSearchingPersona, setIsSearchingPersona] = useState(false);
  // Pagination state
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageInactive, setCurrentPageInactive] = useState(1);
  const itemsPerPage = 50;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();
  const { registrarCreacion, registrarActualizacion, registrarRestauracion } = useActivityLogger();

  // Current user's email and role for highlighting and filtering
  const currentUserEmail = profile?.email || session?.user?.email;
  const currentUserRoleId = profile?.rol_id;
  
  // Check if current user is Administrador de Proyecto
  const isAdministradorProyecto = currentUserRoleId === ROLE_ADMINISTRADOR_PROYECTO;

  // Fetch users with their inmobiliaria info from entidades_relacionadas
  const { data: usuarios = [], isLoading: isLoadingUsuarios } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select(`
          email,
          nombre,
          rol_id,
          activo,
          auth_user_id,
          id_persona,
          debe_cambiar_password,
          email_confirmado,
          roles!inner (nombre, es_rol_interno),
          personas (nombre_legal, email)
        `)
        .eq('roles.es_rol_interno', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      
      // Get inmobiliaria info for agents (rol 3 and 9) and secondary Inmobiliaria users (rol 4) from entidades_relacionadas
      const personaIdsForLookup = (data || [])
        .filter(u => (u.rol_id === ROLE_AGENTE_INMOBILIARIO || u.rol_id === ROLE_AGENTE_INTERNO || u.rol_id === ROLE_INMOBILIARIA) && u.id_persona)
        .map(u => u.id_persona as number);
      
      let inmobByPersona = new Map<number, string>();
      const inmobiliariaPersonaIds = new Set<number>();
      
      if (personaIdsForLookup.length > 0) {
        // Query for agents (tipo 19)
        const { data: agentEntidadesData } = await supabase
          .from('entidades_relacionadas')
          .select('id_persona, id_persona_duena_lead, personas!entidades_relacionadas_id_persona_duena_lead_fkey(nombre_comercial, nombre_legal)')
          .eq('id_tipo_entidad', 19) // Agente Inmobiliario
          .eq('activo', true)
          .in('id_persona', personaIdsForLookup);
        
        (agentEntidadesData || []).forEach((e: any) => {
          if (e.id_persona && e.personas) {
            inmobByPersona.set(e.id_persona, e.personas.nombre_comercial || e.personas.nombre_legal || '');
          }
        });

        // For secondary Inmobiliaria users: look up via proyectos_acceso
        // Get their emails - including those WITHOUT id_persona (secondary users created without persona link)
        const secondaryInmobEmails = (data || [])
          .filter(u => u.rol_id === ROLE_INMOBILIARIA)
          .map(u => u.email);

        if (secondaryInmobEmails.length > 0) {
          // Get proyectos_acceso records for these users
          const { data: proyectosAcceso } = await supabase
            .from('proyectos_acceso')
            .select('usuario_id, id_entidad_relacionada_dueno')
            .in('usuario_id', secondaryInmobEmails)
            .eq('activo', true)
            .not('id_entidad_relacionada_dueno', 'is', null);

          if (proyectosAcceso && proyectosAcceso.length > 0) {
            // Get unique entidad IDs
            const entidadIds = [...new Set(proyectosAcceso.map(p => p.id_entidad_relacionada_dueno).filter(Boolean))];

            // Fetch inmobiliaria names from these entidades
            const { data: entidadesData } = await supabase
              .from('entidades_relacionadas')
              .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_comercial, nombre_legal)')
              .in('id', entidadIds)
              .eq('activo', true);

            // Create map of entidad_id -> nombre and map of email -> nombre for users without persona
            const entidadNombres = new Map<number, string>();
            (entidadesData || []).forEach((e: any) => {
              if (e.id && e.personas) {
                entidadNombres.set(e.id, e.personas.nombre_comercial || e.personas.nombre_legal || '');
              }
            });

            // Map user email to inmobiliaria name - store by email for users without persona
            proyectosAcceso.forEach((pa: any) => {
              const nombre = entidadNombres.get(pa.id_entidad_relacionada_dueno);
              if (nombre) {
                const usuario = (data || []).find(u => u.email === pa.usuario_id);
                if (usuario) {
                  if (usuario.id_persona) {
                    // User has persona - use persona id as key
                    inmobByPersona.set(usuario.id_persona, nombre);
                  } else {
                    // User without persona - use a negative key based on email hash to avoid conflicts
                    // We'll handle this separately below
                  }
                }
              }
            });

            // Create a separate map for users without persona (by email)
            const inmobByEmail = new Map<string, string>();
            proyectosAcceso.forEach((pa: any) => {
              const nombre = entidadNombres.get(pa.id_entidad_relacionada_dueno);
              if (nombre) {
                inmobByEmail.set(pa.usuario_id, nombre);
              }
            });

            // Store in a way we can access later - add to data array
            (data || []).forEach((u: any) => {
              if (u.rol_id === ROLE_INMOBILIARIA && !u.id_persona && inmobByEmail.has(u.email)) {
                u._inmobiliaria_by_email = inmobByEmail.get(u.email);
              }
            });
          }
        }

        // For primary Inmobiliaria users (rol 4), their persona IS the inmobiliaria
        // Get the inmobiliaria name from their own persona record
        const inmobiliariaUserPersonaIds = (data || [])
          .filter(u => u.rol_id === ROLE_INMOBILIARIA && u.id_persona)
          .map(u => u.id_persona as number);

        if (inmobiliariaUserPersonaIds.length > 0) {
          // Check which of these personas are inmobiliarias themselves
          const { data: inmobPersonas } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_comercial, nombre_legal)')
            .eq('id_tipo_entidad', 5) // Inmobiliaria
            .eq('activo', true)
            .in('id_persona', inmobiliariaUserPersonaIds);

          (inmobPersonas || []).forEach((e: any) => {
            if (e.id_persona && e.personas) {
              inmobByPersona.set(e.id_persona, e.personas.nombre_comercial || e.personas.nombre_legal || '');
              inmobiliariaPersonaIds.add(e.id_persona);
            }
          });
        }
      }
      
      // Add inmobiliaria info to users (filtering already done at DB level)
      return ((data || []) as (Usuario & { roles: { nombre: string; es_rol_interno: boolean } | null })[])
        .map(u => {
          // Check if user with Inmobiliaria role (4) is the main user:
          // 1) rol_id must be 4, 2) email matches persona email, 3) persona is a real inmobiliaria in entidades_relacionadas
          const esUsuarioPrincipal = u.rol_id === ROLE_INMOBILIARIA 
            ? (u.personas?.email && u.email.toLowerCase() === u.personas.email.toLowerCase() && u.id_persona && inmobiliariaPersonaIds.has(u.id_persona)) === true
            : undefined; // Non-Inmobiliaria users don't have this concept
          
          // Get inmobiliaria name: first from persona map, then from email-based lookup for users without persona
          const inmobiliariaNombre = u.id_persona 
            ? (inmobByPersona.get(u.id_persona) || null) 
            : ((u as any)._inmobiliaria_by_email || null);
          
          return {
            ...u,
            inmobiliaria_nombre: inmobiliariaNombre,
            es_usuario_principal: esUsuarioPrincipal
          };
        });
    },
  });

  // Fetch roles (only internal roles)
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre, es_rol_interno')
        .eq('activo', true)
        .eq('es_rol_interno', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Role[];
    },
  });

  // Filter roles based on current user's role
  const availableRoles = useMemo(() => {
    if (isAdministradorProyecto) {
      return roles.filter(rol => ROLES_ADMINISTRADOR_PROYECTO_PUEDE_VER.includes(rol.id));
    }
    return roles;
  }, [roles, isAdministradorProyecto]);

  // Convert roles to combobox options
  const roleOptions = useMemo(() => 
    availableRoles.map(rol => ({
      value: rol.id.toString(),
      label: rol.nombre
    })),
    [availableRoles]
  );

  // Fetch agents and inmobiliarias for combobox
  const { data: personasConTipo = [] } = useQuery({
    queryKey: ['personas_agentes_inmobiliarias'],
    queryFn: async () => {
      // Query Inmobiliarias (tipo_entidad = 5) - specify FK to avoid ambiguity
      const { data: inmobiliarias, error: errInmob } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          personas:personas!entidades_relacionadas_id_persona_fkey (id, nombre_legal, email, activo),
          tipos_entidad!inner (nombre)
        `)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true);
      
      if (errInmob) throw errInmob;

      // Query Agentes (tipo_entidad = 19) - specify FK to avoid ambiguity
      const { data: agentes, error: errAgentes } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          personas:personas!entidades_relacionadas_id_persona_fkey (id, nombre_legal, email, activo),
          tipos_entidad!inner (nombre)
        `)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true);
      
      if (errAgentes) throw errAgentes;
      
      // Combine and deduplicate by persona id
      const personasMap = new Map<number, PersonaConTipo>();
      
      [...(inmobiliarias || []), ...(agentes || [])].forEach((item: any) => {
        // Skip if persona is null or not active
        if (!item.personas || !item.personas.activo) return;
        
        const personaId = item.personas.id;
        if (!personasMap.has(personaId)) {
          personasMap.set(personaId, {
            id: personaId,
            nombre_legal: item.personas.nombre_legal,
            email: item.personas.email,
            tipo_entidad: item.tipos_entidad.nombre
          });
        }
      });
      
      return Array.from(personasMap.values()).sort((a, b) => 
        a.nombre_legal.localeCompare(b.nombre_legal)
      );
    },
  });

  // Fetch inmobiliarias for the selector
  // Fetch inmobiliarias with info about whether they have a principal user
  const { data: inmobiliariasOptions = [] } = useQuery({
    queryKey: ['inmobiliarias_options_with_principal'],
    queryFn: async () => {
      const { data: entidadesData, error: entidadesError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_tipo_entidad', 5) // Inmobiliaria
        .eq('activo', true);
      
      if (entidadesError) throw entidadesError;
      
      const personaIds = (entidadesData || []).map(e => e.id_persona).filter(Boolean);
      
      if (personaIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal, nombre_comercial, email')
        .in('id', personaIds)
        .eq('activo', true)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;

      // Get all users with Inmobiliaria role (4) to check for principal users
      const { data: usuariosInmobiliaria, error: usuariosError } = await supabase
        .from('usuarios')
        .select('email, id_persona, personas!inner(email)')
        .eq('rol_id', 4)
        .eq('activo', true);

      if (usuariosError) throw usuariosError;

      // Create a set of persona IDs that have a principal user
      const personasConPrincipal = new Set<number>();
      (usuariosInmobiliaria || []).forEach((u: any) => {
        // Usuario principal = email matches persona email
        if (u.id_persona && u.personas?.email && u.email.toLowerCase() === u.personas.email.toLowerCase()) {
          personasConPrincipal.add(u.id_persona);
        }
      });
      
      return (data || []).map(item => ({
        id: item.id,
        nombre: item.nombre_comercial || item.nombre_legal,
        tiene_usuario_principal: personasConPrincipal.has(item.id),
        email: item.email,
      })) as (InmobiliariaOption & { tiene_usuario_principal: boolean; email?: string })[];
    },
  });
  const deactivateMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
        .eq('email', email);
      
      if (error) throw error;
    },
    onSuccess: (_, email) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      
      // Registrar actividad
      registrarActualizacion('usuario', 
        { email, activo: true },
        { email, activo: false }
      );
      
      toast({
        title: "Usuario desactivado",
        description: "El usuario ha sido desactivado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al desactivar el usuario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Activate user mutation (also resets password to temporary)
  const activateMutation = useMutation({
    mutationFn: async (email: string) => {
      // First activate the user
      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
        .eq('email', email);
      
      if (updateError) throw updateError;

      // Then reset the password
      const response = await supabase.functions.invoke('reset-user-password', {
        body: { email },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (_, email) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      
      // Registrar actividad
      registrarRestauracion('usuario', 
        { email, activo: false },
        { email, activo: true, password_reset: true }
      );
      
      toast({
        title: "Usuario activado",
        description: "El usuario ha sido activado con contraseña temporal: Temporal123!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al activar el usuario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await supabase.functions.invoke('reset-user-password', {
        body: { email },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (data, email) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      
      // Registrar actividad
      registrarActualizacion('usuario_password', 
        { email },
        { email, password_reset: true }
      );
      
      toast({
        title: "Contraseña Reseteada",
        description: data.message || "Se envió un correo de confirmación. Una vez confirmado, recibirá sus credenciales temporales.",
      });
      setIsResetPasswordDialogOpen(false);
      setSelectedUserEmail(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al resetear contraseña: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredUsuarios = usuarios.filter(usuario => {
    // If current user is Administrador de Proyecto, only show Agente Inmobiliario and Inmobiliaria roles
    if (isAdministradorProyecto && !ROLES_ADMINISTRADOR_PROYECTO_PUEDE_VER.includes(usuario.rol_id || 0)) {
      return false;
    }
    
    const matchesSearch = 
      usuario.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.roles?.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = selectedRoleFilter === "all" || 
      usuario.rol_id?.toString() === selectedRoleFilter;
    
    // Inmobiliaria filter (only when role filter is Agente Inmobiliario, Agente Interno, or Inmobiliaria)
    const showInmobFilter = [ROLE_AGENTE_INMOBILIARIO.toString(), ROLE_AGENTE_INTERNO.toString(), ROLE_INMOBILIARIA.toString()].includes(selectedRoleFilter);
    const matchesInmobiliaria = !showInmobFilter || selectedInmobiliariaFilter === "all" || 
      (selectedInmobiliariaFilter === "sin_inmobiliaria" 
        ? !usuario.inmobiliaria_nombre 
        : usuario.inmobiliaria_nombre === selectedInmobiliariaFilter);
    
    return matchesSearch && matchesRole && matchesInmobiliaria;
  });

  const activeUsers = filteredUsuarios.filter(u => u.activo);
  const inactiveUsers = filteredUsuarios.filter(u => !u.activo);

  // Pagination logic
  const totalPagesActive = Math.ceil(activeUsers.length / itemsPerPage);
  const totalPagesInactive = Math.ceil(inactiveUsers.length / itemsPerPage);
  
  const paginatedActiveUsers = activeUsers.slice(
    (currentPageActive - 1) * itemsPerPage,
    currentPageActive * itemsPerPage
  );
  
  const paginatedInactiveUsers = inactiveUsers.slice(
    (currentPageInactive - 1) * itemsPerPage,
    currentPageInactive * itemsPerPage
  );

  const handleCreateUser = async () => {
    if (!newUserForm.email || !newUserForm.nombre || !newUserForm.rol_id) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }

    // Validate inmobiliaria is required for agent roles and Inmobiliaria role
    const rolId = parseInt(newUserForm.rol_id);
    if ((rolId === ROLE_AGENTE_INTERNO || rolId === ROLE_AGENTE_INMOBILIARIO || rolId === ROLE_INMOBILIARIA) && !newUserForm.id_inmobiliaria) {
      toast({
        title: "Error",
        description: "Por favor selecciona una inmobiliaria.",
        variant: "destructive",
      });
      return;
    }

    // Validate Inmobiliaria role requires a principal user
    if (rolId === ROLE_INMOBILIARIA && newUserForm.id_inmobiliaria) {
      const selectedInmob = inmobiliariasOptions.find(
        i => i.id.toString() === newUserForm.id_inmobiliaria
      ) as (InmobiliariaOption & { tiene_usuario_principal?: boolean; email?: string }) | undefined;
      
      // If the inmobiliaria has a principal, check if this new user is not the principal
      if (selectedInmob?.tiene_usuario_principal) {
        // Allow creating non-principal users for inmobiliarias that already have a principal
        // No extra validation needed
      } else if (selectedInmob) {
        // No principal exists - check if this user will be the principal (email matches persona email)
        const inmobEmail = selectedInmob.email?.toLowerCase();
        const userEmail = newUserForm.email.toLowerCase().trim();
        
        if (inmobEmail && inmobEmail !== userEmail) {
          toast({
            title: "Error",
            description: `Para crear usuarios de la inmobiliaria "${selectedInmob.nombre}", primero debes crear el usuario principal usando el email: ${inmobEmail}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setIsCreatingUser(true);

    try {
      // Validate email conflicts before creating
      const emailLower = newUserForm.email.toLowerCase().trim();
      
      // Check if email already exists as a user
      const { data: existingUser } = await supabase
        .from('usuarios')
        .select('email')
        .ilike('email', emailLower)
        .maybeSingle();
      
      if (existingUser) {
        throw new Error(`El email ${emailLower} ya está registrado como usuario.`);
      }
      
      // Check if email is used by an inmobiliaria (persona with tipo_entidad = 5)
      const { data: inmobiliariaPersonas } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(email, nombre_legal)')
        .eq('id_tipo_entidad', 5)
        .eq('activo', true);
      
      const inmobiliariaWithEmail = (inmobiliariaPersonas || []).find((er: any) => 
        er.personas?.email?.toLowerCase() === emailLower
      );
      
      if (inmobiliariaWithEmail && rolId !== ROLE_INMOBILIARIA) {
        throw new Error(`El email ${emailLower} pertenece a la inmobiliaria "${(inmobiliariaWithEmail as any).personas.nombre_legal}". No puedes crear un usuario con otro rol usando este email.`);
      }

      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: newUserForm.email,
          nombre: newUserForm.nombre,
          rol_id: rolId,
          id_persona: newUserForm.id_persona ? parseInt(newUserForm.id_persona) : null,
          id_inmobiliaria: newUserForm.id_inmobiliaria ? parseInt(newUserForm.id_inmobiliaria) : null,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Usuario Creado",
        description: response.data?.message || "El usuario fue creado exitosamente con contraseña temporal: Temporal123!",
      });

      // Registrar actividad
      registrarCreacion('usuario', {
        email: newUserForm.email,
        nombre: newUserForm.nombre,
        rol_id: parseInt(newUserForm.rol_id),
        id_persona: newUserForm.id_persona ? parseInt(newUserForm.id_persona) : null
      });

      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewUserDialogOpen(false);
      resetNewUserForm();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Error al crear usuario: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsCreatingUser(false);
    }
  };

  const resetNewUserForm = () => {
    setNewUserForm({ email: "", nombre: "", rol_id: "", id_persona: "", id_inmobiliaria: "" });
    setIsFieldsLocked(false);
    setSelectedPersonaTipo(null);
    setIsInmobiliariaLocked(false);
    setMatchedPersona(null);
    setIsPersonaLinked(false);
    setIsSearchingPersona(false);
  };

  const handleEmailLookup = async (email: string) => {
    const emailLower = email.toLowerCase().trim();
    if (!emailLower || !emailLower.includes('@')) {
      setMatchedPersona(null);
      setIsPersonaLinked(false);
      return;
    }

    setIsSearchingPersona(true);
    try {
      // Search for personas with this email and their entity types
      const { data: personas } = await supabase
        .from('personas')
        .select('id, nombre_legal, email')
        .ilike('email', emailLower)
        .eq('activo', true)
        .limit(1);

      if (personas && personas.length > 0) {
        const persona = personas[0];
        
        // Get entity types for this persona
        const { data: entidades } = await supabase
          .from('entidades_relacionadas')
          .select('id_tipo_entidad, tipos_entidad!inner(nombre)')
          .eq('id_persona', persona.id)
          .eq('activo', true);

        const tipos = (entidades || []).map((e: any) => e.tipos_entidad?.nombre || 'Desconocido');
        
        setMatchedPersona({
          id: persona.id,
          nombre_legal: persona.nombre_legal || '',
          email: persona.email || '',
          tipos,
        });
        setIsPersonaLinked(false);
      } else {
        setMatchedPersona(null);
        setIsPersonaLinked(false);
      }
    } catch (error) {
      console.error('Error searching persona:', error);
      setMatchedPersona(null);
    } finally {
      setIsSearchingPersona(false);
    }
  };

  const handleLinkPersona = () => {
    if (matchedPersona) {
      setNewUserForm(prev => ({
        ...prev,
        id_persona: matchedPersona.id.toString(),
        nombre: matchedPersona.nombre_legal,
      }));
      setIsPersonaLinked(true);
    }
  };

  const handleUnlinkPersona = () => {
    setNewUserForm(prev => ({
      ...prev,
      id_persona: "",
    }));
    setIsPersonaLinked(false);
  };

  const handlePersonaSelect = (personaId: string) => {
    if (!personaId) {
      // Clear selection
      resetNewUserForm();
      return;
    }

    const selectedPersona = personasConTipo.find(p => p.id.toString() === personaId);
    if (selectedPersona) {
      // Determine the role based on type and email
      let autoRolId = "";
      let autoInmobiliariaId = "";
      let lockInmobiliaria = false;
      
      if (selectedPersona.tipo_entidad === 'Agente') {
        // Check if email ends with @sozu.com
        const email = selectedPersona.email?.toLowerCase() || "";
        if (email.endsWith('@sozu.com')) {
          autoRolId = ROLE_AGENTE_INTERNO.toString();
          autoInmobiliariaId = SOZU_INMOBILIARIA_ID.toString();
          lockInmobiliaria = true;
        } else {
          autoRolId = ROLE_AGENTE_INMOBILIARIO.toString();
        }
      } else if (selectedPersona.tipo_entidad === 'Inmobiliaria') {
        autoRolId = ROLE_INMOBILIARIA.toString();
      }

      setNewUserForm({
        id_persona: personaId,
        email: selectedPersona.email || "",
        nombre: selectedPersona.nombre_legal || "",
        rol_id: autoRolId,
        id_inmobiliaria: autoInmobiliariaId,
      });
      setSelectedPersonaTipo(selectedPersona.tipo_entidad);
      setIsFieldsLocked(true);
      setIsInmobiliariaLocked(lockInmobiliaria);
    }
  };

  // Handle role change to auto-set inmobiliaria for Agente Interno
  const handleRoleChange = (roleId: string) => {
    const newRolId = parseInt(roleId);
    
    if (newRolId === ROLE_AGENTE_INTERNO) {
      // Preselect Sozu and LOCK the field
      setNewUserForm(prev => ({ 
        ...prev, 
        rol_id: roleId,
        id_inmobiliaria: SOZU_INMOBILIARIA_ID.toString()
      }));
      setIsInmobiliariaLocked(true); // Lock for Agente Interno
    } else if (newRolId === ROLE_AGENTE_INMOBILIARIO || newRolId === ROLE_INMOBILIARIA) {
      // Allow selecting inmobiliaria (required for agents and Inmobiliaria secondary users)
      setNewUserForm(prev => ({ 
        ...prev, 
        rol_id: roleId,
        id_inmobiliaria: prev.id_inmobiliaria
      }));
      setIsInmobiliariaLocked(false);
    } else {
      // Clear inmobiliaria for other roles
      setNewUserForm(prev => ({ 
        ...prev, 
        rol_id: roleId,
        id_inmobiliaria: ""
      }));
      setIsInmobiliariaLocked(false);
    }
  };

  const handleOpenResetPassword = (email: string) => {
    setSelectedUserEmail(email);
    setIsResetPasswordDialogOpen(true);
  };

  const getRoleBadgeColor = (roleName: string | undefined) => {
    switch (roleName) {
      case 'Super Administrador':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'Administrador de Proyecto':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'Agente Inmobiliario':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Agente Interno':
        return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
      case 'Inmobiliaria':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'Notario':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Combobox options for personas with type indicator
  const personaOptions = useMemo(() => {
    return personasConTipo.map(p => ({
      value: p.id.toString(),
      label: `${p.nombre_legal} ${p.email ? `(${p.email})` : ''} - ${p.tipo_entidad}`
    }));
  }, [personasConTipo]);

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Usuarios del Sistema
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona los usuarios y sus roles de acceso
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setIsNewUserDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Usuario
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar por nombre, email o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:ring-primary/20"
              />
            </div>
            <div className="w-full sm:w-64">
              <Select value={selectedRoleFilter} onValueChange={(v) => { setSelectedRoleFilter(v); setSelectedInmobiliariaFilter("all"); }}>
                <SelectTrigger className="border-border">
                  <SelectValue placeholder="Filtrar por rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los roles</SelectItem>
                  {availableRoles.map((rol) => (
                    <SelectItem key={rol.id} value={rol.id.toString()}>
                      {rol.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[ROLE_AGENTE_INMOBILIARIO.toString(), ROLE_AGENTE_INTERNO.toString(), ROLE_INMOBILIARIA.toString()].includes(selectedRoleFilter) && (
              <div className="w-full sm:w-64">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between border-border font-normal">
                      {selectedInmobiliariaFilter === "all" 
                        ? "Todas las inmobiliarias" 
                        : selectedInmobiliariaFilter === "sin_inmobiliaria"
                          ? "Sin inmobiliaria"
                          : selectedInmobiliariaFilter}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar inmobiliaria..." />
                      <CommandList>
                        <CommandEmpty>No se encontró inmobiliaria</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="all" onSelect={() => setSelectedInmobiliariaFilter("all")}>
                            <Check className={cn("mr-2 h-4 w-4", selectedInmobiliariaFilter === "all" ? "opacity-100" : "opacity-0")} />
                            Todas las inmobiliarias
                          </CommandItem>
                          <CommandItem value="sin_inmobiliaria" onSelect={() => setSelectedInmobiliariaFilter("sin_inmobiliaria")}>
                            <Check className={cn("mr-2 h-4 w-4", selectedInmobiliariaFilter === "sin_inmobiliaria" ? "opacity-100" : "opacity-0")} />
                            Sin inmobiliaria
                          </CommandItem>
                          {[...new Set(usuarios.filter(u => u.inmobiliaria_nombre && u.rol_id?.toString() === selectedRoleFilter).map(u => u.inmobiliaria_nombre!))].sort().map((nombre) => (
                            <CommandItem key={nombre} value={nombre} onSelect={() => setSelectedInmobiliariaFilter(nombre)}>
                              <Check className={cn("mr-2 h-4 w-4", selectedInmobiliariaFilter === nombre ? "opacity-100" : "opacity-0")} />
                              {nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {isLoadingUsuarios ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : usuarios.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-lg mb-2">
                No hay usuarios registrados
              </div>
              <p className="text-muted-foreground/80 mb-4">
                Crea el primer usuario para comenzar
              </p>
              <Button 
                onClick={() => setIsNewUserDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Usuario
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="activos" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="activos" className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Activos
                  <Badge variant="secondary" className="ml-1">{activeUsers.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="inactivos" className="flex items-center gap-2">
                  <UserX className="h-4 w-4" />
                  Inactivos
                  <Badge variant="secondary" className="ml-1">{inactiveUsers.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="activos">
                {activeUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay usuarios activos que coincidan con la búsqueda.
                  </div>
                ) : (
                  <>
                    <UsersTable 
                      users={paginatedActiveUsers} 
                      currentUserEmail={currentUserEmail}
                      currentUserRoleId={currentUserRoleId}
                      getRoleBadgeColor={getRoleBadgeColor}
                      onResetPassword={handleOpenResetPassword}
                      onActivate={(email) => activateMutation.mutate(email)}
                      onDeactivate={(email) => {
                        const user = activeUsers.find(u => u.email === email);
                        setSelectedUserEmail(email);
                        setSelectedUserName(user?.nombre || email);
                        setIsDeactivateDialogOpen(true);
                      }}
                      onChangeRole={(email, name, roleId) => {
                        setSelectedUserEmail(email);
                        setSelectedUserName(name);
                        setSelectedUserRoleId(roleId);
                        setIsChangeRoleDialogOpen(true);
                      }}
                      onEditUser={(email, name, roleId, personaId) => {
                        setSelectedUserEmail(email);
                        setSelectedUserName(name);
                        setSelectedUserRoleId(roleId || null);
                        setSelectedUserPersonaId(personaId || null);
                        setIsEditUserDialogOpen(true);
                      }}
                    />
                    {totalPagesActive > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {((currentPageActive - 1) * itemsPerPage) + 1} - {Math.min(currentPageActive * itemsPerPage, activeUsers.length)} de {activeUsers.length}
                        </p>
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setCurrentPageActive(p => Math.max(1, p - 1))}
                                className={currentPageActive === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            {Array.from({ length: Math.min(5, totalPagesActive) }, (_, i) => {
                              let pageNum: number;
                              if (totalPagesActive <= 5) {
                                pageNum = i + 1;
                              } else if (currentPageActive <= 3) {
                                pageNum = i + 1;
                              } else if (currentPageActive >= totalPagesActive - 2) {
                                pageNum = totalPagesActive - 4 + i;
                              } else {
                                pageNum = currentPageActive - 2 + i;
                              }
                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    onClick={() => setCurrentPageActive(pageNum)}
                                    isActive={currentPageActive === pageNum}
                                    className="cursor-pointer"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            <PaginationItem>
                              <PaginationNext 
                                onClick={() => setCurrentPageActive(p => Math.min(totalPagesActive, p + 1))}
                                className={currentPageActive === totalPagesActive ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="inactivos">
                {inactiveUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay usuarios inactivos.
                  </div>
                ) : (
                  <>
                    <UsersTable 
                      users={paginatedInactiveUsers} 
                      currentUserEmail={currentUserEmail}
                      currentUserRoleId={currentUserRoleId}
                      getRoleBadgeColor={getRoleBadgeColor}
                      onResetPassword={handleOpenResetPassword}
                      onActivate={(email) => activateMutation.mutate(email)}
                      onDeactivate={(email) => deactivateMutation.mutate(email)}
                      onChangeRole={(email, name, roleId) => {
                        setSelectedUserEmail(email);
                        setSelectedUserName(name);
                        setSelectedUserRoleId(roleId);
                        setIsChangeRoleDialogOpen(true);
                      }}
                      onEditUser={(email, name, roleId, personaId) => {
                        setSelectedUserEmail(email);
                        setSelectedUserName(name);
                        setSelectedUserRoleId(roleId || null);
                        setSelectedUserPersonaId(personaId || null);
                        setIsEditUserDialogOpen(true);
                      }}
                      isInactiveTab
                    />
                    {totalPagesInactive > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {((currentPageInactive - 1) * itemsPerPage) + 1} - {Math.min(currentPageInactive * itemsPerPage, inactiveUsers.length)} de {inactiveUsers.length}
                        </p>
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setCurrentPageInactive(p => Math.max(1, p - 1))}
                                className={currentPageInactive === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            {Array.from({ length: Math.min(5, totalPagesInactive) }, (_, i) => {
                              let pageNum: number;
                              if (totalPagesInactive <= 5) {
                                pageNum = i + 1;
                              } else if (currentPageInactive <= 3) {
                                pageNum = i + 1;
                              } else if (currentPageInactive >= totalPagesInactive - 2) {
                                pageNum = totalPagesInactive - 4 + i;
                              } else {
                                pageNum = currentPageInactive - 2 + i;
                              }
                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    onClick={() => setCurrentPageInactive(pageNum)}
                                    isActive={currentPageInactive === pageNum}
                                    className="cursor-pointer"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            <PaginationItem>
                              <PaginationNext 
                                onClick={() => setCurrentPageInactive(p => Math.min(totalPagesInactive, p + 1))}
                                className={currentPageInactive === totalPagesInactive ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* New User Dialog */}
      <Dialog open={isNewUserDialogOpen} onOpenChange={(open) => {
        setIsNewUserDialogOpen(open);
        if (!open) resetNewUserForm();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Nuevo Usuario
            </DialogTitle>
            <DialogDescription>
              Crea un nuevo usuario con acceso al sistema. La contraseña temporal será: Temporal123!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 1. Rol */}
            <div className="space-y-2">
              <Label htmlFor="rol">Rol *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between",
                      !newUserForm.rol_id && "text-muted-foreground"
                    )}
                  >
                    {newUserForm.rol_id
                      ? availableRoles.find((role) => role.id.toString() === newUserForm.rol_id)?.nombre
                      : "Seleccionar rol..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar rol..." />
                    <CommandList>
                      <CommandEmpty>No se encontró el rol.</CommandEmpty>
                      <CommandGroup>
                        {availableRoles.map((role) => (
                          <CommandItem
                            key={role.id}
                            value={role.nombre}
                            onSelect={() => {
                              handleRoleChange(role.id.toString());
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                newUserForm.rol_id === role.id.toString()
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {role.nombre}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. Inmobiliaria - SOLO visible para Agente Interno (9), Agente Inmobiliario (3) o Inmobiliaria (4) */}
            {(parseInt(newUserForm.rol_id || '0') === ROLE_AGENTE_INTERNO || parseInt(newUserForm.rol_id || '0') === ROLE_AGENTE_INMOBILIARIO || parseInt(newUserForm.rol_id || '0') === ROLE_INMOBILIARIA) && (
              <div className="space-y-2">
                <Label htmlFor="inmobiliaria" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Inmobiliaria *
                  {isInmobiliariaLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                </Label>
                <Popover open={isInmobiliariaPopoverOpen} onOpenChange={setIsInmobiliariaPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      disabled={isInmobiliariaLocked}
                      className={cn(
                        "w-full justify-between",
                        isInmobiliariaLocked && "bg-muted cursor-not-allowed",
                        !newUserForm.id_inmobiliaria && "text-muted-foreground"
                      )}
                    >
                      {newUserForm.id_inmobiliaria
                        ? inmobiliariasOptions.find((inmob) => inmob.id.toString() === newUserForm.id_inmobiliaria)?.nombre
                        : "Seleccionar inmobiliaria..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar inmobiliaria..." />
                      <CommandList>
                        <CommandEmpty>No se encontró la inmobiliaria.</CommandEmpty>
                        <CommandGroup>
                          {inmobiliariasOptions.map((inmob) => {
                            const inmobWithPrincipal = inmob as InmobiliariaOption & { tiene_usuario_principal?: boolean };
                            return (
                              <CommandItem
                                key={inmob.id}
                                value={inmob.nombre}
                              onSelect={() => {
                                setNewUserForm(prev => ({ ...prev, id_inmobiliaria: inmob.id.toString() }));
                                setIsInmobiliariaPopoverOpen(false);
                              }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newUserForm.id_inmobiliaria === inmob.id.toString()
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <span className="flex items-center gap-2">
                                  {inmob.nombre}
                                  {inmobWithPrincipal.tiene_usuario_principal && (
                                    <span 
                                      className="inline-block w-0 h-0 border-l-[5px] border-l-transparent border-b-[8px] border-b-green-500 border-r-[5px] border-r-transparent" 
                                      title="Tiene usuario principal"
                                    />
                                  )}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {parseInt(newUserForm.rol_id || '0') === ROLE_AGENTE_INTERNO && (
                  <p className="text-xs text-muted-foreground">
                    Los Agentes Internos se asignan automáticamente a Sozu.
                  </p>
                )}
              </div>
            )}
            
            {/* 3. Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={newUserForm.nombre}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>
            
            {/* 4. Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => {
                  setNewUserForm(prev => ({ ...prev, email: e.target.value }));
                  // Reset persona match when email changes
                  if (matchedPersona) {
                    setMatchedPersona(null);
                    setIsPersonaLinked(false);
                    setNewUserForm(prev => ({ ...prev, email: e.target.value, id_persona: "" }));
                  }
                }}
                onBlur={(e) => handleEmailLookup(e.target.value)}
                placeholder="usuario@email.com"
              />
              {isSearchingPersona && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Buscando persona asociada...
                </p>
              )}
              
              {/* Persona match notification */}
              {matchedPersona && !isPersonaLinked && (
                <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ⚠️ Se encontró una persona existente con este email:
                  </p>
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p><strong>{matchedPersona.nombre_legal}</strong></p>
                    <p>Tipo(s): {matchedPersona.tipos.length > 0 ? matchedPersona.tipos.join(', ') : 'Sin tipo de entidad'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="text-xs"
                      onClick={handleLinkPersona}
                    >
                      <UserCheck className="h-3 w-3 mr-1" />
                      Vincular usuario a esta persona
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setMatchedPersona(null)}
                    >
                      Ignorar
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Linked confirmation */}
              {isPersonaLinked && matchedPersona && (
                <div className="rounded-md border border-green-500/30 bg-green-50 dark:bg-green-950/20 p-3 space-y-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-1">
                    <UserCheck className="h-4 w-4" />
                    Vinculado a: {matchedPersona.nombre_legal}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Tipo(s): {matchedPersona.tipos.join(', ')}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={handleUnlinkPersona}
                  >
                    Desvincular
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsNewUserDialogOpen(false);
                resetNewUserForm();
              }}
              disabled={isCreatingUser}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateUser}
              disabled={isCreatingUser}
            >
              {isCreatingUser ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Usuario'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Resetear Contraseña
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas resetear la contraseña del usuario <strong>{selectedUserEmail}</strong>?
              <br /><br />
              Primero se enviará un correo para que confirme su email. Una vez confirmado, recibirá otro correo con su contraseña temporal.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsResetPasswordDialogOpen(false);
                setSelectedUserEmail(null);
              }}
              disabled={resetPasswordMutation.isPending}
            >
              Cancelar
            </Button>
            <Button 
              variant="default"
              onClick={() => {
                if (selectedUserEmail) {
                  resetPasswordMutation.mutate(selectedUserEmail);
                }
              }}
              disabled={resetPasswordMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reseteando...
                </>
              ) : (
                'Confirmar Reset'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate User Confirmation Dialog */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de desactivar a <strong>{selectedUserName}</strong>. 
              El usuario no podrá acceder al sistema hasta que sea reactivado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeactivateDialogOpen(false);
              setSelectedUserEmail(null);
              setSelectedUserName(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserEmail) {
                  deactivateMutation.mutate(selectedUserEmail);
                  setIsDeactivateDialogOpen(false);
                  setSelectedUserEmail(null);
                  setSelectedUserName(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Role Dialog */}
      {selectedUserEmail && selectedUserName && (
        <ChangeUserRoleDialog
          open={isChangeRoleDialogOpen}
          onOpenChange={(open) => {
            setIsChangeRoleDialogOpen(open);
            if (!open) {
              setSelectedUserEmail(null);
              setSelectedUserName(null);
              setSelectedUserRoleId(null);
            }
          }}
          userEmail={selectedUserEmail}
          userName={selectedUserName}
          currentRoleId={selectedUserRoleId}
        />
      )}

      {/* Edit User Dialog */}
      {selectedUserEmail && selectedUserName !== null && (
        <EditUserDialog
          open={isEditUserDialogOpen}
          onOpenChange={(open) => {
            setIsEditUserDialogOpen(open);
            if (!open) {
              setSelectedUserEmail(null);
              setSelectedUserName(null);
              setSelectedUserRoleId(null);
              setSelectedUserPersonaId(null);
            }
          }}
          userEmail={selectedUserEmail}
          userName={selectedUserName}
          userRoleId={selectedUserRoleId ?? undefined}
          userPersonaId={selectedUserPersonaId ?? undefined}
        />
      )}

    </div>
  );
}
