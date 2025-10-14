import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface ReciboPagoData {
  aplicacionId: number;
  cuentaCobranzaId: number;
}

export class ReciboPagoService {
  async generateRecibo(data: ReciboPagoData): Promise<void> {
    try {
      // Fetch aplicacion details
      const { data: aplicacionData, error: aplicacionError } = await supabase
        .from('aplicaciones_pago')
        .select('*')
        .eq('id', data.aplicacionId)
        .single();

      if (aplicacionError) throw aplicacionError;

      // Fetch pago details
      let pagoData = null;
      if (aplicacionData.id_pago) {
        const { data: pago } = await supabase
          .from('pagos')
          .select(`
            fecha_pago,
            clave_rastreo,
            descripcion,
            metodos_pago!pagos_id_metodos_pago_fkey(nombre)
          `)
          .eq('id', aplicacionData.id_pago)
          .maybeSingle();
        
        pagoData = pago;
      }

      // Fetch acuerdo details
      let acuerdoData = null;
      if (aplicacionData.id_acuerdo_pago) {
        const { data: acuerdo } = await supabase
          .from('acuerdos_pago')
          .select(`
            id_concepto,
            conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)
          `)
          .eq('id', aplicacionData.id_acuerdo_pago)
          .maybeSingle();
        
        acuerdoData = acuerdo;
      }

      // Fetch cuenta cobranza details
      const { data: cuentaData, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('*')
        .eq('id', data.cuentaCobranzaId)
        .single();

      if (cuentaError) throw cuentaError;

      // Fetch oferta details
      let ofertaData = null;
      if (cuentaData.id_oferta) {
        const { data: oferta } = await supabase
          .from('ofertas')
          .select('id_propiedad, id_producto')
          .eq('id', cuentaData.id_oferta)
          .maybeSingle();
        
        ofertaData = oferta;
      }

      // Fetch compradores
      const { data: compradores, error: compradoresError } = await supabase
        .from('compradores')
        .select('*, personas!compradores_id_persona_fkey(*)')
        .eq('id_cuenta_cobranza', data.cuentaCobranzaId)
        .eq('activo', true);

      if (compradoresError) throw compradoresError;

      // Fetch property or product details
      let unidadInfo: any = {};
      if (ofertaData?.id_propiedad) {
        const { data: propiedadData } = await supabase
          .from('propiedades')
          .select(`
            numero_propiedad,
            m2_reales,
            id_entidad_relacionada_dueno
          `)
          .eq('id', ofertaData.id_propiedad)
          .maybeSingle();

        if (propiedadData) {
          unidadInfo.numero = propiedadData.numero_propiedad;
          unidadInfo.m2 = propiedadData.m2_reales;
          
          // Get project info
          const { data: entidadData } = await supabase
            .from('entidades_relacionadas')
            .select('id_proyecto, id_persona')
            .eq('id', propiedadData.id_entidad_relacionada_dueno)
            .maybeSingle();

          if (entidadData?.id_proyecto) {
            const { data: proyectoData } = await supabase
              .from('proyectos')
              .select('nombre, direccion, url_imagen_portada')
              .eq('id', entidadData.id_proyecto)
              .maybeSingle();

            if (proyectoData) {
              unidadInfo.proyecto = proyectoData.nombre;
              unidadInfo.direccion = proyectoData.direccion;
              unidadInfo.logo = proyectoData.url_imagen_portada;
            }
          }

          // Get owner name
          if (entidadData?.id_persona) {
            const { data: personaData } = await supabase
              .from('personas')
              .select('nombre_legal')
              .eq('id', entidadData.id_persona)
              .maybeSingle();

            unidadInfo.propietario = personaData?.nombre_legal;
          }
        }
      }

      // Generate PDF
      await this.generatePDF({
        aplicacion: aplicacionData,
        pago: pagoData,
        acuerdo: acuerdoData,
        cuenta: cuentaData,
        compradores: compradores || [],
        unidadInfo,
      });
    } catch (error) {
      console.error('Error generating recibo:', error);
      throw error;
    }
  }

  private async generatePDF(data: any): Promise<void> {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 20;

    // Add logo if available
    if (data.unidadInfo.logo) {
      try {
        const img = await this.loadImage(data.unidadInfo.logo);
        doc.addImage(img, 'PNG', 20, currentY, 40, 20);
      } catch (error) {
        console.warn('Could not load logo:', error);
      }
    }

    currentY += 30;

    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO', pageWidth / 2, currentY, { align: 'center' });

    currentY += 15;

    // Bueno por
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const formatMoney = (amount: number) =>
      new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    
    doc.text(`Bueno por: ${formatMoney(data.aplicacion.monto)}`, 20, currentY);
    currentY += 10;

    // Client information
    const clientName = data.compradores.length > 0
      ? data.compradores.map((c: any) => c.personas.nombre_legal).join(', ')
      : 'N/A';

    const formatDate = (date: string) =>
      new Date(date).toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

    const paymentDate = data.pago?.fecha_pago
      ? new Date(data.pago.fecha_pago)
      : new Date();

    currentY += 5;
    const textLines = doc.splitTextToSize(
      `Recibimos del/la Señor/a ${clientName} la cantidad de ${formatMoney(data.aplicacion.monto)}, ` +
      `el día ${paymentDate.getDate()} de ${paymentDate.toLocaleDateString('es-MX', { month: 'long' })} ` +
      `de ${paymentDate.getFullYear()}.`,
      pageWidth - 40
    );
    
    textLines.forEach((line: string) => {
      doc.text(line, 20, currentY);
      currentY += 7;
    });

    currentY += 10;

    // Payment concept
    const concepto = data.pago?.descripcion || 
      data.acuerdo?.conceptos_pago?.nombre || 
      'Pago';

    const conceptoLines = doc.splitTextToSize(
      `Por concepto de: ${concepto}`,
      pageWidth - 40
    );
    
    conceptoLines.forEach((line: string) => {
      doc.text(line, 20, currentY);
      currentY += 7;
    });

    currentY += 10;

    // Property information if available
    if (data.unidadInfo.numero) {
      doc.setFont('helvetica', 'bold');
      doc.text('Información de la Unidad:', 20, currentY);
      currentY += 10;

      doc.setFont('helvetica', 'normal');
      
      if (data.unidadInfo.proyecto) {
        doc.text(`Proyecto: ${data.unidadInfo.proyecto}`, 25, currentY);
        currentY += 7;
      }

      doc.text(`Unidad condominal: ${data.unidadInfo.numero}`, 25, currentY);
      currentY += 7;

      if (data.unidadInfo.m2) {
        doc.text(
          `Metros estimados: ${data.unidadInfo.m2} m² (${this.numberToWords(data.unidadInfo.m2)} metros cuadrados)`,
          25,
          currentY
        );
        currentY += 7;
      }

      doc.text(
        `Monto total de depósito: ${formatMoney(data.cuenta.precio_final)}`,
        25,
        currentY
      );
      currentY += 10;
    }

    currentY += 10;

    // Payment method information
    if (data.pago) {
      doc.setFont('helvetica', 'bold');
      doc.text('Información del Pago:', 20, currentY);
      currentY += 10;

      doc.setFont('helvetica', 'normal');
      
      if (data.pago.metodos_pago?.nombre) {
        doc.text(`Método de pago: ${data.pago.metodos_pago.nombre}`, 25, currentY);
        currentY += 7;
      }

      if (data.pago.clave_rastreo) {
        doc.text(`Clave de rastreo: ${data.pago.clave_rastreo}`, 25, currentY);
        currentY += 7;
      }

      doc.text(`Fecha de pago: ${formatDate(data.pago.fecha_pago)}`, 25, currentY);
      currentY += 10;
    }

    currentY += 20;

    // Additional notes
    doc.setFontSize(10);
    const notesLines = doc.splitTextToSize(
      'La cantidad aquí entregada y recibida será aplicada conforme al acuerdo de pago establecido.',
      pageWidth - 40
    );
    
    notesLines.forEach((line: string) => {
      doc.text(line, 20, currentY);
      currentY += 5;
    });

    currentY += 20;

    // Signature section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ATENTAMENTE', pageWidth / 2, currentY, { align: 'center' });
    currentY += 20;

    if (data.unidadInfo.propietario) {
      doc.setFont('helvetica', 'normal');
      doc.text(data.unidadInfo.propietario, pageWidth / 2, currentY, { align: 'center' });
      currentY += 7;
    }

    doc.setFont('helvetica', 'italic');
    doc.text('Gerente de cobranza', pageWidth / 2, currentY, { align: 'center' });

    // Save PDF
    const fileName = `Recibo_de_pago_${new Date().toISOString()}.pdf`;
    doc.save(fileName);
  }

  private async loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  private numberToWords(num: number): string {
    const units = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];

    if (num === 0) return 'cero';
    if (num < 10) return units[num];
    if (num >= 10 && num < 20) return teens[num - 10];
    if (num >= 20 && num < 100) {
      const unit = num % 10;
      const ten = Math.floor(num / 10);
      return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
    }

    // For numbers >= 100, just return the number
    return num.toString();
  }
}
