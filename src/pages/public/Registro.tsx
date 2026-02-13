import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Registro() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    telefono: "",
    clave_pais_telefono: "MX",
  });
  const [isSuccess, setIsSuccess] = useState(false);

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('registro-publico', {
        body: {
          nombre: formData.nombre.trim(),
          email: formData.email.trim().toLowerCase(),
          telefono: formData.telefono.trim(),
          clave_pais_telefono: formData.clave_pais_telefono,
        },
      });

      if (error) {
        let message = "Error al registrar";
        if (data?.message) {
          message = data.message;
        }
        throw new Error(message);
      }
      if (!data.success) throw new Error(data.message || "Error al registrar");

      return data;
    },
    onSuccess: () => {
      setIsSuccess(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al registrar",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      toast({ title: "Campo requerido", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      toast({ title: "Campo requerido", description: "Ingresa un email válido", variant: "destructive" });
      return;
    }

    if (!formData.telefono.trim() || formData.telefono.length !== 10) {
      toast({ title: "Campo requerido", description: "El teléfono debe tener 10 dígitos", variant: "destructive" });
      return;
    }

    // Check if email already exists
    const emailLower = formData.email.trim().toLowerCase();

    const { data: existingPersona } = await supabase
      .from('personas')
      .select('id')
      .ilike('email', emailLower)
      .eq('activo', true)
      .maybeSingle();

    const { data: existingUsuario } = await supabase
      .from('usuarios')
      .select('id')
      .ilike('email', emailLower)
      .maybeSingle();

    if (existingPersona || existingUsuario) {
      toast({
        title: "Correo ya registrado",
        description: "Este correo ya está registrado. Por favor, contacta al administrador.",
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    registerMutation.mutate();
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-border shadow-xl">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              ¡Registro exitoso!
            </h2>
            <p className="text-muted-foreground mb-6">
              Tu registro ha sido completado. Ya puedes iniciar sesión con tu correo electrónico.
            </p>
            <a href="https://inmobiliarias.sozu.com/auth/login">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Ir a iniciar sesión
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img
              src="/images/sozu-logo.png"
              alt="Sozu"
              className="h-10"
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Plataforma de gestión inmobiliaria
          </p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Registro</CardTitle>
            <CardDescription>
              Completa el formulario para crear tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="tu@correo.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">
                  Teléfono <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.clave_pais_telefono}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, clave_pais_telefono: value }))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MX">🇲🇽 +52</SelectItem>
                      <SelectItem value="US">🇺🇸 +1</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormData(prev => ({ ...prev, telefono: value }));
                    }}
                    placeholder="10 dígitos"
                    className="flex-1"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Registrando...
                  </span>
                ) : (
                  "Registrarse"
                )}
              </Button>

              <div className="text-center pt-2">
                <a
                  href="https://inmobiliarias.sozu.com/auth/login"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  ¿Ya tienes cuenta? Inicia sesión
                </a>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Al registrarte, aceptas nuestros términos y condiciones
        </p>
      </div>
    </div>
  );
}
