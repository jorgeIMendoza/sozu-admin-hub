/**
 * Utility functions for validating fiscal data completeness
 */

export interface FiscalData {
  rfc?: string | null;
  regimen?: string | null;
  uso_cfdi?: string | null;
  direccion_fiscal_calle?: string | null;
  direccion_fiscal_num_ext?: string | null;
  direccion_fiscal_num_int?: string | null;
  direccion_fiscal_colonia?: string | null;
  direccion_fiscal_codigo_postal?: string | null;
  direccion_fiscal_id_pais?: string | null;
  direccion_fiscal_id_estado?: number | null;
  direccion_fiscal_id_municipio?: number | null;
}

/**
 * Validates if fiscal data is complete
 */
export function isFiscalDataComplete(data: FiscalData | null | undefined): boolean {
  if (!data) return false;

  return !!(
    data.rfc &&
    data.regimen &&
    data.uso_cfdi &&
    data.direccion_fiscal_calle &&
    data.direccion_fiscal_colonia &&
    data.direccion_fiscal_codigo_postal &&
    data.direccion_fiscal_id_pais &&
    data.direccion_fiscal_id_estado &&
    data.direccion_fiscal_id_municipio
  );
}

/**
 * Validates if all compradores have complete fiscal data
 */
export function areAllCompradoresFiscalDataComplete(
  compradoresData: FiscalData[]
): { isComplete: boolean; incompleteCount: number } {
  if (!compradoresData || compradoresData.length === 0) {
    return { isComplete: false, incompleteCount: 0 };
  }

  const incompleteCount = compradoresData.filter(
    (data) => !isFiscalDataComplete(data)
  ).length;

  return {
    isComplete: incompleteCount === 0,
    incompleteCount,
  };
}

/**
 * Validates RFC and returns specific error message if invalid
 */
export function validateRFC(rfc: string | null | undefined): { isValid: boolean; error?: string } {
  if (!rfc || typeof rfc !== 'string') {
    return { isValid: false, error: "El RFC es requerido" };
  }

  const rfcTrimmed = rfc.trim().toUpperCase();
  
  if (rfcTrimmed.length === 0) {
    return { isValid: false, error: "El RFC es requerido" };
  }

  // Check minimum length (12 for moral, 13 for physical)
  if (rfcTrimmed.length < 12 || rfcTrimmed.length > 13) {
    return { isValid: false, error: "El RFC debe tener 12 o 13 caracteres" };
  }

  // Check for generic/placeholder patterns
  const genericPatterns = [
    { pattern: /^[X]{3,}/i, message: "El RFC parece ser un valor genérico (XXX...)" },
    { pattern: /^[A]{3,}/i, message: "El RFC parece ser un valor genérico (AAA...)" },
    { pattern: /^[0]{3,}/i, message: "El RFC parece ser un valor genérico (000...)" },
    { pattern: /000000/, message: "El RFC contiene una secuencia inválida (000000)" },
    { pattern: /XXXX/i, message: "El RFC contiene una secuencia inválida (XXXX)" },
    { pattern: /AAAA/i, message: "El RFC contiene una secuencia inválida (AAAA)" },
    { pattern: /^[A-Z]{4}000000/i, message: "El RFC parece ser un valor de prueba" },
    { pattern: /^[A-Z]{3}000000/i, message: "El RFC parece ser un valor de prueba" },
  ];

  for (const { pattern, message } of genericPatterns) {
    if (pattern.test(rfcTrimmed)) {
      return { isValid: false, error: message };
    }
  }

  // Validate RFC format
  // Persona Física: 4 letters + 6 digits + 3 alphanumeric
  const personaFisicaRegex = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
  
  // Persona Moral: 3 letters + 6 digits + 3 alphanumeric
  const personaMoralRegex = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;

  if (!personaFisicaRegex.test(rfcTrimmed) && !personaMoralRegex.test(rfcTrimmed)) {
    return { isValid: false, error: "El formato del RFC no es válido" };
  }

  // Validate date part (positions 4-10 for PF, 3-9 for PM)
  const dateStartIndex = rfcTrimmed.length === 13 ? 4 : 3;
  const monthPart = rfcTrimmed.substring(dateStartIndex + 2, dateStartIndex + 4);
  const dayPart = rfcTrimmed.substring(dateStartIndex + 4, dateStartIndex + 6);

  const month = parseInt(monthPart);
  const day = parseInt(dayPart);

  // Validate month (01-12)
  if (month < 1 || month > 12) {
    return { isValid: false, error: `El mes del RFC no es válido (${monthPart}). Debe ser entre 01 y 12` };
  }

  // Validate day (01-31)
  if (day < 1 || day > 31) {
    return { isValid: false, error: `El día del RFC no es válido (${dayPart}). Debe ser entre 01 y 31` };
  }

  return { isValid: true };
}

/**
 * Validates if an RFC is valid and not a generic/placeholder value
 * @deprecated Use validateRFC() for more detailed error messages
 */
export function isValidRFC(rfc: string | null | undefined): boolean {
  return validateRFC(rfc).isValid;
}
