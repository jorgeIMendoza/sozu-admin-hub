import { useAuth } from "@/contexts/AuthContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";

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
    <div className="sticky top-0 z-10 bg-[hsl(var(--agent-bg))] px-4 pt-4 pb-3 space-y-3">
      <div className="flex items-center justify-between">
        {title && (
          <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">{title}</h1>
        )}
        {!isLoading && (
          <Badge
            variant="outline"
            className={
              isVerified
                ? "border-emerald-500/30 text-emerald-600 gap-1"
                : "border-destructive/30 text-destructive gap-1"
            }
          >
            {isVerified ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Verificado
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                No verificado
              </>
            )}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
};
