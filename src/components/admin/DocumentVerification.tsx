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
  const [alignmentProgress, setAlignmentProgress] = useState(0);
  const [alignedQuadrants, setAlignedQuadrants] = useState({ tl: false, tr: false, bl: false, br: false });
  const lastCheckRef = useRef(0);
  const enabledAtRef = useRef<number>(0);
  // Use refs to avoid recreating the callback when state changes
  const initialDelayDoneRef = useRef(false);
  const onStableCaptureRef = useRef(onStableCapture);
  onStableCaptureRef.current = onStableCapture;

  const STABILITY_DURATION = 1500;
  const SELFIE_STABILITY_DURATION = 2000;
  const CHECK_INTERVAL = 120;
  const SAMPLE_STEP = 6;
  const MIN_CONTENT_THRESHOLD = 0.12;
  const MIN_EDGE_CONTRAST = 30;
  const MIN_SELFIE_CONTENT_THRESHOLD = 0.08;
  const MIN_SELFIE_EDGE_CONTRAST = 25;
  const QUADRANT_EDGE_RATIO_THRESHOLD = 0.04;
  const MIN_QUADRANTS_WITH_EDGES = 2;
  const STRONG_DOC_EDGE_RATIO_THRESHOLD = 0.18;
  const DOC_STABILITY_THRESHOLD = 0.14;
  const SELFIE_STABILITY_THRESHOLD = 0.12;
  const PIXEL_DIFF_THRESHOLD = 25;

  const DOC_REGION = { x: 0.04, y: 0.08, w: 0.92, h: 0.84 };
  const OVAL_CX = 0.50;
  const OVAL_CY = 0.44;
  const OVAL_RX = 0.36;
  const OVAL_RY = 0.35;

  // Stable callback ref that doesn't cause re-renders
  const checkStability = useCallback((timestamp: number) => {
    if (!enabled || !videoRef.current) {
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }

    // Initial delay
    if (enabledAtRef.current > 0 && (timestamp - enabledAtRef.current) < initialDelayMs) {
      if (initialDelayDoneRef.current) {
        initialDelayDoneRef.current = false;
        setInitialDelayDone(false);
      }
      animFrameRef.current = requestAnimationFrame(checkStability);
      return;
    }
    if (!initialDelayDoneRef.current) {
      initialDelayDoneRef.current = true;
      setInitialDelayDone(true);
    }

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
      const edgeQuadrants = { tl: 0, tr: 0, bl: 0, br: 0 };
      const sampledQuadrants = { tl: 0, tr: 0, bl: 0, br: 0 };

      const docLeft = DOC_REGION.x * w;
      const docTop = DOC_REGION.y * h;
      const docRight = (DOC_REGION.x + DOC_REGION.w) * w;
      const docBottom = (DOC_REGION.y + DOC_REGION.h) * h;
      const docMidX = docLeft + (DOC_REGION.w * w) / 2;
      const docMidY = docTop + (DOC_REGION.h * h) / 2;

      for (let i = 0; i < curr.length; i += 4 * SAMPLE_STEP) {
        const pixelIndex = i / 4;
        const px = pixelIndex % w;
        const py = Math.floor(pixelIndex / w);

        // Region check inlined for performance
        let insideRegion: boolean;
        if (requireDocumentPresence) {
          insideRegion = px >= docLeft && px <= docRight && py >= docTop && py <= docBottom;
        } else {
          const cx = OVAL_CX * w;
          const cy = OVAL_CY * h;
          const rx = OVAL_RX * w;
          const ry = OVAL_RY * h;
          const dx = (px - cx) / rx;
          const dy = (py - cy) / ry;
          insideRegion = (dx * dx + dy * dy) <= 1;
        }
        if (!insideRegion) continue;

        totalSampled++;

        let quadrant: keyof typeof edgeQuadrants | null = null;
        if (requireDocumentPresence) {
          if (px < docMidX && py < docMidY) quadrant = "tl";
          else if (px >= docMidX && py < docMidY) quadrant = "tr";
          else if (px < docMidX && py >= docMidY) quadrant = "bl";
          else quadrant = "br";
          sampledQuadrants[quadrant]++;
        }

        const dr = Math.abs(curr[i] - prev[i]);
        const dg = Math.abs(curr[i + 1] - prev[i + 1]);
        const db = Math.abs(curr[i + 2] - prev[i + 2]);
        if ((dr + dg + db) / 3 > PIXEL_DIFF_THRESHOLD) diffCount++;

        const luminance = curr[i] * 0.299 + curr[i + 1] * 0.587 + curr[i + 2] * 0.114;
        if (i + 4 * SAMPLE_STEP < curr.length) {
          const nextL = curr[i + 4 * SAMPLE_STEP] * 0.299 + curr[i + 4 * SAMPLE_STEP + 1] * 0.587 + curr[i + 4 * SAMPLE_STEP + 2] * 0.114;
        const edgeContrast = requireDocumentPresence ? MIN_EDGE_CONTRAST : MIN_SELFIE_EDGE_CONTRAST;
          if (Math.abs(luminance - nextL) > edgeContrast) {
            edgeCount++;
            if (quadrant) edgeQuadrants[quadrant]++;
          }
        }
      }

      const diffRatio = totalSampled > 0 ? diffCount / totalSampled : 1;
      const edgeRatio = totalSampled > 0 ? edgeCount / totalSampled : 0;

      const threshold = requireDocumentPresence ? MIN_CONTENT_THRESHOLD : MIN_SELFIE_CONTENT_THRESHOLD;
      let hasContent = edgeRatio > threshold;

      if (requireDocumentPresence) {
        const quadrantRatios = {
          tl: sampledQuadrants.tl > 0 ? edgeQuadrants.tl / sampledQuadrants.tl : 0,
          tr: sampledQuadrants.tr > 0 ? edgeQuadrants.tr / sampledQuadrants.tr : 0,
          bl: sampledQuadrants.bl > 0 ? edgeQuadrants.bl / sampledQuadrants.bl : 0,
          br: sampledQuadrants.br > 0 ? edgeQuadrants.br / sampledQuadrants.br : 0,
        };

        const nextAlignedQuadrants = {
          tl: quadrantRatios.tl >= QUADRANT_EDGE_RATIO_THRESHOLD,
          tr: quadrantRatios.tr >= QUADRANT_EDGE_RATIO_THRESHOLD,
          bl: quadrantRatios.bl >= QUADRANT_EDGE_RATIO_THRESHOLD,
          br: quadrantRatios.br >= QUADRANT_EDGE_RATIO_THRESHOLD,
        };

        const activeQuadrantCount = Object.values(nextAlignedQuadrants).filter(Boolean).length;
        const hasStrongGlobalEdges = edgeRatio > STRONG_DOC_EDGE_RATIO_THRESHOLD;
        const hasSufficientCornerSignal = activeQuadrantCount >= MIN_QUADRANTS_WITH_EDGES && edgeRatio > (threshold * 0.55);
        hasContent = (edgeRatio > threshold && activeQuadrantCount >= MIN_QUADRANTS_WITH_EDGES) || hasStrongGlobalEdges || hasSufficientCornerSignal;

        setAlignedQuadrants(nextAlignedQuadrants);

        // Only show progress when document is actually detected
        if (hasContent) {
          const cornerProgress = (activeQuadrantCount / 4) * 100;
          const edgeProgress = Math.min(100, (edgeRatio / (threshold * 1.5)) * 100);
          const blendedProgress = Math.round(cornerProgress * 0.5 + edgeProgress * 0.5);
          setAlignmentProgress(blendedProgress);
        } else {
          setAlignmentProgress(0);
        }
      } else {
        setAlignedQuadrants({ tl: false, tr: false, bl: false, br: false });
        setAlignmentProgress(Math.round(Math.min(100, (edgeRatio / (threshold * 1.6)) * 100)));
      }

      setDocumentDetected(hasContent);

      const stabilityThreshold = requireDocumentPresence
        ? DOC_STABILITY_THRESHOLD
        : SELFIE_STABILITY_THRESHOLD;

      const currentStabilityDuration = requireDocumentPresence ? STABILITY_DURATION : SELFIE_STABILITY_DURATION;

      if (hasContent && diffRatio < stabilityThreshold) {
        stabilityMsRef.current += CHECK_INTERVAL;
        const progress = Math.min(100, (stabilityMsRef.current / currentStabilityDuration) * 100);
        setStabilityProgress(progress);

        if (stabilityMsRef.current >= currentStabilityDuration) {
          onStableCaptureRef.current();
          stabilityMsRef.current = 0;
          setStabilityProgress(0);
          setDocumentDetected(false);
          setAlignmentProgress(0);
          setAlignedQuadrants({ tl: false, tr: false, bl: false, br: false });
          prevFrameRef.current = null;
          return;
        }
      } else if (hasContent && diffRatio < stabilityThreshold * 1.5) {
        // Small jitter: decay instead of hard reset
        stabilityMsRef.current = Math.max(0, stabilityMsRef.current - CHECK_INTERVAL * 0.3);
        const progress = Math.min(100, (stabilityMsRef.current / currentStabilityDuration) * 100);
        setStabilityProgress(progress);
      } else {
        stabilityMsRef.current = Math.max(0, stabilityMsRef.current - CHECK_INTERVAL * 0.6);
        setStabilityProgress(Math.min(100, (stabilityMsRef.current / currentStabilityDuration) * 100));
      }
    }

    prevFrameRef.current = currentFrame;
    animFrameRef.current = requestAnimationFrame(checkStability);
  // CRITICAL: Only depend on `enabled` and `requireDocumentPresence` — not on state that we set inside
  }, [enabled, videoRef, initialDelayMs, requireDocumentPresence]);

  useEffect(() => {
    if (enabled) {
      stabilityMsRef.current = 0;
      setStabilityProgress(0);
      setDocumentDetected(false);
      initialDelayDoneRef.current = false;
      setInitialDelayDone(false);
      setAlignmentProgress(0);
      setAlignedQuadrants({ tl: false, tr: false, bl: false, br: false });
      prevFrameRef.current = null;
      enabledAtRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(checkStability);
    } else {
      setDocumentDetected(false);
      initialDelayDoneRef.current = false;
      setInitialDelayDone(false);
      setAlignmentProgress(0);
      setAlignedQuadrants({ tl: false, tr: false, bl: false, br: false });
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [enabled, checkStability]);

  return { stabilityProgress, documentDetected, initialDelayDone, alignmentProgress, alignedQuadrants };
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
  alignmentProgress: number;
  alignedQuadrants: { tl: boolean; tr: boolean; bl: boolean; br: boolean };
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
  alignmentProgress,
  alignedQuadrants,
}: DocCameraOverlayProps) {
  const stepLabel =
    cameraStep === "front"
      ? "Foto frontal del INE"
      : cameraStep === "back"
      ? "Foto reverso del INE"
      : "Foto del Pasaporte";

  // Combined progress: blend alignment + stability into one 0-100% indicator
  const combinedProgress = stabilityProgress > 0
    ? Math.round(alignmentProgress * 0.4 + stabilityProgress * 0.6)
    : alignmentProgress;

  // Dynamic hint based on detection state
  const stepHint = !initialDelayDone
    ? "Preparando cámara..."
    : stabilityProgress > 0
    ? `Capturando... ${Math.round(stabilityProgress)}%`
    : !documentDetected
    ? "Alinea el documento con el marco"
    : "Documento detectado, mantén quieto";

  const frameTone = !initialDelayDone
    ? "border-muted-foreground/40"
    : alignmentProgress >= 75
    ? "border-emerald-500"
    : alignmentProgress >= 45
    ? "border-amber-500"
    : "border-destructive/60";

  const getCornerTone = (isAligned: boolean) => {
    if (!initialDelayDone) return "border-muted-foreground/50";
    if (isAligned) return "border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.7)]";
    if (alignmentProgress >= 45) return "border-amber-400";
    return "border-destructive/60";
  };

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
        "relative rounded-2xl overflow-hidden border-4 bg-black aspect-[4/3] transition-colors duration-300",
        frameTone
      )}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Full alignment frame + illuminated corners */}
        <div className="absolute inset-4 rounded-xl border-4 border-white/45 pointer-events-none" />
        <div className="absolute inset-4 pointer-events-none">
          <div className={cn("absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 rounded-tl-lg transition-all duration-300", getCornerTone(alignedQuadrants.tl))} />
          <div className={cn("absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 rounded-tr-lg transition-all duration-300", getCornerTone(alignedQuadrants.tr))} />
          <div className={cn("absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 rounded-bl-lg transition-all duration-300", getCornerTone(alignedQuadrants.bl))} />
          <div className={cn("absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 rounded-br-lg transition-all duration-300", getCornerTone(alignedQuadrants.br))} />
        </div>
        {/* Step indicator for INE */}
        {cameraStep !== "passport" && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            {cameraStep === "front" ? "1/2" : "2/2"}
          </div>
        )}

        {/* Combined progress indicator */}
        {initialDelayDone && (
          <div className="absolute bottom-3 left-4 right-4 space-y-1.5">
            <div className={cn(
              "flex items-center justify-between px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-colors duration-300",
              stabilityProgress > 50
                ? "bg-emerald-500/80 text-white"
                : documentDetected
                ? "bg-emerald-500/70 text-white"
                : "bg-amber-500/80 text-white"
            )}>
              <span className="flex items-center gap-1">
                {stabilityProgress > 0 ? <><Camera className="h-3 w-3" /> Capturando...</> : documentDetected ? <><Check className="h-3 w-3" /> Detectado</> : <><Eye className="h-3 w-3" /> Buscando...</>}
              </span>
              <span className="font-bold">{combinedProgress}%</span>
            </div>
            <div className="bg-black/60 rounded-full px-2.5 py-1.5">
              <Progress value={combinedProgress} className="h-2 bg-white/20" />
            </div>
          </div>
        )}

        {/* Initial delay indicator */}
        {!initialDelayDone && (
          <div className="absolute bottom-3 left-4 right-4">
            <div className="bg-black/60 rounded-full px-3 py-2 flex items-center gap-2 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/80" />
              <span className="text-xs text-white/90 font-medium">Preparando... 0%</span>
            </div>
          </div>
        )}
      </div>

      <canvas className="hidden" />

      {/* Round capture button — same style as selfie */}
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

// ============ Verification Comparator Panel ============

interface VerificationComparatorProps {
  result: VerificationResult;
  persona: PersonaData;
  personaId: number;
  documentId: number; // The document record ID to update
  allRelatedDocIds?: number[]; // All related doc IDs to mark as validated (e.g. both INE front+back)
  onAccepted: () => void;
  onRejected: () => void;
}

interface ComparableField {
  label: string;
  docValue: string | null | undefined;
  displayDocValue?: string | null | undefined; // Display value (e.g., "Masculino" instead of "M")
  displayProfileValue?: string | null | undefined; // Display value for profile
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
  allRelatedDocIds,
  onAccepted,
  onRejected,
}: VerificationComparatorProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const faceMatchConfidence = result.face_match_confidence ?? 0;
  const hasStrongFaceMatch = result.face_match === true && faceMatchConfidence >= 70;
  const faceMatchFailed = result.face_match === false;
  const faceMatchMissing = result.face_match == null;

  // Full celebration: fanfare + confetti + streamers + trumpets overlay (5 seconds)
  const fireCelebration = useCallback(() => {
    setCelebrating(true);
    setTimeout(() => setCelebrating(false), 3500);

    // Play fanfare sound (sawtooth + triangle brass) — same as AgentPerfil
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const master = audioCtx.createGain();
      master.gain.value = 0.55;
      master.connect(audioCtx.destination);
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
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        gain1.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain1.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + start + 0.025);
        gain1.gain.setValueAtTime(0.15, audioCtx.currentTime + start + 0.06);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc1.connect(gain1); gain1.connect(master);
        osc1.start(audioCtx.currentTime + start);
        osc1.stop(audioCtx.currentTime + start + dur + 0.05);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 0.5, audioCtx.currentTime + start);
        gain2.gain.setValueAtTime(0, audioCtx.currentTime + start);
        gain2.gain.linearRampToValueAtTime(0.10, audioCtx.currentTime + start + 0.03);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc2.connect(gain2); gain2.connect(master);
        osc2.start(audioCtx.currentTime + start);
        osc2.stop(audioCtx.currentTime + start + dur + 0.05);
      });
    } catch (e) { /* audio not supported */ }

    // Round confetti burst
    const colors = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24', '#f97316', '#ec4899', '#8b5cf6'];
    confetti({ particleCount: 100, spread: 120, origin: { x: 0.5, y: 0.4 }, colors, shapes: ['circle'], startVelocity: 50 });

    // Continuous round confetti + long streamers for 3.5 seconds
    const celebrationEnd = Date.now() + 3500;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors, shapes: ['circle'] });
      confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors, shapes: ['circle'] });
      confetti({ particleCount: 2, angle: 60, spread: 25, origin: { x: 0, y: 0.5 }, colors, shapes: ['square'], scalar: 3, drift: 1, gravity: 0.5, ticks: 400 });
      confetti({ particleCount: 2, angle: 120, spread: 25, origin: { x: 1, y: 0.5 }, colors, shapes: ['square'], scalar: 3, drift: -1, gravity: 0.5, ticks: 400 });
      if (Date.now() < celebrationEnd) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  // Auto-fire celebration when verification is positive
  useEffect(() => {
    if (celebrationShown) return;
    if (result.is_valid_document && result.confidence >= 70 && hasStrongFaceMatch) {
      setCelebrationShown(true);
      fireCelebration();
    }
  }, [result, celebrationShown, hasStrongFaceMatch, fireCelebration]);

  // INE names come as "ApPaterno ApMaterno Nombre(s)" — reorder to "Nombre(s) ApPaterno ApMaterno"
  const isIneDoc = result.document_type === "ine_frente" || result.document_type === "ine_reverso" || !!result.clave_elector;
  const reorderIneName = (raw: string): string => {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 3) return raw; // can't reorder with fewer than 3 words
    // INE format: ApPaterno ApMaterno Nombre1 [Nombre2...]
    const [apPaterno, apMaterno, ...nombres] = parts;
    return [...nombres, apPaterno, apMaterno].join(" ");
  };
  const displayDocName = isIneDoc && result.full_name ? reorderIneName(result.full_name) : result.full_name;

  // Build the comparable fields
  const fields: ComparableField[] = [
    {
      label: "Nombre completo",
      docValue: displayDocName,
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
      docValue: (() => {
        // INE uses H=Hombre, M=Mujer; DB uses M=Masculino, F=Femenino
        const raw = result.sexo;
        if (!raw) return raw;
        if (raw === "H") return "M"; // DB value for Masculino
        if (raw === "M") return "F"; // DB value for Femenino
        return raw;
      })(),
      displayDocValue: (() => {
        const raw = result.sexo;
        if (!raw) return raw;
        if (raw === "H") return "Masculino";
        if (raw === "M") return "Femenino";
        return raw;
      })(),
      displayProfileValue: (() => {
        const val = persona.sexo;
        if (val === "M") return "Masculino";
        if (val === "F") return "Femenino";
        return val;
      })(),
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
        f.profileValue.trim().toLowerCase() !== f.docValue.trim().toLowerCase();
      initial[f.label] = profileEmpty || !!differs;
    });
    return initial;
  });

  const getMatchStatus = (f: ComparableField) => {
    if (!f.docValue) return "empty";
    if (!f.saveable || f.profileValue === undefined) return "info"; // info-only field
    if (!f.profileValue || f.profileValue.trim() === "") return "missing";
    if (f.profileValue.trim().toLowerCase() === f.docValue.trim().toLowerCase()) return "match";
    // Check partial match (contains)
    if (
      f.profileValue.trim().toLowerCase().includes(f.docValue.trim().toLowerCase().substring(0, 5)) ||
      f.docValue.trim().toLowerCase().includes(f.profileValue.trim().toLowerCase().substring(0, 5))
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
        const isIneResult =
          result.document_type === "ine_reverso" ||
          result.document_type === "ine_frente" ||
          !!result.clave_elector;
        const normalizedNumber =
          isIneResult && /^\d{8,}$/.test(numField.docValue)
            ? `IDMEX${numField.docValue}`
            : numField.docValue;
        docUpdate.numero = normalizedNumber;
      }

      // Update the main document
      const { error: docError } = await supabase
        .from("documentos")
        .update(docUpdate)
        .eq("id", documentId);
      if (docError) throw docError;

      // Also mark all related docs (e.g. INE front+back) as Validado
      if (allRelatedDocIds && allRelatedDocIds.length > 0) {
        const siblingIds = allRelatedDocIds.filter((id) => id !== documentId);
        if (siblingIds.length > 0) {
          const { error: siblingError } = await supabase
            .from("documentos")
            .update({ id_estatus_verificacion: 2 })
            .in("id", siblingIds);
          if (siblingError) throw siblingError;
        }
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-persona"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-step-persona"] });
      queryClient.invalidateQueries({ queryKey: ["agent-onboarding-docs-detail"] });

      toast.success("Documento verificado y datos actualizados");
      
      // Reuse the celebration function
      fireCelebration();

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
    <div className="space-y-4 pb-4 relative">
      {/* Trumpet + flags celebration overlay */}
      {celebrating && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="absolute left-4 top-1/3 animate-fade-in" style={{ animationDuration: '0.4s' }}>
            <div className="text-6xl animate-bounce" style={{ animationDuration: '0.6s' }}>🎺</div>
          </div>
          <div className="absolute right-4 top-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.15s', animationFillMode: 'both' }}>
            <div className="text-6xl animate-bounce scale-x-[-1]" style={{ animationDuration: '0.6s' }}>🎺</div>
          </div>
          <div className="animate-scale-in flex flex-col items-center gap-2" style={{ animationDuration: '0.5s', animationDelay: '0.3s', animationFillMode: 'both' }}>
            <div className="flex gap-3 text-5xl">
              <span>🏳️</span>
              <span>🎉</span>
              <span>🏳️</span>
            </div>
            <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl">
              <p className="text-lg font-bold text-center">¡Identidad verificada!</p>
              <p className="text-xs text-emerald-100 text-center">Documento y selfie coinciden</p>
            </div>
          </div>
          <div className="absolute left-1/4 bottom-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.25s', animationFillMode: 'both' }}>
            <div className="text-4xl animate-bounce" style={{ animationDuration: '0.7s' }}>🎺</div>
          </div>
          <div className="absolute right-1/4 bottom-1/3 animate-fade-in" style={{ animationDuration: '0.4s', animationDelay: '0.35s', animationFillMode: 'both' }}>
            <div className="text-4xl animate-bounce scale-x-[-1]" style={{ animationDuration: '0.7s' }}>🏁</div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Verificación de documento</h3>
      </div>

      {/* Success celebration banner */}
      {result.is_valid_document && result.confidence >= 70 && hasStrongFaceMatch && (
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

      {/* Face match FAILED warning */}
      {result.is_valid_document && faceMatchFailed && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 text-center space-y-1 animate-scale-in">
          <div className="flex items-center justify-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <span className="text-base font-bold text-destructive">Rostro no coincide</span>
          </div>
          <p className="text-xs text-destructive/80">
            La selfie no coincide con la foto del documento. No se puede guardar. Vuelve a capturar.
          </p>
          <p className="text-[10px] text-destructive/60 mt-1">
            Coincidencia facial: {faceMatchConfidence}%
          </p>
        </div>
      )}

      {/* Face match missing/weak warning */}
      {result.is_valid_document && !faceMatchFailed && !hasStrongFaceMatch && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 text-center space-y-1 animate-scale-in">
          <div className="flex items-center justify-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <span className="text-base font-bold text-destructive">Validación facial insuficiente</span>
          </div>
          <p className="text-xs text-destructive/80">
            {faceMatchMissing
              ? "No se pudo confirmar la coincidencia facial. Debes recapturar documento y selfie."
              : "La coincidencia facial fue débil. No se puede guardar hasta tener match facial confiable."}
          </p>
          <p className="text-[10px] text-destructive/60 mt-1">
            Coincidencia facial: {faceMatchConfidence}%
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

      {/* Data comparison table — only show for valid documents */}
      {result.is_valid_document && (
      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-0 text-[10px] font-semibold text-muted-foreground bg-muted/50 px-3 py-2 border-b">
          <span>Dato</span>
          <span>Documento</span>
          <span>Perfil</span>
          <span className="text-center w-10">Guardar</span>
        </div>
        {fields
          .filter((f) => f.docValue)
          .map((f) => {
            const status = getMatchStatus(f);
            const isChecked = checkedFields[f.label] ?? false;

            return (
              <div
                key={f.label}
                className={cn(
                  "grid grid-cols-[1fr_1fr_1fr_auto] gap-0 items-center px-3 py-2 border-b last:border-b-0 transition-colors",
                  status === "match"
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                    : status === "differs"
                    ? "bg-amber-50/50 dark:bg-amber-950/20"
                    : ""
                )}
              >
                <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                  {f.label}
                  {status === "match" && (
                    <Check className="h-3 w-3 text-emerald-500" />
                  )}
                  {status === "differs" && (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground truncate pr-1">
                  {f.displayDocValue || f.docValue}
                </span>
                <span className="text-[11px] text-muted-foreground truncate pr-1">
                  {f.displayProfileValue || f.profileValue || (
                    <span className="italic text-muted-foreground/60">
                      (vacío)
                    </span>
                  )}
                </span>
                <div className="flex justify-center w-10">
                  {f.saveable && f.docValue ? (
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(v) =>
                        setCheckedFields((prev) => ({
                          ...prev,
                          [f.label]: !!v,
                        }))
                      }
                      className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">
                      n/a
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      )}

      {/* If document is NOT valid, show a clear message that saving is blocked */}
      {!result.is_valid_document && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center space-y-1">
          <p className="text-sm font-semibold text-destructive">No se puede guardar este documento</p>
          <p className="text-xs text-destructive/80">
            Solo se aceptan INE o Pasaporte como identificación oficial. Vuelve a capturar con un documento válido.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {result.is_valid_document && hasStrongFaceMatch && (
        <Button
          onClick={handleSaveAndAccept}
          disabled={saving}
          className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Guardar y aceptar
        </Button>
        )}
        <Button
          onClick={handleReject}
          disabled={saving}
          variant="outline"
          className={cn(
            "h-12 rounded-2xl px-4 text-destructive border-destructive/30 hover:bg-destructive/10",
            (!result.is_valid_document || !hasStrongFaceMatch) && "flex-1"
          )}
        >
          <X className="h-4 w-4" />
          {(!result.is_valid_document || !hasStrongFaceMatch) && <span className="ml-1">Cerrar y reintentar</span>}
        </Button>
      </div>
    </div>
  );
}
