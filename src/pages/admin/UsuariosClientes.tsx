import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Key, Loader2, RotateCcw, RefreshCcw, ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const ITEMS_PER_PAGE = 50;

type UsuarioCliente = {
  email: string;
  nombre: string | null;
  rol_id: number | null;
  activo: boolean;
  auth_user_id: string | null;
  debe_cambiar_password: boolean;
  email_confirmado: boolean;
  roles?: { nombre: string } | null;
  personas?: { nombre_legal: string } | null;
};

export default function UsuariosClientes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();
  const { canUpdate, isLoading: isLoadingPermissions } = usePagePermissions('/admin/usuarios-clientes');

  // Fetch users with role "Cliente"
  const { data: usuarios = [], isLoading: isLoadingUsuarios } = useQuery({
    queryKey: ['usuarios-clientes'],
    queryFn: async () => {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('nombre', 'Cliente')
        .eq('activo', true)
        .single();
      
      if (roleError) {
        console.error('Error fetching Cliente role:', roleError);
        return [];
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select(`
          email,
          nombre,
          rol_id,
          activo,
          auth_user_id,
          debe_cambiar_password,
          email_confirmado,
          roles (nombre),
          personas (nombre_legal)
        `)
        .eq('rol_id', roleData.id)
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return (data || []) as UsuarioCliente[];
    },
  });

  // Filter users based on search
  const filteredUsers = useMemo(() => 
    usuarios.filter(u => 
      u.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())),
    [usuarios, searchTerm]
  );

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const start = pageIndex * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, pageIndex]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  // Reset pagination when search changes
  useEffect(() => {
    setPageIndex(0);
  }, [searchTerm]);

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
      queryClient.invalidateQueries({ queryKey: ['usuarios-clientes'] });
      registrarActualizacion('usuario_cliente_password', { email }, { email, password_reset: true });
      toast({ title: "Contraseña Reseteada", description: data.message || "Se envió un correo de confirmación. Una vez confirmado, recibirá sus credenciales temporales." });
      setIsResetPasswordDialogOpen(false);
      setSelectedUserEmail(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al resetear contraseña: ${error.message}`, variant: "destructive" });
    },
  });

  // Resend confirmation email mutation
  const resendConfirmationMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await supabase.functions.invoke('reenviar-confirmacion-email', {
        body: { email },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data && !response.data.success) throw new Error(response.data.message || 'Error al reenviar');

      return response.data;
    },
    onSuccess: (_data, email) => {
      toast({ title: "Correo Enviado", description: `Se reenvió el correo de confirmación a ${email}` });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al reenviar confirmación: ${error.message}`, variant: "destructive" });
    },
  });

  // Sync users that don't have auth_user_id (create auth users)
  const syncUsersMutation = useMutation({
    mutationFn: async () => {
      const usersWithoutAuth = usuarios.filter(u => !u.auth_user_id && u.activo);
      
      for (const user of usersWithoutAuth) {
        const response = await supabase.functions.invoke('create-client-user', {
          body: { 
            email: user.email,
            nombre: user.nombre || user.personas?.nombre_legal,
          },
        });

        if (response.error) {
          console.error(`Error syncing user ${user.email}:`, response.error);
        }
      }

      return usersWithoutAuth.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-clientes'] });
      toast({ 
        title: "Sincronización completada", 
        description: `Se enviaron correos de confirmación a ${count} usuarios.` 
      });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Error al sincronizar: ${error.message}`, variant: "destructive" });
    },
  });

  // Count users without auth
  const usersWithoutAuth = useMemo(() => 
    usuarios.filter(u => !u.auth_user_id && u.activo).length,
    [usuarios]
  );

  // Pagination Component
  const Pagination = ({ currentPage, totalPages: pages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void }) => {
    if (pages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <p className="text-sm text-muted-foreground">
          Página {currentPage + 1} de {pages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pages - 1}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  // Users Table Component
  const UsersTable = ({ users }: { users: UsuarioCliente[] }) => (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold text-foreground">Cliente</TableHead>
            <TableHead className="font-semibold text-foreground">Email</TableHead>
            <TableHead className="font-semibold text-foreground">Email Confirmado</TableHead>
            <TableHead className="font-semibold text-foreground">Estado Auth</TableHead>
            <TableHead className="font-semibold text-foreground">Contraseña</TableHead>
            {canUpdate && (
              <TableHead className="font-semibold text-foreground text-center">Acciones</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canUpdate ? 6 : 5} className="text-center py-8 text-muted-foreground">
                No se encontraron usuarios clientes
              </TableCell>
            </TableRow>
          ) : (
            users.map((usuario) => (
              <TableRow key={usuario.email} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <span className="text-primary font-semibold text-sm">
                        {usuario.nombre?.charAt(0).toUpperCase() || 'C'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{usuario.nombre || 'Sin nombre'}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
                <TableCell>
                  {usuario.email_confirmado ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                      Confirmado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <Mail className="h-3 w-3 mr-1" />
                      Pendiente
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {usuario.auth_user_id ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                      Sincronizado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Sin sincronizar
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
                {canUpdate && (
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {!usuario.email_confirmado && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resendConfirmationMutation.mutate(usuario.email)}
                          disabled={resendConfirmationMutation.isPending}
                          className="hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-600"
                        >
                          {resendConfirmationMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3 mr-1" />
                          )}
                          Reenviar Confirmación
                        </Button>
                      )}
                      {usuario.auth_user_id && !usuario.debe_cambiar_password && (
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
                          Resetear Contraseña
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (isLoadingPermissions) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuarios Clientes</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona los usuarios clientes (compradores y copropietarios)
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Listado de Clientes</CardTitle>
              <CardDescription>
                {filteredUsers.length} usuarios clientes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {canUpdate && usersWithoutAuth > 0 && (
                <Button
                  variant="outline"
                  onClick={() => syncUsersMutation.mutate()}
                  disabled={syncUsersMutation.isPending}
                  className="hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-600"
                >
                  {syncUsersMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar ({usersWithoutAuth})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoadingUsuarios ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <UsersTable users={paginatedUsers} />
              <Pagination 
                currentPage={pageIndex} 
                totalPages={totalPages} 
                onPageChange={setPageIndex} 
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <AlertDialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetear Contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas resetear la contraseña del usuario <strong>{selectedUserEmail}</strong>?
              <br /><br />
              Primero se enviará un correo para que el cliente confirme su email. Una vez confirmado, recibirá otro correo con su contraseña temporal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUserEmail(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUserEmail && resetPasswordMutation.mutate(selectedUserEmail)}
              disabled={resetPasswordMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Resetear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
