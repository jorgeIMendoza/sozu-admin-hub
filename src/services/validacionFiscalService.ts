/**
 * Service for fiscal data validation between XML invoices and CSF (Constancia de Situación Fiscal)
 * Calls n8n webhook to extract data and compares fields
 */

import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from '@/lib/config';

// Types for the extraction response
export interface XmlData {
  rfc: string;
  nombre: string;
  codigo_postal: string;
  regimen_fiscal: string;
  uso_cfdi: string;
  uuid: string;
  fecha_emision: string;
  total: number;
  emisor_rfc: string;
  emisor_nombre: string;
}

export interface RegimenInfo {
  codigo: string;
  nombre: string;
}

export interface CsfData {
  rfc: string;
  curp: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  codigo_postal: string;
  calle: string;
  numero_exterior: string;
  numero_interior: string;
  colonia: string;
  municipio: string;
  estado: string;
  regimenes: RegimenInfo[];
  estatus_padron: string;
  fecha_inicio_operaciones: string;
}

export interface ExtractionResult {
  success: boolean;
  xml: XmlData;
  csf: CsfData;
  error?: string;
}

export interface ComparisonResult {
  campo: string;
  valorXml: string;
  valorCsf: string;
  coincide: boolean;
  detalle?: string;
}

export interface DatosValidados {
  xml: XmlData;
  csf: CsfData;
  comparacion: ComparisonResult[];
  todoCoincide: boolean;
}

/**
 * Normalizes a name for comparison
 * - Converts to uppercase
 * - Removes accents
 * - Normalizes whitespace
 */
export function normalizarNombre(nombre: string): string {
  if (!nombre) return '';
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
}

/**
 * Compares RFC values
 */
function compararRfc(xmlRfc: string, csfRfc: string): boolean {
  const normalizedXml = (xmlRfc || '').toUpperCase().replace(/\s/g, '');
  const normalizedCsf = (csfRfc || '').toUpperCase().replace(/\s/g, '');
  return normalizedXml === normalizedCsf;
}

/**
 * Compares name values with normalization
 */
function compararNombre(xmlNombre: string, csfNombreCompleto: string): boolean {
  return normalizarNombre(xmlNombre) === normalizarNombre(csfNombreCompleto);
}

/**
 * Compares postal codes
 */
function compararCodigoPostal(xmlCp: string, csfCp: string): boolean {
  const normalizedXml = (xmlCp || '').replace(/\s/g, '');
  const normalizedCsf = (csfCp || '').replace(/\s/g, '');
  return normalizedXml === normalizedCsf;
}

/**
 * Validates that the XML regime exists in the CSF regimes list
 */
function validarRegimen(xmlRegimen: string, csfRegimenes: RegimenInfo[]): boolean {
  if (!csfRegimenes || csfRegimenes.length === 0) return false;
  return csfRegimenes.some(r => r.codigo === xmlRegimen);
}

/**
 * Extracts data from XML and CSF by calling the n8n webhook
 */
export async function extraerDatos(
  xmlUrl: string,
  csfUrl: string,
  cuentaId: number,
  personaId: number
): Promise<ExtractionResult> {
  const payload = {
    xml_url: xmlUrl,
    csf_url: csfUrl,
    id_cuenta_cobranza: cuentaId,
    id_persona: personaId,
    ambiente: ENVIRONMENT
  };

  console.log('Calling n8n webhook for data extraction:', payload);

  try {
    const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/extraerDatosXmlCsf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error en la extracción: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Extraction response:', data);
    
    return data as ExtractionResult;
  } catch (error) {
    console.error('Error extracting data:', error);
    throw error;
  }
}

/**
 * Compares fields between XML and CSF data
 */
export function compararCampos(xmlData: XmlData, csfData: CsfData): ComparisonResult[] {
  const resultados: ComparisonResult[] = [];

  // 1. RFC
  const rfcCoincide = compararRfc(xmlData.rfc, csfData.rfc);
  resultados.push({
    campo: 'RFC',
    valorXml: xmlData.rfc || '-',
    valorCsf: csfData.rfc || '-',
    coincide: rfcCoincide
  });

  // 2. Nombre
  const nombreCoincide = compararNombre(xmlData.nombre, csfData.nombre_completo);
  resultados.push({
    campo: 'Nombre',
    valorXml: xmlData.nombre || '-',
    valorCsf: csfData.nombre_completo || '-',
    coincide: nombreCoincide,
    detalle: !nombreCoincide ? `XML normalizado: "${normalizarNombre(xmlData.nombre)}" vs CSF normalizado: "${normalizarNombre(csfData.nombre_completo)}"` : undefined
  });

  // 3. Código Postal
  const cpCoincide = compararCodigoPostal(xmlData.codigo_postal, csfData.codigo_postal);
  resultados.push({
    campo: 'Código Postal',
    valorXml: xmlData.codigo_postal || '-',
    valorCsf: csfData.codigo_postal || '-',
    coincide: cpCoincide
  });

  // 4. Régimen Fiscal
  const regimenesStr = csfData.regimenes?.map(r => r.codigo).join(', ') || '-';
  const regimenCoincide = validarRegimen(xmlData.regimen_fiscal, csfData.regimenes);
  resultados.push({
    campo: 'Régimen Fiscal',
    valorXml: xmlData.regimen_fiscal || '-',
    valorCsf: regimenesStr,
    coincide: regimenCoincide,
    detalle: regimenCoincide 
      ? `Régimen ${xmlData.regimen_fiscal} encontrado en CSF` 
      : `Régimen ${xmlData.regimen_fiscal} no está en la lista del CSF`
  });

  return resultados;
}

/**
 * Validates and returns the complete validation data
 */
export function validarDatosFiscales(xmlData: XmlData, csfData: CsfData): DatosValidados {
  const comparacion = compararCampos(xmlData, csfData);
  const todoCoincide = comparacion.every(c => c.coincide);

  return {
    xml: xmlData,
    csf: csfData,
    comparacion,
    todoCoincide
  };
}

/**
 * Extracts birth date from CURP
 * CURP format: AAAA000000XXXXXXXX00
 *              ^^^^---------- First 4 letters (names)
 *                  ^^^^^^---- Birth date YYMMDD (positions 5-10)
 */
export function extraerFechaNacimientoDeCurp(curp: string): string | null {
  if (!curp || curp.length < 10) return null;
  
  const fechaPart = curp.substring(4, 10);
  const year = parseInt(fechaPart.substring(0, 2), 10);
  const month = fechaPart.substring(2, 4);
  const day = fechaPart.substring(4, 6);
  
  // Determine century: if year > 30, assume 1900s, otherwise 2000s
  const fullYear = year > 30 ? 1900 + year : 2000 + year;
  
  return `${fullYear}-${month}-${day}`;
}

/**
 * Interface for Excel SAT data
 */
export interface ExcelSatData {
  // Datos del emisor (proyecto/desarrollador)
  emisorRfc: string;
  emisorNombre: string;
  periodo: string; // AAAAMM format
  referencia: string; // CC-{id}
  
  // Datos del comprador
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  fechaNacimiento: string;
  rfc: string;
  curp: string;
  paisNacionalidad: string;
  actividadEconomica: string;
  
  // Domicilio
  codigoPostal: string;
  estado: string;
  municipio: string;
  colonia: string;
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
}

/**
 * Prepares data for the SAT Excel file
 */
export function prepararDatosExcelSat(
  datosValidados: DatosValidados,
  cuentaId: number
): ExcelSatData {
  const { xml, csf } = datosValidados;
  
  // Extract birth date from CURP
  const fechaNacimiento = extraerFechaNacimientoDeCurp(csf.curp) || '';
  
  // Get current year-month for periodo
  const now = new Date();
  const periodo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  return {
    emisorRfc: xml.emisor_rfc || '',
    emisorNombre: xml.emisor_nombre || '',
    periodo,
    referencia: `CC-${cuentaId}`,
    
    nombre: csf.nombre || '',
    apellidoPaterno: csf.apellido_paterno || '',
    apellidoMaterno: csf.apellido_materno || '',
    fechaNacimiento,
    rfc: csf.rfc || '',
    curp: csf.curp || '',
    paisNacionalidad: 'MEX',
    actividadEconomica: csf.regimenes?.[0]?.nombre || '',
    
    codigoPostal: csf.codigo_postal || '',
    estado: csf.estado || '',
    municipio: csf.municipio || '',
    colonia: csf.colonia || '',
    calle: csf.calle || '',
    numeroExterior: csf.numero_exterior || '',
    numeroInterior: csf.numero_interior || ''
  };
}
