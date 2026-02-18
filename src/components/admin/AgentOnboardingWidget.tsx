import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, FileText, FolderOpen, Landmark, Check, Trophy, Loader2 } from "lucide-react";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { AgentOnboardingStepDialog } from "./AgentOnboardingStepDialog";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, React.ElementType> = {
  basic: User,
  address: MapPin,
  fiscal: FileText,
  documents: FolderOpen,
  'bank-accounts': Landmark,
};

const STEP_NUMBERS: Record<string, number> = {
  basic: 1,
  address: 2,
  fiscal: 3,
  documents: 4,
  'bank-accounts': 5,
};

interface AgentOnboardingWidgetProps {
  personaId: number;
}

export function AgentOnboardingWidget({ personaId }: AgentOnboardingWidgetProps) {
  const { steps, completedCount, totalSteps, percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // All complete - show badge
  if (percentage === 100) {
    return (
      <Card className="border-0 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent">
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500 text-white shrink-0">
            <Trophy className="h-4 w-4" />
          </div>
          <p className="font-semibold text-sm text-foreground flex-1">¡Perfil completo!</p>
          <Badge className="bg-emerald-500 text-white border-0 shrink-0">100%</Badge>
        </CardContent>
      </Card>
    );
  }

  const nextIncomplete = steps.find(s => !s.isComplete);

  return (
    <>
      <Card className="overflow-hidden border shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Header with percentage */}
          <div className="text-center space-y-0.5">
            <p className="font-bold text-sm text-foreground">¡Completa tu perfil!</p>
            <p className="text-xs text-muted-foreground">{percentage}% completado</p>
          </div>

          {/* Horizontal stepper */}
          <div className="flex items-center justify-between gap-0">
            {steps.map((step, index) => {
              const Icon = STEP_ICONS[step.id];
              const isNext = nextIncomplete?.id === step.id;
              const num = STEP_NUMBERS[step.id];

              return (
                <div key={step.id} className="flex items-center flex-1 last:flex-none">
                  {/* Step circle + label */}
                  <button
                    onClick={() => setActiveStep(step.id)}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold transition-all border-2",
                        step.isComplete
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isNext
                          ? "bg-primary border-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1"
                          : "bg-muted border-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      {step.isComplete ? <Check className="h-4 w-4" /> : num}
                    </div>
                    <span className={cn(
                      "text-[10px] leading-tight font-medium text-center max-w-[60px]",
                      step.isComplete
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isNext
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </button>

                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-1 mt-[-16px] rounded-full",
                      step.isComplete ? "bg-emerald-500" : "bg-muted-foreground/15"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Dialog */}
      {activeStep && (
        <AgentOnboardingStepDialog
          step={activeStep}
          personaId={personaId}
          open={!!activeStep}
          onOpenChange={(open) => {
            if (!open) setActiveStep(null);
          }}
        />
      )}
    </>
  );
}
