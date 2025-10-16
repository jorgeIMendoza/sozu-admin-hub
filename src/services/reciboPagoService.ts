import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { formatCuentaCobranzaId } from '@/utils/cuentaCobranzaUtils';

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
            monto,
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

      // Fetch compradores with sex info
      const { data: compradores, error: compradoresError } = await supabase
        .from('compradores')
        .select('*, personas!compradores_id_persona_fkey(nombre_legal, sexo)')
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
            m2_interiores,
            m2_exteriores,
            id_entidad_relacionada_dueno
          `)
          .eq('id', ofertaData.id_propiedad)
          .maybeSingle();

        if (propiedadData) {
          unidadInfo.numero = propiedadData.numero_propiedad;
          unidadInfo.m2 = (propiedadData.m2_interiores || 0) + (propiedadData.m2_exteriores || 0);
          
          // Get project info
          const { data: entidadData } = await supabase
            .from('entidades_relacionadas')
            .select('id_proyecto, id_persona')
            .eq('id', propiedadData.id_entidad_relacionada_dueno)
            .maybeSingle();

          if (entidadData?.id_proyecto) {
            const { data: proyectoData } = await supabase
              .from('proyectos')
              .select('nombre, direccion, url_logo, url_firma_recibos, nombre_firmante_recibos')
              .eq('id', entidadData.id_proyecto)
              .maybeSingle();

            if (proyectoData) {
              unidadInfo.proyecto = proyectoData.nombre;
              unidadInfo.direccion = proyectoData.direccion;
              unidadInfo.logo = proyectoData.url_logo;
              unidadInfo.firma = proyectoData.url_firma_recibos;
              unidadInfo.nombreFirmante = proyectoData.nombre_firmante_recibos;
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
        cuentaCobranzaId: data.cuentaCobranzaId,
        oferta: ofertaData,
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

    // Add Sozu logo on the left
    try {
      const sozuLogoData = await this.loadImageWithDimensions('/images/sozu-logo.png');
      const maxHeight = 12;
      const aspectRatio = sozuLogoData.width / sozuLogoData.height;
      const logoHeight = maxHeight;
      const logoWidth = logoHeight * aspectRatio;
      doc.addImage(sozuLogoData.dataUrl, 'PNG', 20, currentY, logoWidth, logoHeight);
    } catch (error) {
      console.warn('Could not load Sozu logo:', error);
    }

    // Add project logo on the right
    if (data.unidadInfo.logo) {
      try {
        const projectLogoData = await this.loadImageWithDimensions(data.unidadInfo.logo);
        const maxHeight = 12;
        const aspectRatio = projectLogoData.width / projectLogoData.height;
        const logoHeight = maxHeight;
        const logoWidth = logoHeight * aspectRatio;
        doc.addImage(projectLogoData.dataUrl, 'PNG', pageWidth - 20 - logoWidth, currentY, logoWidth, logoHeight);
      } catch (error) {
        console.warn('Could not load project logo:', error);
      }
    }

    currentY += 30;

    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO', pageWidth / 2, currentY, { align: 'center' });

    currentY += 15;

    // Format money
    const formatMoney = (amount: number) =>
      new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);

    // Convert amount to words with pesos format
    const montoPago = data.pago?.monto || 0;
    const montoEnLetra = this.numberToWordsWithPesos(montoPago);

    // Bueno por
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const buenoporText = `Bueno por: ${formatMoney(montoPago)} (${montoEnLetra})`;
    const buenoporLines = doc.splitTextToSize(buenoporText, pageWidth - 40);
    buenoporLines.forEach((line: string) => {
      doc.text(line, 20, currentY, { align: 'justify', maxWidth: pageWidth - 40 });
      currentY += 7;
    });
    currentY += 3;

    // Get buyer info with gender
    const primerComprador = data.compradores.length > 0 ? data.compradores[0] : null;
    const sexoComprador = primerComprador?.personas?.sexo?.toUpperCase();
    
    // Get all buyer names
    const nombresCompradores = data.compradores
      .map((c: any) => c.personas?.nombre_legal)
      .filter(Boolean)
      .join('/');
    
    const clientName = nombresCompradores || 'N/A';
    
    // Determine article based on gender (del Señor/de la Señora, el/la)
    // When there are multiple buyers, use neutral "de" and "los compradores"
    const articulo = data.compradores.length > 1 ? 'de' : (sexoComprador === 'M' ? 'del Señor' : 'de la Señora');
    const articuloElLa = data.compradores.length > 1 ? 'los compradores' : (sexoComprador === 'M' ? 'el Señor' : 'la Señora');

    // Payment date formatting
    const paymentDate = data.pago?.fecha_pago
      ? new Date(data.pago.fecha_pago)
      : new Date();
    
    const dia = paymentDate.getDate();
    const mes = paymentDate.toLocaleDateString('es-MX', { month: 'long' });
    const anio = paymentDate.getFullYear();
    const fechaFormateada = `${dia} de ${mes} de ${anio}`;

    // Main text
    currentY += 5;
    const proyectoMayusculas = (data.unidadInfo.proyecto || 'N/A').toUpperCase();
    const mainText = `Recibimos ${articulo} ${clientName} la cantidad de ${formatMoney(montoPago)} (${montoEnLetra}), el día ${fechaFormateada}, por concepto de depósito en garantía de cumplimiento de conformidad que tiene como objetivo la gestión para la adquisición de una unidad condominal del desarrollo inmobiliario ${proyectoMayusculas}, al efecto de adquirir siguiente la unidad condominal, cuyas características serán:`;
    
    const mainTextLines = doc.splitTextToSize(mainText, pageWidth - 40);
    mainTextLines.forEach((line: string) => {
      doc.text(line, 20, currentY, { align: 'justify', maxWidth: pageWidth - 40 });
      currentY += 7;
    });

    currentY += 5;

    // Property characteristics
    if (data.unidadInfo.numero) {
      doc.text(`1. Unidad condominal: ${data.unidadInfo.numero}`, 25, currentY);
      currentY += 7;

      if (data.unidadInfo.m2) {
        const m2EnLetra = this.numberToWords(data.unidadInfo.m2);
        const m2Capitalizado = m2EnLetra.charAt(0).toUpperCase() + m2EnLetra.slice(1);
        doc.text(`2. Metros estimados: ${data.unidadInfo.m2} m² (${m2Capitalizado} metros cuadrados)`, 25, currentY);
        currentY += 7;
      }

      const precioEnLetra = this.numberToWordsWithPesos(data.cuenta.precio_final);
      const montoText = `3. Monto total de depósito en garantía de cumplimiento al que se compromete ${articuloElLa} ${clientName}: ${formatMoney(data.cuenta.precio_final)} (${precioEnLetra})`;
      const montoLines = doc.splitTextToSize(montoText, pageWidth - 50);
      montoLines.forEach((line: string) => {
        doc.text(line, 25, currentY, { align: 'justify', maxWidth: pageWidth - 50 });
        currentY += 7;
      });
    }

    currentY += 10;

    // Legal notes
    doc.setFontSize(11);
    const legalText1 = 'La cantidad aquí entregada y recibida será aplicada al depósito en garantía de cumplimiento, al momento de la celebración del contrato de promesa de compraventa.';
    const legalLines1 = doc.splitTextToSize(legalText1, pageWidth - 40);
    legalLines1.forEach((line: string) => {
      doc.text(line, 20, currentY, { align: 'justify', maxWidth: pageWidth - 40 });
      currentY += 6;
    });

    currentY += 5;

    const legalText2 = `Será obligación de la empresa mantener debidamente informado al aportante de la forma y términos en los que se lleve a cabo la gestión la adquisición de una unidad condominal del desarrollo inmobiliario ${proyectoMayusculas}.`;
    const legalLines2 = doc.splitTextToSize(legalText2, pageWidth - 40);
    legalLines2.forEach((line: string) => {
      doc.text(line, 20, currentY, { align: 'justify', maxWidth: pageWidth - 40 });
      currentY += 6;
    });

    currentY += 20;

    // Signature section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ATENTAMENTE', pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    // Add company name (propietario)
    if (data.unidadInfo.propietario) {
      doc.setFont('helvetica', 'normal');
      doc.text(data.unidadInfo.propietario, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }

    // Add signature image if available
    if (data.unidadInfo.firma) {
      try {
        const firmaImg = await this.loadImage(data.unidadInfo.firma);
        const imgWidth = 40;
        const imgHeight = 20;
        doc.addImage(firmaImg, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 5;
      } catch (error) {
        console.warn('Could not load signature image:', error);
        currentY += 15;
      }
    } else {
      currentY += 15;
    }

    // Add signer name if available
    if (data.unidadInfo.nombreFirmante) {
      doc.setFont('helvetica', 'normal');
      doc.text(data.unidadInfo.nombreFirmante, pageWidth / 2, currentY, { align: 'center' });
      currentY += 7;
    }

    doc.setFont('helvetica', 'italic');
    doc.text('Gerente de cobranza', pageWidth / 2, currentY, { align: 'center' });

    // Format date as yyyy_mm_dd
    const formatDateForFilename = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}_${month}_${day}`;
    };

    // Determine account type for formatting
    const tipoCuenta = data.oferta?.id_producto ? 'Producto' : 'Propiedad';
    const cuentaFormatted = formatCuentaCobranzaId(data.cuentaCobranzaId, tipoCuenta);
    
    // Get payment date
    const fechaPago = data.pago?.fecha_pago 
      ? new Date(data.pago.fecha_pago) 
      : new Date();
    const fechaFormatted = formatDateForFilename(fechaPago);

    // Save PDF with formatted name
    const fileName = `recibo_cuenta_${cuentaFormatted}_${fechaFormatted}.pdf`;
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

  private async loadImageWithDimensions(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: img.width,
          height: img.height
        });
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  private numberToWordsWithPesos(num: number): string {
    // Redondear a 2 decimales
    const roundedNum = Math.round(num * 100) / 100;
    
    // Separar parte entera y decimal
    const parteEntera = Math.floor(roundedNum);
    const parteDecimal = Math.round((roundedNum - parteEntera) * 100);
    
    // Convertir parte entera a palabras
    const palabrasEntera = this.convertirEntero(parteEntera);
    const palabrasEnteraCapitalizada = palabrasEntera.charAt(0).toUpperCase() + palabrasEntera.slice(1);
    
    // Formato final: "Monto en letra Pesos decimal/100 M.N."
    return `${palabrasEnteraCapitalizada} Pesos ${parteDecimal.toString().padStart(2, '0')}/100 M.N.`;
  }

  private numberToWords(num: number): string {
    // Para metros cuadrados y otros números sin formato de pesos
    const roundedNum = Math.round(num * 100) / 100;
    const parteEntera = Math.floor(roundedNum);
    const parteDecimal = Math.round((roundedNum - parteEntera) * 100);
    
    let resultado = this.convertirEntero(parteEntera);
    
    if (parteDecimal > 0) {
      resultado += ` punto ${this.convertirEntero(parteDecimal)}`;
    }
    
    return resultado;
  }

  private convertirEntero(n: number): string {
    const units = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
    const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

    if (n === 0) return 'cero';
    if (n < 10) return units[n];
    if (n >= 10 && n < 20) return teens[n - 10];
    if (n >= 20 && n < 100) {
      const unit = n % 10;
      const ten = Math.floor(n / 10);
      return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
    }
    if (n >= 100 && n < 1000) {
      const hundred = Math.floor(n / 100);
      const resto = n % 100;
      const hundredText = n === 100 ? 'cien' : hundreds[hundred];
      return resto === 0 ? hundredText : `${hundredText} ${this.convertirEntero(resto)}`;
    }
    if (n >= 1000 && n < 1000000) {
      const miles = Math.floor(n / 1000);
      const resto = n % 1000;
      let milesText = '';
      
      if (miles === 1) {
        milesText = 'mil';
      } else {
        milesText = this.convertirEntero(miles) + ' mil';
      }
      
      return resto === 0 ? milesText : `${milesText} ${this.convertirEntero(resto)}`;
    }
    if (n >= 1000000 && n < 2000000) {
      const resto = n % 1000000;
      return resto === 0 ? 'un millón' : `un millón ${this.convertirEntero(resto)}`;
    }
    if (n >= 2000000) {
      const millones = Math.floor(n / 1000000);
      const resto = n % 1000000;
      const millonesText = this.convertirEntero(millones) + ' millones';
      return resto === 0 ? millonesText : `${millonesText} ${this.convertirEntero(resto)}`;
    }
    return n.toString();
  }
}
