import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION } from "@/lib/config";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { AgentOnboardingStepDialog } from "@/components/admin/AgentOnboardingStepDialog";
import { Progress } from "@/components/ui/progress";
import { 
  User, FileText, Receipt, Landmark, GraduationCap, 
  Check, AlertTriangle, ChevronRight, Shield, Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVATION_BLOCKS = [
  { 
    stepId: 'basic' as const, 
    label: 'Identidad y Contrato', 
    description: 'INE, datos personales y contrato',
    icon: FileText,
    relatedSteps: ['basic', 'address', 'documents'] as const,
  },
  { 
    stepId: 'fiscal' as const, 
    label: 'Información Fiscal', 
    description: 'RFC, régimen fiscal y constancia',
    icon: Receipt,
    relatedSteps: ['fiscal'] as const,
  },
  { 
    stepId: 'bank-accounts' as const, 
    label: 'Cuenta Bancaria', 
    description: 'Banco, CLABE y titular',
    icon: Landmark,
    relatedSteps: ['bank-accounts'] as const,
  },
  { 
    stepId: 'training' as const, 
    label: 'Capacitación', 
    description: 'Agenda y completa tu capacitación',
    icon: GraduationCap,
    relatedSteps: ['training'] as const,
  },
];

const AgentPerfil = () => {
  const { profile } = useAuth();
  const personaId = profile?.id_persona;
  const { steps, completedCount, totalSteps, percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  const getBlockStatus = (relatedSteps: readonly string[]) => {
    const related = steps.filter(s => relatedSteps.includes(s.id));
    if (related.length === 0) return 'pending';
    if (related.every(s => s.isComplete)) return 'complete';
    if (related.some(s => s.hasPartialData || s.isComplete)) return 'partial';
    return 'pending';
  };

  const canReceivePayments = steps
    .filter(s => ['fiscal', 'bank-accounts', 'documents'].includes(s.id))
    .every(s => s.isComplete);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-primary))]" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-[hsl(var(--agent-primary))] flex items-center justify-center text-white font-bold text-lg shrink-0">
          {profile?.nombre?.[0]?.toUpperCase() || "A"}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[hsl(var(--agent-text))] truncate">
            {profile?.nombre || "Agente"}
          </h1>
          <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
            {profile?.rol_nombre || "Agente Inmobiliario"}
          </p>
        </div>
        {percentage === 100 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700">Verificado</span>
          </div>
        )}
      </div>

      {/* Progress Card */}
      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[hsl(var(--agent-text))]">
            Estado de tu perfil
          </span>
          <span className="text-sm font-bold text-[hsl(var(--agent-primary))]">
            {percentage}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className="h-2.5 bg-gray-100"
          style={{ 
            ['--progress-color' as string]: percentage === 100 
              ? 'hsl(var(--agent-primary))' 
              : 'hsl(var(--agent-amber))' 
          }}
        />
        <p className="text-xs text-[hsl(var(--agent-text-secondary))]">
          {completedCount} de {totalSteps} secciones completadas
        </p>
      </div>

      {/* Payment Warning */}
      {!canReceivePayments && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No puedes recibir pagos</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Completa tu información fiscal, documentos y cuenta bancaria para poder recibir comisiones.
            </p>
          </div>
        </div>
      )}

      {/* Activation Center */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[hsl(var(--agent-text))] px-1">
          Centro de Activación
        </h2>

        <div className="space-y-2">
          {ACTIVATION_BLOCKS.map((block) => {
            const status = getBlockStatus(block.relatedSteps);
            const Icon = block.icon;

            return (
              <button
                key={block.stepId}
                onClick={() => setActiveStep(block.stepId)}
                className={cn(
                  "w-full rounded-xl bg-white border p-4 flex items-center gap-3 transition-all active:scale-[0.98]",
                  status === 'complete' 
                    ? "border-emerald-200 shadow-sm" 
                    : "border-gray-100 shadow-sm hover:shadow-md"
                )}
              >
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                  status === 'complete'
                    ? "bg-emerald-50 text-emerald-600"
                    : status === 'partial'
                    ? "bg-amber-50 text-amber-600"
                    : "bg-gray-50 text-[hsl(var(--agent-text-secondary))]"
                )}>
                  {status === 'complete' ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                <div className="flex-1 text-left min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    status === 'complete' 
                      ? "text-emerald-700" 
                      : "text-[hsl(var(--agent-text))]"
                  )}>
                    {block.label}
                  </p>
                  <p className="text-xs text-[hsl(var(--agent-text-secondary))] truncate">
                    {block.description}
                  </p>
                </div>

                <ChevronRight className="h-4 w-4 text-[hsl(var(--agent-muted))] shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Step Circles */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[hsl(var(--agent-text))] px-1">
          Progreso detallado
        </h2>
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between gap-1">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setActiveStep(step.id)}
                  className="flex flex-col items-center gap-1 group"
                  title={step.label}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full h-8 w-8 text-xs font-bold transition-all",
                      step.isComplete
                        ? "bg-[hsl(var(--agent-primary))] text-white"
                        : step.hasCancelledData
                        ? "bg-red-500 text-white"
                        : step.hasPartialData
                        ? "border-2 border-[hsl(var(--agent-primary))] text-[hsl(var(--agent-primary))] bg-white"
                        : "bg-gray-100 text-[hsl(var(--agent-muted))]"
                    )}
                  >
                    {step.isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                  </div>
                  <span className={cn(
                    "text-[8px] font-medium text-center leading-tight max-w-[48px]",
                    step.isComplete
                      ? "text-[hsl(var(--agent-primary))]"
                      : "text-[hsl(var(--agent-muted))]"
                  )}>
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-0.5 rounded-full mt-[-14px]",
                    step.isComplete ? "bg-[hsl(var(--agent-primary))]" : "bg-gray-100"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Onboarding Step Dialog */}
      {activeStep && personaId && (
        <AgentOnboardingStepDialog
          step={activeStep}
          personaId={personaId}
          open={!!activeStep}
          onOpenChange={(open) => {
            if (!open) setActiveStep(null);
          }}
        />
      )}

      {/* Version */}
      <p className="text-center text-[10px] text-[hsl(var(--agent-muted))] pb-4 mt-6">
        {APP_VERSION}
      </p>
    </div>
  );
};

export default AgentPerfil;
