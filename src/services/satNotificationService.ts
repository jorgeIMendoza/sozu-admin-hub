import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";

export interface SATNotificationStatus {
  canGenerate: boolean; // id_estatus_disponibilidad === 9 AND tiene factura PDF+XML verificadas AND tiene constancia
  hasArchivoSAT: boolean;
  hasAcuseSAT: boolean;
  archivoSATUrl: string | null;
  acuseSATUrl: string | null;
  archivoSATDocId: number | null;
  acuseSATDocId: number | null;
  isGenerating: boolean;
  tieneFacturaPdf: boolean;
  tieneFacturaXml: boolean;
  facturaPdfVerificada: boolean;
  facturaXmlVerificada: boolean;
  tieneConstancia: boolean;
  estatusDisponibilidad: number | null;
}

export const SATNotificationService = {
  /**
   * Get the current SAT notification status for a cuenta de cobranza
   */
  async getStatus(cuentaCobranzaId: number): Promise<SATNotificationStatus> {
    // Get estatus disponibilidad from propiedad
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select(`
        id,
        ofertas:id_oferta(
          propiedades:id_propiedad(
            id_estatus_disponibilidad
          )
        )
      `)
      .eq('id', cuentaCobranzaId)
      .eq('activo', true)
      .single();

    if (cuentaError || !cuenta) {
      console.error('Error fetching cuenta status:', cuentaError);
      return {
        canGenerate: false,
        hasArchivoSAT: false,
        hasAcuseSAT: false,
        archivoSATUrl: null,
        acuseSATUrl: null,
        archivoSATDocId: null,
        acuseSATDocId: null,
        isGenerating: false,
        tieneFacturaPdf: false,
        tieneFacturaXml: false,
        facturaPdfVerificada: false,
        facturaXmlVerificada: false,
        tieneConstancia: false,
        estatusDisponibilidad: null
      };
    }

    const estatusDisponibilidad = (cuenta.ofertas as any)?.propiedades?.id_estatus_disponibilidad || null;

    // Check for factura PDF (id_tipo_documento 22) - verificada = id_estatus_verificacion 2
    const { data: facturaPdf } = await supabase
      .from('documentos')
      .select('id, id_estatus_verificacion')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('id_tipo_documento', 22)
      .eq('activo', true)
      .eq('es_draft', false)
      .order('fecha_creacion', { ascending: false })
      .limit(1);

    const tieneFacturaPdf = (facturaPdf?.length || 0) > 0;
    const facturaPdfVerificada = facturaPdf?.[0]?.id_estatus_verificacion === 2;

    // Check for factura XML (id_tipo_documento 21) - verificada = id_estatus_verificacion 2
    const { data: facturaXml } = await supabase
      .from('documentos')
      .select('id, id_estatus_verificacion')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('id_tipo_documento', 21)
      .eq('activo', true)
      .eq('es_draft', false)
      .order('fecha_creacion', { ascending: false })
      .limit(1);

    const tieneFacturaXml = (facturaXml?.length || 0) > 0;
    const facturaXmlVerificada = facturaXml?.[0]?.id_estatus_verificacion === 2;

    // Get compradores for this cuenta
    const { data: compradores } = await supabase
      .from('compradores')
      .select('id_persona')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true);

    const personaIds = compradores?.map(c => c.id_persona) || [];

    // Check for constancia de situación fiscal (id_tipo_documento 6) from compradores
    let tieneConstancia = false;
    if (personaIds.length > 0) {
      const { data: constancias } = await supabase
        .from('documentos')
        .select('id')
        .in('id_persona', personaIds)
        .eq('id_tipo_documento', 6)
        .eq('activo', true)
        .limit(1);

      tieneConstancia = (constancias?.length || 0) > 0;
    }

    // Check for archivo de notificación SAT (id_tipo_documento 44)
    const { data: archivoSAT } = await supabase
      .from('documentos')
      .select('id, url')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('id_tipo_documento', 44)
      .eq('activo', true)
      .order('fecha_creacion', { ascending: false })
      .limit(1);

    const hasArchivoSAT = (archivoSAT?.length || 0) > 0;
    const archivoSATUrl = archivoSAT?.[0]?.url || null;
    const archivoSATDocId = archivoSAT?.[0]?.id || null;

    // Check for acuse de notificación SAT (id_tipo_documento 45)
    const { data: acuseSAT } = await supabase
      .from('documentos')
      .select('id, url')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('id_tipo_documento', 45)
      .eq('activo', true)
      .order('fecha_creacion', { ascending: false })
      .limit(1);

    const hasAcuseSAT = (acuseSAT?.length || 0) > 0;
    const acuseSATUrl = acuseSAT?.[0]?.url || null;
    const acuseSATDocId = acuseSAT?.[0]?.id || null;

    // canGenerate = estatus 9 + factura PDF y XML verificadas + constancia
    const facturasCompletas = tieneFacturaPdf && tieneFacturaXml && facturaPdfVerificada && facturaXmlVerificada;
    const canGenerate = estatusDisponibilidad === 9 && facturasCompletas && tieneConstancia;

    return {
      canGenerate,
      hasArchivoSAT,
      hasAcuseSAT,
      archivoSATUrl,
      acuseSATUrl,
      archivoSATDocId,
      acuseSATDocId,
      isGenerating: false,
      tieneFacturaPdf,
      tieneFacturaXml,
      facturaPdfVerificada,
      facturaXmlVerificada,
      tieneConstancia,
      estatusDisponibilidad
    };
  },

  /**
   * Generate SAT notification file by calling N8N webhook
   * Returns the URL of the generated file
   */
  async generate(cuentaCobranzaId: number): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/generaNotificacionSAT`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_cuenta_cobranza: cuentaCobranzaId,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Error from N8N: ${response.statusText}`);
      }

      // The response should be the XLSM file
      const blob = await response.blob();
      
      // Generate filename
      const filename = `notificacion_sat_${cuentaCobranzaId}_${Date.now()}.xlsm`;
      
      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(`sat-notifications/${filename}`, blob, {
          contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12'
        });

      if (uploadError) {
        throw new Error(`Error uploading file: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(`sat-notifications/${filename}`);

      const documentUrl = urlData.publicUrl;

      // Create document record
      const { error: docError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_tipo_documento: 44, // Archivo de notificación al SAT
          url: documentUrl,
          activo: true
        });

      if (docError) {
        throw new Error(`Error creating document record: ${docError.message}`);
      }

      return { success: true, url: documentUrl };
    } catch (error: any) {
      console.error('Error generating SAT notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Invalidate (mark as inactive) the existing SAT notification file
   */
  async invalidatePrevious(cuentaCobranzaId: number): Promise<boolean> {
    const { error } = await supabase
      .from('documentos')
      .update({ activo: false })
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('id_tipo_documento', 44)
      .eq('activo', true);

    if (error) {
      console.error('Error invalidating previous SAT document:', error);
      return false;
    }

    return true;
  },

  /**
   * Regenerate SAT notification (invalidate old + generate new)
   */
  async regenerate(cuentaCobranzaId: number): Promise<{ success: boolean; url?: string; error?: string }> {
    const invalidated = await this.invalidatePrevious(cuentaCobranzaId);
    if (!invalidated) {
      return { success: false, error: 'No se pudo invalidar el archivo anterior' };
    }

    return this.generate(cuentaCobranzaId);
  },

  /**
   * Upload acuse de notificación al SAT
   */
  async uploadAcuse(cuentaCobranzaId: number, file: File): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // Generate filename
      const ext = file.name.split('.').pop() || 'pdf';
      const filename = `acuse_sat_${cuentaCobranzaId}_${Date.now()}.${ext}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(`sat-acuses/${filename}`, file);

      if (uploadError) {
        throw new Error(`Error uploading file: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(`sat-acuses/${filename}`);

      const documentUrl = urlData.publicUrl;

      // Create document record
      const { error: docError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_tipo_documento: 45, // Acuse de notificación al SAT
          url: documentUrl,
          activo: true
        });

      if (docError) {
        throw new Error(`Error creating document record: ${docError.message}`);
      }

      return { success: true, url: documentUrl };
    } catch (error: any) {
      console.error('Error uploading SAT acuse:', error);
      return { success: false, error: error.message };
    }
  }
};
