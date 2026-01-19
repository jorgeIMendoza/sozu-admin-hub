import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReciboPagoRequest {
  aplicacionId: number;
  cuentaCobranzaId: number;
}

// Number to words conversion utilities
function convertirEntero(n: number): string {
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
    return resto === 0 ? hundredText : `${hundredText} ${convertirEntero(resto)}`;
  }
  if (n >= 1000 && n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    let milesText = miles === 1 ? 'mil' : convertirEntero(miles) + ' mil';
    return resto === 0 ? milesText : `${milesText} ${convertirEntero(resto)}`;
  }
  if (n >= 1000000 && n < 2000000) {
    const resto = n % 1000000;
    return resto === 0 ? 'un millón' : `un millón ${convertirEntero(resto)}`;
  }
  if (n >= 2000000) {
    const millones = Math.floor(n / 1000000);
    const resto = n % 1000000;
    const millonesText = convertirEntero(millones) + ' millones';
    return resto === 0 ? millonesText : `${millonesText} ${convertirEntero(resto)}`;
  }
  return n.toString();
}

function numberToWordsWithPesos(num: number): string {
  const roundedNum = Math.round(num * 100) / 100;
  const parteEntera = Math.floor(roundedNum);
  const parteDecimal = Math.round((roundedNum - parteEntera) * 100);
  const palabrasEntera = convertirEntero(parteEntera);
  const palabrasEnteraCapitalizada = palabrasEntera.charAt(0).toUpperCase() + palabrasEntera.slice(1);
  return `${palabrasEnteraCapitalizada} Pesos ${parteDecimal.toString().padStart(2, '0')}/100 M.N.`;
}

function numberToWords(num: number): string {
  const roundedNum = Math.round(num * 100) / 100;
  const parteEntera = Math.floor(roundedNum);
  const parteDecimal = Math.round((roundedNum - parteEntera) * 100);
  let resultado = convertirEntero(parteEntera);
  if (parteDecimal > 0) {
    resultado += ` punto ${convertirEntero(parteDecimal)}`;
  }
  return resultado;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

function formatCuentaCobranzaId(id: number, tipo: string): string {
  const prefix = tipo === 'Producto' ? 'PR' : 'PR';
  return `${prefix}${id.toString().padStart(6, '0')}`;
}

// Function to wrap text into lines that fit a given width
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { aplicacionId, cuentaCobranzaId }: ReciboPagoRequest = await req.json();
    console.log(`📄 Generating recibo for aplicacionId: ${aplicacionId}, cuentaCobranzaId: ${cuentaCobranzaId}`);

    if (!aplicacionId || !cuentaCobranzaId) {
      return new Response(
        JSON.stringify({ error: 'aplicacionId y cuentaCobranzaId son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch aplicacion details
    const { data: aplicacionData, error: aplicacionError } = await supabase
      .from('aplicaciones_pago')
      .select('*')
      .eq('id', aplicacionId)
      .single();

    if (aplicacionError) {
      console.error('Error fetching aplicacion:', aplicacionError);
      throw new Error(`Error fetching aplicacion: ${aplicacionError.message}`);
    }

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
      .eq('id', cuentaCobranzaId)
      .single();

    if (cuentaError) {
      console.error('Error fetching cuenta cobranza:', cuentaError);
      throw new Error(`Error fetching cuenta cobranza: ${cuentaError.message}`);
    }

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
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .eq('activo', true);

    if (compradoresError) {
      console.error('Error fetching compradores:', compradoresError);
    }

    // Fetch property or product details
    const unidadInfo: Record<string, any> = {};
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

    console.log('📋 Data collected, generating PDF...');

    // Generate PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let currentY = height - 50;
    const margin = 50;
    const maxWidth = width - 2 * margin;

    // Title
    page.drawText('RECIBO', {
      x: width / 2 - 40,
      y: currentY,
      size: 24,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    currentY -= 40;

    // Bueno por
    const montoPago = pagoData?.monto || 0;
    const montoEnLetra = numberToWordsWithPesos(montoPago);
    const buenoporText = `Bueno por: ${formatMoney(montoPago)} (${montoEnLetra})`;
    
    const buenoporLines = wrapText(buenoporText, 80);
    for (const line of buenoporLines) {
      page.drawText(line, {
        x: margin,
        y: currentY,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 16;
    }

    currentY -= 10;

    // Get buyer info
    const primerComprador = compradores && compradores.length > 0 ? compradores[0] : null;
    const sexoComprador = primerComprador?.personas?.sexo?.toUpperCase();
    const nombresCompradores = (compradores || [])
      .map((c: any) => c.personas?.nombre_legal)
      .filter(Boolean)
      .join('/');
    const clientName = nombresCompradores || 'N/A';
    const articulo = (compradores?.length || 0) > 1 ? 'de' : (sexoComprador === 'M' ? 'del Señor' : 'de la Señora');
    const articuloElLa = (compradores?.length || 0) > 1 ? 'los compradores' : (sexoComprador === 'M' ? 'el Señor' : 'la Señora');

    // Payment date
    const paymentDateStr = pagoData?.fecha_pago;
    const paymentDate = paymentDateStr
      ? new Date(paymentDateStr.includes('T') ? paymentDateStr : `${paymentDateStr}T12:00:00`)
      : new Date();
    const dia = paymentDate.getDate();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mes = meses[paymentDate.getMonth()];
    const anio = paymentDate.getFullYear();
    const fechaFormateada = `${dia} de ${mes} de ${anio}`;

    // Main text
    const proyectoMayusculas = (unidadInfo.proyecto || 'N/A').toUpperCase();
    const mainText = `Recibimos ${articulo} ${clientName} la cantidad de ${formatMoney(montoPago)} (${montoEnLetra}), el dia ${fechaFormateada}, por concepto de deposito en garantia de cumplimiento de conformidad que tiene como objetivo la gestion para la adquisicion de una unidad condominal del desarrollo inmobiliario ${proyectoMayusculas}, al efecto de adquirir la siguiente unidad condominal, cuyas caracteristicas seran:`;
    
    const mainTextLines = wrapText(mainText, 85);
    for (const line of mainTextLines) {
      page.drawText(line, {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 14;
    }

    currentY -= 10;

    // Property characteristics
    if (unidadInfo.numero) {
      page.drawText(`1. Unidad condominal: ${unidadInfo.numero}`, {
        x: margin + 10,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 16;

      if (unidadInfo.m2) {
        const m2EnLetra = numberToWords(unidadInfo.m2);
        const m2Capitalizado = m2EnLetra.charAt(0).toUpperCase() + m2EnLetra.slice(1);
        page.drawText(`2. Metros estimados: ${unidadInfo.m2} m2 (${m2Capitalizado} metros cuadrados)`, {
          x: margin + 10,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 16;
      }

      const precioEnLetra = numberToWordsWithPesos(cuentaData.precio_final || 0);
      const montoText = `3. Monto total de deposito en garantia de cumplimiento al que se compromete ${articuloElLa} ${clientName}: ${formatMoney(cuentaData.precio_final || 0)} (${precioEnLetra})`;
      const montoLines = wrapText(montoText, 80);
      for (const line of montoLines) {
        page.drawText(line, {
          x: margin + 10,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
        currentY -= 14;
      }
    }

    currentY -= 20;

    // Legal notes
    const legalText1 = 'La cantidad aqui entregada y recibida sera aplicada al deposito en garantia de cumplimiento, al momento de la celebracion del contrato de promesa de compraventa.';
    const legalLines1 = wrapText(legalText1, 90);
    for (const line of legalLines1) {
      page.drawText(line, {
        x: margin,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 12;
    }

    currentY -= 10;

    const legalText2 = `Sera obligacion de la empresa mantener debidamente informado al aportante de la forma y terminos en los que se lleve a cabo la gestion la adquisicion de una unidad condominal del desarrollo inmobiliario ${proyectoMayusculas}.`;
    const legalLines2 = wrapText(legalText2, 90);
    for (const line of legalLines2) {
      page.drawText(line, {
        x: margin,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 12;
    }

    currentY -= 30;

    // Signature section
    page.drawText('ATENTAMENTE', {
      x: width / 2 - 35,
      y: currentY,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    currentY -= 20;

    if (unidadInfo.propietario) {
      const propietarioX = width / 2 - (unidadInfo.propietario.length * 3);
      page.drawText(unidadInfo.propietario, {
        x: propietarioX,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 40;
    }

    if (unidadInfo.nombreFirmante) {
      const firmanteX = width / 2 - (unidadInfo.nombreFirmante.length * 3);
      page.drawText(unidadInfo.nombreFirmante, {
        x: firmanteX,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      currentY -= 16;
    }

    page.drawText('Gerente de cobranza', {
      x: width / 2 - 45,
      y: currentY,
      size: 10,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log(`📄 PDF generated, size: ${pdfBytes.length} bytes`);

    // Generate filename
    const tipoCuenta = ofertaData?.id_producto ? 'Producto' : 'Propiedad';
    const cuentaFormatted = formatCuentaCobranzaId(cuentaCobranzaId, tipoCuenta);
    const fechaPago = paymentDateStr 
      ? new Date(paymentDateStr.includes('T') ? paymentDateStr : `${paymentDateStr}T12:00:00`) 
      : new Date();
    const year = fechaPago.getFullYear();
    const month = String(fechaPago.getMonth() + 1).padStart(2, '0');
    const day = String(fechaPago.getDate()).padStart(2, '0');
    const fechaFormatted = `${year}_${month}_${day}`;
    const timestamp = Date.now();
    const fileName = `recibos_temp/recibo_cuenta_${cuentaFormatted}_${fechaFormatted}_${timestamp}.pdf`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
      throw new Error(`Error uploading PDF: ${uploadError.message}`);
    }

    console.log('📤 PDF uploaded to storage:', fileName);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;
    console.log('🔗 Public URL:', publicUrl);

    // Schedule deletion after 1 minute
    setTimeout(async () => {
      try {
        console.log(`🗑️ Deleting ephemeral recibo: ${fileName}`);
        await supabase.storage.from('documentos').remove([fileName]);
        console.log(`✅ Ephemeral recibo deleted: ${fileName}`);
      } catch (deleteError) {
        console.error('Error deleting ephemeral recibo:', deleteError);
      }
    }, 60000); // 1 minute

    return new Response(
      JSON.stringify({ 
        success: true,
        url_recibo: publicUrl,
        fileName: fileName,
        expiresIn: '1 minute'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Error generating recibo:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Error desconocido',
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
