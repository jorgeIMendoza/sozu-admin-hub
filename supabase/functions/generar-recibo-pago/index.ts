import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert number to words in Spanish
function convertirEntero(n: number): string {
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  if (n === 0) return 'cero';
  if (n === 100) return 'cien';
  
  if (n < 10) return unidades[n];
  if (n < 20) return especiales[n - 10];
  if (n < 30) {
    if (n === 20) return 'veinte';
    return 'veinti' + unidades[n - 20];
  }
  if (n < 100) {
    const decena = Math.floor(n / 10);
    const unidad = n % 10;
    return decenas[decena] + (unidad > 0 ? ' y ' + unidades[unidad] : '');
  }
  if (n < 1000) {
    const centena = Math.floor(n / 100);
    const resto = n % 100;
    return centenas[centena] + (resto > 0 ? ' ' + convertirEntero(resto) : '');
  }
  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    if (miles === 1) {
      return 'mil' + (resto > 0 ? ' ' + convertirEntero(resto) : '');
    }
    return convertirEntero(miles) + ' mil' + (resto > 0 ? ' ' + convertirEntero(resto) : '');
  }
  if (n < 1000000000) {
    const millones = Math.floor(n / 1000000);
    const resto = n % 1000000;
    if (millones === 1) {
      return 'un millón' + (resto > 0 ? ' ' + convertirEntero(resto) : '');
    }
    return convertirEntero(millones) + ' millones' + (resto > 0 ? ' ' + convertirEntero(resto) : '');
  }
  return n.toString();
}

function numberToWordsWithPesos(num: number): string {
  const entero = Math.floor(num);
  const centavos = Math.round((num - entero) * 100);
  
  let resultado = convertirEntero(entero) + ' Pesos';
  if (centavos > 0) {
    resultado += ' ' + centavos.toString().padStart(2, '0') + '/100 M.N.';
  } else {
    resultado += ' 00/100 M.N.';
  }
  
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatCuentaCobranzaId(id: number, tipo: string): string {
  const prefix = tipo === 'mantenimiento' ? 'MN' : 'PR';
  return `${prefix}${id.toString().padStart(6, '0')}`;
}

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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pagoId } = await req.json();

    console.log('Received request with pagoId:', pagoId);

    if (!pagoId) {
      return new Response(
        JSON.stringify({ error: 'pagoId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the payment data
    console.log('Fetching pago data...');
    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('*')
      .eq('id', pagoId)
      .single();

    if (pagoError || !pago) {
      console.error('Error fetching pago:', pagoError);
      return new Response(
        JSON.stringify({ error: 'Pago not found', details: pagoError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Pago found:', { id: pago.id, monto: pago.monto, id_cuenta_cobranza: pago.id_cuenta_cobranza });

    // 2. Fetch the cuenta_cobranza
    console.log('Fetching cuenta_cobranza...');
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select('*')
      .eq('id', pago.id_cuenta_cobranza)
      .single();

    if (cuentaError || !cuenta) {
      console.error('Error fetching cuenta:', cuentaError);
      return new Response(
        JSON.stringify({ error: 'Cuenta cobranza not found', details: cuentaError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cuenta found:', { id: cuenta.id, tipo: cuenta.tipo, id_oferta: cuenta.id_oferta });

    // 3. Fetch the oferta
    console.log('Fetching oferta...');
    const { data: oferta, error: ofertaError } = await supabase
      .from('ofertas')
      .select('*')
      .eq('id', cuenta.id_oferta)
      .single();

    if (ofertaError || !oferta) {
      console.error('Error fetching oferta:', ofertaError);
      return new Response(
        JSON.stringify({ error: 'Oferta not found', details: ofertaError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Oferta found:', { id: oferta.id, id_propiedad: oferta.id_propiedad, id_producto_servicio: oferta.id_producto_servicio });

    // 4. Fetch compradores
    console.log('Fetching compradores...');
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select(`
        id,
        es_titular,
        id_persona,
        personas:id_persona (
          id,
          nombre_legal,
          rfc,
          direccion_calle,
          direccion_colonia,
          direccion_municipio,
          direccion_estado,
          direccion_codigo_postal
        )
      `)
      .eq('id_oferta', oferta.id)
      .eq('activo', true);

    if (compradoresError) {
      console.error('Error fetching compradores:', compradoresError);
    }

    console.log('Compradores found:', compradores?.length || 0);

    // Get buyer names
    const buyerNames = compradores?.map((c: any) => c.personas?.nombre_legal).filter(Boolean).join(', ') || 'Sin comprador';
    const titularComprador = compradores?.find((c: any) => c.es_titular);
    const titularPersona = titularComprador?.personas;

    // 5. Fetch property or product details
    let unidadNombre = '';
    let proyectoNombre = '';
    let edificioNombre = '';
    let proyectoData: any = null;

    if (oferta.id_propiedad) {
      console.log('Fetching propiedad...');
      const { data: propiedad, error: propiedadError } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero,
          piso,
          id_proyecto,
          id_edificio_modelo,
          proyectos:id_proyecto (
            id,
            nombre,
            url_logo,
            nombre_firmante_recibos,
            url_firma_recibos
          ),
          edificios_modelos:id_edificio_modelo (
            id,
            edificios:id_edificio (
              id,
              nombre
            )
          )
        `)
        .eq('id', oferta.id_propiedad)
        .single();

      if (!propiedadError && propiedad) {
        unidadNombre = `Unidad ${propiedad.numero}${propiedad.piso ? ` - Piso ${propiedad.piso}` : ''}`;
        proyectoData = propiedad.proyectos;
        proyectoNombre = proyectoData?.nombre || '';
        edificioNombre = (propiedad.edificios_modelos as any)?.edificios?.nombre || '';
        console.log('Propiedad found:', { numero: propiedad.numero, proyecto: proyectoNombre });
      }
    } else if (oferta.id_producto_servicio) {
      console.log('Fetching producto...');
      const { data: producto, error: productoError } = await supabase
        .from('productos_servicios')
        .select(`
          id,
          nombre,
          id_proyecto,
          proyectos:id_proyecto (
            id,
            nombre,
            url_logo,
            nombre_firmante_recibos,
            url_firma_recibos
          )
        `)
        .eq('id', oferta.id_producto_servicio)
        .single();

      if (!productoError && producto) {
        unidadNombre = producto.nombre || 'Producto';
        proyectoData = producto.proyectos;
        proyectoNombre = proyectoData?.nombre || '';
        console.log('Producto found:', { nombre: producto.nombre, proyecto: proyectoNombre });
      }
    }

    // ============ Generate PDF ============
    console.log('Generating PDF...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let yPosition = height - 50;

    // Try to load project logo
    if (proyectoData?.url_logo) {
      try {
        const logoResponse = await fetch(proyectoData.url_logo);
        const logoBytes = await logoResponse.arrayBuffer();
        let logoImage;
        
        if (proyectoData.url_logo.toLowerCase().includes('.png')) {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
        
        const logoWidth = 120;
        const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
        page.drawImage(logoImage, {
          x: 50,
          y: yPosition - logoHeight + 20,
          width: logoWidth,
          height: logoHeight,
        });
        yPosition -= logoHeight + 30;
      } catch (e) {
        console.error('Error loading logo:', e);
        yPosition -= 30;
      }
    } else {
      yPosition -= 30;
    }

    // Title
    page.drawText('RECIBO DE PAGO', {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    // Receipt number
    const cuentaFormateada = formatCuentaCobranzaId(cuenta.id, cuenta.tipo || 'propiedad');
    page.drawText(`Recibo: ${cuentaFormateada}-${pago.id}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 15;

    // Date
    const fechaPago = new Date(pago.fecha_pago);
    const fechaFormateada = fechaPago.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    page.drawText(`Fecha: ${fechaFormateada}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 40;

    // Amount section
    page.drawRectangle({
      x: 50,
      y: yPosition - 60,
      width: 512,
      height: 70,
      color: rgb(0.95, 0.95, 0.95),
    });

    page.drawText('CANTIDAD RECIBIDA:', {
      x: 60,
      y: yPosition - 20,
      size: 12,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(formatMoney(pago.monto), {
      x: 60,
      y: yPosition - 45,
      size: 24,
      font: helveticaBold,
      color: rgb(0.1, 0.4, 0.1),
    });

    yPosition -= 80;

    // Amount in words
    const montoEnLetras = numberToWordsWithPesos(pago.monto);
    const letrasLines = wrapText(`(${montoEnLetras})`, 80);
    for (const line of letrasLines) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= 15;
    }
    yPosition -= 20;

    // Buyer info section
    page.drawText('RECIBIDO DE:', {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= 18;

    const nombreLines = wrapText(buyerNames, 70);
    for (const line of nombreLines) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
    }
    yPosition -= 10;

    // RFC if available
    if (titularPersona?.rfc) {
      page.drawText(`RFC: ${titularPersona.rfc}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= 20;
    }
    yPosition -= 10;

    // Property/Product info
    page.drawText('POR CONCEPTO DE:', {
      x: 50,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= 18;

    const conceptoText = cuenta.tipo === 'mantenimiento' 
      ? `Cuota de mantenimiento - ${unidadNombre}`
      : `Pago de ${unidadNombre}`;
    
    const conceptoLines = wrapText(conceptoText, 70);
    for (const line of conceptoLines) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
    }
    yPosition -= 5;

    // Project info
    if (proyectoNombre) {
      page.drawText(`Proyecto: ${proyectoNombre}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= 15;
    }

    if (edificioNombre) {
      page.drawText(`Edificio: ${edificioNombre}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= 15;
    }

    page.drawText(`Cuenta: ${cuentaFormateada}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    yPosition -= 40;

    // Legal notice
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 562, y: yPosition },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    yPosition -= 20;

    const legalText = 'Este recibo es un comprobante de pago y no sustituye la factura fiscal correspondiente. ' +
      'Para cualquier aclaración, favor de comunicarse con la administración del proyecto.';
    const legalLines = wrapText(legalText, 90);
    for (const line of legalLines) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= 12;
    }
    yPosition -= 30;

    // Signature section
    if (proyectoData?.nombre_firmante_recibos) {
      // Try to load signature image
      if (proyectoData?.url_firma_recibos) {
        try {
          const firmaResponse = await fetch(proyectoData.url_firma_recibos);
          const firmaBytes = await firmaResponse.arrayBuffer();
          let firmaImage;
          
          if (proyectoData.url_firma_recibos.toLowerCase().includes('.png')) {
            firmaImage = await pdfDoc.embedPng(firmaBytes);
          } else {
            firmaImage = await pdfDoc.embedJpg(firmaBytes);
          }
          
          const firmaWidth = 100;
          const firmaHeight = (firmaImage.height / firmaImage.width) * firmaWidth;
          page.drawImage(firmaImage, {
            x: 250,
            y: yPosition - firmaHeight + 20,
            width: firmaWidth,
            height: firmaHeight,
          });
          yPosition -= firmaHeight + 10;
        } catch (e) {
          console.error('Error loading signature:', e);
        }
      }

      page.drawLine({
        start: { x: 200, y: yPosition },
        end: { x: 400, y: yPosition },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;

      page.drawText(proyectoData.nombre_firmante_recibos, {
        x: 200 + (200 - helvetica.widthOfTextAtSize(proyectoData.nombre_firmante_recibos, 10)) / 2,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPosition -= 12;

      page.drawText('Firma Autorizada', {
        x: 200 + (200 - helvetica.widthOfTextAtSize('Firma Autorizada', 8)) / 2,
        y: yPosition,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length, 'bytes');

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const fileName = `recibo_cuenta_${cuentaFormateada}_${fechaPago.toISOString().split('T')[0]}_${timestamp}.pdf`;
    const filePath = `recibos_temp/${fileName}`;

    console.log('Uploading PDF to storage:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload PDF', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(filePath);

    console.log('PDF uploaded successfully:', urlData.publicUrl);

    // Schedule deletion after 1 minute
    setTimeout(async () => {
      try {
        await supabase.storage.from('documentos').remove([filePath]);
        console.log('Temporary file deleted:', filePath);
      } catch (e) {
        console.error('Error deleting temporary file:', e);
      }
    }, 60000);

    return new Response(
      JSON.stringify({
        success: true,
        url_recibo: urlData.publicUrl,
        fileName: fileName,
        expiresIn: '1 minute',
        pagoId: pago.id,
        monto: pago.monto,
        cuentaCobranzaId: cuenta.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generar-recibo-pago:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
