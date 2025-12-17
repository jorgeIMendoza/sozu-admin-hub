import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Mail, Shield, Key, Eye, EyeOff, CheckCircle, Building2, UserCog } from "lucide-react";
import { PersonForm } from "./PersonForm";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const { profile, user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Check if user is super admin (rol_id 1 or 2)
  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;

  // Query for user's project access
  const { data: userProjects, isLoading: projectsLoading } = useQuery({
    queryKey: ["user_projects_access", profile?.email],
    queryFn: async () => {
      if (!profile?.email || isSuperAdmin) return [];

      // Get projects the user has access to
      const { data: proyectosAcceso } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', profile.email)
        .eq('activo', true);

      if (!proyectosAcceso || proyectosAcceso.length === 0) return [];

      const projectIds = proyectosAcceso.map(p => p.proyecto_id);

      // Get project names
      const { data: proyectos } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .in('id', projectIds)
        .eq('activo', true);

      return proyectos || [];
    },
    enabled: open && !!profile?.email && !isSuperAdmin,
  });

  // Query for user's persona data
  const { data: personaData, isLoading: personaLoading } = useQuery({
    queryKey: ["user_persona_data", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return null;

      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('id', profile.id_persona)
        .single();

      if (error) {
        console.error('Error fetching persona:', error);
        return null;
      }

      return data;
    },
    enabled: open && !!profile?.id_persona,
  });

  const passwordRequirements = [
    { text: 'Al menos 8 caracteres', valid: newPassword.length >= 8 },
    { text: 'Al menos una mayúscula', valid: /[A-Z]/.test(newPassword) },
    { text: 'Al menos una minúscula', valid: /[a-z]/.test(newPassword) },
    { text: 'Al menos un número', valid: /[0-9]/.test(newPassword) },
    { text: 'Al menos un símbolo especial', valid: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const allRequirementsMet = passwordRequirements.every(req => req.valid);

  const handlePasswordChange = async () => {
    // Validate current password is provided
    if (!currentPassword) {
      toast.error("Debes ingresar tu contraseña actual");
      return;
    }

    // Validate new password meets requirements
    if (!allRequirementsMet) {
      toast.error("La nueva contraseña no cumple con los requisitos");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setIsLoading(true);

    try {
      // First verify the current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        toast.error("La contraseña actual es incorrecta");
        setIsLoading(false);
        return;
      }

      // Now update to the new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast.error("Error al cambiar la contraseña: " + updateError.message);
        setIsLoading(false);
        return;
      }

      toast.success("Contraseña actualizada correctamente");
      resetForm();
    } catch (err) {
      toast.error("Error al cambiar la contraseña");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = async (data: any) => {
    if (!profile?.id_persona) {
      toast.error("No se encontró información de persona asociada");
      return;
    }

    setIsSavingProfile(true);

    try {
      const { error } = await supabase
        .from('personas')
        .update({
          nombre_legal: data.nombre_legal,
          nombre_comercial: data.nombre_comercial,
          email: data.email,
          telefono: data.telefono,
          clave_pais_telefono: data.clave_pais_telefono,
          curp: data.curp,
          rfc: data.rfc,
          uso_cfdi: data.uso_cfdi,
          regimen: data.regimen,
          sexo: data.sexo,
          fecha_nacimiento: data.fecha_nacimiento,
          id_estado_civil: data.id_estado_civil,
          ocupacion: data.ocupacion,
          id_pais_nacimiento: data.id_pais_nacimiento,
          id_estado_nacimiento: data.id_estado_nacimiento,
          id_municipio_nacimiento: data.id_municipio_nacimiento,
          direccion_calle: data.direccion_calle,
          direccion_num_ext: data.direccion_num_ext,
          direccion_num_int: data.direccion_num_int,
          direccion_colonia: data.direccion_colonia,
          direccion_codigo_postal: data.direccion_codigo_postal,
          direccion_id_pais: data.direccion_id_pais,
          direccion_id_estado: data.direccion_id_estado,
          direccion_id_municipio: data.direccion_id_municipio,
          direccion_fiscal_calle: data.direccion_fiscal_calle,
          direccion_fiscal_num_ext: data.direccion_fiscal_num_ext,
          direccion_fiscal_num_int: data.direccion_fiscal_num_int,
          direccion_fiscal_colonia: data.direccion_fiscal_colonia,
          direccion_fiscal_codigo_postal: data.direccion_fiscal_codigo_postal,
          direccion_fiscal_id_pais: data.direccion_fiscal_id_pais,
          direccion_fiscal_id_estado: data.direccion_fiscal_id_estado,
          direccion_fiscal_id_municipio: data.direccion_fiscal_id_municipio,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', profile.id_persona);

      if (error) throw error;

      // Update usuario name if changed
      if (data.nombre_legal) {
        await supabase
          .from('usuarios')
          .update({ nombre: data.nombre_legal })
          .eq('email', profile.email);
      }

      toast.success("Datos actualizados correctamente");
      setIsEditingProfile(false);
      queryClient.invalidateQueries({ queryKey: ["user_persona_data"] });
      refreshProfile();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error("Error al actualizar los datos: " + error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const resetForm = () => {
    setIsChangingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const getRoleBadgeColor = (rol: string) => {
    switch (rol) {
      case "Super Administrador":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "Administrador":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Vendedor":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  // If editing profile, show PersonForm in a full dialog
  if (isEditingProfile && personaData) {
    return (
      <Dialog open={open} onOpenChange={(newOpen) => {
        if (!newOpen) {
          setIsEditingProfile(false);
        }
        onOpenChange(newOpen);
      }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar mis datos</DialogTitle>
            <DialogDescription>
              Actualiza tu información personal y documentos
            </DialogDescription>
          </DialogHeader>
          <PersonForm
            initialData={personaData}
            onSubmit={handleProfileUpdate}
            onCancel={() => setIsEditingProfile(false)}
            isLoading={isSavingProfile}
            entityType="user"
            fixedEntityType={true}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) resetForm();
      onOpenChange(newOpen);
    }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración de Usuario</DialogTitle>
          <DialogDescription>
            Información de tu cuenta y opciones de configuración
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Info Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nombre</p>
                <p className="font-medium">{profile?.nombre || "Sin nombre"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Correo electrónico</p>
                <p className="font-medium">{profile?.email || "Sin correo"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rol</p>
                <Badge className={getRoleBadgeColor(profile?.rol_nombre || "")}>
                  {profile?.rol_nombre || "Sin rol"}
                </Badge>
              </div>
            </div>

            {/* Project Access Section */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Acceso a proyectos</p>
                {isSuperAdmin ? (
                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 mt-1">
                    Todos los proyectos
                  </Badge>
                ) : projectsLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                ) : userProjects && userProjects.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {userProjects.map((project: any) => (
                      <Badge 
                        key={project.id} 
                        variant="secondary"
                        className="text-xs"
                      >
                        {project.nombre}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin proyectos asignados</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Edit Profile Section */}
          {profile?.id_persona && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Mis datos personales</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                    disabled={personaLoading}
                  >
                    {personaLoading ? "Cargando..." : "Editar"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Actualiza tu información personal, dirección, datos fiscales y documentos.
                </p>
              </div>
              <Separator />
            </>
          )}

          {/* Change Password Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Cambiar contraseña</span>
              </div>
              {!isChangingPassword && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsChangingPassword(true)}
                >
                  Cambiar
                </Button>
              )}
            </div>

            {isChangingPassword && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Contraseña actual</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña actual"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Ingresa la nueva contraseña"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Password Requirements */}
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-muted-foreground">Requisitos:</p>
                  {passwordRequirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {req.valid ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <span className={req.valid ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                        {req.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite la nueva contraseña"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-sm text-destructive">Las contraseñas no coinciden</p>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                    disabled={isLoading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePasswordChange}
                    disabled={isLoading || !currentPassword || !allRequirementsMet || newPassword !== confirmPassword}
                  >
                    {isLoading ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
