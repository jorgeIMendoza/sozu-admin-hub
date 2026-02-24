import { useAuth } from "@/contexts/AuthContext";

const AgentPerfil = () => {
  const { profile } = useAuth();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-[hsl(var(--agent-primary))] flex items-center justify-center text-white font-bold text-lg">
          {profile?.nombre?.[0] || "A"}
        </div>
        <div>
          <h1 className="text-lg font-bold text-[hsl(var(--agent-text))]">
            {profile?.nombre || "Agente"}
          </h1>
          <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
            {profile?.rol_nombre || "Agente Inmobiliario"}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
        <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
          Centro de activación profesional (próximamente)
        </p>
      </div>
    </div>
  );
};

export default AgentPerfil;
