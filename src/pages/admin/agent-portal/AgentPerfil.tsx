import { useState } from "react";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION } from "@/lib/config";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { AgentOnboardingStepDialog } from "@/components/admin/AgentOnboardingStepDialog";
import { 
  FileText, Receipt, Landmark, GraduationCap, 
  Check, AlertTriangle, ChevronRight, Loader2, LogOut 
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVATION_BLOCKS = [
  { 
    stepId: 'basic' as const, 
    label: 'Identidad', 
    description: 'Datos personales, dirección, INE y contrato',
    icon: FileText,
    relatedSteps: ['basic'] as const,
  },
  { 
    stepId: 'fiscal' as const, 
    label: 'Información fiscal', 
    description: 'RFC, régimen fiscal y constancia',
    icon: Receipt,
    relatedSteps: ['fiscal'] as const,
  },
  { 
    stepId: 'bank-accounts' as const, 
    label: 'Cuenta bancaria', 
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
  const { profile, signOut } = useAuth();
  const personaId = profile?.id_persona;
  const { steps, completedCount, totalSteps, percentage, isLoading } = useAgentOnboardingStatus(personaId);
  const { permissions } = useAgentPortalPermissions();
  const perfilPerms = permissions['/admin/agent/perfil'];
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  const getBlockStatus = (relatedSteps: readonly string[]) => {
    const related = steps.filter(s => relatedSteps.includes(s.id));
    if (related.length === 0) return 'pending';
    if (related.every(s => s.isComplete)) return 'complete';
    if (related.some(s => s.hasPartialData || s.isComplete)) return 'partial';
    return 'pending';
  };

  const canReceivePayments = steps
    .filter(s => ['fiscal', 'bank-accounts'].includes(s.id))
    .every(s => s.isComplete);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-primary))]" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <AgentPortalHeader />
      <div className="p-4 space-y-5">
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
      </div>

      {/* Progress Steps - 4 step indicators */}
      <div className="rounded-xl bg-white p-4 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[hsl(var(--agent-text))]">
            Progreso
          </span>
        </div>
        <div className="flex items-center gap-0">
          {steps.map((step, index) => {
            const block = ACTIVATION_BLOCKS[index];
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  className="flex flex-col items-center gap-1 cursor-pointer"
                  onClick={() => perfilPerms.canUpdate && setActiveStep(step.id)}
                  disabled={!perfilPerms.canUpdate}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                      step.isComplete
                        ? "bg-emerald-500 text-white"
                        : step.hasPartialData
                        ? "bg-amber-500/70 text-white"
                        : "bg-gray-200 text-gray-500"
                    )}
                  >
                    {step.isComplete ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                  </div>
                  <span className={cn(
                    "text-[9px] font-medium text-center max-w-[64px] leading-tight",
                    step.isComplete
                      ? "text-emerald-600"
                      : step.hasPartialData
                      ? "text-amber-600"
                      : "text-gray-400"
                  )}>
                    {block?.label || step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-[2px] mx-1 mt-[-14px] rounded-full",
                    step.isComplete ? "bg-emerald-400" : "bg-gray-200"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Warning */}
      {!canReceivePayments && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">No puedes recibir pagos</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Completa tu información fiscal y cuenta bancaria para poder recibir comisiones.
            </p>
          </div>
        </div>
      )}

      {/* Etapas de activación */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[hsl(var(--agent-text))] px-1">
          Etapas de activación
        </h2>

        <div className="space-y-2">
          {ACTIVATION_BLOCKS.map((block, index) => {
            const status = getBlockStatus(block.relatedSteps);
            const Icon = block.icon;

            return (
              <button
                key={block.stepId}
                onClick={() => perfilPerms.canUpdate && setActiveStep(block.stepId)}
                disabled={!perfilPerms.canUpdate}
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
                    {index + 1}. {block.label}
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

      <div className="pt-2 pb-1">
        <button
          onClick={signOut}
          className="w-full rounded-xl border border-destructive/20 bg-destructive/5 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-[10px] text-[hsl(var(--agent-muted))] pb-4 mt-2">
        {APP_VERSION}
      </p>
      </div>
    </div>
  );
};

export default AgentPerfil;
