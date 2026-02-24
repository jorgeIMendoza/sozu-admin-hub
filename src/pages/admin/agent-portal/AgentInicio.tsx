import { useAuth } from "@/contexts/AuthContext";

const AgentInicio = () => {
  const { profile } = useAuth();
  const nombre = profile?.nombre?.split(" ")[0] || "Agente";

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">
          Buenos días, {nombre}
        </h1>
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Aquí tienes un resumen de tu actividad
        </p>
      </div>

      {/* Placeholder sections — will be replaced with real data */}
      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Sección de métricas comerciales (próximamente)
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Requieren tu atención (próximamente)
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Showrooms activos (próximamente)
        </p>
      </div>
    </div>
  );
};

export default AgentInicio;
