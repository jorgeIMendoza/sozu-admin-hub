import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, UserCheck, UserX, Key, Loader2, RotateCcw, FolderOpen, Check, ChevronsUpDown, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";

// Role ID for "Directores" (internal role)
const ROLE_DIRECTORES_ID = 19;

type UsuarioDirectivo = {
  email: string;
  nombre: string | null;
  rol_id: number | null;
  activo: boolean;
  auth_user_id: string | null;
  debe_cambiar_password: boolean;
  roles?: { nombre: string } | null;
};

type Proyecto = {
  id: number;
  nombre: string;
};

type EntidadDueno = {
  id: number;
  id_proyecto: number;
  id_tipo_entidad: number;
  persona: {
    id: number;
    nombre_legal: string;
  } | null;
};

type ProjectAccess = {
  proyecto_id: number;
  id_entidad_relacionada_dueno: number | null;
};

export default function UsuariosDirectivos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isProjectsDialogOpen, setIsProjectsDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  // Multi-select: array of owner IDs per project (empty array = all owners)
  const [ownerSelections, setOwnerSelections] = useState<Record<number, number[]>>({});
  const [projectSearch, setProjectSearch] = useState("");
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    nombre: "",
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSavingProjects, setIsSavingProjects] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarCreacion, registrarActualizacion, registrarRestauracion } = useActivityLogger();

  // Fetch users with role "Directores"
  const { data: usuarios = [], isLoading: isLoadingUsuarios } = useQuery({
    queryKey: ['usuarios-directivos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select(`
          email,
          nombre,
          rol_id,
          activo,
          auth_user_id,
          debe_cambiar_password,
          roles (nombre)
        `)
        .eq('rol_id', ROLE_DIRECTORES_ID)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return (data || []) as UsuarioDirectivo[];
    },
  });

  // Fetch projects associated with Real Estate Ventures (id_persona = 186, tipo_entidad = 5)
  const { data: proyectosRealEstate = [] } = useQuery({
    queryKey: ['proyectos-real-estate'],
    queryFn: async () => {
      const { data: relaciones, error: relError } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id_persona', 186)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .not('id_proyecto', 'is', null);
      
      if (relError) throw relError;
      
      const projectIds = relaciones?.map(r => r.id_proyecto).filter(Boolean) as number[];
      
      if (projectIds.length === 0) return [];
      
      const { data: proyectos, error: projError } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .in('id', projectIds)
        .eq('activo', true)
        .order('nombre');
      
      if (projError) throw projError;
      
      return (proyectos || []) as Proyecto[];
    },
  });

  // Fetch user's project access when dialog opens
  const { data: userProjects = [], refetch: refetchUserProjects } = useQuery({
    queryKey: ['user-projects-access', selectedUserEmail],
    queryFn: async () => {
      if (!selectedUserEmail) return [];
      
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id, id_entidad_relacionada_dueno')
        .eq('usuario_id', selectedUserEmail)
        .eq('activo', true);
      
      if (error) throw error;
      return (data || []) as ProjectAccess[];
    },
    enabled: !!selectedUserEmail && isProjectsDialogOpen,
  });

  // Fetch owners (dueños) for selected projects - tipo_entidad 4 and 15
  const { data: duenosData = [], isLoading: loadingDuenos } = useQuery({
    queryKey: ['project-owners-directivos', selectedProjects],
    queryFn: async () => {
      if (selectedProjects.length === 0) return [];
      
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_proyecto,
          id_tipo_entidad,
          persona:personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal)
        `)
        .in('id_proyecto', selectedProjects)
        .in('id_tipo_entidad', [4, 15])
        .eq('activo', true);
      
      if (error) throw error;
      return (data as unknown as EntidadDueno[]) || [];
    },
    enabled: isProjectsDialogOpen && selectedProjects.length > 0,
  });

  // Group owners by project
  const ownersByProject = useMemo(() => {
    const map: Record<number, EntidadDueno[]> = {};
    if (duenosData) {
      for (const dueno of duenosData) {
        if (!map[dueno.id_proyecto]) {
          map[dueno.id_proyecto] = [];
        }
        map[dueno.id_proyecto].push(dueno);
      }
    }
    return map;
  }, [duenosData]);

  // Filter users based on search and active/inactive tab
  const activeUsers = useMemo(() => 
    usuarios.filter(u => u.activo && 
      (u.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.email.toLowerCase().includes(searchTerm.toLowerCase()))),
    [usuarios, searchTerm]
  );

  const inactiveUsers = useMemo(() => 
    usuarios.filter(u => !u.activo && 
      (u.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.email.toLowerCase().includes(searchTerm.toLowerCase()))),
    [usuarios, searchTerm]
  );

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
      queryClient.invalidateQueries({ queryKey: ['usuarios-directivos'] });
      registrarActualizacion('usuario_directivo', { email, activo: true }, { email, activo: false });
      toast({ title: "Usuario desactivado", description: "El usuario ha sido desactivado correctamente." });
      setIsDeactivateDialogOpen(false);
      setSelectedUserEmail(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al desactivar el usuario: ${error.message}`, variant: "destructive" });
    },
  });

  // Activate user mutation
  const activateMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
        .eq('email', email);
      
      if (updateError) throw updateError;

      const response = await supabase.functions.invoke('reset-user-password', {
        body: { email },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      return response.data;
    },
    onSuccess: (_, email) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-directivos'] });
      registrarRestauracion('usuario_directivo', { email, activo: false }, { email, activo: true, password_reset: true });
      toast({ title: "Usuario activado", description: "El usuario ha sido activado con contraseña temporal: Temporal123!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al activar el usuario: ${error.message}`, variant: "destructive" });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await supabase.functions.invoke('reset-user-password', {
        body: { email },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      return response.data;
    },
    onSuccess: (data, email) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-directivos'] });
      registrarActualizacion('usuario_directivo_password', { email }, { email, password_reset: true });
      toast({ title: "Contraseña Reseteada", description: data.message || "Se envió un correo de confirmación. Una vez confirmado, recibirá sus credenciales temporales." });
      setIsResetPasswordDialogOpen(false);
      setSelectedUserEmail(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al resetear contraseña: ${error.message}`, variant: "destructive" });
    },
  });

  // Create new user
  const handleCreateUser = async () => {
    if (!newUserForm.email || !newUserForm.nombre) {
      toast({ title: "Error", description: "Por favor completa todos los campos requeridos.", variant: "destructive" });
      return;
    }

    setIsCreatingUser(true);
    try {
      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: newUserForm.email,
          nombre: newUserForm.nombre,
          rol_id: ROLE_DIRECTORES_ID,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      queryClient.invalidateQueries({ queryKey: ['usuarios-directivos'] });
      registrarCreacion('usuario_directivo', { email: newUserForm.email, nombre: newUserForm.nombre, rol: 'Directores' });
      
      toast({ title: "Usuario creado", description: `Usuario creado con contraseña temporal: Temporal123!` });
      setIsNewUserDialogOpen(false);
      setNewUserForm({ email: "", nombre: "" });
    } catch (error: any) {
      toast({ title: "Error", description: `Error al crear usuario: ${error.message}`, variant: "destructive" });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Save project access with multiple owner selections
  const handleSaveProjects = async () => {
    if (!selectedUserEmail) return;

    setIsSavingProjects(true);
    try {
      const projectIdsToManage = proyectosRealEstate.map(p => p.id);
      
      // Deactivate all existing access for managed projects
      if (projectIdsToManage.length > 0) {
        const { error: updateError } = await supabase
          .from('proyectos_acceso')
          .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
          .eq('usuario_id', selectedUserEmail)
          .in('proyecto_id', projectIdsToManage);

        if (updateError) throw updateError;
      }

      // Insert records for selected projects
      if (selectedProjects.length > 0) {
        for (const projectId of selectedProjects) {
          const selectedOwners = ownerSelections[projectId] || [];
          
          if (selectedOwners.length === 0) {
            // No owners selected = access to all owners (null)
            const { data: existing } = await supabase
              .from('proyectos_acceso')
              .select('usuario_id')
              .eq('usuario_id', selectedUserEmail)
              .eq('proyecto_id', projectId)
              .is('id_entidad_relacionada_dueno', null)
              .maybeSingle();

            if (existing) {
              await supabase
                .from('proyectos_acceso')
                .update({ 
                  activo: true, 
                  fecha_actualizacion: new Date().toISOString()
                })
                .eq('usuario_id', selectedUserEmail)
                .eq('proyecto_id', projectId)
                .is('id_entidad_relacionada_dueno', null);
            } else {
              await supabase
                .from('proyectos_acceso')
                .insert({
                  usuario_id: selectedUserEmail,
                  proyecto_id: projectId,
                  activo: true,
                  id_entidad_relacionada_dueno: null,
                });
            }
          } else {
            // Insert one record per selected owner
            for (const ownerId of selectedOwners) {
              const { data: existing } = await supabase
                .from('proyectos_acceso')
                .select('usuario_id')
                .eq('usuario_id', selectedUserEmail)
                .eq('proyecto_id', projectId)
                .eq('id_entidad_relacionada_dueno', ownerId)
                .maybeSingle();

              if (existing) {
                await supabase
                  .from('proyectos_acceso')
                  .update({ 
                    activo: true, 
                    fecha_actualizacion: new Date().toISOString()
                  })
                  .eq('usuario_id', selectedUserEmail)
                  .eq('proyecto_id', projectId)
                  .eq('id_entidad_relacionada_dueno', ownerId);
              } else {
                await supabase
                  .from('proyectos_acceso')
                  .insert({
                    usuario_id: selectedUserEmail,
                    proyecto_id: projectId,
                    activo: true,
                    id_entidad_relacionada_dueno: ownerId,
                  });
              }
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['user-projects-access', selectedUserEmail] });
      registrarActualizacion('usuario_directivo_proyectos', 
        { usuario_id: selectedUserEmail }, 
        { usuario_id: selectedUserEmail, proyectos: selectedProjects, ownerSelections }
      );

      toast({ title: "Proyectos actualizados", description: "Los proyectos han sido asignados correctamente." });
      setIsProjectsDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: `Error al guardar proyectos: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSavingProjects(false);
    }
  };

  // Open projects dialog
  const handleOpenProjectsDialog = async (email: string, name: string) => {
    setSelectedUserEmail(email);
    setSelectedUserName(name);
    setIsProjectsDialogOpen(true);
  };

  // Effect to set selected projects and owner selections when dialog opens
  useEffect(() => {
    if (isProjectsDialogOpen && userProjects.length > 0) {
      // Get unique project IDs
      const projectIds = [...new Set(userProjects.map(p => p.proyecto_id))];
      setSelectedProjects(projectIds);
      
      // Group owners by project
      const selections: Record<number, number[]> = {};
      for (const access of userProjects) {
        if (!selections[access.proyecto_id]) {
          selections[access.proyecto_id] = [];
        }
        // If id_entidad_relacionada_dueno is null, it means all owners - keep empty array
        if (access.id_entidad_relacionada_dueno !== null) {
          selections[access.proyecto_id].push(access.id_entidad_relacionada_dueno);
        }
      }
      setOwnerSelections(selections);
    } else if (isProjectsDialogOpen && userProjects.length === 0) {
      setSelectedProjects([]);
      setOwnerSelections({});
    }
  }, [userProjects, isProjectsDialogOpen]);

  const toggleProject = (projectId: number) => {
    setSelectedProjects(prev => {
      if (prev.includes(projectId)) {
        // When deselecting, clear owner selection
        setOwnerSelections(prevOwners => {
          const { [projectId]: _, ...rest } = prevOwners;
          return rest;
        });
        return prev.filter(id => id !== projectId);
      } else {
        // Initialize with empty array (all owners)
        setOwnerSelections(prevOwners => ({
          ...prevOwners,
          [projectId]: []
        }));
        return [...prev, projectId];
      }
    });
  };

  const toggleOwner = (projectId: number, ownerId: number) => {
    setOwnerSelections(prev => {
      const currentOwners = prev[projectId] || [];
      if (currentOwners.includes(ownerId)) {
        return {
          ...prev,
          [projectId]: currentOwners.filter(id => id !== ownerId)
        };
      } else {
        return {
          ...prev,
          [projectId]: [...currentOwners, ownerId]
        };
      }
    });
  };

  const getOwnerSelectionLabel = (projectId: number) => {
    const selectedOwners = ownerSelections[projectId] || [];
    const projectOwners = ownersByProject[projectId] || [];
    
    if (selectedOwners.length === 0) {
      return "Ningún dueño seleccionado";
    } else if (selectedOwners.length === projectOwners.length && projectOwners.length > 0) {
      return "Todos los dueños";
    } else if (selectedOwners.length === 1) {
      const owner = projectOwners.find(o => o.id === selectedOwners[0]);
      return owner?.persona?.nombre_legal || "1 dueño seleccionado";
    } else {
      return `${selectedOwners.length} dueños seleccionados`;
    }
  };

  // Users Table Component
  const UsersTable = ({ users, isInactiveTab = false }: { users: UsuarioDirectivo[], isInactiveTab?: boolean }) => (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold text-foreground">Usuario</TableHead>
            <TableHead className="font-semibold text-foreground">Email</TableHead>
            {!isInactiveTab && (
              <TableHead className="font-semibold text-foreground">Contraseña</TableHead>
            )}
            <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isInactiveTab ? 3 : 4} className="text-center py-8 text-muted-foreground">
                No se encontraron usuarios
              </TableCell>
            </TableRow>
          ) : (
            users.map((usuario) => (
              <TableRow key={usuario.email} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <span className="text-primary font-semibold text-sm">
                        {usuario.nombre?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{usuario.nombre || 'Sin nombre'}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
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
                    {!isInactiveTab && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenProjectsDialog(usuario.email, usuario.nombre || 'Sin nombre')}
                        className="hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-600"
                      >
                        <FolderOpen className="h-3 w-3 mr-1" />
                        Proyectos
                      </Button>
                    )}
                    {isInactiveTab ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activateMutation.mutate(usuario.email)}
                        disabled={activateMutation.isPending}
                        className="hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        Activar
                      </Button>
                    ) : (
                      <>
                        {!usuario.debe_cambiar_password && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserEmail(usuario.email);
                              setIsResetPasswordDialogOpen(true);
                            }}
                            className="hover:bg-amber-500/10 hover:border-amber-500 hover:text-amber-600"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Resetear
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUserEmail(usuario.email);
                            setIsDeactivateDialogOpen(true);
                          }}
                          className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                        >
                          Desactivar
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuarios Directivos</h1>
        <p className="text-muted-foreground">
          Gestiona usuarios directivos que acceden al sistema externo
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-xl">Usuarios</CardTitle>
            <CardDescription>
              Usuarios con rol de Directores para sistema externo
            </CardDescription>
          </div>
          <Button onClick={() => setIsNewUserDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Usuario
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoadingUsuarios ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="activos" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="activos">
                  Activos ({activeUsers.length})
                </TabsTrigger>
                <TabsTrigger value="inactivos">
                  Inactivos ({inactiveUsers.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="activos">
                <UsersTable users={activeUsers} />
              </TabsContent>
              <TabsContent value="inactivos">
                <UsersTable users={inactiveUsers} isInactiveTab />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* New User Dialog */}
      <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario Directivo</DialogTitle>
            <DialogDescription>
              Crea un nuevo usuario directivo. La contraseña inicial será: Temporal123!
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                placeholder="Nombre completo"
                value={newUserForm.nombre}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, nombre: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewUserDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreatingUser}>
              {isCreatingUser && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation */}
      <AlertDialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Resetear contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              La contraseña del usuario <strong>{selectedUserEmail}</strong> será cambiada a <strong>Temporal123!</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUserEmail(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUserEmail && resetPasswordMutation.mutate(selectedUserEmail)}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Resetear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario <strong>{selectedUserEmail}</strong> será desactivado y no podrá acceder al sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUserEmail(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUserEmail && deactivateMutation.mutate(selectedUserEmail)}
              disabled={deactivateMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deactivateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Projects Dialog with Multi-select Owner Selection */}
      <Dialog open={isProjectsDialogOpen} onOpenChange={(open) => {
        setIsProjectsDialogOpen(open);
        if (!open) {
          setProjectSearch("");
          setOwnerSelections({});
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Asignar Proyectos y Dueños</DialogTitle>
            <DialogDescription>
              Selecciona los proyectos y dueños a los que <strong>{selectedUserName}</strong> tendrá acceso.
              <br />
              <span className="text-xs">Si no seleccionas ningún dueño, tendrá acceso a todos los dueños del proyecto.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar proyecto..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {proyectosRealEstate.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No hay proyectos disponibles de Real Estate Ventures
                  </p>
                ) : (
                  proyectosRealEstate
                    .filter(p => p.nombre.toLowerCase().includes(projectSearch.toLowerCase()))
                    .map((proyecto) => {
                      const isSelected = selectedProjects.includes(proyecto.id);
                      const projectOwners = ownersByProject[proyecto.id] || [];
                      const selectedOwners = ownerSelections[proyecto.id] || [];
                      
                      return (
                        <div
                          key={proyecto.id}
                          className={cn(
                            "p-3 rounded-lg border transition-colors",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          )}
                        >
                          {/* Project checkbox */}
                          <div 
                            className="flex items-center space-x-3 cursor-pointer"
                            onClick={() => toggleProject(proyecto.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleProject(proyecto.id)}
                            />
                            <span className="font-medium">{proyecto.nombre}</span>
                          </div>
                          
                          {/* Owner multi-select - only visible when project is selected */}
                          {isSelected && (
                            <div className="ml-6 mt-3 space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                <Users className="h-3.5 w-3.5" />
                                <span>{getOwnerSelectionLabel(proyecto.id)}</span>
                              </div>
                              
                              {loadingDuenos ? (
                                <p className="text-xs text-muted-foreground">Cargando dueños...</p>
                              ) : projectOwners.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No hay dueños específicos para este proyecto (acceso a todos)
                                </p>
                              ) : (
                                <div className="bg-muted/30 rounded-md p-2 space-y-1.5">
                                  {projectOwners.map((dueno) => (
                                    <div
                                      key={dueno.id}
                                      className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleOwner(proyecto.id, dueno.id);
                                      }}
                                    >
                                      <Checkbox
                                        checked={selectedOwners.includes(dueno.id)}
                                        onCheckedChange={() => toggleOwner(proyecto.id, dueno.id)}
                                      />
                                      <span className="text-sm">
                                        {dueno.persona?.nombre_legal || `Entidad ${dueno.id}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
                {proyectosRealEstate.length > 0 && 
                  proyectosRealEstate.filter(p => p.nombre.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                  <p className="text-muted-foreground text-center py-4">
                    No se encontraron proyectos con "{projectSearch}"
                  </p>
                )}
              </div>
            </ScrollArea>
            <p className="text-sm text-muted-foreground mt-3">
              {selectedProjects.length} proyecto(s) seleccionado(s)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProjectsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProjects} disabled={isSavingProjects}>
              {isSavingProjects && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
