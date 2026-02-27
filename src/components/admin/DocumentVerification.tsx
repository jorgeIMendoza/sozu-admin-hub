import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, Camera, Check, X, AlertTriangle, 
  Shield, ShieldCheck, ShieldAlert, User, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";

// ============ Types ============

export interface VerificationResult {
  is_valid_document: boolean;
  document_type: "ine_frente" | "ine_reverso" | "pasaporte" | "otro" | "no_documento";
  confidence: number;
  full_name?: string | null;
  curp?: string | null;
  clave_elector?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: "H" | "M" | null;
  domicilio?: string | null;
  vigencia?: string | null;
  numero_identificacion?: string | null;
  is_expired?: boolean | null;
  authenticity_signals: string[];
  rejection_reason?: string | null;
  face_match?: boolean | null;
  face_match_confidence?: number | null;
  face_match_reason?: string | null;
}

interface PersonaData {
  nombre_legal?: string | null;
  curp?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: string | null;
}

// ============ Stability Detection Hook ============

export function useStabilityDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean,
  onStableCapture: () => void,
  initialDelayMs: number = 3000,
  requireDocumentPresence: boolean = true
) {
  const prevFrameRef = useRef<ImageData | null>(null);
  const stabilityMsRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [documentDetected, setDocumentDetected] = useState(false);
  const [initialDelayDone, setInitialDelayDone] = useState(false);
  const lastCheckRef = useRef(0);
  const enabledAtRef = useRef<number>(0);

  const STABILITY_THRESHOLD = 0.05;
  const STABILITY_DURATION = 1500; // 1.5s for reliable captures
  const CHECK_INTERVAL = 150;
  const SAMPLE_STEP = 12;
  const MIN_CONTENT_THRESHOLD = 0.30; // 30% edge ratio required
  const MIN_EDGE_CONTRAST = 40; // Higher contrast threshold to filter noise
  const MIN_QUADRANTS_WITH_EDGES = 3; // At least 3 of 4 quadrants must have edges
  const QUADRANT_EDGE_THRESHOLD = 0.05; // 5% edges per quadrant
  const MIN_SELFIE_CONTENT_THRESHOLD = 0.08; // Less strict for faces/selfies

  const checkStability = useCallback((timestamp: number) => {
    if (!enabled || !videoRef.current) {
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }

    // Initial delay: don't evaluate anything for the first N ms
    if (enabledAtRef.current > 0 && (timestamp - enabledAtRef.current) < initialDelayMs) {
      setInitialDelayDone(false);
      setDocumentDetected(false);
      setStabilityProgress(0);
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }
    if (!initialDelayDone) setInitialDelayDone(true);

    const elapsed = timestamp - lastCheckRef.current;
    if (elapsed < CHECK_INTERVAL) {
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }
    lastCheckRef.current = timestamp;

    const video = videoRef.current;
    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    const w = Math.min(video.videoWidth, 320);
    const h = Math.min(video.videoHeight, 240);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }

    ctx.drawImage(video, 0, 0, w, h);
    const currentFrame = ctx.getImageData(0, 0, w, h);

    if (prevFrameRef.current) {
      const prev = prevFrameRef.current.data;
      const curr = currentFrame.data;
      let diffCount = 0;
      let totalSampled = 0;
      let edgeCount = 0;

      // Quadrant edge tracking
      const halfW = w / 2;
      const halfH = h / 2;
      const quadrantEdges = [0, 0, 0, 0]; // TL, TR, BL, BR
      const quadrantSamples = [0, 0, 0, 0];

      for (let i = 0; i < curr.length; i += 4 * SAMPLE_STEP) {
        totalSampled++;
        const pixelIndex = i / 4;
        const px = pixelIndex % w;
        const py = Math.floor(pixelIndex / w);

        // Determine quadrant
        const qIdx = (py < halfH ? 0 : 2) + (px < halfW ? 0 : 1);
        quadrantSamples[qIdx]++;

        const dr = Math.abs(curr[i] - prev[i]);
        const dg = Math.abs(curr[i + 1] - prev[i + 1]);
        const db = Math.abs(curr[i + 2] - prev[i + 2]);
        if ((dr + dg + db) / 3 > 35) diffCount++;

        const luminance = curr[i] * 0.299 + curr[i + 1] * 0.587 + curr[i + 2] * 0.114;
        if (i + 4 * SAMPLE_STEP < curr.length) {
          const nextL = curr[i + 4 * SAMPLE_STEP] * 0.299 + curr[i + 4 * SAMPLE_STEP + 1] * 0.587 + curr[i + 4 * SAMPLE_STEP + 2] * 0.114;
          if (Math.abs(luminance - nextL) > MIN_EDGE_CONTRAST) {
            edgeCount++;
            quadrantEdges[qIdx]++;
          }
        }
      }

      const diffRatio = totalSampled > 0 ? diffCount / totalSampled : 1;
      const edgeRatio = totalSampled > 0 ? edgeCount / totalSampled : 0;

      // Check quadrant distribution: at least 3 of 4 quadrants must have significant edges
      let activeQuadrants = 0;
      for (let q = 0; q < 4; q++) {
        if (quadrantSamples[q] > 0 && (quadrantEdges[q] / quadrantSamples[q]) > QUADRANT_EDGE_THRESHOLD) {
          activeQuadrants++;
        }
      }

      const hasRequiredContent = requireDocumentPresence
        ? (edgeRatio > MIN_CONTENT_THRESHOLD && activeQuadrants >= MIN_QUADRANTS_WITH_EDGES)
        : edgeRatio > MIN_SELFIE_CONTENT_THRESHOLD;
      setDocumentDetected(hasRequiredContent);

      if (diffRatio < STABILITY_THRESHOLD && hasRequiredContent) {
        stabilityMsRef.current += CHECK_INTERVAL;
        const progress = Math.min(100, (stabilityMsRef.current / STABILITY_DURATION) * 100);
        setStabilityProgress(progress);

        if (stabilityMsRef.current >= STABILITY_DURATION) {
          onStableCapture();
          stabilityMsRef.current = 0;
          setStabilityProgress(0);
          setDocumentDetected(false);
          prevFrameRef.current = null;
          return;
        }
      } else {
        stabilityMsRef.current = 0;
        setStabilityProgress(0);
      }
    }

    prevFrameRef.current = currentFrame;
    animFrameRef.current = requestAnimationFrame(checkStability);
  }, [enabled, videoRef, onStableCapture, initialDelayMs, initialDelayDone, requireDocumentPresence]);

  useEffect(() => {
    if (enabled) {
      stabilityMsRef.current = 0;
      setStabilityProgress(0);
      setDocumentDetected(false);
      setInitialDelayDone(false);
      prevFrameRef.current = null;
      enabledAtRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(checkStability);
    } else {
      setDocumentDetected(false);
      setInitialDelayDone(false);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [enabled, checkStability]);

  return { stabilityProgress, documentDetected, initialDelayDone };
}

// ============ Flash Overlay ============

export function CaptureFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 bg-white z-[9999] pointer-events-none animate-[flash_300ms_ease-out_forwards]"
      style={{
        animation: "flash 300ms ease-out forwards",
      }}
    />
  );
}

// Add flash keyframes to global styles via style tag
const flashStyle = document.createElement("style");
flashStyle.textContent = `
@keyframes flash {
  0% { opacity: 0.8; }
  100% { opacity: 0; }
}
`;
if (!document.querySelector("[data-capture-flash]")) {
  flashStyle.setAttribute("data-capture-flash", "true");
  document.head.appendChild(flashStyle);
}

// ============ Selfie Camera Overlay ============

interface SelfieCameraProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  onCapture: () => void;
  onCancel: () => void;
  uploading: boolean;
  stabilityProgress: number;
  documentDetected: boolean;
  initialDelayDone: boolean;
}

export function SelfieCameraOverlay({
  videoRef,
  onCapture,
  onCancel,
  uploading,
  stabilityProgress,
  documentDetected,
  initialDelayDone,
}: SelfieCameraProps) {
  return (
    <div className="space-y-3 pb-4">
      <div className="text-center space-y-1">
        <h3 className="text-base font-bold text-foreground">Verifica tu identidad</h3>
        <p className="text-xs text-muted-foreground">Centra tu rostro en el óvalo</p>
      </div>

      {/* Camera with oval guide */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />

        {/* Dark overlay outside oval */}
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 300 400" preserveAspectRatio="none">
            <defs>
              <mask id="oval-mask">
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="175" rx="95" ry="125" fill="black" />
              </mask>
            </defs>
            <rect
              width="300"
              height="400"
              fill="rgba(0,0,0,0.6)"
              mask="url(#oval-mask)"
            />
            <ellipse
              cx="150"
              cy="175"
              rx="95"
              ry="125"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="8 4"
              opacity="0.8"
            />
          </svg>
        </div>

        {/* Stability indicator */}
        {stabilityProgress > 0 && stabilityProgress < 100 && (
          <div className="absolute bottom-3 left-4 right-4">
            <div className="bg-black/60 rounded-full px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] text-white/80">Mantén quieto...</span>
              <div className="flex-1">
                <Progress value={stabilityProgress} className="h-1.5 bg-white/20" />
              </div>
              <span className="text-[10px] text-white font-bold">
                {Math.round(stabilityProgress)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Capture button - large circle */}
      <div className="flex justify-center pt-1">
        <button
          onClick={onCapture}
          disabled={uploading}
          className="relative w-16 h-16 rounded-full bg-white border-4 border-white/60 shadow-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <Camera className="h-6 w-6 text-foreground" />
          )}
          {/* Progress ring around capture button */}
          {stabilityProgress > 0 && !uploading && (
            <svg className="absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90">
              <circle
                cx="50%"
                cy="50%"
                r="34"
                fill="none"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth="3"
                strokeDasharray={`${(stabilityProgress / 100) * 213.6} 213.6`}
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      <button
        onClick={onCancel}
        className="w-full py-3 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}

// ============ Document Camera with Stability ============

interface DocCameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraStep: "front" | "back" | "passport";
  onCapture: () => void;
  onCancel: () => void;
  uploading: boolean;
  stabilityProgress: number;
  documentDetected: boolean;
  initialDelayDone: boolean;
}

export function DocCameraOverlay({
  videoRef,
  cameraStep,
  onCapture,
  onCancel,
  uploading,
  stabilityProgress,
  documentDetected,
  initialDelayDone,
}: DocCameraOverlayProps) {
  const stepLabel =
    cameraStep === "front"
      ? "Foto frontal del INE"
      : cameraStep === "back"
      ? "Foto reverso del INE"
      : "Foto del Pasaporte";

  // Dynamic hint based on detection state
  const stepHint = !initialDelayDone
    ? "Preparando cámara... posiciona tu documento"
    : !documentDetected
    ? "Coloca tu documento dentro del marco"
    : "Documento detectado, mantén quieto...";

  // Border color based on state
  const borderColor = !initialDelayDone
    ? "border-muted-foreground/40"
    : documentDetected
    ? "border-emerald-500"
    : "border-amber-500";

  // Corner guide color
  const cornerColor = !initialDelayDone
    ? "border-muted-foreground"
    : documentDetected
    ? "border-emerald-400"
    : "border-amber-400";

  return (
    <div className="space-y-3 pb-4">
      <div className="text-center space-y-1">
        <h3 className="text-base font-bold text-foreground">{stepLabel}</h3>
        <p className={cn(
          "text-xs font-medium transition-colors duration-300",
          !initialDelayDone
            ? "text-muted-foreground"
            : documentDetected
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400"
        )}>
          {stepHint}
        </p>
      </div>

      {/* Camera viewfinder */}
      <div className={cn(
        "relative rounded-2xl overflow-hidden border-2 border-dashed bg-black aspect-[4/3] transition-colors duration-300",
        borderColor
      )}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {/* Corner frame guides */}
        <div className="absolute inset-4 pointer-events-none">
          <div className={cn("absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg transition-colors duration-300", cornerColor)} />
          <div className={cn("absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg transition-colors duration-300", cornerColor)} />
          <div className={cn("absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg transition-colors duration-300", cornerColor)} />
          <div className={cn("absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-lg transition-colors duration-300", cornerColor)} />
        </div>
        {/* Step indicator for INE */}
        {cameraStep !== "passport" && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            {cameraStep === "front" ? "1/2" : "2/2"}
          </div>
        )}

        {/* Detection status indicator */}
        {initialDelayDone && (
          <div className="absolute top-2 left-2">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-colors duration-300",
              documentDetected
                ? "bg-emerald-500/80 text-white"
                : "bg-amber-500/80 text-white"
            )}>
              {documentDetected ? (
                <><Check className="h-3 w-3" /> Detectado</>
              ) : (
                <><Eye className="h-3 w-3" /> Buscando...</>
              )}
            </div>
          </div>
        )}

        {/* Initial delay indicator */}
        {!initialDelayDone && (
          <div className="absolute bottom-3 left-4 right-4">
            <div className="bg-black/60 rounded-full px-3 py-1.5 flex items-center gap-2 justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-white/80" />
              <span className="text-[10px] text-white/80">Posiciona tu documento...</span>
            </div>
          </div>
        )}

        {/* Stability indicator */}
        {initialDelayDone && stabilityProgress > 0 && stabilityProgress < 100 && (
          <div className="absolute bottom-3 left-4 right-4">
            <div className="bg-black/60 rounded-full px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] text-white/80">Mantén quieto...</span>
              <div className="flex-1">
                <Progress value={stabilityProgress} className="h-1.5 bg-white/20" />
              </div>
              <span className="text-[10px] text-white font-bold">
                {Math.round(stabilityProgress)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <canvas className="hidden" />

      {/* Capture button with progress ring */}
      <button
        onClick={onCapture}
        disabled={uploading}
        className="relative w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
          </>
        ) : (
          <>
            <Camera className="h-5 w-5" />
            {cameraStep === "front"
              ? "Capturar frente del INE"
              : cameraStep === "back"
              ? "Capturar reverso del INE"
              : "Capturar Pasaporte"}
          </>
        )}
      </button>

      <button
        onClick={onCancel}
        className="w-full py-3 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}

// ============ Verification Comparator Panel ============

interface VerificationComparatorProps {
  result: VerificationResult;
  persona: PersonaData;
  personaId: number;
  documentId: number; // The document record ID to update
  onAccepted: () => void;
  onRejected: () => void;
}

interface ComparableField {
  label: string;
  docValue: string | null | undefined;
  profileValue: string | null | undefined;
  personaField?: string; // Field name in personas table
  documentField?: string; // Field name in documentos table
  saveable: boolean; // Whether this field can be saved
  alwaysSave?: boolean; // Always saved automatically (e.g., numero_identificacion)
}

export function VerificationComparator({
  result,
  persona,
  personaId,
  documentId,
  onAccepted,
  onRejected,
}: VerificationComparatorProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);

  // Auto-fire confetti when verification result is positive
  useEffect(() => {
    if (celebrationShown) return;
    const isSuccess = result.is_valid_document && result.confidence >= 70 && 
      (result.face_match === true || result.face_match === null || result.face_match === undefined);
    if (isSuccess) {
      setCelebrationShown(true);
      // Confetti burst
      const end = Date.now() + 2000;
      const frame = () => {
        confetti({
          particleCount: 6,
          angle: 60,
          spread: 65,
          origin: { x: 0, y: 0.6 },
          colors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24', '#22c55e'],
        });
        confetti({
          particleCount: 6,
          angle: 120,
          spread: 65,
          origin: { x: 1, y: 0.6 },
          colors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24', '#22c55e'],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [result, celebrationShown]);

  // Build the comparable fields
  const fields: ComparableField[] = [
    {
      label: "Nombre completo",
      docValue: result.full_name,
      profileValue: persona.nombre_legal,
      personaField: "nombre_legal",
      saveable: true,
    },
    {
      label: "CURP",
      docValue: result.curp,
      profileValue: persona.curp,
      personaField: "curp",
      saveable: true,
    },
    {
      label: "Fecha nacimiento",
      docValue: result.fecha_nacimiento,
      profileValue: persona.fecha_nacimiento,
      personaField: "fecha_nacimiento",
      saveable: true,
    },
    {
      label: "Sexo",
      docValue: result.sexo,
      profileValue: persona.sexo,
      personaField: "sexo",
      saveable: true,
    },
    {
      label: "Clave elector",
      docValue: result.clave_elector,
      profileValue: undefined,
      saveable: false,
    },
    {
      label: "Vigencia",
      docValue: result.vigencia,
      profileValue: undefined,
      saveable: false,
    },
    {
      label: "Núm. identificación",
      docValue: result.numero_identificacion,
      profileValue: undefined,
      documentField: "numero",
      saveable: true,
      alwaysSave: true,
    },
  ];

  // Initialize checkboxes: pre-checked when profile is empty or differs
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    fields.forEach((f) => {
      if (!f.saveable || !f.docValue) return;
      if (f.alwaysSave) {
        initial[f.label] = true;
        return;
      }
      const profileEmpty = !f.profileValue || f.profileValue.trim() === "";
      const differs = f.profileValue && f.docValue && 
        f.profileValue.trim().toUpperCase() !== f.docValue.trim().toUpperCase();
      initial[f.label] = profileEmpty || !!differs;
    });
    return initial;
  });

  const getMatchStatus = (f: ComparableField) => {
    if (!f.docValue) return "empty";
    if (!f.saveable || f.profileValue === undefined) return "info"; // info-only field
    if (!f.profileValue || f.profileValue.trim() === "") return "missing";
    if (f.profileValue.trim().toUpperCase() === f.docValue.trim().toUpperCase()) return "match";
    // Check partial match (contains)
    if (
      f.profileValue.trim().toUpperCase().includes(f.docValue.trim().toUpperCase().substring(0, 5)) ||
      f.docValue.trim().toUpperCase().includes(f.profileValue.trim().toUpperCase().substring(0, 5))
    )
      return "partial";
    return "differs";
  };

  const handleSaveAndAccept = async () => {
    setSaving(true);
    try {
      // Build persona update
      const personaUpdate: Record<string, any> = {};
      fields.forEach((f) => {
        if (!f.saveable || !f.personaField || !f.docValue || !checkedFields[f.label]) return;
        if (f.personaField === "fecha_nacimiento" && f.docValue) {
          // Convert DD/MM/YYYY to YYYY-MM-DD
          const parts = f.docValue.split("/");
          if (parts.length === 3) {
            personaUpdate[f.personaField] = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        } else {
          personaUpdate[f.personaField] = f.docValue;
        }
      });

      // Update persona if there are fields to update
      if (Object.keys(personaUpdate).length > 0) {
        const { error } = await supabase
          .from("personas")
          .update(personaUpdate)
          .eq("id", personaId);
        if (error) throw error;
      }

      // Update document numero and verification status
      const docUpdate: Record<string, any> = {
        id_estatus_verificacion: 2, // Validado
      };
      const numField = fields.find((f) => f.documentField === "numero");
      if (numField?.docValue && checkedFields[numField.label]) {
        docUpdate.numero = numField.docValue;
      }

      const { error: docError } = await supabase
        .from("documentos")
        .update(docUpdate)
        .eq("id", documentId);
      if (docError) throw docError;

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-persona"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-step-persona"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs-detail"] });

      toast.success("Documento verificado y datos actualizados");
      
      // Fire confetti celebration
      const duration = 2500;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24'],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24'],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();

      onAccepted();
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    setSaving(true);
    try {
      await supabase
        .from("documentos")
        .update({ activo: false })
        .eq("id", documentId);

      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs-detail"] });

      toast.info("Documento rechazado. Captura de nuevo.");
      onRejected();
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const confidenceColor =
    result.confidence >= 80
      ? "text-emerald-600"
      : result.confidence >= 50
      ? "text-amber-600"
      : "text-destructive";

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Verificación de documento</h3>
      </div>

      {/* Success celebration banner */}
      {result.is_valid_document && result.confidence >= 70 && result.face_match === true && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 p-4 text-white text-center space-y-1 animate-scale-in shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            <span className="text-base font-bold">¡Identidad verificada!</span>
          </div>
          <p className="text-xs text-white/90">
            El documento es auténtico y coincide con la selfie
          </p>
        </div>
      )}

      {/* Validity + Confidence */}
      <div className="flex items-center gap-3">
        {result.is_valid_document ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Documento válido
          </Badge>
        ) : (
          <Badge variant="destructive">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Documento inválido
          </Badge>
        )}
        <span className={cn("text-xs font-bold", confidenceColor)}>
          Confianza: {result.confidence}%
        </span>
        {!result.is_valid_document && result.document_type === "no_documento" && (
          <Badge variant="destructive" className="text-[10px]">
            No es una identificación
          </Badge>
        )}
      </div>

      {/* Expiry warning */}
      {result.is_expired && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">
            El documento está vencido
          </span>
        </div>
      )}

      {/* Rejection reason */}
      {result.rejection_reason && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-2.5">
          <p className="text-xs text-destructive">{result.rejection_reason}</p>
        </div>
      )}

      {/* Data comparison table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-0 text-[10px] font-semibold text-muted-foreground bg-muted/50 px-3 py-2 border-b">
          <span>Dato</span>
          <span>Documento</span>
          <span>Perfil</span>
          <span className="text-center w-10">Guardar</span>
        </div>
        {fields
          .filter((f) => f.docValue) // Only show fields with extracted data
          .map((f) => {
            const status = getMatchStatus(f);
            const StatusIcon =
              status === "match"
                ? Check
                : status === "partial"
                ? Eye
                : status === "missing"
                ? AlertTriangle
                : status === "differs"
                ? X
                : null;
            const statusColor =
              status === "match"
                ? "text-emerald-500"
                : status === "partial"
                ? "text-amber-500"
                : status === "missing"
                ? "text-muted-foreground"
                : status === "differs"
                ? "text-destructive"
                : "text-muted-foreground";

            return (
              <div
                key={f.label}
                className="grid grid-cols-[1fr_1fr_1fr_auto] gap-0 px-3 py-2 border-b last:border-0 items-center"
              >
                <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                  {f.label}
                  {StatusIcon && <StatusIcon className={cn("h-3 w-3", statusColor)} />}
                </span>
                <span className="text-[11px] text-foreground truncate pr-1">
                  {f.docValue || "—"}
                </span>
                <span className="text-[11px] text-muted-foreground truncate pr-1">
                  {f.profileValue || (f.saveable ? "(vacío)" : "—")}
                </span>
                <div className="w-10 flex justify-center">
                  {f.saveable && f.docValue ? (
                    f.alwaysSave ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Checkbox
                        checked={checkedFields[f.label] ?? false}
                        onCheckedChange={(checked) =>
                          setCheckedFields((prev) => ({
                            ...prev,
                            [f.label]: !!checked,
                          }))
                        }
                        className="h-4 w-4"
                      />
                    )
                  ) : (
                    <span className="text-[10px] text-muted-foreground">n/a</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Authenticity signals */}
      {result.authenticity_signals.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            Señales de autenticidad
          </span>
          <div className="flex flex-wrap gap-1.5">
            {result.authenticity_signals.map((signal, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <Check className="h-2.5 w-2.5 mr-0.5" />
                {signal}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Face match */}
      {result.face_match !== null && result.face_match !== undefined && (
        <div
          className={cn(
            "rounded-xl border p-3 flex items-center gap-2.5",
            result.face_match
              ? "bg-emerald-50 border-emerald-200"
              : "bg-destructive/10 border-destructive/20"
          )}
        >
          <User className={cn("h-5 w-5", result.face_match ? "text-emerald-600" : "text-destructive")} />
          <div className="flex-1">
            <p className={cn("text-xs font-semibold", result.face_match ? "text-emerald-700" : "text-destructive")}>
              {result.face_match ? "Coincidencia facial" : "No hay coincidencia facial"}
            </p>
            {result.face_match_confidence != null && (
              <p className="text-[10px] text-muted-foreground">
                Confianza: {result.face_match_confidence}%
                {result.face_match_reason ? ` — ${result.face_match_reason}` : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSaveAndAccept}
          disabled={saving || (!result.is_valid_document && result.confidence < 50)}
          className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Guardar y aceptar
        </Button>
        <Button
          onClick={handleReject}
          disabled={saving}
          variant="outline"
          className="h-12 rounded-2xl px-4 text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
