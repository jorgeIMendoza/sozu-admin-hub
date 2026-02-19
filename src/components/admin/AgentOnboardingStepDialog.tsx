import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, CheckCircle2, Clock, RefreshCw, Download, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BankAccountsSection } from "./BankAccountsSection";
import { validateRFC } from "@/utils/fiscalDataValidation";
import { Badge } from "@/components/ui/badge";
import type { OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { useCtaTracker } from "@/hooks/useCtaTracker";

interface AgentOnboardingStepDialogProps {
  step: OnboardingStep['id'];
  personaId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_TITLES: Record<string, string> = {
  basic: 'Información Básica',
  address: 'Dirección',
  fiscal: 'Información Fiscal',
  documents: 'Documentos',
  'bank-accounts': 'Cuentas Bancarias',
  training: 'Capacitación',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  basic: 'Tu nombre, correo y teléfono',
  address: 'Tu dirección física completa',
  fiscal: 'RFC, régimen fiscal y dirección fiscal',
  documents: 'INE, Constancia y Contrato de comercialización',
  'bank-accounts': 'Agrega al menos una cuenta bancaria',
  training: 'Agenda tu cita de capacitación presencial',
};

// Required document types for onboarding
const REQUIRED_DOC_TYPES = [2, 3, 6, 48];

export function AgentOnboardingStepDialog({ step, personaId, open, onOpenChange }: AgentOnboardingStepDialogProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { track } = useCtaTracker();
  const hasTrackedFieldChange = useRef(false);

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
      <AgentDocumentsStep personaId={personaId} onTrackFieldChange={() => {
        if (!hasTrackedFieldChange.current) {
          hasTrackedFieldChange.current = true;
          track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
        }
      }} onTrackDocView={(docName: string) => track({ page: "modal_perfil", elementId: "perfil_documentos_ver", metadata: { documento: docName } })} />
    </div>
  ) : step === 'bank-accounts' ? (
    <div className="px-1">
      <BankAccountsSection 
        personId={personaId} 
        onAddAccountClick={() => track({ page: "modal_perfil", elementId: "perfil_cuentas_agregar", metadata: { fase: "bank-accounts" } })}
        onSaveAccountClick={() => track({ page: "modal_perfil", elementId: "perfil_fase_guardar", metadata: { fase: "bank-accounts" } })}
      />
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
    <StepForm step={step} persona={persona} personaId={personaId} onSaved={handleSaved} onTrackSave={() => track({ page: "modal_perfil", elementId: "perfil_fase_guardar", metadata: { fase: step } })} onTrackFieldChange={() => {
      if (!hasTrackedFieldChange.current) {
        hasTrackedFieldChange.current = true;
        track({ page: "modal_perfil", elementId: "perfil_fase_campo_modificado", metadata: { fase: step } });
      }
    }} />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh] rounded-t-3xl overflow-hidden max-w-[100vw]">
          <DrawerHeader className="text-left pb-2 px-4">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            <DrawerDescription className="text-xs">{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto overflow-x-hidden w-full" style={{ maxHeight: 'calc(92vh - 100px)' }}>
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

function AgentDocumentsStep({ personaId, onTrackFieldChange, onTrackDocView }: { personaId: number; onTrackFieldChange?: () => void; onTrackDocView?: (docName: string) => void }) {
  const queryClient = useQueryClient();

  // Fetch doc type names from DB
  const { data: docTypes = [] } = useQuery({
    queryKey: ['agent-doc-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id, nombre')
        .in('id', REQUIRED_DOC_TYPES)
        .eq('activo', true);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing documents for this persona
  const { data: existingDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['agent-onboarding-docs-detail', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documentos')
        .select('id, id_tipo_documento, url, id_estatus_verificacion, fecha_creacion')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .in('id_tipo_documento', REQUIRED_DOC_TYPES);
      if (error) throw error;
      return data || [];
    },
  });

  const [uploading, setUploading] = useState<number | null>(null);

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
          id_estatus_verificacion: 1, // Pendiente
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

  return (
    <div className="space-y-3 pb-4">
      {REQUIRED_DOC_TYPES.map((typeId) => {
        const docType = docTypes.find((d: any) => d.id === typeId);
        const doc = getDocForType(typeId);
        const status = getStatusInfo(doc);
        const StatusIcon = status.icon;
        const isValidated = doc?.id_estatus_verificacion === 2;
        const isUploading = uploading === typeId;

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
                {/* Preview button for uploaded docs */}
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

                {/* Upload/Update button */}
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

                {/* Download button for validated */}
                {isValidated && doc?.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(doc.url, '_blank')}
                    className="flex-1 h-10 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 font-semibold text-xs gap-1.5 text-emerald-600 border-emerald-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
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
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');

  // Fetch existing appointment
  const { data: existingCita } = useQuery({
    queryKey: ['agent-training-cita', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('citas_capacitacion')
        .select('*')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (existingCita) {
      setFecha(existingCita.fecha || '');
      setHoraInicio(existingCita.hora_inicio || '');
      setHoraFin(existingCita.hora_fin || '');
    }
  }, [existingCita]);

  const getStatusBadge = () => {
    if (!existingCita) return null;
    switch (existingCita.estatus) {
      case 'asistio': return <Badge className="bg-emerald-500 text-white border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Completada</Badge>;
      case 'programada': return <Badge className="bg-amber-500 text-white border-0"><Clock className="h-3 w-3 mr-1" />Programada</Badge>;
      case 'no_asistio': return <Badge variant="destructive"><RefreshCw className="h-3 w-3 mr-1" />No asistió</Badge>;
      case 'cancelada': return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
      default: return null;
    }
  };

  const handleSchedule = async () => {
    onTrackSave?.();
    if (!fecha || !horaInicio) {
      toast.error("Completa fecha y hora.");
      return;
    }
    // Auto-calculate hora_fin as 1h30m after inicio
    const [h, m] = horaInicio.split(':').map(Number);
    const totalMin = h * 60 + m + 90;
    const autoHoraFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

    setSaving(true);
    try {
      // Deactivate previous
      if (existingCita) {
        await supabase
          .from('citas_capacitacion')
          .update({ activo: false })
          .eq('id', existingCita.id);
      }

      const { error } = await supabase
        .from('citas_capacitacion')
        .insert({
          id_persona: personaId,
          fecha,
          hora_inicio: horaInicio,
          hora_fin: autoHoraFin,
          ubicacion: 'Por confirmar',
          estatus: 'programada',
        });
      if (error) throw error;

      toast.success("Cita de capacitación agendada correctamente.");
      queryClient.invalidateQueries({ queryKey: ['agent-onboarding-training'] });
      queryClient.invalidateQueries({ queryKey: ['agent-training-cita'] });
      onSaved();
    } catch (err: any) {
      toast.error("Error al agendar: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const isCompleted = existingCita?.estatus === 'asistio';
  const isProgrammed = existingCita?.estatus === 'programada';

  return (
    <div className="space-y-5 pb-4">
      {/* Status */}
      {existingCita && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Estado actual:</span>
          {getStatusBadge()}
        </div>
      )}

      {isCompleted ? (
        <div className="text-center py-6 space-y-2">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold text-emerald-600">¡Capacitación completada!</p>
          <p className="text-xs text-muted-foreground">Tu asistencia fue confirmada por el administrador.</p>
        </div>
      ) : (
        <>
          <div>
            <Label className="text-sm font-semibold">Fecha *</Label>
            <Input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); onTrackFieldChange?.(); }} className="mt-1.5 neu-input h-auto" min={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <Label className="text-sm font-semibold">Hora *</Label>
            <Input type="time" value={horaInicio} onChange={(e) => { setHoraInicio(e.target.value); onTrackFieldChange?.(); }} className="mt-1.5 neu-input h-auto" />
          </div>

          {isProgrammed && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ya tienes una cita programada. Si reagendas, se cancelará la anterior.
              </p>
            </div>
          )}

          <button
            onClick={handleSchedule}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Agendando...</> : isProgrammed ? "Reagendar Cita" : "Agendar Cita"}
          </button>
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
}

function StepForm({ step, persona, personaId, onSaved, onTrackSave, onTrackFieldChange }: StepFormProps) {
  const [saving, setSaving] = useState(false);

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
    enabled: step === 'address' || step === 'fiscal',
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

  // Copy address for fiscal
  useEffect(() => {
    if (copiarDireccion) {
      setFCalle(calle || persona?.direccion_calle || '');
      setFNumExt(numExt || persona?.direccion_num_ext || '');
      setFNumInt(numInt || persona?.direccion_num_int || '');
      setFColonia(colonia || persona?.direccion_colonia || '');
      setFCp(cp || persona?.direccion_codigo_postal || '');
      setFIdPais(idPais || persona?.direccion_id_pais || '');
      setFIdEstado(idEstado || persona?.direccion_id_estado?.toString() || '');
      setFIdMunicipio(idMunicipio || persona?.direccion_id_municipio?.toString() || '');
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
        isIncomplete = !nombre.trim() || !email.trim() || !telefono.trim();
        updateData = {
          nombre_legal: nombre.trim() || null,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          curp: curp.trim().toUpperCase() || null,
          sexo: sexo || null,
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
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Nombre completo *</Label>
            <Input value={nombre} onChange={(e) => { setNombre(e.target.value); onTrackFieldChange?.(); }} className="mt-1.5 neu-input h-auto" />
          </div>
          <div>
            <Label className="text-sm font-semibold">Correo electrónico *</Label>
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); onTrackFieldChange?.(); }} className="mt-1.5 neu-input h-auto" />
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
        </div>
      )}

      {step === 'address' && renderAddressFields(
        'dir', calle, setCalle, numExt, setNumExt, numInt, setNumInt,
        colonia, setColonia, cp, setCp, idPais, setIdPais, idEstado, setIdEstado, idMunicipio, setIdMunicipio
      )}

      {step === 'fiscal' && (
        <div className="space-y-4">
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

          <div className="flex items-center gap-2 pt-2">
            <Checkbox id="copiar" checked={copiarDireccion} onCheckedChange={(c) => setCopiarDireccion(!!c)} />
            <Label htmlFor="copiar" className="text-sm cursor-pointer">Copiar dirección física</Label>
          </div>

          <p className="text-xs font-medium text-muted-foreground pt-1">Dirección Fiscal</p>
          {renderAddressFields(
            'fiscal', fCalle, setFCalle, fNumExt, setFNumExt, fNumInt, setFNumInt,
            fColonia, setFColonia, fCp, setFCp, fIdPais, setFIdPais, fIdEstado, setFIdEstado, fIdMunicipio, setFIdMunicipio
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : "Guardar"}
      </button>
    </div>
  );
}
