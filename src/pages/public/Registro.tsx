import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
        // Try to parse error context for edge function errors (4xx responses)
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

    // Duplicate check is done server-side in the edge function (RLS prevents anon from seeing all users)
    registerMutation.mutate();
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[hsl(220,20%,93%)] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto mb-10" />
          <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsl(200,70%,55%), hsl(210,80%,50%))',
              boxShadow: '0 8px 24px hsla(210,80%,50%,0.3)',
            }}>
            <UserPlus className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[hsl(0,0%,15%)] mb-3">
            ¡Confirma tu correo!
          </h2>
          <p className="text-[hsl(0,0%,45%)] mb-3 text-sm leading-relaxed">
            Hemos enviado un correo de confirmación a:
          </p>
          <p className="text-[hsl(0,0%,15%)] font-semibold mb-3 text-base">
            {formData.email}
          </p>
          <p className="text-[hsl(0,0%,45%)] mb-3 text-sm leading-relaxed">
            Haz clic en el enlace de confirmación que recibiste para activar tu cuenta y recibir tus credenciales de acceso.
          </p>
          <p className="text-[hsl(0,0%,55%)] mb-10 text-xs leading-relaxed">
            Si no lo encuentras, revisa tu carpeta de spam o correo no deseado.
          </p>
          <a href="https://inmobiliarias.sozu.com/auth/login">
            <button
              className="w-full py-4 rounded-2xl text-sm font-medium text-[hsl(0,0%,40%)] transition-all duration-200"
              style={{
                background: 'hsl(220,20%,93%)',
                boxShadow: '6px 6px 12px hsl(220,20%,86%), -6px -6px 12px hsl(0,0%,100%)',
              }}
            >
              Ir a iniciar sesión
            </button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,93%)] flex flex-col items-center justify-center p-4">
      <div
        className="w-full max-w-md bg-white rounded-3xl px-8 py-10 sm:px-10"
        style={{
          boxShadow: '12px 12px 30px hsl(220,20%,84%), -12px -12px 30px hsl(0,0%,100%)',
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-[hsl(0,0%,15%)] mb-2">
          Registro de Agente
        </h1>
        <p className="text-sm text-[hsl(0,0%,55%)] text-center mb-8">
          Completa tus datos para crear tu cuenta
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0,0%,15%)] mb-2">Nombre completo</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre completo"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 border border-[hsl(220,20%,88%)]"
              style={{
                background: 'hsl(220,20%,93%)',
                boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
              }}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0,0%,15%)] mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="tu@email.com"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 border border-[hsl(220,20%,88%)]"
              style={{
                background: 'hsl(220,20%,93%)',
                boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
              }}
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0,0%,15%)] mb-2">Teléfono</label>
            <div className="flex gap-3">
              <select
                value={formData.clave_pais_telefono}
                onChange={(e) => setFormData(prev => ({ ...prev, clave_pais_telefono: e.target.value }))}
                className="w-24 px-3 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] outline-none border border-[hsl(220,20%,88%)]"
                style={{
                  background: 'hsl(220,20%,93%)',
                  boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
                }}
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
                className="flex-1 px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 border border-[hsl(220,20%,88%)]"
                style={{
                  background: 'hsl(220,20%,93%)',
                  boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
                }}
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full py-4 rounded-2xl text-white font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, hsl(180,60%,55%), hsl(158,64%,38%))',
              boxShadow: '0 8px 24px hsla(158,64%,38%,0.3)',
            }}
          >
            {registerMutation.isPending ? "Registrando..." : "Registrarme como Agente"}
          </button>

          {/* Login link */}
          <a href="https://inmobiliarias.sozu.com/auth/login" className="block w-full">
            <button
              type="button"
              className="w-full py-4 rounded-2xl text-sm font-medium text-[hsl(0,0%,40%)] transition-all duration-200"
              style={{
                background: 'hsl(220,20%,93%)',
                boxShadow: '6px 6px 12px hsl(220,20%,86%), -6px -6px 12px hsl(0,0%,100%)',
              }}
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </a>
        </form>

        <p className="text-center text-xs text-[hsl(0,0%,55%)] mt-8 px-4 leading-relaxed">
          Al registrarte, aceptas nuestros términos contenidos en nuestro{" "}
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