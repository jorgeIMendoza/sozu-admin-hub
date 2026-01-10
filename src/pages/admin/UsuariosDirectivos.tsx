import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, UserCheck, UserX, Key, Loader2, RotateCcw, FolderOpen, Check, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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

export default function UsuariosDirectivos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isProjectsDialogOpen, setIsProjectsDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [selectedUserAuthId, setSelectedUserAuthId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
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

  // Fetch projects associated with Real Estate Ventures (id_persona = 1809, tipo_entidad = 5)
  const { data: proyectosRealEstate = [] } = useQuery({
    queryKey: ['proyectos-real-estate'],
    queryFn: async () => {
      // Get project IDs from entidades_relacionadas where id_persona = 1809 (Real Estate Ventures) and tipo_entidad = 5 (Inmobiliaria)
      const { data: relaciones, error: relError } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id_persona', 1809)
        .eq('id_tipo_entidad', 5)
        .eq('activo', true)
        .not('id_proyecto', 'is', null);
      
      if (relError) throw relError;
      
      const projectIds = relaciones?.map(r => r.id_proyecto).filter(Boolean) as number[];
      
      if (projectIds.length === 0) return [];
      
      // Fetch project details
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
    queryKey: ['user-projects-access', selectedUserAuthId],
    queryFn: async () => {
      if (!selectedUserAuthId) return [];
      
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', selectedUserAuthId)
        .eq('activo', true);
      
      if (error) throw error;
      return (data || []).map(p => p.proyecto_id);
    },
    enabled: !!selectedUserAuthId,
  });

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
      toast({ title: "Contraseña Reseteada", description: data.message || "La contraseña fue reseteada a Temporal123!" });
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

  // Save project access
  const handleSaveProjects = async () => {
    if (!selectedUserAuthId) return;

    setIsSavingProjects(true);
    try {
      // First, deactivate all existing project access for this user
      const { error: deleteError } = await supabase
        .from('proyectos_acceso')
        .update({ activo: false })
        .eq('usuario_id', selectedUserAuthId);

      if (deleteError) throw deleteError;

      // Then, insert/upsert the selected projects
      if (selectedProjects.length > 0) {
        for (const projectId of selectedProjects) {
          const { error: insertError } = await supabase
            .from('proyectos_acceso')
            .upsert({
              usuario_id: selectedUserAuthId,
              proyecto_id: projectId,
              activo: true,
            }, {
              onConflict: 'usuario_id,proyecto_id'
            });

          if (insertError) throw insertError;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['user-projects-access', selectedUserAuthId] });
      registrarActualizacion('usuario_directivo_proyectos', 
        { usuario_id: selectedUserAuthId }, 
        { usuario_id: selectedUserAuthId, proyectos: selectedProjects }
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
  const handleOpenProjectsDialog = async (authId: string, name: string) => {
    setSelectedUserAuthId(authId);
    setSelectedUserName(name);
    setIsProjectsDialogOpen(true);
  };

  // Effect to set selected projects when dialog opens
  useEffect(() => {
    if (isProjectsDialogOpen) {
      setSelectedProjects(userProjects);
    }
  }, [userProjects, isProjectsDialogOpen]);

  const toggleProject = (projectId: number) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
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
                    {!isInactiveTab && usuario.auth_user_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenProjectsDialog(usuario.auth_user_id!, usuario.nombre || 'Sin nombre')}
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

      {/* Projects Dialog */}
      <Dialog open={isProjectsDialogOpen} onOpenChange={setIsProjectsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Asignar Proyectos</DialogTitle>
            <DialogDescription>
              Selecciona los proyectos a los que <strong>{selectedUserName}</strong> tendrá acceso
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {proyectosRealEstate.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No hay proyectos disponibles de Real Estate Ventures
                  </p>
                ) : (
                  proyectosRealEstate.map((proyecto) => (
                    <div
                      key={proyecto.id}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedProjects.includes(proyecto.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                      onClick={() => toggleProject(proyecto.id)}
                    >
                      <Checkbox
                        checked={selectedProjects.includes(proyecto.id)}
                        onCheckedChange={() => toggleProject(proyecto.id)}
                      />
                      <span className="font-medium">{proyecto.nombre}</span>
                    </div>
                  ))
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