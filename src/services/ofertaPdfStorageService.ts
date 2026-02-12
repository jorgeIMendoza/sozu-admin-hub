import { supabase } from "@/integrations/supabase/client";
import { isValidRFC } from "@/utils/fiscalDataValidation";

interface UploadAndSaveResult {
  url: string;
  filename: string;
}

interface ValidationResult {
  isValid: boolean;
  wasInvalidated: boolean;
  reason?: string;
}

interface OfferFullData {
  id: number;
  url: string | null;
  id_persona_lead: number | null;
  id_propiedad: number | null;
  id_producto: number | null;
  mostrar_seccion_efectivo_en_oferta: boolean | null;
  rfc_comprador: string | null;
  clabe_stp_propiedad: string | null;
  proyecto_mostrar_efectivo: boolean | null;
  id_estatus_aprobacion: number | null;
}

export class OfertaPdfStorageService {
  
  /**
   * Verificar si ya existe URL para una oferta
   */
  async getExistingUrl(offerId: number): Promise<string | null> {
    const { data, error } = await supabase
      .from('ofertas')
      .select('url')
      .eq('id', offerId)
      .single();
    
    if (error) {
      console.warn('Error fetching existing URL:', error);
      return null;
    }
    
    return data?.url || null;
  }

  /**
   * Obtener todos los datos relevantes de la oferta para validación
   */
  private async fetchOfferWithAllData(offerId: number): Promise<OfferFullData | null> {
    // Obtener oferta con persona lead y propiedad
    const { data: oferta, error } = await supabase
      .from('ofertas')
      .select(`
        id,
        url,
        id_persona_lead,
        id_propiedad,
        id_producto,
        mostrar_seccion_efectivo_en_oferta,
        id_estatus_aprobacion
      `)
      .eq('id', offerId)
      .single();

    if (error || !oferta) {
      console.warn('Error fetching offer data for validation:', error);
      return null;
    }

    // Obtener RFC del comprador
    let rfcComprador: string | null = null;
    if (oferta.id_persona_lead) {
      const { data: persona } = await supabase
        .from('personas')
        .select('rfc')
        .eq('id', oferta.id_persona_lead)
        .single();
      rfcComprador = persona?.rfc || null;
    }

    // Obtener CLABE STP de la propiedad
    let clabeStp: string | null = null;
    if (oferta.id_propiedad) {
      const { data: propiedad } = await supabase
        .from('propiedades')
        .select('clabe_stp_tmp_apartado')
        .eq('id', oferta.id_propiedad)
        .single();
      clabeStp = propiedad?.clabe_stp_tmp_apartado || null;
    }

    // Obtener configuración del proyecto
    let proyectoMostrarEfectivo: boolean | null = null;
    if (oferta.id_propiedad) {
      const { data: propiedad } = await supabase
        .from('propiedades')
        .select('proyectos!propiedades_id_proyecto_fkey(mostrar_seccion_efectivo_en_oferta)')
        .eq('id', oferta.id_propiedad)
        .single();
      proyectoMostrarEfectivo = (propiedad as any)?.proyectos?.mostrar_seccion_efectivo_en_oferta ?? null;
    }

    return {
      id: oferta.id,
      url: oferta.url,
      id_persona_lead: oferta.id_persona_lead,
      id_propiedad: oferta.id_propiedad,
      id_producto: oferta.id_producto,
      mostrar_seccion_efectivo_en_oferta: oferta.mostrar_seccion_efectivo_en_oferta,
      rfc_comprador: rfcComprador,
      clabe_stp_propiedad: clabeStp,
      proyecto_mostrar_efectivo: proyectoMostrarEfectivo,
      id_estatus_aprobacion: oferta.id_estatus_aprobacion ?? null,
    };
  }

  /**
   * Validar si los datos críticos actuales requieren regenerar el PDF
   * 
   * La lógica es: si AHORA los datos están presentes para mostrar la sección
   * de datos bancarios, pero el PDF fue generado SIN esos datos, debemos regenerar.
   * 
   * También aplica al revés: si la configuración cambió y ya no debe mostrarse.
   */
  private validateCriticalData(oferta: OfferFullData): { isValid: boolean; reason?: string } {
    // Si no hay URL, no hay nada que invalidar (se generará nuevo)
    if (!oferta.url) {
      return { isValid: true };
    }

    const hasValidRFC = isValidRFC(oferta.rfc_comprador);
    const hasClabeStp = !!oferta.clabe_stp_propiedad;
    const mostrarEfectivo = oferta.mostrar_seccion_efectivo_en_oferta ?? oferta.proyecto_mostrar_efectivo ?? false;

    // La sección de datos bancarios se muestra cuando:
    // hasValidRFC AND (hasClabeStp OR mostrarEfectivo)
    const shouldShowBankSection = hasValidRFC && (hasClabeStp || mostrarEfectivo);

    // Si el estado actual difiere del estado cuando se generó,
    // necesitamos regenerar. Como no guardamos el estado anterior,
    // siempre invalidamos cuando los datos críticos cambian.
    // La estrategia es: si RFC es válido ahora Y hay datos bancarios disponibles,
    // invalidar para regenerar con la información completa.
    // También invalidar si RFC cambió de válido a inválido (poco probable pero posible).

    // Caso 1: Ahora hay RFC válido + datos bancarios → probablemente el PDF anterior no los tenía
    if (shouldShowBankSection) {
      // Verificar si la configuración de la oferta matchea la del proyecto
      if (oferta.mostrar_seccion_efectivo_en_oferta !== mostrarEfectivo) {
        return { isValid: false, reason: 'La configuración de datos bancarios del proyecto ha cambiado' };
      }
    }

    // Caso 2: Verificar si el RFC se agregó después de generar la oferta
    // Como no tenemos forma de saber si el PDF original tenía RFC,
    // invalidamos si ahora tiene RFC válido (el PDF se regenerará y si ya lo tenía, quedará igual)
    // Para evitar invalidaciones innecesarias, solo invalidamos cuando:
    // - Hay RFC válido Y hay CLABE o mostrar efectivo (la sección se mostraría)
    if (hasValidRFC && hasClabeStp && !oferta.mostrar_seccion_efectivo_en_oferta) {
      // La oferta no guardó mostrar_seccion_efectivo pero la propiedad tiene CLABE
      // Esto sugiere que la CLABE se agregó después
      return { isValid: false, reason: 'Se detectó CLABE STP en la propiedad que podría no estar reflejada en el PDF' };
    }

    // Caso 3: Si el estatus de aprobación no es el default (2=Aprobada),
    // siempre invalidar ya que no guardamos con qué estatus se generó el PDF
    if (oferta.id_estatus_aprobacion && oferta.id_estatus_aprobacion !== 2) {
      return { isValid: false, reason: 'El estatus de aprobación ha cambiado y debe reflejarse en el PDF' };
    }

    return { isValid: true };
  }

  /**
   * Invalidar URL de una oferta (setear a NULL)
   */
  private async invalidateOfferUrl(offerId: number): Promise<void> {
    const { error } = await supabase
      .from('ofertas')
      .update({ url: null })
      .eq('id', offerId);

    if (error) {
      console.error('Error invalidating offer URL:', error);
      throw error;
    }
    console.log(`Offer ${offerId} URL invalidated - will regenerate on next download`);
  }

  /**
   * Validar datos de la oferta y invalidar URL si los datos han cambiado
   */
  async validateOfferDataAndInvalidateIfNeeded(offerId: number): Promise<ValidationResult> {
    try {
      const oferta = await this.fetchOfferWithAllData(offerId);
      
      if (!oferta) {
        return { isValid: false, wasInvalidated: false, reason: 'No se pudo obtener datos de la oferta' };
      }

      if (!oferta.url) {
        return { isValid: false, wasInvalidated: false, reason: 'No hay URL guardada' };
      }

      const validation = this.validateCriticalData(oferta);

      if (!validation.isValid) {
        await this.invalidateOfferUrl(offerId);
        console.log(`Offer ${offerId} invalidated: ${validation.reason}`);
        return { isValid: false, wasInvalidated: true, reason: validation.reason };
      }

      return { isValid: true, wasInvalidated: false };
    } catch (error) {
      console.error('Error validating offer data:', error);
      // En caso de error, no invalidar - dejar que use la URL existente
      return { isValid: true, wasInvalidated: false };
    }
  }

  /**
   * Subir blob al bucket y guardar URL en BD
   */
  async uploadAndSave(
    offerId: number, 
    blob: Blob, 
    filename: string,
    isProduct: boolean = false
  ): Promise<UploadAndSaveResult> {
    // Crear path: propiedades/O_000123.pdf o productos/OP_000123.pdf
    const folder = isProduct ? 'productos' : 'propiedades';
    const path = `${folder}/${filename}`;

    console.log('Uploading PDF to storage:', path);

    // Subir al bucket
    const { error: uploadError } = await supabase.storage
      .from('ofertas')
      .upload(path, blob, { 
        contentType: 'application/pdf',
        upsert: true 
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
      throw uploadError;
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('ofertas')
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;
    console.log('PDF uploaded, public URL:', publicUrl);

    // Guardar URL en BD
    const { error: updateError } = await supabase
      .from('ofertas')
      .update({ url: publicUrl })
      .eq('id', offerId);

    if (updateError) {
      console.error('Error updating offer URL:', updateError);
      throw updateError;
    }

    console.log('URL saved to database for offer:', offerId);

    return { url: publicUrl, filename };
  }

  /**
   * Descargar archivo desde URL sin abrir nueva pestaña
   */
  async downloadFromUrl(url: string, filename: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      const blob = await response.blob();
      this.downloadBlob(blob, filename);
    } catch (error) {
      console.error('Error downloading from URL:', error);
      throw error;
    }
  }

  /**
   * Descargar blob directamente (sin abrir nueva pestaña)
   */
  downloadBlob(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
}

export const ofertaPdfStorageService = new OfertaPdfStorageService();
