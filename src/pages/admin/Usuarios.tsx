import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, UserCheck, UserX, Key, Loader2, RotateCcw, Lock } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserProjectAccessDialog } from "@/components/admin/UserProjectAccessDialog";
import { ChangeUserRoleDialog } from "@/components/admin/ChangeUserRoleDialog";
import { useActivityLogger } from "@/hooks/useActivityLogger";

type Usuario = {
  email: string;
  nombre: string | null;
  rol_id: number | null;
  activo: boolean;
  auth_user_id: string | null;
  id_persona: number | null;
  debe_cambiar_password: boolean;
  roles?: { nombre: string } | null;
  personas?: { nombre_legal: string } | null;
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

// Role IDs
const ROLE_AGENTE_INTERNO = 9;
const ROLE_AGENTE_INMOBILIARIO = 3;
const ROLE_INMOBILIARIA = 4;

// UsersTable component for reuse in tabs
interface UsersTableProps {
  users: Usuario[];
  currentUserEmail: string | undefined;
  getRoleBadgeColor: (roleName: string | undefined) => string;
  onResetPassword: (email: string) => void;
  onActivate: (email: string) => void;
  onDeactivate: (email: string) => void;
  onChangeRole: (email: string, name: string, roleId: number | null) => void;
  isInactiveTab?: boolean;
}

function UsersTable({ 
  users, 
  currentUserEmail, 
  getRoleBadgeColor, 
  onResetPassword, 
  onActivate,
  onDeactivate,
  onChangeRole,
  isInactiveTab 
}: UsersTableProps) {

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
                      {usuario.personas?.nombre_legal && (
                        <p className="text-xs text-muted-foreground">
                          Persona: {usuario.personas.nombre_legal}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {usuario.email}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={getRoleBadgeColor(usuario.roles?.nombre)}
                  >
                    {usuario.roles?.nombre || 'Sin rol'}
                  </Badge>
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
                        userRoleId={usuario.rol_id}
                      />
                    )}
                    {!isCurrentUser && (
                      <>
                        {!isInactiveTab && (
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
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isChangeRoleDialogOpen, setIsChangeRoleDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [selectedUserRoleId, setSelectedUserRoleId] = useState<number | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    nombre: "",
    rol_id: "",
    id_persona: "",
  });
  const [isFieldsLocked, setIsFieldsLocked] = useState(false);
  const [selectedPersonaTipo, setSelectedPersonaTipo] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();
  const { registrarCreacion, registrarActualizacion, registrarRestauracion } = useActivityLogger();

  // Current user's email for highlighting
  const currentUserEmail = profile?.email || session?.user?.email;

  // Fetch users
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
          roles (nombre),
          personas (nombre_legal)
        `)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Usuario[];
    },
  });

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Role[];
    },
  });

  // Convert roles to combobox options
  const roleOptions = useMemo(() => 
    roles.map(rol => ({
      value: rol.id.toString(),
      label: rol.nombre
    })),
    [roles]
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

  // Deactivate user mutation
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
        description: data.message || "La contraseña fue reseteada a Temporal123!",
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

  const filteredUsuarios = usuarios.filter(usuario => 
    usuario.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.roles?.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeUsers = filteredUsuarios.filter(u => u.activo);
  const inactiveUsers = filteredUsuarios.filter(u => !u.activo);

  const handleCreateUser = async () => {
    if (!newUserForm.email || !newUserForm.nombre || !newUserForm.rol_id) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingUser(true);

    try {
      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: newUserForm.email,
          nombre: newUserForm.nombre,
          rol_id: parseInt(newUserForm.rol_id),
          id_persona: newUserForm.id_persona ? parseInt(newUserForm.id_persona) : null,
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
    setNewUserForm({ email: "", nombre: "", rol_id: "", id_persona: "" });
    setIsFieldsLocked(false);
    setSelectedPersonaTipo(null);
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
      
      if (selectedPersona.tipo_entidad === 'Agente') {
        // Check if email ends with @sozu.com
        const email = selectedPersona.email?.toLowerCase() || "";
        if (email.endsWith('@sozu.com')) {
          autoRolId = ROLE_AGENTE_INTERNO.toString();
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
      });
      setSelectedPersonaTipo(selectedPersona.tipo_entidad);
      setIsFieldsLocked(true);
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
            <Button 
              onClick={() => setIsNewUserDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar por nombre, email o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:ring-primary/20"
              />
            </div>
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
                  <UsersTable 
                    users={activeUsers} 
                    currentUserEmail={currentUserEmail} 
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
                  />
                )}
              </TabsContent>

              <TabsContent value="inactivos">
                {inactiveUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay usuarios inactivos.
                  </div>
                ) : (
                  <UsersTable 
                    users={inactiveUsers} 
                    currentUserEmail={currentUserEmail} 
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
                    isInactiveTab
                  />
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
            <div className="space-y-2">
              <Label htmlFor="persona">Vincular a Agente/Inmobiliaria (opcional)</Label>
              <Combobox
                value={newUserForm.id_persona}
                onValueChange={handlePersonaSelect}
                options={personaOptions}
                placeholder="Seleccionar agente o inmobiliaria..."
                searchPlaceholder="Buscar..."
                emptyText="No se encontraron resultados"
              />
              {selectedPersonaTipo && (
                <p className="text-xs text-muted-foreground">
                  Tipo seleccionado: <span className="font-medium">{selectedPersonaTipo}</span>
                  {selectedPersonaTipo === 'Agente' && newUserForm.email?.toLowerCase().endsWith('@sozu.com') && (
                    <span className="text-cyan-600 ml-1">(Agente Interno)</span>
                  )}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nombre" className="flex items-center gap-2">
                Nombre *
                {isFieldsLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                id="nombre"
                value={newUserForm.nombre}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre completo"
                disabled={isFieldsLocked}
                className={isFieldsLocked ? "bg-muted" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                Email *
                {isFieldsLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                id="email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="usuario@email.com"
                disabled={isFieldsLocked}
                className={isFieldsLocked ? "bg-muted" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rol" className="flex items-center gap-2">
                Rol *
                {isFieldsLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Select
                value={newUserForm.rol_id}
                onValueChange={(value) => setNewUserForm(prev => ({ ...prev, rol_id: value }))}
                disabled={isFieldsLocked}
              >
                <SelectTrigger className={isFieldsLocked ? "bg-muted" : ""}>
                  <SelectValue placeholder="Seleccionar rol..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      {role.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFieldsLocked && (
                <p className="text-xs text-muted-foreground">
                  El rol se asigna automáticamente según el tipo de persona seleccionada.
                </p>
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
              La nueva contraseña será: <code className="bg-muted px-2 py-1 rounded">Temporal123!</code>
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
    </div>
  );
}
