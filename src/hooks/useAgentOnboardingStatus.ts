import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStep {
  id: 'basic' | 'address' | 'fiscal' | 'documents' | 'bank-accounts' | 'training';
  label: string;
  isComplete: boolean;
  hasPartialData: boolean;
  hasCancelledData?: boolean;
}

interface OnboardingStatus {
  steps: OnboardingStep[];
  completedCount: number;
  totalSteps: number;
  percentage: number;
  isLoading: boolean;
  hasTrainingComplete: boolean;
  hasBasicIdentityComplete: boolean;
  canAccessComisiones: boolean;
  missingForComisiones: string[];
  missingByStep: Record<string, string[]>;
}

export function useAgentOnboardingStatus(personaId: number | null | undefined): OnboardingStatus {
  // Check if agent belongs to an inmobiliaria (auto-verified)
  const { data: hasInmobiliaria, isLoading: loadingInmo } = useQuery({
    queryKey: ['agent-onboarding-inmo', personaId],
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

  // Fetch persona data
  const { data: persona, isLoading: loadingPersona } = useQuery({
    queryKey: ['agent-onboarding-persona', personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data, error } = await supabase
        .from('personas')
        .select('nombre_legal, email, telefono, direccion_calle, direccion_num_ext, direccion_colonia, direccion_codigo_postal, direccion_id_pais, direccion_id_estado, direccion_id_municipio, rfc, regimen, uso_cfdi, direccion_fiscal_calle, direccion_fiscal_colonia, direccion_fiscal_codigo_postal, direccion_fiscal_id_pais, direccion_fiscal_id_estado, direccion_fiscal_id_municipio')
        .eq('id', personaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!personaId,
  });

  // Fetch documents (types 2=INE frente, 3=INE reverso, 4=Pasaporte, 6=Constancia, 48=Contrato comercialización)
  const { data: documentos = [], isLoading: loadingDocs } = useQuery({
    queryKey: ['agent-onboarding-docs', personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data, error } = await supabase
        .from('documentos')
        .select('id_tipo_documento, id_estatus_verificacion')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .in('id_tipo_documento', [2, 3, 4, 6, 48]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!personaId,
  });

  // Fetch bank accounts
  const { data: cuentas = [], isLoading: loadingCuentas } = useQuery({
    queryKey: ['agent-onboarding-bank', personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select('id')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!personaId,
  });

  // Fetch training appointments
  const { data: citasCapacitacion = [], isLoading: loadingCitas } = useQuery({
    queryKey: ['agent-onboarding-training', personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data, error } = await supabase
        .from('reservas_citas')
        .select('id, estatus, activo, id_estatus_cita')
        .eq('id_persona', personaId)
        .in('estatus', ['asistio', 'programada', 'cancelada'])
        .order('fecha_creacion', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!personaId,
    staleTime: 0,
  });

  const isLoading = loadingInmo || loadingPersona || loadingDocs || loadingCuentas || loadingCitas;

  // If agent has an inmobiliaria, only require Identity step (basic + address + docs)
  if (hasInmobiliaria && !isLoading) {
    const basicComplete = !!(persona?.nombre_legal && persona?.email && persona?.telefono);
    const basicPartial = !basicComplete && !!(persona?.nombre_legal || persona?.email || persona?.telefono);

    const addressComplete = !!(
      persona?.direccion_calle &&
      persona?.direccion_num_ext &&
      persona?.direccion_colonia &&
      persona?.direccion_codigo_postal &&
      persona?.direccion_id_pais &&
      persona?.direccion_id_estado &&
      persona?.direccion_id_municipio
    );
    const addressPartial = !addressComplete && !!(persona?.direccion_calle || persona?.direccion_num_ext || persona?.direccion_colonia || persona?.direccion_codigo_postal);

    const docTypes = new Set(documentos.map((d: any) => d.id_tipo_documento));
    const hasINE = docTypes.has(2) && docTypes.has(3);
    const hasPasaporte = docTypes.has(4);
    const hasIdentityDoc = hasINE || hasPasaporte;
    // For agents with inmobiliaria, carta de cumplimiento (48) is NOT required
    const identityDocsComplete = hasIdentityDoc;
    const identityDocsPartial = !identityDocsComplete && docTypes.size > 0;

    const identityComplete = basicComplete && addressComplete && identityDocsComplete;
    const identityPartial = !identityComplete && (basicPartial || basicComplete || addressPartial || addressComplete || identityDocsPartial);

    const inmoSteps: OnboardingStep[] = [
      { id: 'basic', label: 'Identidad', isComplete: identityComplete, hasPartialData: identityPartial },
      { id: 'fiscal', label: 'Información fiscal', isComplete: true, hasPartialData: false },
      { id: 'bank-accounts', label: 'Cuenta bancaria', isComplete: true, hasPartialData: false },
      { id: 'training', label: 'Capacitación', isComplete: true, hasPartialData: false },
    ];
    const inmoCompleted = inmoSteps.filter(s => s.isComplete).length;
    return { steps: inmoSteps, completedCount: inmoCompleted, totalSteps: 4, percentage: Math.round((inmoCompleted / 4) * 100), isLoading: false, hasTrainingComplete: true, hasBasicIdentityComplete: identityComplete, canAccessComisiones: true, missingForComisiones: [] };
  }

  // Evaluate steps
  const basicComplete = !!(persona?.nombre_legal && persona?.email && persona?.telefono);
  const basicPartial = !basicComplete && !!(persona?.nombre_legal || persona?.email || persona?.telefono);

  const addressComplete = !!(
    persona?.direccion_calle &&
    persona?.direccion_num_ext &&
    persona?.direccion_colonia &&
    persona?.direccion_codigo_postal &&
    persona?.direccion_id_pais &&
    persona?.direccion_id_estado &&
    persona?.direccion_id_municipio
  );
  const addressPartial = !addressComplete && !!(persona?.direccion_calle || persona?.direccion_num_ext || persona?.direccion_colonia || persona?.direccion_codigo_postal);

  const fiscalComplete = !!(
    persona?.rfc &&
    persona?.regimen &&
    persona?.uso_cfdi &&
    persona?.direccion_fiscal_calle &&
    persona?.direccion_fiscal_colonia &&
    persona?.direccion_fiscal_codigo_postal &&
    persona?.direccion_fiscal_id_pais &&
    persona?.direccion_fiscal_id_estado &&
    persona?.direccion_fiscal_id_municipio
  );
  const fiscalPartial = !fiscalComplete && !!(persona?.rfc || persona?.regimen || persona?.uso_cfdi);

  const docTypes = new Set(documentos.map((d: any) => d.id_tipo_documento));
  const hasINE = docTypes.has(2) && docTypes.has(3);
  const hasPasaporte = docTypes.has(4);
  const hasIdentityDoc = hasINE || hasPasaporte;
  const documentsComplete = hasIdentityDoc && docTypes.has(48);
  const documentsPartial = !documentsComplete && docTypes.size > 0;

  const bankComplete = cuentas.length > 0;

  const trainingComplete = citasCapacitacion.some((c: any) => (c.id_estatus_cita === 3 || c.estatus === 'asistio') && c.activo);
  const trainingPartial = !trainingComplete && citasCapacitacion.some((c: any) => (c.id_estatus_cita === 1 || c.id_estatus_cita === 2 || c.estatus === 'programada') && c.activo);
  const trainingCancelled = !trainingComplete && !trainingPartial && citasCapacitacion.some((c: any) => c.estatus === 'cancelada' || !c.activo);

  // Consolidated into 4 stages for the profile view
  // Stage 1: basic = basic info + address + documents (INE front/back + Carta comercialización)
  const basicStageComplete = basicComplete && addressComplete && documentsComplete;
  const basicStagePartial = !basicStageComplete && (basicPartial || basicComplete || addressPartial || addressComplete || documentsPartial);

  // Stage 2: fiscal = fiscal info + constancia (doc type 6) — constancia must be approved (id_estatus_verificacion === 2)
  const constanciaApproved = documentos.some((d: any) => d.id_tipo_documento === 6 && d.id_estatus_verificacion === 2);
  const constanciaExists = docTypes.has(6);
  const fiscalStageComplete = fiscalComplete && constanciaApproved;
  const fiscalStagePartial = !fiscalStageComplete && (fiscalPartial || fiscalComplete || constanciaExists);

  const steps: OnboardingStep[] = [
    { id: 'basic', label: 'Identidad', isComplete: basicStageComplete, hasPartialData: basicStagePartial },
    { id: 'fiscal', label: 'Información fiscal', isComplete: fiscalStageComplete, hasPartialData: fiscalStagePartial },
    { id: 'bank-accounts', label: 'Cuenta bancaria', isComplete: bankComplete, hasPartialData: false },
    { id: 'training', label: 'Capacitación', isComplete: trainingComplete, hasPartialData: trainingPartial, hasCancelledData: trainingCancelled },
  ];

  const completedCount = steps.filter(s => s.isComplete).length;
  const totalSteps = steps.length;

  const missingForComisiones: string[] = [];
  if (!basicStageComplete) missingForComisiones.push('Identidad');
  if (!fiscalStageComplete) missingForComisiones.push('Información fiscal');
  if (!bankComplete) missingForComisiones.push('Cuenta bancaria');

  return {
    steps,
    completedCount,
    totalSteps,
    percentage: Math.round((completedCount / totalSteps) * 100),
    isLoading,
    hasTrainingComplete: trainingComplete,
    hasBasicIdentityComplete: basicStageComplete,
    canAccessComisiones: basicStageComplete && fiscalStageComplete && bankComplete,
    missingForComisiones,
  };
}
