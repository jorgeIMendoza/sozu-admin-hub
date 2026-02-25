import { useAuth } from "@/contexts/AuthContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, User } from "lucide-react";

interface AgentPortalHeaderProps {
  title?: string;
  children?: React.ReactNode;
  showAgentName?: boolean;
}

export const AgentPortalHeader = ({ title, children, showAgentName = false }: AgentPortalHeaderProps) => {
  const { profile } = useAuth();
  const personaId = profile?.id_persona;
  const { percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const isVerified = percentage === 100;
  const nombreCompleto = profile?.nombre || "Agente";
  const initials = nombreCompleto
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join("");

  return (
    <>
      {!isLoading && !isVerified && (
        <div className="fixed top-3 right-4 z-50">
          <Badge
            variant="outline"
            className="border-destructive/30 text-destructive gap-1 bg-white shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
            No verificado
          </Badge>
        </div>
      )}

      <div className="sticky top-0 z-10 bg-[hsl(var(--agent-bg))] px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {showAgentName && (
              <div className="h-9 w-9 rounded-full bg-[hsl(var(--agent-primary))] flex items-center justify-center shrink-0">
                {initials ? (
                  <span className="text-sm font-bold text-white leading-none">{initials}</span>
                ) : (
                  <User className="h-4 w-4 text-white" />
                )}
              </div>
            )}
            <div>
              {showAgentName && (
                <p className="text-sm font-medium text-[hsl(var(--agent-text))]">{nombreCompleto}</p>
              )}
              {title ? (
                <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">{title}</h1>
              ) : <div />}
            </div>
          </div>
          {!isLoading && isVerified && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-emerald-600 gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              Verificado
            </Badge>
          )}
        </div>
        {children}
      </div>
    </>
  );
};
