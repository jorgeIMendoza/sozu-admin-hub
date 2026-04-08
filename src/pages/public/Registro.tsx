import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";

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
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json();
            if (errorBody?.message) message = errorBody.message;
          } else if (data?.message) {
            message = data.message;
          }
        } catch {
          if (data?.message) message = data.message;
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

    registerMutation.mutate();
  };

  if (isSuccess) {
    return (
      <div className="login-page">
        <div className="login-bg-gradient" />
        <div className="login-card relative z-10 text-center">
          <img src={sozuLogoBlack} alt="Sozu" className="h-10 mx-auto mb-7" />
          <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsl(145 38% 46%), hsl(152 40% 54%))',
              boxShadow: '0 6px 24px -4px hsl(145 35% 51% / 0.30)',
            }}>
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black text-[hsl(0_0%_5%)] mb-2" style={{ letterSpacing: '-0.02em' }}>
            ¡Confirma tu correo!
          </h2>
          <p className="text-sm mb-2" style={{ color: 'hsl(0 0% 45%)' }}>
            Hemos enviado un correo de confirmación a:
          </p>
          <p className="text-[hsl(0_0%_5%)] font-semibold mb-2 text-base">
            {formData.email}
          </p>
          <p className="text-sm mb-2" style={{ color: 'hsl(0 0% 45%)' }}>
            Haz clic en el enlace de confirmación que recibiste para activar tu cuenta y recibir tus credenciales de acceso.
          </p>
          <p className="text-xs mb-7" style={{ color: 'hsl(0 0% 55%)' }}>
            Si no lo encuentras, revisa tu carpeta de spam o correo no deseado.
          </p>
          <a href="https://agentes.sozu.com/login" className="block">
            <button type="button" className="login-btn-outline">
              Ir a iniciar sesión
            </button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card relative z-10">
        {/* Logo */}
        <div className="text-center mb-7">
          <img src={sozuLogoBlack} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-center text-[hsl(0_0%_5%)] mb-1.5" style={{ letterSpacing: '-0.02em' }}>
          Registro de Agente
        </h1>
        <p className="text-sm text-center mb-7" style={{ color: 'hsl(0 0% 45%)' }}>
          Completa tus datos para crear tu cuenta
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">Nombre completo</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre completo"
              required
              className="login-input w-full"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="tu@email.com"
              required
              className="login-input w-full"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">Teléfono</label>
            <div className="flex gap-3">
              <select
                value={formData.clave_pais_telefono}
                onChange={(e) => setFormData(prev => ({ ...prev, clave_pais_telefono: e.target.value }))}
                className="login-input w-24 px-3"
              >
                <option value="MX">🇲🇽 +52</option>
                <option value="US">🇺🇸 +1</option>
              </select>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setFormData(prev => ({ ...prev, telefono: value }));
                }}
                placeholder="10 dígitos"
                required
                className="login-input flex-1"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMutation.isPending || !formData.nombre.trim() || !formData.email.trim() || !formData.email.includes('@') || formData.telefono.length !== 10}
            className="login-btn-primary"
          >
            {registerMutation.isPending ? "Registrando..." : "Registrarme como Agente"}
          </button>

          {/* Login link */}
          <a href="https://agentes.sozu.com/login" className="block">
            <button type="button" className="login-btn-outline">
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </a>
        </form>

        <p className="text-center text-xs mt-7 px-4 leading-relaxed" style={{ color: 'hsl(0 0% 55%)' }}>
          Al registrarte, aceptas nuestros{" "}
          <a
            href="https://www.sozu.com/terminos-y-condiciones"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'hsl(145 35% 51%)' }}
          >
            Términos y condiciones
          </a>
          . Ver{" "}
          <a
            href="https://www.sozu.com/aviso-de-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'hsl(145 35% 51%)' }}
          >
            Aviso de privacidad
          </a>
          .
        </p>
      </div>
    </div>
  );
}
