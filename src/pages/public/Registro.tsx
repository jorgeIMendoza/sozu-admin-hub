import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, CheckCircle2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import sozuLogoBlack from "@/assets/sozu-logo-black.png";

interface PublishedProject {
  id: number;
  nombre: string;
  url_imagen_portada: string | null;
}

function ProjectSelector({ projects, selected, onToggle }: {
  projects: PublishedProject[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">
        Desarrollos de interés <span className="text-red-500">*</span>
      </label>
      <p className="text-xs mb-3" style={{ color: 'hsl(0 0% 50%)' }}>
        Selecciona al menos 1 desarrollo al que deseas tener acceso
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
        {projects.map((project) => {
          const isSelected = selected.includes(project.id);
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onToggle(project.id)}
              className={`
                relative flex-shrink-0 w-[140px] rounded-xl overflow-hidden border-2 transition-all duration-200 snap-start
                ${isSelected
                  ? 'border-[hsl(145_35%_51%)] shadow-[0_0_0_1px_hsl(145_35%_51%)]'
                  : 'border-[hsl(0_0%_88%)] hover:border-[hsl(0_0%_70%)]'
                }
              `}
            >
              {/* Image */}
              <div className="w-full h-[90px] bg-[hsl(0_0%_95%)] flex items-center justify-center overflow-hidden">
                {project.url_imagen_portada ? (
                  <img
                    src={project.url_imagen_portada}
                    alt={project.nombre}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Building2 className="w-8 h-8" style={{ color: 'hsl(0 0% 70%)' }} />
                )}
              </div>
              {/* Name */}
              <div className="px-2 py-2 text-center">
                <span className="text-xs font-semibold text-[hsl(0_0%_15%)] line-clamp-2 leading-tight">
                  {project.nombre}
                </span>
              </div>
              {/* Check badge */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5">
                  <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" fill="hsl(145 35% 51%)" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* Disclaimer */}
      <p className="text-[11px] mt-3 leading-relaxed px-1" style={{ color: 'hsl(0 0% 55%)' }}>
        ⚠️ El acceso a los desarrollos estará sujeto a la aprobación de un administrador.
      </p>
    </div>
  );
}

export default function Registro() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    telefono: "",
    clave_pais_telefono: "MX",
  });
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [publishedProjects, setPublishedProjects] = useState<PublishedProject[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  // Fetch published projects
  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase
        .from('proyectos')
        .select('id, nombre, url_imagen_portada')
        .eq('publicar', true)
        .eq('activo', true)
        .order('nombre');
      if (data) setPublishedProjects(data);
    };
    fetchProjects();
  }, []);

  const toggleProject = (id: number) => {
    setSelectedProjects(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('registro-publico', {
        body: {
          nombre: formData.nombre.trim(),
          email: formData.email.trim().toLowerCase(),
          telefono: formData.telefono.trim(),
          clave_pais_telefono: formData.clave_pais_telefono,
          proyecto_ids: selectedProjects,
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

    if (selectedProjects.length === 0) {
      toast({ title: "Selección requerida", description: "Selecciona al menos 1 desarrollo de interés", variant: "destructive" });
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
          <a href="https://inmobiliarias.sozu.com/auth/login" className="block">
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

          {/* Project Selection */}
          <ProjectSelector
            projects={publishedProjects}
            selected={selectedProjects}
            onToggle={toggleProject}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="login-btn-primary"
          >
            {registerMutation.isPending ? "Registrando..." : "Registrarme como Agente"}
          </button>

          {/* Login link */}
          <a href="https://inmobiliarias.sozu.com/auth/login" className="block">
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
