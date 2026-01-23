import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";

export interface CompradorSATStatus {
  id_persona: number;
  nombre_legal: string;
  tieneFacturaPdf: boolean;
  facturaPdfVerificada: boolean;
  tieneFacturaXml: boolean;
  facturaXmlVerificada: boolean;
  tieneConstancia: boolean;
  constanciaVerificada: boolean;
  cumpleRequisitos: boolean;
}

export interface SATNotificationStatus {
  canGenerate: boolean;
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
  compradoresStatus: CompradorSATStatus[];
  compradoresListos: number;
  totalCompradores: number;
  // Payment-based "fully paid" check
  estaPagadaCompletamente: boolean;
  precioFinal: number;
  totalPagado: number;
}

export const SATNotificationService = {
  /**
   * Get the current SAT notification status for a cuenta de cobranza
   */
  async getStatus(cuentaCobranzaId: number): Promise<SATNotificationStatus> {
    console.log('[SAT Service] getStatus called for cuenta:', cuentaCobranzaId);
    
    // Get cuenta info including precio_final
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select(`
        id,
        precio_final,
        ofertas:ofertas!fk_ccob_oferta(
          propiedades:propiedades!fk_ofertas_propiedad(
            id_estatus_disponibilidad
          )
        )
      `)
      .eq('id', cuentaCobranzaId)
      .eq('activo', true)
      .maybeSingle();

    console.log('[SAT Service] Cuenta query result:', { cuenta, cuentaError });

    if (cuentaError || !cuenta) {
      console.error('[SAT Service] Error fetching cuenta status:', cuentaError);
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
        estatusDisponibilidad: null,
        compradoresStatus: [],
        compradoresListos: 0,
        totalCompradores: 0,
        estaPagadaCompletamente: false,
        precioFinal: 0,
        totalPagado: 0
      };
    }

    // Get total pagado from pagos
    const { data: pagosData } = await supabase
      .from('pagos')
      .select('monto')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true);
    
    // Parse numeric values properly (Supabase returns numeric as string)
    const totalPagado = (pagosData || []).reduce((sum, p) => sum + (parseFloat(String(p.monto)) || 0), 0);
    const precioFinal = parseFloat(String(cuenta.precio_final)) || 0;
    const estaPagadaCompletamente = precioFinal > 0 && totalPagado >= precioFinal;
    
    console.log('[SAT Service] Payment check:', { totalPagado, precioFinal, estaPagadaCompletamente });

    const estatusDisponibilidad = (cuenta.ofertas as any)?.propiedades?.id_estatus_disponibilidad || null;

    // Get compradores for this cuenta
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select(`
        id_persona,
        personas:id_persona(
          nombre_legal
        )
      `)
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true);

    console.log('[SAT Service] Compradores query:', { cuentaCobranzaId, compradores, compradoresError });

    const personaIds = compradores?.map(c => c.id_persona) || [];

    // Get all facturas (PDF type 22, XML type 21) for this cuenta
    const { data: facturas, error: facturasError } = await supabase
      .from('documentos')
      .select('id, id_persona, id_tipo_documento, id_estatus_verificacion')
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .in('id_tipo_documento', [21, 22])
      .eq('activo', true)
      .eq('es_draft', false);

    console.log('[SAT Service] Facturas query:', { cuentaCobranzaId, facturas, facturasError });

    // Get constancias de situación fiscal (type 6) for all compradores
    let constancias: any[] = [];
    if (personaIds.length > 0) {
      const { data: constanciasData, error: constanciasError } = await supabase
        .from('documentos')
        .select('id, id_persona, id_estatus_verificacion')
        .in('id_persona', personaIds)
        .eq('id_tipo_documento', 6)
        .eq('activo', true);
      
      console.log('[SAT Service] Constancias query:', { personaIds, constanciasData, constanciasError });
      constancias = constanciasData || [];
    }

    // Build per-comprador status
    const compradoresStatus: CompradorSATStatus[] = (compradores || []).map(comprador => {
      const nombreLegal = (comprador.personas as any)?.nombre_legal || 'Sin nombre';
      
      // Filter facturas for this comprador
      const facturasPdf = (facturas || []).filter(f => 
        f.id_persona === comprador.id_persona && f.id_tipo_documento === 22
      );
      const facturasXml = (facturas || []).filter(f => 
        f.id_persona === comprador.id_persona && f.id_tipo_documento === 21
      );
      const constanciasComprador = constancias.filter(c => 
        c.id_persona === comprador.id_persona
      );

      const tieneFacturaPdf = facturasPdf.length > 0;
      const facturaPdfVerificada = facturasPdf.some(f => f.id_estatus_verificacion === 2);
      const tieneFacturaXml = facturasXml.length > 0;
      const facturaXmlVerificada = facturasXml.some(f => f.id_estatus_verificacion === 2);
      const tieneConstancia = constanciasComprador.length > 0;
      const constanciaVerificada = constanciasComprador.some(c => c.id_estatus_verificacion === 2);

      // Comprador cumple si tiene factura PDF y XML verificadas + constancia verificada
      const cumpleRequisitos = tieneFacturaPdf && facturaPdfVerificada && 
        tieneFacturaXml && facturaXmlVerificada && 
        tieneConstancia && constanciaVerificada;

      return {
        id_persona: comprador.id_persona,
        nombre_legal: nombreLegal,
        tieneFacturaPdf,
        facturaPdfVerificada,
        tieneFacturaXml,
        facturaXmlVerificada,
        tieneConstancia,
        constanciaVerificada,
        cumpleRequisitos
      };
    });

    // Calculate totals
    const compradoresListos = compradoresStatus.filter(c => c.cumpleRequisitos).length;
    const totalCompradores = compradoresStatus.length;

    // Global flags (at least one has each)
    const tieneFacturaPdf = compradoresStatus.some(c => c.tieneFacturaPdf);
    const facturaPdfVerificada = compradoresStatus.some(c => c.facturaPdfVerificada);
    const tieneFacturaXml = compradoresStatus.some(c => c.tieneFacturaXml);
    const facturaXmlVerificada = compradoresStatus.some(c => c.facturaXmlVerificada);
    const tieneConstancia = compradoresStatus.some(c => c.tieneConstancia);

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

    // canGenerate = pagada completamente (pagos >= precio_final) + TODOS los compradores cumplen
    const todosCompradoresCumplen = totalCompradores > 0 && compradoresStatus.every(c => c.cumpleRequisitos);
    const canGenerate = estaPagadaCompletamente && todosCompradoresCumplen;

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
      estatusDisponibilidad,
      compradoresStatus,
      compradoresListos,
      totalCompradores,
      estaPagadaCompletamente,
      precioFinal,
      totalPagado
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
