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
import sozuLogo from "@/assets/sozu-logo-black.png";

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
      <div className="min-h-screen bg-[hsl(0,0%,97%)] flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-0 shadow-xl rounded-2xl">
          <CardContent className="pt-10 pb-10 text-center px-8">
            <div className="w-16 h-16 bg-[hsl(158,64%,38%)]/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-[hsl(158,64%,38%)]" />
            </div>
            <h2 className="text-2xl font-bold text-[hsl(0,0%,0%)] mb-2">
              ¡Registro exitoso!
            </h2>
            <p className="text-[hsl(0,0%,34%)] mb-8">
              Tu registro ha sido completado. Ya puedes iniciar sesión con tu correo electrónico.
            </p>
            <a href="https://inmobiliarias.sozu.com/auth/login">
              <Button
                variant="outline"
                className="rounded-full px-6 border-[hsl(158,64%,38%)] text-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,38%)]/5"
              >
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
    <div className="min-h-screen bg-[hsl(0,0%,97%)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={sozuLogo}
            alt="Sozu"
            className="h-9 mx-auto mb-3"
          />
          <p className="text-[hsl(0,0%,34%)] text-sm">
            Plataforma de gestión inmobiliaria
          </p>
        </div>

        <Card className="border-0 shadow-xl rounded-2xl">
          <CardHeader className="text-center pb-2 px-8 pt-8">
            <div className="w-12 h-12 bg-[hsl(158,64%,38%)]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-6 h-6 text-[hsl(158,64%,38%)]" />
            </div>
            <CardTitle className="text-xl font-bold text-[hsl(0,0%,0%)]">Registro</CardTitle>
            <CardDescription className="text-[hsl(0,0%,34%)]">
              Completa el formulario para crear tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nombre" className="text-sm font-semibold text-[hsl(0,0%,0%)]">
                  Nombre <span className="text-[hsl(0,84%,60%)]">*</span>
                </Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  className="h-11 rounded-lg border-gray-200 focus:border-[hsl(158,64%,38%)] focus:ring-[hsl(158,64%,38%)]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-[hsl(0,0%,0%)]">
                  Email <span className="text-[hsl(0,84%,60%)]">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="tu@correo.com"
                  className="h-11 rounded-lg border-gray-200 focus:border-[hsl(158,64%,38%)] focus:ring-[hsl(158,64%,38%)]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono" className="text-sm font-semibold text-[hsl(0,0%,0%)]">
                  Teléfono <span className="text-[hsl(0,84%,60%)]">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.clave_pais_telefono}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, clave_pais_telefono: value }))}
                  >
                    <SelectTrigger className="w-28 h-11 rounded-lg border-gray-200">
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
                    className="flex-1 h-11 rounded-lg border-gray-200 focus:border-[hsl(158,64%,38%)] focus:ring-[hsl(158,64%,38%)]"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-full bg-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,32%)] text-white font-semibold text-sm shadow-lg shadow-[hsl(158,64%,38%)]/20 transition-all duration-300"
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

              <div className="text-center pt-1">
                <a
                  href="https://inmobiliarias.sozu.com/auth/login"
                  className="text-sm text-[hsl(0,0%,34%)] hover:text-[hsl(158,64%,38%)] transition-colors"
                >
                  ¿Ya tienes cuenta? Inicia sesión
                </a>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[hsl(0,0%,50%)] mt-6 px-4">
          Al registrarte, aceptas nuestros términos y condiciones contenidas en nuestro{" "}
          <a
            href="https://www.sozu.com/aviso-de-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[hsl(158,64%,38%)] hover:underline"
          >
            Aviso de privacidad
          </a>
          .
        </p>
      </div>
    </div>
  );
}
