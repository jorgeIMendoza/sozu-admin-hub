import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, FileText, FolderOpen, Landmark, Check, Trophy, Loader2, GraduationCap } from "lucide-react";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { AgentOnboardingStepDialog } from "./AgentOnboardingStepDialog";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, React.ElementType> = {
  basic: User,
  address: MapPin,
  fiscal: FileText,
  documents: FolderOpen,
  'bank-accounts': Landmark,
  training: GraduationCap,
};

const STEP_NUMBERS: Record<string, number> = {
  basic: 1,
  address: 2,
  fiscal: 3,
  documents: 4,
  'bank-accounts': 5,
  training: 6,
};

interface AgentOnboardingWidgetProps {
  personaId: number;
}

export function AgentOnboardingWidget({ personaId }: AgentOnboardingWidgetProps) {
  const { steps, completedCount, totalSteps, percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  if (isLoading) {
    return (
      <div className="bg-card border-b px-4 py-2 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // All complete - show slim badge
  if (percentage === 100) {
    return (
      <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b px-4 py-2 flex items-center gap-2 justify-center">
        <Trophy className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">¡Perfil completo!</span>
        <Badge className="bg-emerald-500 text-white border-0 text-[10px] px-1.5 py-0">100%</Badge>
      </div>
    );
  }


  return (
    <>
      <div className="bg-card border-b px-3 py-2.5">
        {/* Title row */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-bold text-foreground">¡Completa tu perfil!</span>
          <span className="text-[10px] text-muted-foreground">{percentage}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-full mb-2.5 mx-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${percentage}%`,
              background: percentage < 40
                ? 'hsl(var(--destructive))'
                : percentage < 70
                ? 'hsl(45 93% 47%)'
                : 'hsl(142 76% 36%)',
            }}
          />
        </div>

        {/* Horizontal stepper - compact */}
        <div className="flex items-center justify-between gap-0">
          {steps.map((step, index) => {
            const isSelected = activeStep === step.id;
            const num = STEP_NUMBERS[step.id];

            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setActiveStep(step.id)}
                  className="flex flex-col items-center gap-0.5 group"
                >
                  <div
                    className={cn(
                      "flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-bold transition-all border-2",
                      step.isComplete
                        ? "bg-emerald-500 border-emerald-500 text-white scale-100"
                        : isSelected
                        ? "bg-primary border-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1"
                        : "bg-muted border-muted-foreground/20 text-muted-foreground"
                    )}
                  >
                    {step.isComplete ? <Check className="h-3.5 w-3.5" /> : num}
                  </div>
                  <span className={cn(
                    "text-[9px] leading-tight font-medium text-center max-w-[52px]",
                    step.isComplete
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isSelected
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </button>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-0.5 mt-[-12px] rounded-full",
                    step.isComplete ? "bg-emerald-500" : "bg-muted-foreground/15"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

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
