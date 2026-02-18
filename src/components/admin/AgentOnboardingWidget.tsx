import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Trophy, Loader2 } from "lucide-react";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { AgentOnboardingStepDialog } from "./AgentOnboardingStepDialog";
import { cn } from "@/lib/utils";

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
  variant?: 'default' | 'inline';
}

export function AgentOnboardingWidget({ personaId, variant = 'default' }: AgentOnboardingWidgetProps) {
  const { steps, completedCount, totalSteps, percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />;
  }

  if (percentage === 100) {
    return (
      <div className="flex items-center gap-1.5 justify-center">
        <Trophy className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Perfil completo</span>
      </div>
    );
  }

  const isInline = variant === 'inline';

  return (
    <>
      <div className={cn(isInline ? "" : "bg-card border-b px-3 py-2.5")}>
        {/* Title + progress */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-foreground whitespace-nowrap">Perfil {percentage}%</span>
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
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
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0">
          {steps.map((step, index) => {
            const isSelected = activeStep === step.id;
            const num = STEP_NUMBERS[step.id];

            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setActiveStep(step.id)}
                  className="flex flex-col items-center gap-0.5 group"
                  title={step.label}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full text-[9px] font-bold transition-all border-2",
                      isInline ? "h-5 w-5" : "h-7 w-7 text-[10px]",
                      step.isComplete
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : isSelected
                        ? "bg-primary border-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1"
                        : "bg-muted border-muted-foreground/20 text-muted-foreground"
                    )}
                  >
                    {step.isComplete ? <Check className={cn(isInline ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} /> : num}
                  </div>
                  {!isInline && (
                    <span className={cn(
                      "text-[9px] leading-tight font-medium text-center max-w-[48px]",
                      step.isComplete
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isSelected
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  )}
                </button>

                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-0.5 rounded-full",
                    !isInline && "mt-[-12px]",
                    step.isComplete ? "bg-emerald-500" : "bg-muted-foreground/15"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

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
