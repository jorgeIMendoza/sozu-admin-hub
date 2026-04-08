import { ArrowRight, Shield, BarChart3, Building2, Users, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import sozuLogo from "@/assets/sozu-logo-black.png";
import heroImage from "@/assets/hero-agents.jpg";

const features = [
  {
    icon: Building2,
    title: "Inventario en tiempo real",
    description: "Accede al catálogo completo de propiedades disponibles con precios actualizados.",
  },
  {
    icon: BarChart3,
    title: "Seguimiento de ventas",
    description: "Monitorea tus ofertas, reservas y comisiones desde un solo lugar.",
  },
  {
    icon: Shield,
    title: "Documentación segura",
    description: "Comparte brochures, fichas técnicas y materiales de venta con tus clientes.",
  },
  {
    icon: Users,
    title: "Red de agentes",
    description: "Forma parte de la red de comercialización inmobiliaria más transparente.",
  },
];

const benefits = [
  "Acceso a proyectos exclusivos",
  "Comisiones competitivas",
  "Herramientas de venta digitales",
  "Soporte personalizado",
  "Reportes y analytics",
  "Contratos digitales",
];

export default function AgentesLanding() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <img src={sozuLogo} alt="Sozu" className="h-7 sm:h-8" />
            <div className="flex items-center gap-3">
              <a href="https://agentes.sozu.com/login">
                <Button variant="ghost" className="text-sm font-medium text-[hsl(0,0%,34%)] hover:text-[hsl(0,0%,0%)]">
                  Acceder
                </Button>
              </a>
              <a href="https://agentes.sozu.com/registro">
                <Button className="text-sm font-medium bg-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,32%)] text-white rounded-full px-6">
                  Registrarme
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 sm:pt-32 sm:pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 sm:space-y-8">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[hsl(0,0%,0%)] leading-[1.1]">
                La plataforma que conecta{" "}
                <span className="text-[hsl(158,64%,38%)]">patrimonio</span>,
                transparencia y oportunidades
              </h1>
              <p className="text-lg sm:text-xl text-[hsl(0,0%,34%)] max-w-lg">
                Administra tu inversión o comercializa proyectos con total claridad y control.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <a href="https://agentes.sozu.com/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto rounded-full px-8 border-[hsl(158,64%,38%)] text-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,38%)]/5 font-semibold"
                  >
                    Acceder a mi cuenta
                  </Button>
                </a>
                <a href="https://agentes.sozu.com/registro">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto rounded-full px-8 bg-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,32%)] text-white font-semibold"
                  >
                    Convertirme en Agente
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src={heroImage}
                  alt="Equipo de agentes inmobiliarios"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 bg-[hsl(0,0%,97%)] px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-[hsl(0,0%,0%)] mb-4">
              Todo lo que necesitas para vender
            </h2>
            <p className="text-[hsl(0,0%,34%)] text-lg max-w-2xl mx-auto">
              Herramientas diseñadas para potenciar tu gestión comercial inmobiliaria.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-lg bg-[hsl(158,64%,38%)]/10 flex items-center justify-center mb-5">
                  <feature.icon className="h-6 w-6 text-[hsl(158,64%,38%)]" />
                </div>
                <h3 className="font-bold text-lg text-[hsl(0,0%,0%)] mb-2">{feature.title}</h3>
                <p className="text-[hsl(0,0%,34%)] text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[hsl(0,0%,0%)] mb-6">
                ¿Por qué ser agente Sozu?
              </h2>
              <p className="text-[hsl(0,0%,34%)] text-lg mb-8">
                Únete a la plataforma líder en gestión inmobiliaria y accede a beneficios exclusivos.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-[hsl(158,64%,38%)] flex-shrink-0" />
                    <span className="text-[hsl(0,0%,15%)] font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[hsl(0,0%,97%)] rounded-2xl p-8 sm:p-12 text-center">
              <h3 className="text-2xl font-bold text-[hsl(0,0%,0%)] mb-4">
                Comienza hoy
              </h3>
              <p className="text-[hsl(0,0%,34%)] mb-8">
                Regístrate en menos de 2 minutos y comienza a comercializar proyectos inmobiliarios.
              </p>
              <a href="https://agentes.sozu.com/registro">
                <Button
                  size="lg"
                  className="rounded-full px-10 bg-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,32%)] text-white font-semibold"
                >
                  Registrarme como Agente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src={sozuLogo} alt="Sozu" className="h-6" />
          <p className="text-sm text-[hsl(0,0%,34%)]">
            © {new Date().getFullYear()} Sozu. Todos los derechos reservados.
          </p>
          <a
            href="https://www.sozu.com/aviso-de-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[hsl(158,64%,38%)] hover:underline"
          >
            Aviso de privacidad
          </a>
        </div>
      </footer>
    </div>
  );
}
