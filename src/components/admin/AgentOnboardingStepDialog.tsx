import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MifielSigningDialog } from "@/components/admin/MifielSigningDialog";
import { PdfViewerDialog } from "@/components/admin/PdfViewerDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Upload, CheckCircle2, Clock, RefreshCw, Download, FileText, CalendarDays, Landmark, Trash2, Camera, Shield, PenTool, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { validateRFC } from "@/utils/fiscalDataValidation";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { cn } from "@/lib/utils";
import {
  useStabilityDetection,
  CaptureFlash,
  SelfieCameraOverlay,
  DocCameraOverlay,
  VerificationComparator,
  type VerificationResult,
} from "@/components/admin/DocumentVerification";

interface AgentOnboardingStepDialogProps {
  step: OnboardingStep['id'];
  personaId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_TITLES: Record<string, string> = {
  basic: 'Identidad',
  address: 'Dirección',
  fiscal: 'Información Fiscal',
  documents: 'Documentos',
  'bank-accounts': 'Cuenta Bancaria',
  training: 'Capacitación',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  basic: 'Datos personales, dirección e INE',
  address: 'Tu dirección física completa',
  fiscal: 'RFC, régimen fiscal, constancia y dirección fiscal',
  documents: 'INE y Constancia',
  'bank-accounts': 'Agrega tu cuenta bancaria',
  training: 'Agenda tu cita de capacitación presencial',
};

// Required document types for basic step (INE frente=2, INE reverso=3, Pasaporte=4, Carta comercialización=48)
const BASIC_DOC_TYPES = [2, 3, 4, 48];
// Constancia de situación fiscal (type 6) for fiscal step
const FISCAL_DOC_TYPES = [6];
// All required doc types for onboarding queries
const REQUIRED_DOC_TYPES = [2, 3, 4, 6, 48];
// Document types that support camera capture
const CAMERA_DOC_TYPES = [2, 3, 4]; // INE frente, INE reverso, Pasaporte
// INE document types (need both front and back)
const INE_DOC_TYPES = [2, 3];
// Pasaporte document type
const PASAPORTE_DOC_TYPE = 4;
// Selfie document type
const SELFIE_DOC_TYPE = 49;

export function AgentOnboardingStepDialog({ step, personaId, open, onOpenChange }: AgentOnboardingStepDialogProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { track } = useCtaTracker();
  const hasTrackedFieldChange = useRef(false);

  // Check if agent belongs to an inmobiliaria (to hide doc 48)
  const { data: hasInmobiliaria } = useQuery({
    queryKey: ['agent-step-dialog-inmo', personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', personaId)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true)
        .not('id_persona_duena_lead', 'is', null)
        .limit(1);
      return (data && data.length > 0) || false;
    },
    enabled: !!personaId,
  });

  // Filter out doc type 48 for agents with inmobiliaria
  const effectiveBasicDocTypes = hasInmobiliaria ? BASIC_DOC_TYPES.filter(t => t !== 48) : BASIC_DOC_TYPES;
  const effectiveRequiredDocTypes = hasInmobiliaria ? REQUIRED_DOC_TYPES.filter(t => t !== 48) : REQUIRED_DOC_TYPES;

  // Track opening the step
  useEffect(() => {
    if (open) {
      track({ page: "modal_perfil", elementId: "perfil_fase_abrir", metadata: { fase: step } });
      hasTrackedFieldChange.current = false;
    }
  }, [open, step, track]);

  // Full fetch persona data
  const { data: persona, isLoading } = useQuery({
    queryKey: ['agent-onboarding-step-persona', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('id', personaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!personaId,
  });

  const title = STEP_TITLES[step];
  const description = STEP_DESCRIPTIONS[step];

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-persona'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-bank'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-step-persona'] });
    onOpenChange(false);
  };

  const content = isLoading ? (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  ) : step === 'documents' ? (
    <div className="px-1">
      <AgentDocumentsStep personaId={personaId} filterDocTypes={effectiveRequiredDocTypes} onTrackFieldChange={() => {
        if (!hasTrackedFieldChange.current) {
          hasTrackedFieldChange.current = true;
          track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
        }
      }} onTrackDocView={(docName: string) => track({ page: "modal_perfil", elementId: "perfil_documentos_ver", metadata: { documento: docName } })} />
    </div>
  ) : step === 'bank-accounts' ? (
    <div className="px-1">
      <AgentBankAccountStep personaId={personaId} onTrackFieldChange={() => {
        if (!hasTrackedFieldChange.current) {
          hasTrackedFieldChange.current = true;
          track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
        }
      }} onTrackSave={() => track({ page: "modal_perfil", elementId: "perfil_fase_guardar", metadata: { fase: "bank-accounts" } })} />
    </div>
  ) : step === 'training' ? (
    <div className="px-1">
      <AgentTrainingStep personaId={personaId} onSaved={handleSaved} onTrackSave={() => track({ page: "modal_perfil", elementId: "perfil_fase_guardar", metadata: { fase: step } })} onTrackFieldChange={() => {
        if (!hasTrackedFieldChange.current) {
          hasTrackedFieldChange.current = true;
          track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
        }
      }} />
    </div>
  ) : (
    <StepForm step={step} persona={persona} personaId={personaId} onSaved={handleSaved} basicDocTypes={effectiveBasicDocTypes} onTrackSave={() => track({ page: "modal_perfil", elementId: "perfil_fase_guardar", metadata: { fase: step } })} onTrackFieldChange={() => {
      if (!hasTrackedFieldChange.current) {
        hasTrackedFieldChange.current = true;
        track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
      }
    }} />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh] rounded-t-3xl overflow-hidden max-w-[100vw]">
          <DrawerHeader className="text-left pb-2 px-4">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            <DrawerDescription className="text-xs">{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto overflow-x-hidden w-full" style={{ maxHeight: 'calc(95vh - 100px)' }}>
            <div className="w-full max-w-full overflow-hidden">
              {content}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl border-0">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Agent Documents Step ----------

function AgentDocumentsStep({ personaId, filterDocTypes, onTrackFieldChange, onTrackDocView }: { personaId: number; filterDocTypes?: number[]; onTrackFieldChange?: () => void; onTrackDocView?: (docName: string) => void }) {
  const queryClient = useQueryClient();

  const activeDocTypes = filterDocTypes || REQUIRED_DOC_TYPES;
  
  // Determine if this is the basic step (has INE/Pasaporte docs)
  const hasIdentityDocs = activeDocTypes.some(t => INE_DOC_TYPES.includes(t) || t === PASAPORTE_DOC_TYPE);
  
  // Fetch doc type names from DB
  const { data: docTypes = [] } = useQuery({
    queryKey: ['agent-doc-types', activeDocTypes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id, nombre')
        .in('id', activeDocTypes)
        .eq('activo', true);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing documents for this persona
  const { data: existingDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['agent-onboarding-docs-detail', personaId, activeDocTypes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('id, id_tipo_documento, url, id_estatus_verificacion, fecha_creacion')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .in('id_tipo_documento', activeDocTypes);
      if (error) throw error;
      return data || [];
    },
  });

  // Determine identity mode based on existing docs
  const hasINEDocs = existingDocs.some((d: any) => INE_DOC_TYPES.includes(d.id_tipo_documento));
  const hasPasaporteDocs = existingDocs.some((d: any) => d.id_tipo_documento === PASAPORTE_DOC_TYPE);
  const [identityMode, setIdentityMode] = useState<'ine' | 'pasaporte'>('ine');
  
  // Sync identity mode from existing docs on first load
  useEffect(() => {
    if (hasPasaporteDocs && !hasINEDocs) {
      setIdentityMode('pasaporte');
    } else {
      setIdentityMode('ine');
    }
  }, [hasPasaporteDocs, hasINEDocs]);

  const [uploading, setUploading] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStep, setCameraStep] = useState<'front' | 'back' | 'passport' | 'selfie'>('front');
  const [capturedFront, setCapturedFront] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationDocId, setVerificationDocId] = useState<number | null>(null);
  const [capturedDocUrls, setCapturedDocUrls] = useState<{ front?: string; back?: string; passport?: string }>({});
  const capturedDocUrlsRef = useRef<{ front?: string; back?: string; passport?: string }>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoCaptureLockRef = useRef(false);
  const activeVerifyCallsRef = useRef(0);

  // --- Mifiel digital signature state for doc type 48 ---
  const [mifielDialogOpen, setMifielDialogOpen] = useState(false);
  const [mifielWidgetId, setMifielWidgetId] = useState<string | null>(null);
  const [sendingToMifiel, setSendingToMifiel] = useState(false);
  const [syncingFirma, setSyncingFirma] = useState(false);
  const [cartaPdfViewerUrl, setCartaPdfViewerUrl] = useState<string | null>(null);
  const [agentSignaturePadOpen, setAgentSignaturePadOpen] = useState(false);
  const [agentSignatureDataUrl, setAgentSignatureDataUrl] = useState<string | null>(null);
  const [pendingSignAction, setPendingSignAction] = useState<"firmar" | "continuar" | null>(null);

  // Fetch persona data for Mifiel (name + email)
  const { data: personaForMifiel } = useQuery({
    queryKey: ['agent-persona-mifiel', personaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('personas')
        .select('nombre_legal, email')
        .eq('id', personaId)
        .single();
      return data;
    },
    enabled: activeDocTypes.includes(48),
  });

  // Fetch existing firma digital for this agent and sync against Mifiel state
  const { data: firmaExistente, refetch: refetchFirma } = useQuery({
    queryKey: ['agent-firma-digital', personaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('firmas_digitales')
        .select('*')
        .eq('tipo_documento', 'carta_acuerdos')
        .eq('referencia_id', personaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const firmaEnProgreso = data.estado === 'enviado' || data.estado === 'firmado_parcial';
      if (!firmaEnProgreso || !data.mifiel_document_id) return data;

      const { data: mifielData, error: mifielError } = await supabase.functions.invoke('mifiel-consultar-documento', {
        body: { document_id: data.mifiel_document_id },
      });

      const upstreamStatus = Number(mifielData?.upstream_status || 0);
      const errorMessage = [mifielError?.message, mifielData?.error, JSON.stringify(mifielData?.details ?? '')]
        .filter(Boolean)
        .join(' | ');
      const mifielNotFound = upstreamStatus === 404 || /404|not found|no existe|deleted/i.test(errorMessage);

      if (mifielError || !mifielData?.success) {
        if (mifielNotFound) {
          await (supabase as any)
            .from('firmas_digitales')
            .update({ estado: 'cancelado' })
            .eq('id', data.id);
          return { ...data, estado: 'cancelado' };
        }
        return data;
      }

      const remoteState = String(mifielData?.document?.state || '').toLowerCase().trim();
      const remoteCancelledStates = new Set(['deleted', 'canceled', 'cancelled', 'void', 'voided', 'expired', 'rejected']);
      const remoteCompletedStates = new Set(['completed', 'signed']);

      // Check if the agent has already signed
      const mifielSigners = mifielData.document?.signers || mifielData.document?.signatories || [];
      const agentSigner = mifielSigners.find((s: any) => s.email === personaForMifiel?.email);
      const agentAlreadySigned = agentSigner?.signed === true || agentSigner?.current === false;

      if (remoteCancelledStates.has(remoteState) && data.estado !== 'cancelado') {
        await (supabase as any)
          .from('firmas_digitales')
          .update({ estado: 'cancelado' })
          .eq('id', data.id);
        return { ...data, estado: 'cancelado', agentAlreadySigned };
      }

      if (remoteCompletedStates.has(remoteState) && data.estado !== 'completado') {
        await (supabase as any)
          .from('firmas_digitales')
          .update({ estado: 'completado' })
          .eq('id', data.id);
        return { ...data, estado: 'completado', agentAlreadySigned };
      }

      return { ...data, agentAlreadySigned };
    },
    enabled: activeDocTypes.includes(48),
    refetchInterval: 30000,
  });

  // Step 1: Ask for autograph before creating/continuing Mifiel doc
  const handleRequestAgentSignature = (action: "firmar" | "continuar") => {
    if (!personaForMifiel?.email || !personaForMifiel?.nombre_legal) {
      toast.error("Faltan datos del agente (nombre o email) para enviar a firma.");
      return;
    }
    setPendingSignAction(action);
    setAgentSignaturePadOpen(true);
  };

  // Step 2: After autograph is captured, proceed with the action
  const handleAgentSignatureSaved = async (dataUrl: string) => {
    setAgentSignatureDataUrl(dataUrl);
    if (pendingSignAction === "firmar") {
      await doFirmarCarta(dataUrl);
    } else if (pendingSignAction === "continuar") {
      await handleContinuarFirmaInternal();
    }
    setPendingSignAction(null);
  };

  const doFirmarCarta = async (firmaAutografa: string) => {
    setSendingToMifiel(true);
    try {
      const { data, error } = await supabase.functions.invoke("mifiel-crear-documento", {
        body: {
          agente_email: personaForMifiel!.email,
          agente_nombre: personaForMifiel!.nombre_legal,
          agente_persona_id: personaId,
          carta_acuerdo_id: "ce94b2d7-dcc8-4f91-a8d8-882264556c3e",
          firma_autografa_agente: firmaAutografa,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Error desconocido");
      
      if (data.widget_id) {
        setMifielWidgetId(data.widget_id);
        setMifielDialogOpen(true);
      } else {
        toast.success("Documento enviado a firma. Revisa tu correo.");
      }
      refetchFirma();
    } catch (err: any) {
      toast.error("Error al enviar a firma: " + (err.message || "Error"));
    } finally {
      setSendingToMifiel(false);
    }
  };

  const handleContinuarFirma = async () => {
    if (!firmaExistente?.mifiel_document_id) {
      toast.error("No se encontró un documento activo para continuar firma.");
      return;
    }

    setSyncingFirma(true);
    try {
      const { data: mifielData, error: mifielError } = await supabase.functions.invoke('mifiel-consultar-documento', {
        body: { document_id: firmaExistente.mifiel_document_id },
      });

      const upstreamStatus = Number(mifielData?.upstream_status || 0);
      const errorMessage = [mifielError?.message, mifielData?.error, JSON.stringify(mifielData?.details ?? '')]
        .filter(Boolean)
        .join(' | ');
      const mifielNotFound = upstreamStatus === 404 || /404|not found|no existe|deleted/i.test(errorMessage);

      if (mifielError || !mifielData?.success) {
        if (mifielNotFound) {
          await (supabase as any)
            .from('firmas_digitales')
            .update({ estado: 'cancelado' })
            .eq('id', firmaExistente.id);
          await refetchFirma();
          toast.error("Este documento ya no existe en Mifiel. Se sincronizó el estado en la BD.");
          return;
        }
        throw new Error(errorMessage || 'No se pudo sincronizar el estado de firma');
      }

      const remoteState = String(mifielData?.document?.state || '').toLowerCase().trim();
      const remoteCancelledStates = new Set(['deleted', 'canceled', 'cancelled', 'void', 'voided', 'expired', 'rejected']);
      const remoteCompletedStates = new Set(['completed', 'signed']);

      if (remoteCancelledStates.has(remoteState)) {
        await (supabase as any)
          .from('firmas_digitales')
          .update({ estado: 'cancelado' })
          .eq('id', firmaExistente.id);
        await refetchFirma();
        toast.error("Este documento ya no está disponible para firma en Mifiel. Se sincronizó como cancelado.");
        return;
      }

      if (remoteCompletedStates.has(remoteState)) {
        await (supabase as any)
          .from('firmas_digitales')
          .update({ estado: 'completado' })
          .eq('id', firmaExistente.id);
        await refetchFirma();
        refetchDocs();
        toast.success("Este documento ya aparece como firmado en Mifiel. Se sincronizó el estado.");
        return;
      }

      const mifielSigners = mifielData.document?.signers || mifielData.document?.signatories || [];
      const agentSigner = mifielSigners.find((s: any) => s.email === personaForMifiel?.email);
      const wid = agentSigner?.widget_id || null;

      if (wid) {
        setMifielWidgetId(wid);
        setMifielDialogOpen(true);
      } else {
        toast.error("No se encontró el widget de firma del agente en Mifiel.");
      }
    } catch (err: any) {
      toast.error("Error al sincronizar firma: " + (err.message || "Error"));
    } finally {
      setSyncingFirma(false);
    }
  };

  const handleMifielSuccess = () => {
    setMifielDialogOpen(false);
    toast.success("¡Firma completada exitosamente!");
    refetchFirma();
    refetchDocs();
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
  };

  const getDocForType = (typeId: number) => {
    return existingDocs
      .filter((d: any) => d.id_tipo_documento === typeId)
      .sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())[0];
  };

  const getStatusInfo = (doc: any) => {
    if (!doc) return { label: 'Sin subir', color: 'text-muted-foreground', bg: 'bg-muted', icon: Upload };
    switch (doc.id_estatus_verificacion) {
      case 2: return { label: 'Validado', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle2 };
      case 3: return { label: 'Rechazado', color: 'text-destructive', bg: 'bg-destructive/10', icon: RefreshCw };
      default: return { label: 'Pendiente', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock };
    }
  };

  const handleUpload = async (typeId: number, file: File) => {
    setUploading(typeId);
    onTrackFieldChange?.();
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `persona_${personaId}_doctype${typeId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      // Deactivate previous documents of same type
      await supabase
        .from('documentos')
        .update({ activo: false })
        .eq('id_persona', personaId)
        .eq('id_tipo_documento', typeId)
        .eq('activo', true);

      // Insert new
      const { error: insertError } = await supabase
        .from('documentos')
        .insert({
          url: urlData.publicUrl,
          id_tipo_documento: typeId,
          id_persona: personaId,
          activo: true,
          id_estatus_verificacion: 1,
        });
      if (insertError) throw insertError;

      toast.success("Documento subido correctamente");
      refetchDocs();
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
    } catch (err: any) {
      toast.error("Error al subir documento: " + (err.message || "Error"));
    } finally {
      setUploading(null);
    }
  };

  const handleFileSelect = (typeId: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.webp';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(typeId, file);
    };
    input.click();
  };

  // Camera functions
  const startCamera = async (step: 'front' | 'back' | 'passport' | 'selfie') => {
    setCameraStep(step);
    setCameraActive(true);
    setCapturedFront(null);
    activeVerifyCallsRef.current = 0;
    setVerifying(false);

    if (step !== 'selfie') {
      setVerificationResult(null);
      setVerificationDocId(null);
    }

    autoCaptureLockRef.current = false;
    try {
      const facingMode = step === 'selfie' ? 'user' : 'environment';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error("No se pudo acceder a la cámara. Verifica los permisos.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCapturedFront(null);
    autoCaptureLockRef.current = false;
  };

  // Upload and return the public URL + document ID
  const uploadAndGetUrl = async (typeId: number, file: File): Promise<{ url: string; docId: number } | null> => {
    setUploading(typeId);
    onTrackFieldChange?.();
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `persona_${personaId}_doctype${typeId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      // Deactivate previous documents of same type
      await supabase
        .from('documentos')
        .update({ activo: false })
        .eq('id_persona', personaId)
        .eq('id_tipo_documento', typeId)
        .eq('activo', true);

      // Insert new
      const { data: insertData, error: insertError } = await supabase
        .from('documentos')
        .insert({
          url: urlData.publicUrl,
          id_tipo_documento: typeId,
          id_persona: personaId,
          activo: true,
          id_estatus_verificacion: 1,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      refetchDocs();
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
      return { url: urlData.publicUrl, docId: insertData.id };
    } catch (err: any) {
      toast.error("Error al subir documento: " + (err.message || "Error"));
      return null;
    } finally {
      setUploading(null);
    }
  };

  // Verify document with AI
  const verifyDocument = async (imageUrl: string, expectedType: string, selfieUrl?: string) => {
    activeVerifyCallsRef.current += 1;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verificar-documento-identidad', {
        body: { imageUrl, expectedType, selfieUrl },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as VerificationResult;
    } catch (err: any) {
      console.error("Error verificando documento:", err);
      toast.error("Error verificando documento", {
        duration: 8000,
        description: err.message || "Ocurrió un error inesperado. Intenta de nuevo.",
      });
      return null;
    } finally {
      activeVerifyCallsRef.current = Math.max(0, activeVerifyCallsRef.current - 1);
      if (activeVerifyCallsRef.current === 0) {
        setVerifying(false);
      }
    }
  };

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || autoCaptureLockRef.current) return;
    autoCaptureLockRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { autoCaptureLockRef.current = false; return; }
    ctx.drawImage(video, 0, 0);

    // Show flash
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 300);

    canvas.toBlob(async (blob) => {
      if (!blob) { autoCaptureLockRef.current = false; return; }

      if (cameraStep === 'front') {
        const file = new File([blob], `ine_frente_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const result = await uploadAndGetUrl(2, file);
        if (result) {
          setCapturedDocUrls(prev => {
            const next = { ...prev, front: result.url };
            capturedDocUrlsRef.current = next;
            return next;
          });
          setCameraStep('back');
          toast.success("INE frente capturado. Ahora captura el reverso.", { duration: 4000 });
          autoCaptureLockRef.current = false;
        }
      } else if (cameraStep === 'back') {
        const file = new File([blob], `ine_reverso_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const result = await uploadAndGetUrl(3, file);
        if (result) {
          setCapturedDocUrls(prev => {
            const next = { ...prev, back: result.url };
            capturedDocUrlsRef.current = next;
            return next;
          });
          setVerificationDocId(result.docId);
          stopCamera();
          // Pre-verifica documento mostrando el spinner de IA
          const urls = capturedDocUrlsRef.current;
          const [frontCheck, backCheck] = await Promise.all([
            urls.front ? verifyDocument(urls.front, 'ine_frente') : Promise.resolve(null),
            verifyDocument(result.url, 'ine_reverso'),
          ]);
          const preResult = frontCheck ? {
            ...frontCheck,
            numero_identificacion: backCheck?.numero_identificacion || frontCheck.numero_identificacion,
          } : backCheck;
          if (preResult && !preResult.is_valid_document) {
            // Not a valid INE — show result immediately, no selfie
            setVerificationResult(preResult);
            toast.error("El documento no es una identificación válida (INE/Pasaporte).", { duration: 6000 });
            autoCaptureLockRef.current = false;
          } else {
            toast.success("INE reverso capturado. Ahora toma una selfie.", { duration: 4000 });
            setTimeout(() => startCamera('selfie'), 300);
          }
        }
      } else if (cameraStep === 'passport') {
        const file = new File([blob], `pasaporte_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const result = await uploadAndGetUrl(4, file);
        if (result) {
          setCapturedDocUrls(prev => {
            const next = { ...prev, passport: result.url };
            capturedDocUrlsRef.current = next;
            return next;
          });
          setVerificationDocId(result.docId);
          stopCamera();
          // Pre-verifica documento mostrando el spinner de IA
          const preResult = await verifyDocument(result.url, 'pasaporte');
          if (preResult && !preResult.is_valid_document) {
            // Not a valid passport — show result immediately, no selfie
            setVerificationResult(preResult);
            toast.error("El documento no es una identificación válida (INE/Pasaporte).", { duration: 6000 });
            autoCaptureLockRef.current = false;
          } else {
            toast.success("Pasaporte capturado. Ahora toma una selfie.", { duration: 4000 });
            setTimeout(() => startCamera('selfie'), 300);
          }
        }
      } else if (cameraStep === 'selfie') {
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const selfieResult = await uploadAndGetUrl(SELFIE_DOC_TYPE, file);
        if (selfieResult) {
          stopCamera();
          // Use ref for fresh URLs (avoids stale closure)
          const urls = capturedDocUrlsRef.current;
          const isPasaporteFlow = !!urls.passport;
          const frontUrl = urls.front || '';
          const backUrl = urls.back || '';
          const passportUrl = urls.passport || '';
          const primaryDocUrl = passportUrl || frontUrl;
          
          if (!primaryDocUrl) {
            toast.error("No se encontró la imagen del documento. Intenta de nuevo.", {
              duration: 6000,
              description: "Vuelve a capturar el documento desde el inicio.",
            });
            autoCaptureLockRef.current = false;
            return;
          }
          
          // Spinner is shown via the `verifying` state — no toast needed

          let aiResult: VerificationResult | null = null;

          if (isPasaporteFlow) {
            aiResult = await verifyDocument(primaryDocUrl, 'pasaporte', selfieResult.url);
          } else {
            const [frontVerification, backVerification] = await Promise.all([
              verifyDocument(frontUrl, 'ine_frente', selfieResult.url),
              backUrl ? verifyDocument(backUrl, 'ine_reverso') : Promise.resolve(null),
            ]);

            if (frontVerification) {
              aiResult = {
                ...frontVerification,
                numero_identificacion:
                  backVerification?.numero_identificacion || frontVerification.numero_identificacion,
              };
            } else {
              aiResult = backVerification;
            }
          }

          // verification done — verifying state is cleared by verifyDocument
          
          if (aiResult) {
            setVerificationResult(aiResult);
            const strongFaceMatch = aiResult.face_match === true && (aiResult.face_match_confidence ?? 0) >= 70;

            if (!aiResult.is_valid_document) {
              toast.error("Documento inválido", {
                duration: 5000,
                description: aiResult.rejection_reason || "Se rechazó la identificación. Vuelve a capturar.",
              });
            } else if (!strongFaceMatch) {
              toast.error("Selfie no coincide con el documento", {
                duration: 6000,
                description: "No se permitirá guardar hasta obtener coincidencia facial confiable.",
              });
            } else {
              toast.success("Verificación completada", {
                duration: 3000,
                description: "Revisa los resultados a continuación.",
              });
            }
          } else {
            toast.error("No se pudo verificar el documento", {
              duration: 8000,
              description: "La verificación con IA falló. Intenta capturar de nuevo las fotos.",
            });
            // Reset to allow retry
            autoCaptureLockRef.current = false;
          }
        } else {
          toast.error("Error al subir la selfie. Intenta de nuevo.", { duration: 5000 });
          autoCaptureLockRef.current = false;
        }
      }
    }, 'image/jpeg', 0.85);
  }, [cameraStep]);

  // Stability detection for auto-capture
  const onStableCapture = useCallback(() => {
    if (!autoCaptureLockRef.current) {
      capturePhoto();
    }
  }, [capturePhoto]);

  const { stabilityProgress, documentDetected, initialDelayDone, alignmentProgress, alignedQuadrants } = useStabilityDetection(
    videoRef,
    cameraActive && !uploading && !verifying,
    onStableCapture,
    1500,
    cameraStep !== 'selfie'
  );

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle identity mode change - deactivate opposing docs
  const handleIdentityModeChange = async (mode: 'ine' | 'pasaporte') => {
    setIdentityMode(mode);
    onTrackFieldChange?.();
    if (mode === 'ine') {
      await supabase
        .from('documentos')
        .update({ activo: false })
        .eq('id_persona', personaId)
        .eq('id_tipo_documento', PASAPORTE_DOC_TYPE)
        .eq('activo', true);
    } else {
      for (const typeId of INE_DOC_TYPES) {
        await supabase
          .from('documentos')
          .update({ activo: false })
          .eq('id_persona', personaId)
          .eq('id_tipo_documento', typeId)
          .eq('activo', true);
      }
    }
    refetchDocs();
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
  };

  // Filter doc types based on identity mode
  const visibleDocTypes = activeDocTypes.filter(typeId => {
    if (!hasIdentityDocs) return true;
    if (identityMode === 'ine') {
      return typeId !== PASAPORTE_DOC_TYPE;
    } else {
      return !INE_DOC_TYPES.includes(typeId);
    }
  });

  // Fetch persona data for comparator
  const { data: personaData } = useQuery({
    queryKey: ['agent-persona-for-verification', personaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('personas')
        .select('nombre_legal, curp, fecha_nacimiento, sexo')
        .eq('id', personaId)
        .single();
      return data;
    },
    enabled: !!verificationResult,
  });

  // Show verification result comparator
  if (verificationResult && verificationDocId) {
    if (!personaData) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-semibold text-foreground">Cargando datos del perfil...</p>
        </div>
      );
    }
    return (
      <div className="pb-4">
        <CaptureFlash show={showFlash} />
        <VerificationComparator
          result={verificationResult}
          persona={personaData}
          personaId={personaId}
          documentId={verificationDocId}
          allRelatedDocIds={
            identityMode === 'ine'
              ? existingDocs.filter((d: any) => INE_DOC_TYPES.includes(d.id_tipo_documento)).map((d: any) => d.id as number)
              : undefined
          }
          onAccepted={() => {
            setVerificationResult(null);
            setVerificationDocId(null);
            setCapturedDocUrls({});
            capturedDocUrlsRef.current = {};
            refetchDocs();
          }}
          onRejected={() => {
            setVerificationResult(null);
            setVerificationDocId(null);
            setCapturedDocUrls({});
            capturedDocUrlsRef.current = {};
            // Restart camera for retry
            if (identityMode === 'ine') {
              startCamera('front');
            } else {
              startCamera('passport');
            }
          }}
        />
      </div>
    );
  }

  // Show verifying spinner
  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <CaptureFlash show={showFlash} />
        
        {/* Animated verification spinner */}
        <div className="relative flex items-center justify-center">
          {/* Outer pulsing ring */}
          <div className="absolute h-28 w-28 rounded-full border-2 border-emerald-400/30 animate-ping" style={{ animationDuration: '2s' }} />
          {/* Middle rotating gradient ring */}
          <svg className="absolute h-24 w-24 animate-spin" style={{ animationDuration: '3s' }}>
            <defs>
              <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity="1" />
                <stop offset="50%" stopColor="hsl(142, 76%, 36%)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r="44" fill="none" stroke="url(#spinGrad)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {/* Inner circle with shield icon */}
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-400/30 flex items-center justify-center backdrop-blur-sm">
            <Shield className="h-7 w-7 text-emerald-600 animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-2 max-w-[260px]">
          <p className="text-base font-bold text-foreground">Verificando identidad...</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Analizando autenticidad del documento, extrayendo datos y comparando rostro con selfie
          </p>
        </div>

        {/* Animated steps */}
        <div className="flex flex-col gap-2 w-full max-w-[240px]">
          {['Analizando documento', 'Extrayendo datos', 'Comparando rostro'].map((label, i) => (
            <div key={label} className="flex items-center gap-2.5 animate-fade-in" style={{ animationDelay: `${i * 0.6}s`, animationFillMode: 'both' }}>
              <div className="h-5 w-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" style={{ animationDelay: `${i * 0.3}s` }} />
              </div>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Camera overlay
  if (cameraActive) {
    if (cameraStep === 'selfie') {
      return (
        <div>
          <CaptureFlash show={showFlash} />
          <SelfieCameraOverlay
            videoRef={videoRef}
            onCapture={capturePhoto}
            onCancel={stopCamera}
            uploading={uploading !== null}
            stabilityProgress={stabilityProgress}
            documentDetected={documentDetected}
            initialDelayDone={initialDelayDone}
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      );
    }

    return (
      <div>
        <CaptureFlash show={showFlash} />
        <DocCameraOverlay
          videoRef={videoRef}
          cameraStep={cameraStep}
          onCapture={capturePhoto}
          onCancel={stopCamera}
          uploading={uploading !== null}
          stabilityProgress={stabilityProgress}
          documentDetected={documentDetected}
          initialDelayDone={initialDelayDone}
          alignmentProgress={alignmentProgress}
          alignedQuadrants={alignedQuadrants}
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {/* Identity type selector - only show when this section has identity docs */}
      {hasIdentityDocs && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Tipo de identificación</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleIdentityModeChange('ine')}
              className={cn(
                "py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border",
                identityMode === 'ine'
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5"
              )}
            >
              INE
            </button>
            <button
              onClick={() => handleIdentityModeChange('pasaporte')}
              className={cn(
                "py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border",
                identityMode === 'pasaporte'
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5"
              )}
            >
              Pasaporte
            </button>
          </div>

          {/* Camera capture button for identity docs */}
          {identityMode === 'ine' ? (
            <button
              onClick={() => startCamera('front')}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Capturar INE con cámara
            </button>
          ) : (
            <button
              onClick={() => startCamera('passport')}
              className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Capturar Pasaporte con cámara
            </button>
          )}
        </div>
      )}

      {visibleDocTypes.map((typeId) => {
        const docType = docTypes.find((d: any) => d.id === typeId);
        const doc = getDocForType(typeId);
        const status = getStatusInfo(doc);
        const StatusIcon = status.icon;
        const isValidated = doc?.id_estatus_verificacion === 2;
        const isUploading = uploading === typeId;
        const isCameraDoc = CAMERA_DOC_TYPES.includes(typeId);

        // Special rendering for doc type 48 (Carta de cumplimiento - firma digital)
        if (typeId === 48) {
          const firmaEstado = firmaExistente?.estado;
          const firmaCompletada = firmaEstado === 'completado';
          const firmaEnProgreso = firmaEstado === 'enviado' || firmaEstado === 'firmado_parcial';
          const agentAlreadySigned = !!firmaExistente?.agentAlreadySigned;
          const pendienteContraparte = firmaEnProgreso && agentAlreadySigned;
          const pdfUrl = firmaExistente?.pdf_firmado_url;

          // Determine status display for firma
          const firmaStatus = firmaCompletada
            ? { label: 'Firmado', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle2 }
            : pendienteContraparte
            ? { label: 'Pendiente contraparte', color: 'text-blue-600', bg: 'bg-blue-500/10', icon: Clock }
            : firmaEnProgreso
            ? { label: firmaEstado === 'firmado_parcial' ? 'Firma parcial' : 'Enviado', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock }
            : isValidated
            ? { label: 'Validado', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle2 }
            : doc
            ? status
            : { label: 'Sin firmar', color: 'text-muted-foreground', bg: 'bg-muted', icon: PenTool };

          const FirmaIcon = firmaStatus.icon;

          return (
            <div
              key={typeId}
              className={`rounded-2xl border-2 transition-all duration-300 shadow-sm hover:shadow-md ${
                firmaCompletada || isValidated
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : firmaEnProgreso
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-dashed border-muted-foreground/20 bg-muted/30'
              }`}
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <PenTool className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">
                      {docType?.nombre || 'Carta de Acuerdos'}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 shrink-0 ${firmaStatus.color} ${firmaStatus.bg} border-0`}
                  >
                    <FirmaIcon className="h-3 w-3 mr-1" />
                    {firmaStatus.label}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  {/* View PDF if available */}
                  {(pdfUrl || doc?.url) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCartaPdfViewerUrl(pdfUrl || doc?.url || null)}
                      className="h-10 px-3 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5 border-primary/20"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver PDF
                    </Button>
                  )}

                  {/* Firmar button - no active firma */}
                  {!firmaCompletada && !firmaEnProgreso && !isValidated && (
                    <Button
                      size="sm"
                      disabled={sendingToMifiel}
                      onClick={handleFirmarCarta}
                      className="flex-1 h-10 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5"
                    >
                      {sendingToMifiel ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <PenTool className="h-3.5 w-3.5" />
                          Firmar Carta
                        </>
                      )}
                    </Button>
                  )}

                  {/* Continuar firma button */}
                  {firmaEnProgreso && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={pendienteContraparte ? undefined : handleContinuarFirma}
                      disabled={syncingFirma || pendienteContraparte}
                      className={cn(
                        "flex-1 h-10 rounded-2xl shadow-md font-semibold text-xs gap-1.5",
                        pendienteContraparte
                          ? "opacity-70 cursor-not-allowed"
                          : "hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                      )}
                    >
                      {syncingFirma ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : pendienteContraparte ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {syncingFirma
                        ? 'Sincronizando...'
                        : pendienteContraparte
                        ? 'Pendiente firma SOZU'
                        : 'Continuar firma'}
                    </Button>
                  )}

                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={typeId}
            className={`rounded-2xl border-2 transition-all duration-300 shadow-sm hover:shadow-md ${
              isValidated
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : doc
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-dashed border-muted-foreground/20 bg-muted/30'
            }`}
          >
            <div className="p-4 space-y-3">
              {/* Doc name + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {docType?.nombre || `Documento ${typeId}`}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-2 py-0.5 shrink-0 ${status.color} ${status.bg} border-0`}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.label}
                </Badge>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {doc?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(doc.url, '_blank')}
                    className="h-10 px-3 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5 border-primary/20"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ver
                  </Button>
                )}

                {!isValidated && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => handleFileSelect(typeId)}
                    className="flex-1 h-10 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : doc ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Actualizar
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Subir
                      </>
                    )}
                  </Button>
                )}

                {isCameraDoc && !isValidated && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => {
                      if (typeId === 2) startCamera('front');
                      else if (typeId === 3) startCamera('back');
                      else if (typeId === 4) startCamera('passport');
                    }}
                    className="h-10 px-3 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5 bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                )}

              </div>
            </div>
          </div>
        );
      })}

      {/* Mifiel Signing Dialog */}
      {mifielWidgetId && (
        <MifielSigningDialog
          open={mifielDialogOpen}
          onOpenChange={setMifielDialogOpen}
          widgetId={mifielWidgetId}
          onSuccess={handleMifielSuccess}
          onError={(err) => toast.error("Error en firma: " + err)}
        />
      )}

      <PdfViewerDialog
        open={!!cartaPdfViewerUrl}
        onOpenChange={(open) => { if (!open) setCartaPdfViewerUrl(null); }}
        url={cartaPdfViewerUrl || ""}
        title="Carta de Cumplimiento"
      />
    </div>
  );
}

// ---------- Step Form ----------

interface StepFormProps {
  step: 'basic' | 'address' | 'fiscal';
  persona: any;
  personaId: number;
  onSaved: () => void;
}

// ---------- Agent Training Step ----------

function AgentTrainingStep({ personaId, onSaved, onTrackSave, onTrackFieldChange }: { personaId: number; onSaved: () => void; onTrackSave?: () => void; onTrackFieldChange?: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [mode, setMode] = useState<'schedule' | 'already-attended'>('schedule');
  const [attendedDate, setAttendedDate] = useState<Date | undefined>(undefined);
  const initializedFromCita = useRef(false);
  const [citaCancelledExternally, setCitaCancelledExternally] = useState(false);
  const verifiedEventRef = useRef(false);

  // Fetch agent's project access via proyectos_acceso (no RLS restrictions)
  const { data: agentProjectIds = [] } = useQuery({
    queryKey: ['agent-project-ids', personaId],
    queryFn: async () => {
      // First get the agent's email from usuarios
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('email')
        .eq('id_persona', personaId)
        .single();
      if (!usuario?.email) return [];

      // Then get their project access
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', usuario.email)
        .eq('activo', true);
      if (error) throw error;
      return (data || []).map((d: any) => d.proyecto_id as number);
    },
    staleTime: 0,
  });

  // Fetch existing appointment (including cancelled to show warning)
  const { data: existingCita } = useQuery({
    queryKey: ['agent-training-cita', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservas_citas')
        .select('*')
        .eq('id_persona', personaId)
        .in('estatus', ['programada', 'asistio', 'cancelada', 'no_asistio'])
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  // Fetch training configs matching agent's projects (DB-only)
  const { data: trainingConfigs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['training-configs-for-agent', agentProjectIds],
    queryFn: async () => {
      // Get all active training configs (tipo_cita=1)
      const { data: allConfigs } = await supabase
        .from('configuracion_citas_usuarios')
        .select('id, nombre, id_usuario_email, duracion_minutos, max_invitados, correos_enterado, fecha_fin_recurrencia')
        .eq('id_tipo_cita', 1)
        .eq('activo', true);
      if (!allConfigs || allConfigs.length === 0) return [];

      const configIds = allConfigs.map((c: any) => c.id);
      const { data: configProjects } = await supabase
        .from('configuracion_citas_proyectos')
        .select('id_configuracion_cita, id_proyecto')
        .in('id_configuracion_cita', configIds);

      // Filter to configs that match agent's projects
      const filtered = allConfigs.filter((c: any) => {
        const projIds = (configProjects || []).filter((cp: any) => cp.id_configuracion_cita === c.id).map((cp: any) => cp.id_proyecto);
        return projIds.some((pid: number) => agentProjectIds.includes(pid));
      });

      // Fetch trainer names from personas by email
      const emails = [...new Set(filtered.map((c: any) => c.id_usuario_email).filter(Boolean))];
      if (emails.length > 0) {
        const { data: personas } = await supabase
          .from('personas')
          .select('email, nombre_legal')
          .in('email', emails);
        const emailToName = new Map((personas || []).map((p: any) => [p.email, p.nombre_legal]));
        filtered.forEach((c: any) => {
          c.owner_display_name = emailToName.get(c.id_usuario_email) || null;
        });
      }

      return filtered;
    },
    enabled: agentProjectIds.length > 0,
    staleTime: 0,
  });

  // Fetch horarios for matching configs → generate available dates
  const matchingConfigIds = trainingConfigs.map((c: any) => c.id);
  const { data: availableDates = [], isLoading: loadingDates } = useQuery({
    queryKey: ['training-available-dates-db', matchingConfigIds],
    queryFn: async () => {
      if (matchingConfigIds.length === 0) return [];
      const { data: horarios } = await supabase
        .from('configuracion_citas_horarios')
        .select('id_configuracion_cita, dia_semana')
        .in('id_configuracion_cita', matchingConfigIds)
        .eq('activo', true);
      if (!horarios || horarios.length === 0) return [];

      // Build a map of day_of_week → max fecha_fin_recurrencia across configs
      const dayToMaxEnd = new Map<number, Date>();
      for (const h of horarios) {
        const day = h.dia_semana as number;
        const configId = h.id_configuracion_cita;
        const config = trainingConfigs.find((c: any) => c.id === configId);
        const endStr = config?.fecha_fin_recurrencia;
        const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;
        if (endDate) {
          const current = dayToMaxEnd.get(day);
          if (!current || endDate > current) dayToMaxEnd.set(day, endDate);
        }
        // If any config for this day has no end date, treat as unlimited
        if (!endDate) dayToMaxEnd.set(day, new Date(9999, 11, 31));
      }

      const dates: Date[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 28);

      for (let d = new Date(today); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay();
        const endLimit = dayToMaxEnd.get(jsDay);
        if (endLimit && d >= today && d <= endLimit) {
          dates.push(new Date(d));
        }
      }
      return dates;
    },
    enabled: matchingConfigIds.length > 0,
    staleTime: 0,
  });

  // When a date is selected, fetch available slots from DB
  const fechaStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const dayOfWeek = selectedDate ? selectedDate.getDay() : -1;

  const { data: dbSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['training-slots-db', fechaStr, matchingConfigIds, personaId],
    queryFn: async () => {
      if (matchingConfigIds.length === 0 || dayOfWeek < 0) return [];

      // Get configured hours for this weekday
      const { data: horarios } = await supabase
        .from('configuracion_citas_horarios')
        .select('id_configuracion_cita, hora')
        .in('id_configuracion_cita', matchingConfigIds)
        .eq('dia_semana', dayOfWeek)
        .eq('activo', true);
      if (!horarios || horarios.length === 0) return [];

      // Get existing bookings for this date
      const { data: bookings } = await supabase
        .from('reservas_citas')
        .select('id_configuracion_cita, hora_inicio, id_persona')
        .in('id_configuracion_cita', matchingConfigIds)
        .eq('fecha', fechaStr)
        .eq('activo', true)
        .in('estatus', ['programada']);

      // Get externally cancelled slots for this date
      const { data: cancelledSlots } = await supabase
        .from('citas_calendar_events')
        .select('id_configuracion_cita, hora')
        .in('id_configuracion_cita', matchingConfigIds)
        .eq('fecha', fechaStr)
        .eq('cancelado_externamente', true)
        .eq('activo', true);
      const cancelledSet = new Set(
        (cancelledSlots || []).map((cs: any) => `${cs.id_configuracion_cita}_${cs.hora}`)
      );

      // Build slots grouped by config
      type SlotInfo = {
        config_id: number;
        config_name: string;
        owner_name: string;
        hora: string;
        attendees: number;
        max_invitados: number;
        is_full: boolean;
        is_cancelled_externally: boolean;
      };

      const result: SlotInfo[] = [];
      for (const h of horarios) {
        const config = trainingConfigs.find((c: any) => c.id === h.id_configuracion_cita);
        if (!config) continue;

        const horaLabel = `${String(h.hora).padStart(2, '0')}:00`;
        const maxInvitados = (config.max_invitados || 1);
        const isCancelledExternally = cancelledSet.has(`${config.id}_${h.hora}`);

        // Count bookings for this slot (excluding the current persona so they can reschedule)
        const slotBookings = (bookings || []).filter((b: any) =>
          b.id_configuracion_cita === config.id &&
          b.hora_inicio?.slice(0, 5) === horaLabel &&
          b.id_persona !== personaId
        );
        const attendeeCount = slotBookings.length;

        result.push({
          config_id: config.id,
          config_name: config.nombre,
          owner_name: config.id_usuario_email?.split('@')[0] || '',
          hora: horaLabel,
          attendees: attendeeCount,
          max_invitados: maxInvitados,
          is_full: attendeeCount >= maxInvitados,
          is_cancelled_externally: isCancelledExternally,
        });
      }
      return result;
    },
    enabled: !!fechaStr && matchingConfigIds.length > 0,
  });

  // Reset slot when date changes
  useEffect(() => {
    if (initializedFromCita.current) {
      setSelectedSlot('');
      setSelectedConfigId(null);
    }
  }, [fechaStr]);

  // Pre-select date and time from existing appointment
  useEffect(() => {
    if (existingCita && !initializedFromCita.current) {
      initializedFromCita.current = true;
      // If the cita is cancelled or inactive, mark as externally cancelled
      if (existingCita.estatus === 'cancelada' || !existingCita.activo) {
        setCitaCancelledExternally(true);
        return;
      }
      // If admin marked "no asistió", allow rescheduling without pre-selecting old slot
      if (existingCita.estatus === 'no_asistio') {
        return;
      }
      if (existingCita.fecha) {
        setSelectedDate(new Date(existingCita.fecha + 'T12:00:00'));
      }
      if (existingCita.hora_inicio) {
        setSelectedSlot(existingCita.hora_inicio.slice(0, 5));
      }
    }
  }, [existingCita]);

  // Verify if the Google Calendar event still exists for programada/agendada citas only
  useEffect(() => {
    if (existingCita?.estatus === 'programada' && existingCita?.activo && existingCita?.google_calendar_event_id && !verifiedEventRef.current) {
      verifiedEventRef.current = true;
      const config = trainingConfigs.find((c: any) => c.id === existingCita.id_configuracion_cita);
      supabase.functions.invoke('agendar-capacitacion', {
        body: {
          action: 'verify-event',
          google_calendar_event_id: existingCita.google_calendar_event_id,
          reserva_id: existingCita.id,
          calendar_owner_email: config?.id_usuario_email || undefined,
        },
      }).then(({ data }) => {
        if (data && data.exists === false && data.cancelled) {
          setCitaCancelledExternally(true);
          setSelectedDate(undefined);
          setSelectedSlot('');
          setSelectedConfigId(null);
          initializedFromCita.current = true;
          queryClient.invalidateQueries({ queryKey: ['agent-training-cita', personaId] });
          queryClient.invalidateQueries({ queryKey: ['agent-onboarding-training'] });
          queryClient.invalidateQueries({ queryKey: ['training-slots-db'] });
        }
      }).catch((err) => {
        console.error('Error verifying calendar event:', err);
      });
    }
  }, [existingCita, trainingConfigs, personaId, queryClient]);

  const getStatusBadge = () => {
    if (citaCancelledExternally) {
      return <Badge variant="destructive"><RefreshCw className="h-3 w-3 mr-1" />Cancelada externamente</Badge>;
    }
    if (!existingCita) return null;
    // Use id_estatus_cita if available
    const estatusCita = (existingCita as any).id_estatus_cita;
    if (estatusCita === 3) return <Badge className="bg-emerald-500 text-white border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmada</Badge>;
    if (estatusCita === 2) return <Badge className="bg-amber-500 text-white border-0"><Clock className="h-3 w-3 mr-1" />Pendiente de confirmación</Badge>;
    if (estatusCita === 1) return <Badge className="bg-blue-500 text-white border-0"><CalendarDays className="h-3 w-3 mr-1" />Agendada</Badge>;
    switch (existingCita.estatus) {
      case 'asistio': return <Badge className="bg-emerald-500 text-white border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmada</Badge>;
      case 'programada': return <Badge className="bg-blue-500 text-white border-0"><CalendarDays className="h-3 w-3 mr-1" />Agendada</Badge>;
      case 'no_asistio': return <Badge variant="destructive"><RefreshCw className="h-3 w-3 mr-1" />No asistió</Badge>;
      case 'cancelada': return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
      default: return null;
    }
  };

  // Get the config name to display as title
  const formatConfigLabel = (c: any) => c.owner_display_name ? `${c.nombre} (capacitador: ${c.owner_display_name})` : c.nombre;
  const configName = trainingConfigs.length === 1 ? formatConfigLabel(trainingConfigs[0]) : trainingConfigs.length > 0 ? trainingConfigs.map((c: any) => formatConfigLabel(c)).join(' / ') : 'Capacitación';

  const handleSchedule = async () => {
    onTrackSave?.();
    if (!selectedDate || !selectedSlot || !selectedConfigId) {
      toast.error("Selecciona fecha y hora.");
      return;
    }

    setSaving(true);

    // Deactivate any existing booking before creating a new one
    if (existingCita && (existingCita.estatus === 'programada' || existingCita.estatus === 'no_asistio')) {
      await supabase
        .from('reservas_citas')
        .update({ activo: false, estatus: 'cancelada' })
        .eq('id', existingCita.id);
    }
    try {
      const { data: persona } = await supabase
        .from('personas')
        .select('email')
        .eq('id', personaId)
        .single();

      const { data: entRel } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .limit(1)
        .maybeSingle();

      let showroomData: any = null;
      if (entRel?.id_proyecto) {
        const { data: showroom } = await supabase
          .from('showrooms_proyecto')
          .select('descripcion_direccion, latitud, longitud')
          .eq('id_proyecto', entRel.id_proyecto)
          .eq('activo', true)
          .limit(1)
          .maybeSingle();
        showroomData = showroom;
      }

      const selectedConfig = trainingConfigs.find((c: any) => c.id === selectedConfigId);

      const { data, error } = await supabase.functions.invoke('agendar-capacitacion', {
        body: {
          fecha: fechaStr,
          hora_inicio: selectedSlot,
          id_persona: personaId,
          agent_email: persona?.email || '',
          calendar_owner_email: selectedConfig?.id_usuario_email || undefined,
          config_id: selectedConfigId,
          direccion_showroom: showroomData?.descripcion_direccion || null,
          latitud_showroom: showroomData?.latitud || null,
          longitud_showroom: showroomData?.longitud || null,
        },
      });

      if (error) throw error;
      if (data?.error === 'no_disponible') {
        toast.error(data.message || "El horario no está disponible.");
        queryClient.invalidateQueries({ queryKey: ['training-slots-db'] });
        return;
      }
      if (data?.error) throw new Error(data.error);

      toast.success("Cita de capacitación agendada correctamente.");
      initializedFromCita.current = false;
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-training'] });
      queryClient.invalidateQueries({ queryKey: ['agent-training-cita', personaId] });
      queryClient.invalidateQueries({ queryKey: ['training-slots-db'] });
      onSaved();
    } catch (err: any) {
      console.error("Error scheduling:", err);
      toast.error("Error al agendar: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const isCompleted = existingCita?.estatus === 'asistio' || (existingCita as any)?.id_estatus_cita === 3;
  const isProgrammed = (existingCita?.estatus === 'programada' || (existingCita as any)?.id_estatus_cita === 1) && !citaCancelledExternally;
  const isPendingConfirmation = (existingCita as any)?.id_estatus_cita === 2;
  const isNoShow = existingCita?.estatus === 'no_asistio';

  const availableSlots = dbSlots.filter(s => !s.is_full);

  const handleAlreadyAttended = async () => {
    onTrackSave?.();
    if (!attendedDate) {
      toast.error("Selecciona la fecha en que acudiste.");
      return;
    }
    setSaving(true);
    try {
      // Deactivate any existing booking
      if (existingCita && (existingCita.estatus === 'programada' || existingCita.estatus === 'no_asistio')) {
        await supabase
          .from('reservas_citas')
          .update({ activo: false, estatus: 'cancelada' })
          .eq('id', existingCita.id);
      }

      // Insert a new record with status "Pendiente de confirmación"
      const { error } = await supabase
        .from('reservas_citas')
        .insert({
          id_tipo_cita: 1,
          id_persona: personaId,
          fecha: format(attendedDate, 'yyyy-MM-dd'),
          hora_inicio: '00:00',
          hora_fin: '00:00',
          ubicacion: 'Presencial',
          estatus: 'programada',
          id_estatus_cita: 2,
          fecha_asistencia: format(attendedDate, 'yyyy-MM-dd'),
        });
      if (error) throw error;

      toast.success("Asistencia reportada. Pendiente de confirmación del administrador.");
      initializedFromCita.current = false;
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-training'] });
      queryClient.invalidateQueries({ queryKey: ['agent-training-cita', personaId] });
      onSaved();
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Config name removed from here — shown below in Fechas disponibles */}

      {/* Status */}
      {(existingCita || citaCancelledExternally) && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Estado actual:</span>
          {getStatusBadge()}
        </div>
      )}

      {/* Cancelled externally warning */}
      {citaCancelledExternally && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-xs text-destructive font-medium">
            Tu cita fue cancelada desde el calendario. Selecciona una nueva fecha y horario para reprogramar.
          </p>
        </div>
      )}

      {/* No show warning */}
      {isNoShow && !citaCancelledExternally && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700 font-medium">
            Tu asistencia no fue confirmada en la cita anterior. Selecciona una nueva fecha y horario para reagendar.
          </p>
        </div>
      )}

      {isCompleted ? (
        <div className="text-center py-6 space-y-2">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-emerald-600">¡Capacitación confirmada!</p>
          <p className="text-xs text-muted-foreground">Tu asistencia fue confirmada por el administrador.</p>
        </div>
      ) : isPendingConfirmation ? (
        <div className="text-center py-6 space-y-2">
          <Clock className="h-12 w-12 text-amber-500 mx-auto" />
          <p className="text-sm font-semibold text-amber-600">Pendiente de confirmación</p>
          <p className="text-xs text-muted-foreground">Reportaste tu asistencia. Un administrador confirmará próximamente.</p>
        </div>
      ) : (
        <>
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('schedule')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                mode === 'schedule'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              Agendar cita
            </button>
            <button
              onClick={() => setMode('already-attended')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                mode === 'already-attended'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              Ya acudí
            </button>
          </div>

          {mode === 'already-attended' ? (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  ¿En qué fecha acudiste?
                </Label>
                <div className="border rounded-lg flex justify-center">
                  <Calendar
                    mode="single"
                    selected={attendedDate}
                    onSelect={(d) => { setAttendedDate(d); onTrackFieldChange?.(); }}
                    disabled={(date) => date > new Date()}
                  />
                </div>
                {attendedDate && (
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    {format(attendedDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                )}
              </div>
              <button
                onClick={handleAlreadyAttended}
                disabled={saving || !attendedDate}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : "Reportar asistencia"}
              </button>
            </div>
          ) : (
            <>
              {/* Available Dates as chips */}
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Fechas disponibles
                </Label>
                {configName && (
                  <p className="text-xs text-muted-foreground font-medium -mt-1 mb-1">{configName}</p>
                )}
                {loadingDates || loadingConfigs ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Cargando fechas...</span>
                  </div>
                ) : availableDates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableDates.map((date) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;
                      const isExistingDate = existingCita?.fecha === dateStr;
                      const isCancelledDate = citaCancelledExternally && existingCita?.fecha === dateStr;
                      return (
                        <button
                          key={dateStr}
                          onClick={() => { setSelectedDate(date); onTrackFieldChange?.(); }}
                          className={`py-2 px-3 rounded-xl text-xs font-medium transition-all duration-200 border relative ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]'
                              : isCancelledDate
                                ? 'bg-destructive/10 border-destructive/40 text-destructive hover:border-destructive/60'
                                : isExistingDate
                                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30'
                                  : 'bg-card border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5'
                          }`}
                        >
                          <span className="capitalize">{format(date, "EEE d MMM", { locale: es })}</span>
                          {isCancelledDate && !isSelected && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-card" />
                          )}
                          {isExistingDate && !isSelected && !isCancelledDate && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-card" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 rounded-xl border border-border/60 bg-muted/30">
                    <p className="text-sm text-muted-foreground">No hay fechas disponibles.</p>
                  </div>
                )}
              </div>

              {/* Time Slots from DB */}
              {selectedDate && (
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Horarios disponibles — <span className="capitalize font-normal">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
                  </Label>
                  {loadingSlots ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Consultando disponibilidad...</span>
                    </div>
                  ) : dbSlots.length > 0 ? (
                    <div className="space-y-4">
                      {trainingConfigs.filter((cfg: any) => dbSlots.some(s => s.config_id === cfg.id)).map((cfg: any) => {
                        const cfgSlots = dbSlots.filter(s => s.config_id === cfg.id);
                        return (
                          <div key={cfg.id} className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {cfg.owner_display_name ? `${cfg.nombre} (capacitador: ${cfg.owner_display_name})` : cfg.nombre}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {cfgSlots.map((slot) => {
                                const isExisting = existingCita?.hora_inicio?.slice(0, 5) === slot.hora && existingCita?.fecha === fechaStr;
                                const isCancelledSlot = (citaCancelledExternally && isExisting) || slot.is_cancelled_externally;
                                const isSelected = selectedSlot === slot.hora && selectedConfigId === slot.config_id;
                                const isDisabled = slot.is_full || isCancelledSlot;
                                return (
                                  <button
                                    key={`${slot.config_id}-${slot.hora}`}
                                    onClick={() => {
                                      if (!isDisabled) {
                                        setSelectedSlot(slot.hora);
                                        setSelectedConfigId(slot.config_id);
                                        onTrackFieldChange?.();
                                      }
                                    }}
                                    disabled={isDisabled}
                                    className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 border relative ${
                                      isCancelledSlot
                                        ? 'bg-destructive/10 border-destructive/40 text-destructive/60 cursor-not-allowed line-through'
                                        : slot.is_full
                                          ? 'bg-muted/50 border-border/30 text-muted-foreground/50 cursor-not-allowed'
                                          : isSelected
                                            ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]'
                                            : isExisting
                                              ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30'
                                              : 'bg-card border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5'
                                    }`}
                                  >
                                    <span>{slot.hora}</span>
                                    {isCancelledSlot && (
                                      <span className="ml-2 text-[10px] text-destructive/70">cancelado</span>
                                    )}
                                    {!isCancelledSlot && (
                                      <span className={`ml-2 text-[10px] ${slot.is_full ? 'text-destructive/60' : 'text-muted-foreground'}`}>
                                        {slot.attendees}/{slot.max_invitados}
                                      </span>
                                    )}
                                    {isExisting && !isSelected && !isCancelledSlot && (
                                      <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-card" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 rounded-xl border border-border/60 bg-muted/30">
                      <p className="text-sm text-muted-foreground">No hay horarios disponibles para esta fecha.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Selecciona otra fecha.</p>
                    </div>
                  )}
                </div>
              )}

              {isProgrammed && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Ya tienes una cita programada. Si reagendas, se cancelará la anterior.
                  </p>
                </div>
              )}

              <button
                onClick={handleSchedule}
                disabled={saving || !selectedDate || !selectedSlot}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Agendando...</> : citaCancelledExternally ? "Reprogramar Cita" : isProgrammed ? "Reagendar Cita" : "Agendar Cita"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
// ---------- Step Form ----------

interface StepFormProps {
  step: 'basic' | 'address' | 'fiscal';
  persona: any;
  personaId: number;
  onSaved: () => void;
  onTrackSave?: () => void;
  onTrackFieldChange?: () => void;
  basicDocTypes?: number[];
}

function StepForm({ step, persona, personaId, onSaved, onTrackSave, onTrackFieldChange, basicDocTypes }: StepFormProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(step === 'basic' ? 'personal' : step === 'fiscal' ? 'datos' : '');

  // Basic fields
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [curp, setCurp] = useState('');
  const [sexo, setSexo] = useState('');

  // Address fields
  const [calle, setCalle] = useState('');
  const [numExt, setNumExt] = useState('');
  const [numInt, setNumInt] = useState('');
  const [colonia, setColonia] = useState('');
  const [cp, setCp] = useState('');
  const [idPais, setIdPais] = useState('');
  const [idEstado, setIdEstado] = useState('');
  const [idMunicipio, setIdMunicipio] = useState('');

  // Fiscal fields
  const [rfc, setRfc] = useState('');
  const [regimen, setRegimen] = useState('');
  const [usoCfdi, setUsoCfdi] = useState('');
  const [fCalle, setFCalle] = useState('');
  const [fNumExt, setFNumExt] = useState('');
  const [fNumInt, setFNumInt] = useState('');
  const [fColonia, setFColonia] = useState('');
  const [fCp, setFCp] = useState('');
  const [fIdPais, setFIdPais] = useState('');
  const [fIdEstado, setFIdEstado] = useState('');
  const [fIdMunicipio, setFIdMunicipio] = useState('');
  const [copiarDireccion, setCopiarDireccion] = useState(false);
  const initializedRef = useRef(false);

  // Initialize from persona
  useEffect(() => {
    if (!persona) return;
    setNombre(persona.nombre_legal || '');
    setEmail(persona.email || '');
    setTelefono(persona.telefono || '');
    setCurp(persona.curp || '');
    setSexo(persona.sexo || '');
    setCalle(persona.direccion_calle || '');
    setNumExt(persona.direccion_num_ext || '');
    setNumInt(persona.direccion_num_int || '');
    setColonia(persona.direccion_colonia || '');
    setCp(persona.direccion_codigo_postal || '');
    setIdPais(persona.direccion_id_pais || '');
    setIdEstado(persona.direccion_id_estado?.toString() || '');
    setIdMunicipio(persona.direccion_id_municipio?.toString() || '');
    setRfc(persona.rfc || '');
    setRegimen(persona.regimen?.toString() || '');
    setUsoCfdi(persona.uso_cfdi || '');
    setFCalle(persona.direccion_fiscal_calle || '');
    setFNumExt(persona.direccion_fiscal_num_ext || '');
    setFNumInt(persona.direccion_fiscal_num_int || '');
    setFColonia(persona.direccion_fiscal_colonia || '');
    setFCp(persona.direccion_fiscal_codigo_postal || '');
    setFIdPais(persona.direccion_fiscal_id_pais || '');
    setFIdEstado(persona.direccion_fiscal_id_estado?.toString() || '');
    setFIdMunicipio(persona.direccion_fiscal_id_municipio?.toString() || '');
    initializedRef.current = true;
  }, [persona]);

  // Lookups
  const { data: paises = [] } = useQuery({
    queryKey: ['paises'],
    queryFn: async () => {
      const { data } = await supabase.from('paises').select('id, nombre').eq('activo', true).order('nombre');
      return data || [];
    },
  });

  const { data: estados = [] } = useQuery({
    queryKey: ['estados'],
    queryFn: async () => {
      const { data } = await supabase.from('estados_mx').select('id, nombre, id_pais').eq('activo', true).order('nombre');
      return data || [];
    },
  });

  const { data: municipios = [] } = useQuery({
    queryKey: ['municipios-all'],
    queryFn: async () => {
      const { data } = await supabase.from('municipios_mx').select('id, nombre, id_estado').eq('activo', true).order('nombre');
      return data || [];
    },
    enabled: step === 'basic' || step === 'address' || step === 'fiscal',
  });

  const { data: regimenes = [] } = useQuery({
    queryKey: ['regimen', 'pf'],
    queryFn: async () => {
      const { data } = await supabase.from('regimen').select('id, nombre').eq('activo', true).in('tipo', ['pf']).order('nombre');
      return data || [];
    },
    enabled: step === 'fiscal',
  });

  const { data: usosCfdi = [] } = useQuery({
    queryKey: ['uso_cfdi', 'pf'],
    queryFn: async () => {
      const { data } = await supabase.from('uso_cfdi').select('codigo, nombre').eq('activo', true).in('tipo', ['pf', 'a']).order('codigo');
      return data || [];
    },
    enabled: step === 'fiscal',
  });

  // Copy address for fiscal — clear when unchecked (skip initial mount)
  useEffect(() => {
    if (!initializedRef.current) return;
    if (copiarDireccion) {
      setFCalle(calle || persona?.direccion_calle || '');
      setFNumExt(numExt || persona?.direccion_num_ext || '');
      setFNumInt(numInt || persona?.direccion_num_int || '');
      setFColonia(colonia || persona?.direccion_colonia || '');
      setFCp(cp || persona?.direccion_codigo_postal || '');
      setFIdPais(idPais || persona?.direccion_id_pais || '');
      setFIdEstado(idEstado || persona?.direccion_id_estado?.toString() || '');
      setFIdMunicipio(idMunicipio || persona?.direccion_id_municipio?.toString() || '');
    } else {
      setFCalle('');
      setFNumExt('');
      setFNumInt('');
      setFColonia('');
      setFCp('');
      setFIdPais('');
      setFIdEstado('');
      setFIdMunicipio('');
    }
  }, [copiarDireccion]);

  // Filtered lookups
  const filteredEstados = (paisId: string) => estados.filter((e: any) => e.id_pais === paisId);
  const filteredMunicipios = (estadoId: string) => municipios.filter((m: any) => m.id_estado === parseInt(estadoId));

  const handleSave = async () => {
    onTrackSave?.();
    setSaving(true);
    try {
      let updateData: any = {};
      let isIncomplete = false;

      if (step === 'basic') {
        // Validate format only if provided
        if (telefono.trim() && telefono.trim().length !== 10) {
          toast.error("El teléfono debe tener 10 dígitos.");
          setSaving(false);
          return;
        }
        if (curp.trim()) {
          const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
          if (!curpRegex.test(curp.trim().toUpperCase())) {
            toast.error("El formato del CURP no es válido (18 caracteres alfanuméricos).");
            setSaving(false);
            return;
          }
        }
        isIncomplete = !nombre.trim() || !email.trim() || !telefono.trim() || !calle.trim() || !numExt.trim() || !colonia.trim() || !cp.trim() || !idPais || !idEstado || !idMunicipio;
        updateData = {
          nombre_legal: nombre.trim() || null,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          curp: curp.trim().toUpperCase() || null,
          sexo: sexo || null,
          direccion_calle: calle.trim() || null,
          direccion_num_ext: numExt.trim() || null,
          direccion_num_int: numInt.trim() || null,
          direccion_colonia: colonia.trim() || null,
          direccion_codigo_postal: cp.trim() || null,
          direccion_id_pais: idPais || null,
          direccion_id_estado: idEstado ? parseInt(idEstado) : null,
          direccion_id_municipio: idMunicipio ? parseInt(idMunicipio) : null,
        };
      } else if (step === 'address') {
        isIncomplete = !calle.trim() || !numExt.trim() || !colonia.trim() || !cp.trim() || !idPais || !idEstado || !idMunicipio;
        updateData = {
          direccion_calle: calle.trim() || null,
          direccion_num_ext: numExt.trim() || null,
          direccion_num_int: numInt.trim() || null,
          direccion_colonia: colonia.trim() || null,
          direccion_codigo_postal: cp.trim() || null,
          direccion_id_pais: idPais || null,
          direccion_id_estado: idEstado ? parseInt(idEstado) : null,
          direccion_id_municipio: idMunicipio ? parseInt(idMunicipio) : null,
        };
      } else if (step === 'fiscal') {
        if (rfc.trim()) {
          const rfcValidation = validateRFC(rfc);
          if (!rfcValidation.isValid) {
            toast.error(rfcValidation.error || "RFC inválido.");
            setSaving(false);
            return;
          }
        }
        isIncomplete = !rfc.trim() || !regimen || !usoCfdi || !fCalle.trim() || !fColonia.trim() || !fCp.trim() || !fIdPais || !fIdEstado || !fIdMunicipio;
        updateData = {
          rfc: rfc.trim().toUpperCase() || null,
          regimen: regimen || null,
          uso_cfdi: usoCfdi || null,
          direccion_fiscal_calle: fCalle.trim() || null,
          direccion_fiscal_num_ext: fNumExt.trim() || null,
          direccion_fiscal_num_int: fNumInt.trim() || null,
          direccion_fiscal_colonia: fColonia.trim() || null,
          direccion_fiscal_codigo_postal: fCp.trim() || null,
          direccion_fiscal_id_pais: fIdPais || null,
          direccion_fiscal_id_estado: fIdEstado ? parseInt(fIdEstado) : null,
          direccion_fiscal_id_municipio: fIdMunicipio ? parseInt(fIdMunicipio) : null,
        };
      }

      const { error } = await supabase
        .from('personas')
        .update(updateData)
        .eq('id', personaId);

      if (error) throw error;

      // Sync phone to usuarios if basic step
      if (step === 'basic' && telefono.trim()) {
        await supabase
          .from('usuarios')
          .update({ telefono: telefono.trim() })
          .eq('id_persona', personaId);
      }

      if (isIncomplete) {
        const stepTitle = STEP_TITLES[step] || step;
        toast.warning(`Información guardada. El paso "${stepTitle}" no se marcará como completado hasta llenar todos los campos obligatorios (*).`, { duration: 12000 });
      } else {
        toast.success("Información guardada correctamente.");
      }
      onSaved();
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message || "Error desconocido"));
    } finally {
      setSaving(false);
    }
  };

  // Render address fields helper
  const renderAddressFields = (
    prefix: string,
    calleVal: string, setCalleVal: (v: string) => void,
    numExtVal: string, setNumExtVal: (v: string) => void,
    numIntVal: string, setNumIntVal: (v: string) => void,
    coloniaVal: string, setColoniaVal: (v: string) => void,
    cpVal: string, setCpVal: (v: string) => void,
    paisVal: string, setPaisVal: (v: string) => void,
    estadoVal: string, setEstadoVal: (v: string) => void,
    municipioVal: string, setMunicipioVal: (v: string) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">Calle *</Label>
        <Input value={calleVal} onChange={(e) => setCalleVal(e.target.value)} className="mt-1.5 neu-input h-auto" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm font-semibold">Num. Ext. *</Label>
          <Input value={numExtVal} onChange={(e) => setNumExtVal(e.target.value)} className="mt-1.5 neu-input h-auto" />
        </div>
        <div>
          <Label className="text-sm font-semibold">Num. Int.</Label>
          <Input value={numIntVal} onChange={(e) => setNumIntVal(e.target.value)} className="mt-1.5 neu-input h-auto" />
        </div>
      </div>
      <div>
        <Label className="text-sm font-semibold">Colonia *</Label>
        <Input value={coloniaVal} onChange={(e) => setColoniaVal(e.target.value)} className="mt-1.5 neu-input h-auto" />
      </div>
      <div>
        <Label className="text-sm font-semibold">Código Postal *</Label>
        <Input value={cpVal} onChange={(e) => setCpVal(e.target.value)} className="mt-1.5 neu-input h-auto" maxLength={5} />
      </div>
      <div>
        <Label className="text-sm font-semibold">País *</Label>
        <Select value={paisVal} onValueChange={(v) => { setPaisVal(v); setEstadoVal(''); setMunicipioVal(''); }}>
          <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {paises.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-semibold">Estado *</Label>
        <Select value={estadoVal} onValueChange={(v) => { setEstadoVal(v); setMunicipioVal(''); }}>
          <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {filteredEstados(paisVal).map((e: any) => (
              <SelectItem key={e.id} value={e.id.toString()}>{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-semibold">Municipio *</Label>
        <Select value={municipioVal} onValueChange={setMunicipioVal}>
          <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {filteredMunicipios(estadoVal).map((m: any) => (
              <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      {step === 'basic' && (
        <Tabs defaultValue="personal" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="personal" className="text-xs">Datos personales</TabsTrigger>
            <TabsTrigger value="address" className="text-xs">Dirección</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">Documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="personal" className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Nombre completo *</Label>
              <Input value={nombre} onChange={(e) => { setNombre(e.target.value); onTrackFieldChange?.(); }} className="mt-1.5 neu-input h-auto" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Correo electrónico *</Label>
              <Input type="email" value={email} disabled className="mt-1.5 neu-input h-auto opacity-60" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Teléfono (10 dígitos) *</Label>
              <Input value={telefono} onChange={(e) => { setTelefono(e.target.value.replace(/\D/g, '')); onTrackFieldChange?.(); }} maxLength={10} className="mt-1.5 neu-input h-auto" />
            </div>
            <div>
              <Label className="text-sm font-semibold">CURP <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
              <Input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={18} placeholder="Ej. GARC850101HDFRRL09" className="mt-1.5 neu-input h-auto" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Tipo de Persona</Label>
              <Input value="Persona Física" disabled className="mt-1.5 neu-input h-auto opacity-60" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Sexo <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona sexo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="address" className="space-y-4">
            {renderAddressFields(
              'dir', calle, setCalle, numExt, setNumExt, numInt, setNumInt,
              colonia, setColonia, cp, setCp, idPais, setIdPais, idEstado, setIdEstado, idMunicipio, setIdMunicipio
            )}
          </TabsContent>
          <TabsContent value="documents" className="space-y-4">
            <AgentDocumentsStep personaId={personaId} filterDocTypes={basicDocTypes || BASIC_DOC_TYPES} onTrackFieldChange={onTrackFieldChange} />
          </TabsContent>
        </Tabs>
      )}

      {step === 'address' && renderAddressFields(
        'dir', calle, setCalle, numExt, setNumExt, numInt, setNumInt,
        colonia, setColonia, cp, setCp, idPais, setIdPais, idEstado, setIdEstado, idMunicipio, setIdMunicipio
      )}

      {step === 'fiscal' && (
        <Tabs defaultValue="datos" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="datos" className="text-xs">Datos</TabsTrigger>
            <TabsTrigger value="direccion" className="text-xs">Dirección</TabsTrigger>
            <TabsTrigger value="constancia" className="text-xs">Constancia</TabsTrigger>
          </TabsList>
          <TabsContent value="datos" className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">RFC *</Label>
              <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} className="mt-1.5 neu-input h-auto" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Régimen Fiscal *</Label>
              <Select value={regimen} onValueChange={setRegimen}>
                <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {regimenes.map((r: any) => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-semibold">Uso CFDI *</Label>
              <Select value={usoCfdi} onValueChange={setUsoCfdi}>
                <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {usosCfdi.map((u: any) => (
                    <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} - {u.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="direccion" className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox id="copiar" checked={copiarDireccion} onCheckedChange={(c) => setCopiarDireccion(!!c)} />
              <Label htmlFor="copiar" className="text-sm cursor-pointer">Copiar dirección física</Label>
            </div>
            {renderAddressFields(
              'fiscal', fCalle, setFCalle, fNumExt, setFNumExt, fNumInt, setFNumInt,
              fColonia, setFColonia, fCp, setFCp, fIdPais, setFIdPais, fIdEstado, setFIdEstado, fIdMunicipio, setFIdMunicipio
            )}
          </TabsContent>
          <TabsContent value="constancia" className="space-y-4">
            <AgentDocumentsStep personaId={personaId} filterDocTypes={FISCAL_DOC_TYPES} onTrackFieldChange={onTrackFieldChange} />
          </TabsContent>
        </Tabs>
      )}

      {/* Hide save button on document-only tabs (documents in basic, constancia in fiscal) */}
      {activeTab !== 'documents' && activeTab !== 'constancia' && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
        </button>
      )}
    </div>
  );
}

// ---------- Agent Bank Account Step (single account, evidence required) ----------

function AgentBankAccountStep({ personaId, onTrackFieldChange, onTrackSave }: { personaId: number; onTrackFieldChange?: () => void; onTrackSave?: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [bankId, setBankId] = useState('');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [clabe, setClabe] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [titular, setTitular] = useState('');
  const [titularIsSamePerson, setTitularIsSamePerson] = useState(false);
  const [existingId, setExistingId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch persona name for "same person" checkbox
  const { data: personaName } = useQuery({
    queryKey: ['agent-persona-name', personaId],
    queryFn: async () => {
      const { data } = await supabase.from('personas').select('nombre_legal').eq('id', personaId).single();
      return data?.nombre_legal || '';
    },
    enabled: !!personaId,
  });

  const { data: banks = [] } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data } = await supabase.from('bancos').select('id, nombre').eq('activo', true).order('nombre');
      return data || [];
    },
  });

  const { data: existingAccount, isLoading } = useQuery({
    queryKey: ['agent-bank-account', personaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cuentas_bancarias')
        .select('*, banco:bancos(nombre)')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!personaId,
  });

  useEffect(() => {
    if (existingAccount) {
      setBankId(existingAccount.id_banco?.toString() || '');
      setNumeroCuenta(existingAccount.numero_cuenta || '');
      setClabe(existingAccount.cuenta_clabe || '');
      setEvidencia(existingAccount.url_evidencia || '');
      setTitular((existingAccount as any).titular || '');
      setExistingId(existingAccount.id);
      // Check if titular matches persona name
      if ((existingAccount as any).titular && personaName && (existingAccount as any).titular === personaName) {
        setTitularIsSamePerson(true);
      }
    }
  }, [existingAccount, personaName]);

  const handleSave = async () => {
    onTrackSave?.();
    if (!bankId || !numeroCuenta) {
      toast.error("Completa banco y número de cuenta.");
      return;
    }
    if (!titular.trim()) {
      toast.error("El nombre del titular es obligatorio.");
      return;
    }
    if (!evidencia) {
      toast.error("La evidencia es obligatoria.");
      return;
    }
    const len = numeroCuenta.length;
    if (!/^\d+$/.test(numeroCuenta)) {
      toast.error("El número de cuenta solo debe contener dígitos.");
      return;
    }
    if (len < 8 || len > 34) {
      toast.error("El número de cuenta debe tener entre 8 y 34 dígitos.");
      return;
    }

    setSaving(true);
    try {
      const accountData = {
        id_banco: parseInt(bankId),
        numero_cuenta: numeroCuenta,
        cuenta_clabe: clabe || null,
        url_evidencia: evidencia,
        titular: titular.trim(),
        id_persona: personaId,
      };

      if (existingId) {
        const { error } = await (supabase as any).from('cuentas_bancarias').update(accountData).eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('cuentas_bancarias').insert([accountData]);
        if (error) throw error;
      }

      toast.success("Cuenta bancaria guardada.");
      queryClient.invalidateQueries({ queryKey: ['agent-bank-account'] });
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-bank'] });
      setIsEditing(false);
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingId) return;
    setSaving(true);
    try {
      await supabase.from('cuentas_bancarias').update({ activo: false }).eq('id', existingId);
      toast.success("Cuenta eliminada.");
      setExistingId(null);
      setBankId('');
      setNumeroCuenta('');
      setClabe('');
      setEvidencia('');
      setTitular('');
      setTitularIsSamePerson(false);
      setIsEditing(true);
      queryClient.invalidateQueries({ queryKey: ['agent-bank-account'] });
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-bank'] });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  // Show existing account view
  if (existingAccount && !isEditing) {
    return (
      <div className="space-y-4 pb-4">
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <Landmark className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{(existingAccount as any).banco?.nombre || 'Banco'}</p>
              <p className="text-xs text-muted-foreground">Cuenta: {existingAccount.numero_cuenta}</p>
              {(existingAccount as any).titular && (
                <p className="text-xs text-muted-foreground">Titular: {(existingAccount as any).titular}</p>
              )}
            </div>
          </div>
          {existingAccount.cuenta_clabe && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">CLABE:</span> {existingAccount.cuenta_clabe}
            </div>
          )}
          {existingAccount.url_evidencia && (
            <div className="text-xs">
              <span className="font-medium text-muted-foreground">Evidencia:</span>{' '}
              <a href={existingAccount.url_evidencia} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver documento</a>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setIsEditing(true)}>
              Editar
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={saving}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show form (add or edit)
  return (
    <div className="space-y-4 pb-4">
      <div>
        <Label className="text-sm font-semibold">Banco *</Label>
        <Select value={bankId} onValueChange={(v) => { setBankId(v); onTrackFieldChange?.(); }}>
          <SelectTrigger className="mt-1.5 neu-input h-auto"><SelectValue placeholder="Selecciona un banco" /></SelectTrigger>
          <SelectContent>
            {banks.map((b: any) => (
              <SelectItem key={b.id} value={b.id.toString()}>{b.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-semibold">Número de Cuenta *</Label>
        <Input value={numeroCuenta} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setNumeroCuenta(v); onTrackFieldChange?.(); }} placeholder="Entre 8 y 34 dígitos" maxLength={34} className="mt-1.5 neu-input h-auto" />
      </div>
      <div>
        <Label className="text-sm font-semibold">Titular de la cuenta *</Label>
        <div className="flex items-center gap-2 mt-1">
          <Checkbox
            id="titular-same-person"
            checked={titularIsSamePerson}
            onCheckedChange={(checked) => {
              setTitularIsSamePerson(checked as boolean);
              if (checked && personaName) {
                setTitular(personaName);
              } else {
                setTitular('');
              }
              onTrackFieldChange?.();
            }}
          />
          <Label htmlFor="titular-same-person" className="text-xs text-muted-foreground font-normal cursor-pointer">
            El titular es {personaName || 'la misma persona'}
          </Label>
        </div>
        <Input
          value={titular}
          onChange={(e) => { setTitular(e.target.value); setTitularIsSamePerson(false); onTrackFieldChange?.(); }}
          placeholder="Nombre completo del titular"
          className="mt-1.5 neu-input h-auto"
          disabled={titularIsSamePerson}
        />
      </div>
      <div>
        <Label className="text-sm font-semibold">CLABE <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
        <Input value={clabe} onChange={(e) => setClabe(e.target.value)} placeholder="18 dígitos" maxLength={18} className="mt-1.5 neu-input h-auto" />
      </div>
      <div>
        <ImageUploadField
          label="Evidencia *"
          value={evidencia}
          onChange={(url) => { setEvidencia(url); onTrackFieldChange?.(); }}
          accept=".pdf,.jpg,.jpeg,.png,.webp"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
        </button>
        {existingId && (
          <button onClick={() => setIsEditing(false)} className="py-3 px-4 rounded-2xl border text-sm font-medium text-muted-foreground hover:bg-muted/50">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
