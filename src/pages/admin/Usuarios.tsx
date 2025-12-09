import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, UserCheck, UserX, Key, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

type Persona = {
  id: number;
  nombre_legal: string;
  email: string | null;
};

export default function Usuarios() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    nombre: "",
    rol_id: "",
    id_persona: "",
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session } = useAuth();

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
        .order('id', { ascending: true });
      
      if (error) throw error;
      return (data || []) as Role[];
    },
  });

  // Fetch personas for combobox
  const { data: personas = [] } = useQuery({
    queryKey: ['personas_for_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal, email')
        .eq('activo', true)
        .order('nombre_legal', { ascending: true })
        .limit(1000);
      
      if (error) throw error;
      return (data || []) as Persona[];
    },
  });

  // Toggle user active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ email, activo }: { email: string; activo: boolean }) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ activo, fecha_actualizacion: new Date().toISOString() })
        .eq('email', email);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast({
        title: "Éxito",
        description: "Estado del usuario actualizado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar el usuario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredUsuarios = usuarios.filter(usuario => 
    usuario.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.roles?.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
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

      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setIsNewUserDialogOpen(false);
      setNewUserForm({ email: "", nombre: "", rol_id: "", id_persona: "" });
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

  const handlePersonaSelect = (personaId: string) => {
    setNewUserForm(prev => ({ ...prev, id_persona: personaId }));
    
    // Auto-fill email and name from selected persona
    const selectedPersona = personas.find(p => p.id.toString() === personaId);
    if (selectedPersona) {
      setNewUserForm(prev => ({
        ...prev,
        id_persona: personaId,
        email: selectedPersona.email || prev.email,
        nombre: selectedPersona.nombre_legal || prev.nombre,
      }));
    }
  };

  const getRoleBadgeColor = (roleName: string | undefined) => {
    switch (roleName) {
      case 'Super Administrador':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'Administrador de Proyecto':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'Agente Inmobiliario':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Inmobiliaria':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'Notario':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

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
          ) : filteredUsuarios.length === 0 ? (
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
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground">Usuario</TableHead>
                    <TableHead className="font-semibold text-foreground">Email</TableHead>
                    <TableHead className="font-semibold text-foreground">Rol</TableHead>
                    <TableHead className="font-semibold text-foreground">Estado</TableHead>
                    <TableHead className="font-semibold text-foreground">Contraseña</TableHead>
                    <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsuarios.map((usuario) => (
                    <TableRow key={usuario.email} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                            <span className="text-primary font-semibold text-sm">
                              {usuario.nombre?.charAt(0).toUpperCase() || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {usuario.nombre || 'Sin nombre'}
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
                      <TableCell>
                        {usuario.activo ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                            <UserX className="h-3 w-3 mr-1" />
                            Inactivo
                          </Badge>
                        )}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ 
                              email: usuario.email, 
                              activo: !usuario.activo 
                            })}
                            className={usuario.activo 
                              ? "hover:bg-destructive/10 hover:border-destructive hover:text-destructive" 
                              : "hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
                            }
                          >
                            {usuario.activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New User Dialog */}
      <Dialog open={isNewUserDialogOpen} onOpenChange={setIsNewUserDialogOpen}>
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
              <Label htmlFor="persona">Vincular a Persona (opcional)</Label>
              <Combobox
                value={newUserForm.id_persona}
                onValueChange={handlePersonaSelect}
                options={personas.map(p => ({
                  value: p.id.toString(),
                  label: `${p.nombre_legal} ${p.email ? `(${p.email})` : ''}`
                }))}
                placeholder="Seleccionar persona..."
                searchPlaceholder="Buscar persona..."
                emptyText="No se encontraron personas"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={newUserForm.nombre}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="usuario@email.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rol">Rol *</Label>
              <Select
                value={newUserForm.rol_id}
                onValueChange={(value) => setNewUserForm(prev => ({ ...prev, rol_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((rol) => (
                    <SelectItem key={rol.id} value={rol.id.toString()}>
                      {rol.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsNewUserDialogOpen(false)}
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Usuario'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
