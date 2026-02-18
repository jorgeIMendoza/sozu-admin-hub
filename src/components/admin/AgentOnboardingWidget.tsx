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
      <div className="flex items-center gap-2 justify-center px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <Trophy className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Perfil completo</span>
      </div>
    );
  }

  const isInline = variant === 'inline';

  return (
    <>
      <div className={cn(isInline ? "" : "bg-card border-b px-4 py-3")}>
        {/* Title + progress */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-bold text-foreground whitespace-nowrap">Perfil {percentage}%</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${percentage}%`,
                background: percentage < 70
                  ? 'linear-gradient(90deg, hsl(210 80% 55%), hsl(220 85% 60%))'
                  : 'linear-gradient(90deg, hsl(142 76% 36%), hsl(158 64% 38%))',
                boxShadow: percentage < 70
                  ? '0 2px 8px hsla(210 80% 55% / 0.4)'
                  : '0 2px 8px hsla(142 76% 36% / 0.4)',
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
                  className="flex flex-col items-center gap-1 group"
                  title={step.label}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full font-bold transition-all duration-300",
                      isInline ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-sm",
                      step.isComplete
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_3px_12px_-2px_hsla(142,76%,36%,0.5)]"
                        : isSelected
                        ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_3px_12px_-2px_hsla(210,80%,55%,0.5)] ring-3 ring-blue-400/30 ring-offset-1 ring-offset-background"
                        : step.hasPartialData
                        ? "bg-gradient-to-br from-blue-300 to-blue-500 text-white shadow-[0_3px_10px_-2px_hsla(210,80%,55%,0.35)]"
                        : "bg-muted border-2 border-muted-foreground/15 text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted-foreground/5"
                    )}
                  >
                    {step.isComplete ? <Check className={cn(isInline ? "h-3 w-3" : "h-4 w-4")} strokeWidth={3} /> : num}
                  </div>
                  <span className={cn(
                    "leading-tight font-semibold text-center max-w-[52px] transition-colors",
                    isInline ? "text-[8px]" : "text-[9px]",
                    step.isComplete
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : step.hasPartialData
                      ? "text-blue-500 dark:text-blue-400"
                      : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </button>

                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 rounded-full mx-1 transition-all duration-300",
                    isInline ? "h-0.5" : "h-[3px] mt-[-14px]",
                    step.isComplete ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-muted-foreground/10"
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
