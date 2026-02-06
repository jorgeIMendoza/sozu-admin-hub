import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MissingField {
  section: string;
  fields: string[];
}

interface InmobiliariaDataStatus {
  isDataComplete: boolean;
  missingFields: MissingField[];
  isLoading: boolean;
}

// IDs de documentos obligatorios
const REQUIRED_DOCS = {
  ACTA_CONSTITUTIVA: 7,
  CONSTANCIA_SITUACION_FISCAL: 6,
  PODER_NOTARIAL: 9,
  FRENTE_INE: 2,
  REVERSO_INE: 3,
};

export function useInmobiliariaDataStatus(inmobiliariaId: number | null | undefined): InmobiliariaDataStatus {
  const { data, isLoading } = useQuery({
    queryKey: ['inmobiliaria-data-status', inmobiliariaId],
    queryFn: async () => {
      if (!inmobiliariaId) {
        return { isDataComplete: false, missingFields: [] };
      }

      const missingFields: MissingField[] = [];

      // 1. Obtener datos de la inmobiliaria (persona)
      const { data: personaData, error: personaError } = await supabase
        .from('personas')
        .select(`
          nombre_legal,
          nombre_comercial,
          email,
          telefono,
          id_entidad_relacionada_rep_leg,
          id_entidad_relacionada_rep_com,
          direccion_calle,
          direccion_num_ext,
          direccion_codigo_postal,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          direccion_colonia,
          direccion_fiscal_calle,
          direccion_fiscal_num_ext,
          direccion_fiscal_codigo_postal,
          direccion_fiscal_id_pais,
          direccion_fiscal_id_estado,
          direccion_fiscal_id_municipio,
          direccion_fiscal_colonia
        `)
        .eq('id', inmobiliariaId)
        .single();

      if (personaError || !personaData) {
        return { isDataComplete: false, missingFields: [{ section: 'Información', fields: ['No se encontraron datos'] }] };
      }

      // Validar información básica
      const basicInfoMissing: string[] = [];
      if (!personaData.nombre_legal?.trim()) basicInfoMissing.push('Razón Social');
      if (!personaData.nombre_comercial?.trim()) basicInfoMissing.push('Nombre Comercial');
      if (!personaData.email?.trim()) basicInfoMissing.push('Email');
      if (!personaData.telefono?.trim()) basicInfoMissing.push('Teléfono');
      if (!personaData.id_entidad_relacionada_rep_leg) basicInfoMissing.push('Representante Legal');
      if (!personaData.id_entidad_relacionada_rep_com) basicInfoMissing.push('Representante Comercial');

      if (basicInfoMissing.length > 0) {
        missingFields.push({ section: 'Información Básica', fields: basicInfoMissing });
      }

      // Validar dirección
      const addressMissing: string[] = [];
      if (!personaData.direccion_calle?.trim()) addressMissing.push('Calle');
      if (!personaData.direccion_num_ext?.trim()) addressMissing.push('Número Exterior');
      if (!personaData.direccion_codigo_postal?.trim()) addressMissing.push('Código Postal');
      if (!personaData.direccion_id_pais) addressMissing.push('País');
      if (!personaData.direccion_id_estado) addressMissing.push('Estado');
      if (!personaData.direccion_id_municipio) addressMissing.push('Municipio');
      if (!personaData.direccion_colonia?.trim()) addressMissing.push('Colonia/Barrio');

      if (addressMissing.length > 0) {
        missingFields.push({ section: 'Dirección', fields: addressMissing });
      }

      // Validar dirección fiscal
      const fiscalMissing: string[] = [];
      if (!personaData.direccion_fiscal_calle?.trim()) fiscalMissing.push('Calle Fiscal');
      if (!personaData.direccion_fiscal_num_ext?.trim()) fiscalMissing.push('Número Exterior Fiscal');
      if (!personaData.direccion_fiscal_codigo_postal?.trim()) fiscalMissing.push('Código Postal Fiscal');
      if (!personaData.direccion_fiscal_id_pais) fiscalMissing.push('País Fiscal');
      if (!personaData.direccion_fiscal_id_estado) fiscalMissing.push('Estado Fiscal');
      if (!personaData.direccion_fiscal_id_municipio) fiscalMissing.push('Municipio Fiscal');
      if (!personaData.direccion_fiscal_colonia?.trim()) fiscalMissing.push('Colonia/Barrio Fiscal');

      if (fiscalMissing.length > 0) {
        missingFields.push({ section: 'Información Fiscal', fields: fiscalMissing });
      }

      // 2. Obtener documentos de la inmobiliaria
      const { data: docsInmobiliaria } = await supabase
        .from('documentos')
        .select('id_tipo_documento')
        .eq('id_persona', inmobiliariaId)
        .eq('activo', true)
        .in('id_tipo_documento', [
          REQUIRED_DOCS.ACTA_CONSTITUTIVA,
          REQUIRED_DOCS.CONSTANCIA_SITUACION_FISCAL,
          REQUIRED_DOCS.PODER_NOTARIAL,
        ]);

      const inmobiliariaDocTypes = new Set(docsInmobiliaria?.map(d => d.id_tipo_documento) || []);

      // 3. Obtener documentos del representante legal (si existe)
      const repLegalId = personaData.id_entidad_relacionada_rep_leg;
      let repLegalDocTypes = new Set<number>();

      if (repLegalId) {
        const { data: docsRepLegal } = await supabase
          .from('documentos')
          .select('id_tipo_documento')
          .eq('id_persona', repLegalId)
          .eq('activo', true)
          .in('id_tipo_documento', [
            REQUIRED_DOCS.PODER_NOTARIAL,
            REQUIRED_DOCS.FRENTE_INE,
            REQUIRED_DOCS.REVERSO_INE,
          ]);

        repLegalDocTypes = new Set(docsRepLegal?.map(d => d.id_tipo_documento) || []);
      }

      // Validar documentos de la inmobiliaria
      const docsMissing: string[] = [];
      if (!inmobiliariaDocTypes.has(REQUIRED_DOCS.ACTA_CONSTITUTIVA)) {
        docsMissing.push('Acta Constitutiva');
      }
      if (!inmobiliariaDocTypes.has(REQUIRED_DOCS.CONSTANCIA_SITUACION_FISCAL)) {
        docsMissing.push('Constancia de Situación Fiscal');
      }
      // Poder notarial puede estar en inmobiliaria O en rep legal
      const hasPoderNotarial = 
        inmobiliariaDocTypes.has(REQUIRED_DOCS.PODER_NOTARIAL) || 
        repLegalDocTypes.has(REQUIRED_DOCS.PODER_NOTARIAL);
      if (!hasPoderNotarial) {
        docsMissing.push('Poder Notarial (puede cargarse aquí o en Rep. Legal)');
      }

      if (docsMissing.length > 0) {
        missingFields.push({ section: 'Documentos Inmobiliaria', fields: docsMissing });
      }

      // Validar documentos del representante legal
      const docsRepLegalMissing: string[] = [];
      if (repLegalId) {
        if (!repLegalDocTypes.has(REQUIRED_DOCS.FRENTE_INE)) {
          docsRepLegalMissing.push('Frente INE');
        }
        if (!repLegalDocTypes.has(REQUIRED_DOCS.REVERSO_INE)) {
          docsRepLegalMissing.push('Reverso INE');
        }
      } else {
        // Si no hay rep legal, los docs de INE también faltan
        docsRepLegalMissing.push('Frente INE');
        docsRepLegalMissing.push('Reverso INE');
      }

      if (docsRepLegalMissing.length > 0) {
        missingFields.push({ section: 'Documentos Rep. Legal', fields: docsRepLegalMissing });
      }

      // 4. Validar cuentas bancarias
      const { data: bankAccounts, error: bankError } = await supabase
        .from('cuentas_bancarias')
        .select('id')
        .eq('id_persona', inmobiliariaId)
        .eq('activo', true)
        .limit(1);

      if (bankError || !bankAccounts || bankAccounts.length === 0) {
        missingFields.push({ section: 'Cuentas Bancarias', fields: ['Mínimo 1 cuenta bancaria activa'] });
      }

      return {
        isDataComplete: missingFields.length === 0,
        missingFields,
      };
    },
    enabled: !!inmobiliariaId,
    staleTime: 30000, // 30 seconds
  });

  return {
    isDataComplete: data?.isDataComplete ?? false,
    missingFields: data?.missingFields ?? [],
    isLoading,
  };
}
