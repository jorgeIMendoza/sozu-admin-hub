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

  const { data: citasCapacitacion = [], isLoading: loadingCitas } = useQuery({
    queryKey: ['agent-onboarding-training', personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data, error } = await supabase
        .from('reservas_citas')
        .select('id, estatus, activo, id_estatus_cita')
        .eq('id_persona', personaId)
        .in('estatus', ['asistio', 'programada', 'cancelada', 'no_asistio'])
        .order('fecha_creacion', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!personaId,
    staleTime: 0,
  });

  const isLoading = loadingInmo || loadingPersona || loadingDocs || loadingCuentas || loadingCitas;

  const latestTrainingCita = citasCapacitacion[0] as any | undefined;
  const trainingComplete = !!latestTrainingCita && latestTrainingCita.activo && (latestTrainingCita.id_estatus_cita === 3 || latestTrainingCita.estatus === 'asistio');
  const trainingPartial = !!latestTrainingCita && !trainingComplete && latestTrainingCita.activo && (latestTrainingCita.id_estatus_cita === 1 || latestTrainingCita.id_estatus_cita === 2 || latestTrainingCita.estatus === 'programada');
  const trainingCancelled = !!latestTrainingCita && !trainingComplete && !trainingPartial && (latestTrainingCita.estatus === 'cancelada' || latestTrainingCita.estatus === 'no_asistio' || !latestTrainingCita.activo);

  const trainingMissing: string[] = [];
  if (!trainingComplete) {
    if (latestTrainingCita?.estatus === 'no_asistio') trainingMissing.push('Reagendar capacitación');
    else if (trainingPartial) trainingMissing.push('Cita programada (pendiente de asistencia)');
    else trainingMissing.push('Agendar capacitación');
  }

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
    const identityDocsComplete = hasIdentityDoc;
    const identityDocsPartial = !identityDocsComplete && docTypes.size > 0;

    const identityComplete = basicComplete && addressComplete && identityDocsComplete;
    const identityPartial = !identityComplete && (basicPartial || basicComplete || addressPartial || addressComplete || identityDocsPartial);

    const basicMissing: string[] = [];
    if (!persona?.nombre_legal) basicMissing.push('Nombre completo');
    if (!persona?.email) basicMissing.push('Correo electrónico');
    if (!persona?.telefono) basicMissing.push('Teléfono');
    if (!persona?.direccion_calle) basicMissing.push('Dirección (calle)');
    if (!persona?.direccion_num_ext) basicMissing.push('Num. exterior');
    if (!persona?.direccion_colonia) basicMissing.push('Colonia');
    if (!persona?.direccion_codigo_postal) basicMissing.push('Código postal');
    if (!persona?.direccion_id_pais) basicMissing.push('País');
    if (!persona?.direccion_id_estado) basicMissing.push('Estado');
    if (!persona?.direccion_id_municipio) basicMissing.push('Municipio');
    if (!hasIdentityDoc) basicMissing.push('INE o Pasaporte');

    const inmoSteps: OnboardingStep[] = [
      { id: 'basic', label: 'Identidad', isComplete: identityComplete, hasPartialData: identityPartial },
      { id: 'fiscal', label: 'Información fiscal', isComplete: true, hasPartialData: false },
      { id: 'bank-accounts', label: 'Cuenta bancaria', isComplete: true, hasPartialData: false },
      { id: 'training', label: 'Capacitación', isComplete: trainingComplete, hasPartialData: trainingPartial, hasCancelledData: trainingCancelled },
    ];

    const inmoCompleted = inmoSteps.filter(s => s.isComplete).length;
    return {
      steps: inmoSteps,
      completedCount: inmoCompleted,
      totalSteps: 4,
      percentage: Math.round((inmoCompleted / 4) * 100),
      isLoading: false,
      hasTrainingComplete: trainingComplete,
      hasBasicIdentityComplete: identityComplete,
      canAccessComisiones: true,
      missingForComisiones: [],
      missingByStep: { basic: basicMissing, fiscal: [], 'bank-accounts': [], training: trainingMissing },
    };
  }

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

  const basicStageComplete = basicComplete && addressComplete && documentsComplete;
  const basicStagePartial = !basicStageComplete && (basicPartial || basicComplete || addressPartial || addressComplete || documentsPartial);

  const constanciaApproved = documentos.some((d: any) => d.id_tipo_documento === 6 && d.id_estatus_verificacion === 2);
  const constanciaExists = docTypes.has(6);
  const fiscalStageComplete = fiscalComplete && constanciaApproved;
  const fiscalStagePartial = !fiscalStageComplete && (fiscalPartial || fiscalComplete || constanciaExists);

  const basicMissing: string[] = [];
  if (!persona?.nombre_legal) basicMissing.push('Nombre completo');
  if (!persona?.email) basicMissing.push('Correo electrónico');
  if (!persona?.telefono) basicMissing.push('Teléfono');
  if (!persona?.direccion_calle) basicMissing.push('Dirección (calle)');
  if (!persona?.direccion_num_ext) basicMissing.push('Num. exterior');
  if (!persona?.direccion_colonia) basicMissing.push('Colonia');
  if (!persona?.direccion_codigo_postal) basicMissing.push('Código postal');
  if (!persona?.direccion_id_pais) basicMissing.push('País');
  if (!persona?.direccion_id_estado) basicMissing.push('Estado');
  if (!persona?.direccion_id_municipio) basicMissing.push('Municipio');
  if (!hasIdentityDoc) basicMissing.push('INE o Pasaporte');
  if (!docTypes.has(48)) basicMissing.push('Carta de comercialización');

  const fiscalMissing: string[] = [];
  if (!persona?.rfc) fiscalMissing.push('RFC');
  if (!persona?.regimen) fiscalMissing.push('Régimen fiscal');
  if (!persona?.uso_cfdi) fiscalMissing.push('Uso CFDI');
  if (!persona?.direccion_fiscal_calle) fiscalMissing.push('Calle fiscal');
  if (!persona?.direccion_fiscal_colonia) fiscalMissing.push('Colonia fiscal');
  if (!persona?.direccion_fiscal_codigo_postal) fiscalMissing.push('C.P. fiscal');
  if (!persona?.direccion_fiscal_id_pais) fiscalMissing.push('País fiscal');
  if (!persona?.direccion_fiscal_id_estado) fiscalMissing.push('Estado fiscal');
  if (!persona?.direccion_fiscal_id_municipio) fiscalMissing.push('Municipio fiscal');
  if (!constanciaExists) fiscalMissing.push('Constancia de situación fiscal');
  else if (!constanciaApproved) fiscalMissing.push('Constancia pendiente de aprobación');

  const bankMissing: string[] = [];
  if (!bankComplete) bankMissing.push('Cuenta bancaria');

  const missingByStep: Record<string, string[]> = {
    basic: basicMissing,
    fiscal: fiscalMissing,
    'bank-accounts': bankMissing,
    training: trainingMissing,
  };

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
    missingByStep,
  };
}
