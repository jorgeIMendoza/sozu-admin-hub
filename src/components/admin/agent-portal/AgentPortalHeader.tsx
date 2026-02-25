import { useAuth } from "@/contexts/AuthContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

interface AgentPortalHeaderProps {
  title?: string;
  children?: React.ReactNode;
}

export const AgentPortalHeader = ({ title, children }: AgentPortalHeaderProps) => {
  const { profile } = useAuth();
  const personaId = profile?.id_persona;
  const { percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const isVerified = percentage === 100;

  return (
    <>
      {/* Floating "No verificado" badge - always visible */}
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
          {title ? (
            <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">{title}</h1>
          ) : <div />}
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
