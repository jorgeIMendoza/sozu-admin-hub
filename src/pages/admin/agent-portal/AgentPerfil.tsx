import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { APP_VERSION } from "@/lib/config";
import { useAgentOnboardingStatus, type OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { AgentOnboardingStepDialog } from "@/components/admin/AgentOnboardingStepDialog";
import { 
  FileText, Receipt, Landmark, GraduationCap, 
  Check, AlertTriangle, ChevronRight, Loader2, LogOut 
} from "lucide-react";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

const ACTIVATION_BLOCKS = [
  { 
    stepId: 'basic' as const, 
    label: 'Identidad', 
    description: 'Datos personales, dirección e INE',
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
  const { impersonatedAgentPersonaId, impersonatedAgentName, isImpersonating } = useAgentImpersonation();
  const isAgentRole = profile?.rol_nombre === 'Agente Inmobiliario';
  const personaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const displayName = isImpersonating ? impersonatedAgentName : profile?.nombre;
  const { steps, completedCount, totalSteps, percentage, isLoading, missingByStep } = useAgentOnboardingStatus(personaId);
  const { permissions } = useAgentPortalPermissions();
  const perfilPerms = permissions['/admin/agent/perfil'];
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  // Fetch agency name for this agent
  const { data: agencyName } = useQuery({
    queryKey: ['agent-agency', personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select('personas!entidades_relacionadas_id_persona_duena_lead_fkey(nombre_legal)')
        .eq('id_persona', personaId)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true)
        .not('id_persona_duena_lead', 'is', null)
        .limit(1)
        .maybeSingle();
      return (data?.personas as any)?.nombre_legal || null;
    },
    enabled: !!personaId,
    staleTime: Infinity,
  });

  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);
  const confettiFiredRef = useRef(false);
  const prevPercentageRef = useRef<number | null>(null);
  const [showTrumpets, setShowTrumpets] = useState(false);

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/perfil');
    track({ page: 'agent_perfil', elementId: 'page_view', elementType: 'page' });
  }, []);

  // Play celebration fanfare — louder, longer, richer
  const playCelebrationSound = useCallback(async () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const master = audioCtx.createGain();
      master.gain.value = 0.55; // Much louder
      master.connect(audioCtx.destination);

      // Brass-like fanfare: two oscillators per note for richness
      const notes = [
        { freq: 523.25, start: 0, dur: 0.20 },
        { freq: 659.25, start: 0.18, dur: 0.20 },
        { freq: 783.99, start: 0.36, dur: 0.22 },
        { freq: 1046.5, start: 0.56, dur: 0.50 },
        { freq: 783.99, start: 1.10, dur: 0.14 },
        { freq: 880.0,  start: 1.24, dur: 0.14 },
        { freq: 1046.5, start: 1.38, dur: 0.18 },
        { freq: 1174.66, start: 1.56, dur: 0.60 },
        { freq: 1318.51, start: 2.20, dur: 0.70 },
      ];

      notes.forEach(({ freq, start, dur }) => {
        // Primary oscillator — sawtooth for brass timbre
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        gain1.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain1.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + start + 0.025);
        gain1.gain.setValueAtTime(0.15, audioCtx.currentTime + start + 0.06);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc1.connect(gain1);
        gain1.connect(master);
        osc1.start(audioCtx.currentTime + start);
        osc1.stop(audioCtx.currentTime + start + dur + 0.05);

        // Second oscillator — triangle an octave below for warmth
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 0.5, audioCtx.currentTime + start);
        gain2.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain2.gain.linearRampToValueAtTime(0.10, audioCtx.currentTime + start + 0.03);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc2.connect(gain2);
        gain2.connect(master);
        osc2.start(audioCtx.currentTime + start);
        osc2.stop(audioCtx.currentTime + start + dur + 0.05);
      });
    } catch (e) {
      // Audio no soportado/bloqueado
    }
  }, []);

  // Fire confetti + streamers + trumpets when profile reaches 100% FOR THE FIRST TIME EVER
  const celebrationStorageKey = `agent_celebration_fired_${personaId}`;
  useEffect(() => {
    if (!isLoading && percentage === 100 && !confettiFiredRef.current) {
      const alreadyCelebrated = localStorage.getItem(celebrationStorageKey);
      if (!alreadyCelebrated) {
        confettiFiredRef.current = true;
        localStorage.setItem(celebrationStorageKey, 'true');

        // Show trumpet overlay
        setShowTrumpets(true);
        setTimeout(() => setShowTrumpets(false), 3500);

        // Play fanfare
        playCelebrationSound();

        // Confetti burst
        const duration = 3500;
        const end = Date.now() + duration;
        const colors = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24', '#f97316', '#ec4899', '#8b5cf6'];

        // Initial big burst
        confetti({ particleCount: 80, spread: 100, origin: { x: 0.5, y: 0.4 }, colors, startVelocity: 45 });

        // Streamers (long thin ribbons) from sides
        const launchStreamers = () => {
          // Left side streamers
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 30,
            origin: { x: 0, y: 0.5 },
            colors,
            shapes: ['square'],
            scalar: 2.2,
            drift: 0.8,
            gravity: 0.6,
            ticks: 300,
          });
          // Right side streamers
          confetti({
            particleCount: 3,
            angle: 120,
            spread: 30,
            origin: { x: 1, y: 0.5 },
            colors,
            shapes: ['square'],
            scalar: 2.2,
            drift: -0.8,
            gravity: 0.6,
            ticks: 300,
          });
        };

        // Continuous confetti + streamers
        const frame = () => {
          confetti({
            particleCount: 4,
            angle: 60,
            spread: 65,
            origin: { x: 0, y: 0.7 },
            colors,
            shapes: ['circle', 'square'],
          });
          confetti({
            particleCount: 4,
            angle: 120,
            spread: 65,
            origin: { x: 1, y: 0.7 },
            colors,
            shapes: ['circle', 'square'],
          });
          launchStreamers();
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      }
    }
  }, [percentage, isLoading, playCelebrationSound, celebrationStorageKey]);

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
    <div className="pb-24 relative">
      {/* Trumpet celebration overlay */}
      {showTrumpets && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          {/* Left trumpet */}
          <div className="absolute left-4 top-1/3 animate-fade-in" style={{ animationDuration: '0.4s' }}>
            <div className="text-6xl animate-bounce" style={{ animationDuration: '0.6s' }}>🎺</div>
          </div>
          {/* Right trumpet (mirrored) */}
          <div className="absolute right-4 top-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.15s', animationFillMode: 'both' }}>
            <div className="text-6xl animate-bounce scale-x-[-1]" style={{ animationDuration: '0.6s' }}>🎺</div>
          </div>
          {/* Center celebration text */}
          <div className="animate-scale-in flex flex-col items-center gap-2" style={{ animationDuration: '0.5s', animationDelay: '0.3s', animationFillMode: 'both' }}>
            <span className="text-5xl">🎉</span>
            <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl">
              <p className="text-lg font-bold text-center">¡Perfil completo!</p>
              <p className="text-xs text-emerald-100 text-center">Ya puedes recibir comisiones</p>
            </div>
          </div>
          {/* Bottom trumpets */}
          <div className="absolute left-1/4 bottom-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.25s', animationFillMode: 'both' }}>
            <div className="text-4xl animate-bounce" style={{ animationDuration: '0.7s' }}>🎺</div>
          </div>
          <div className="absolute right-1/4 bottom-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.35s', animationFillMode: 'both' }}>
            <div className="text-4xl animate-bounce scale-x-[-1]" style={{ animationDuration: '0.7s' }}>🎺</div>
          </div>
        </div>
      )}
      <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-[hsl(var(--agent-primary))] flex items-center justify-center text-white font-bold text-lg shrink-0">
          {(displayName || "A")[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[hsl(var(--agent-text))] truncate">
            {displayName || "Agente"}
          </h1>
          <p className="text-sm text-[hsl(var(--agent-text-secondary))]">
            {profile?.rol_nombre || "Agente Inmobiliario"}
          </p>
          {agencyName && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-[hsl(var(--agent-text-secondary))]">
                {agencyName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Steps */}
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
                  onClick={() => {
                    if (perfilPerms.canUpdate) {
                      track({ page: 'agent_perfil', elementId: 'btn_etapa_onboarding', elementLabel: block?.label || step.label, metadata: { step_id: step.id } });
                      setActiveStep(step.id);
                    }
                  }}
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
      {isAgentRole && !canReceivePayments && (
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
                onClick={() => {
                  if (perfilPerms.canUpdate) {
                    track({ page: 'agent_perfil', elementId: 'btn_etapa_onboarding', elementLabel: block.label, metadata: { step_id: block.stepId } });
                    setActiveStep(block.stepId);
                  }
                }}
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
          onClick={() => {
            track({ page: 'agent_perfil', elementId: 'btn_cerrar_sesion', elementLabel: 'Cerrar sesión' });
            signOut();
          }}
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
