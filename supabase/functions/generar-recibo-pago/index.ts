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
  
  // Capitalize first letter
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
  const prefix = tipo === 'mantenimiento' ? 'MN' : 'CC';
  return `${prefix}-${id.toString().padStart(6, '0')}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function numberToWordsM2(num: number): string {
  const entero = Math.floor(num);
  const decimales = Math.round((num - entero) * 100);
  
  let resultado = convertirEntero(entero);
  if (decimales > 0) {
    resultado += ' punto ' + convertirEntero(decimales);
  }
  
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

function drawCenteredText(page: any, text: string, y: number, font: any, fontSize: number, color: any, pageWidth: number) {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, {
    x: (pageWidth - textWidth) / 2,
    y,
    size: fontSize,
    font,
    color,
  });
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

    console.log('Cuenta found:', { id: cuenta.id, tipo: cuenta.tipo, id_oferta: cuenta.id_oferta, precio_final: cuenta.precio_final });

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

    console.log('Oferta found:', { id: oferta.id, id_propiedad: oferta.id_propiedad, id_producto: oferta.id_producto });

    // 4. Fetch compradores - using id_cuenta_cobranza (not id_oferta)
    // Table compradores has: id_cuenta_cobranza, id_persona, porcentaje_copropiedad, activo
    console.log('Fetching compradores for cuenta_cobranza:', cuenta.id);
    const { data: compradores, error: compradoresError } = await supabase
      .from('compradores')
      .select(`
        id_cuenta_cobranza,
        id_persona,
        porcentaje_copropiedad,
        personas!fk_compradores_persona (
          id,
          nombre_legal,
          rfc,
          tipo_persona,
          sexo
        )
      `)
      .eq('id_cuenta_cobranza', cuenta.id)
      .eq('activo', true);

    if (compradoresError) {
      console.error('Error fetching compradores:', compradoresError);
    }

    console.log('Compradores found:', compradores?.length || 0);
    console.log('Compradores data:', JSON.stringify(compradores, null, 2));

    // Get buyer info - use first comprador or the one with highest porcentaje_copropiedad
    const titularComprador = compradores?.reduce((prev: any, curr: any) => {
      if (!prev) return curr;
      return (curr.porcentaje_copropiedad || 0) > (prev.porcentaje_copropiedad || 0) ? curr : prev;
    }, null) || compradores?.[0];
    
    const titularPersona = titularComprador?.personas;
    const nombreComprador = (titularPersona?.nombre_legal || 'Sin nombre').trim().replace(/\s+/g, ' ');
    const tipoPersona = titularPersona?.tipo_persona || 'fisica';
    const sexo = titularPersona?.sexo || 'F';
    
    console.log('Buyer info:', { nombreComprador, tipoPersona, sexo });
    
    // Determine title (Señor/Señora or company)
    let titulo = '';
    if (tipoPersona === 'moral') {
      titulo = '';
    } else {
      titulo = sexo === 'M' ? 'el Señor ' : 'la Señora ';
    }

    // 5. Fetch property or product details with CORRECT relationship path
    // IMPORTANT: Prioritize id_producto when it exists (it means it's a product account, not property)
    let unidadNombre = '';
    let proyectoNombre = '';
    let m2Totales = 0;
    let proyectoData: any = null;
    let categoriaProducto = ''; // Para mostrar si es bodega, estacionamiento, etc.
    let tieneMetraje = false; // Whether the product category uses metraje
    let numeroDepartamento = ''; // Property number when the product belongs to a property

    // Check id_producto FIRST - if it exists, this is a product account
    if (oferta.id_producto) {
      console.log('Fetching producto (prioritized over property)...');
      // Use explicit FK name to avoid ambiguous relationship error
      const { data: producto, error: productoError } = await supabase
        .from('productos_servicios')
        .select(`
          id,
          nombre,
          metraje,
          id_proyecto,
          id_categoria,
          categorias_producto!fk_prodserv_categoria (
            id,
            nombre,
            tiene_metraje
          ),
          proyectos!productos_servicios_id_proyecto_fkey (
            id,
            nombre,
            url_logo,
            nombre_firmante_recibos,
            url_firma_recibos
          )
        `)
        .eq('id', oferta.id_producto)
        .single();

      if (!productoError && producto) {
        unidadNombre = producto.nombre || 'Producto';
        proyectoData = producto.proyectos;
        proyectoNombre = proyectoData?.nombre || '';
        // Get category name for displaying in the receipt
        const catData = (producto as any).categorias_producto;
        categoriaProducto = catData?.nombre || '';
        tieneMetraje = catData?.tiene_metraje === true;
        
        // If the category has metraje, use the product's metraje
        if (tieneMetraje) {
          m2Totales = Number(producto.metraje) || 0;
        }
        
        console.log('Producto found:', { 
          nombre: producto.nombre, 
          proyecto: proyectoNombre,
          categoria: categoriaProducto,
          tieneMetraje,
          metraje: producto.metraje,
          url_logo: proyectoData?.url_logo,
          nombre_firmante: proyectoData?.nombre_firmante_recibos
        });
      } else {
        console.error('Error fetching producto:', productoError);
      }

      // Fetch the property number (departamento) if the offer has a property
      if (oferta.id_propiedad) {
        const { data: propForProduct, error: propForProductError } = await supabase
          .from('propiedades')
          .select('numero_propiedad')
          .eq('id', oferta.id_propiedad)
          .single();
        
        if (!propForProductError && propForProduct) {
          numeroDepartamento = propForProduct.numero_propiedad || '';
          console.log('Property number for product:', numeroDepartamento);
        }
      }
    } else if (oferta.id_propiedad) {
      // Only fetch property if there's no product (regular property account)
      console.log('Fetching propiedad with correct relationship path...');
      // Use explicit FK name to avoid ambiguous relationship error
      const { data: propiedad, error: propiedadError } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_interiores,
          m2_exteriores,
          m2_loft,
          edificios_modelos!fk_propiedades_edificio_modelo (
            id,
            edificios!fk_edificios_modelos_edificio (
              id,
              nombre,
              proyectos!fk_edificios_proyecto (
                id,
                nombre,
                url_logo,
                nombre_firmante_recibos,
                url_firma_recibos
              )
            )
          )
        `)
        .eq('id', oferta.id_propiedad)
        .single();

      if (!propiedadError && propiedad) {
        unidadNombre = propiedad.numero_propiedad || '';
        // Navigate the correct path: propiedad -> edificios_modelos -> edificios -> proyectos
        const edificioModelo = propiedad.edificios_modelos;
        const edificio = edificioModelo?.edificios;
        proyectoData = edificio?.proyectos;
        proyectoNombre = proyectoData?.nombre || '';
        
        // Calculate total m2
        const m2Int = Number(propiedad.m2_interiores) || 0;
        const m2Ext = Number(propiedad.m2_exteriores) || 0;
        const m2Loft = Number(propiedad.m2_loft) || 0;
        m2Totales = m2Int + m2Ext + m2Loft;
        
        console.log('Propiedad found:', { 
          numero: propiedad.numero_propiedad, 
          proyecto: proyectoNombre, 
          m2: m2Totales,
          url_logo: proyectoData?.url_logo,
          nombre_firmante: proyectoData?.nombre_firmante_recibos,
          url_firma: proyectoData?.url_firma_recibos
        });
      } else {
        console.error('Error fetching propiedad:', propiedadError);
      }
    }

    // ============ Generate Professional PDF ============
    console.log('Generating professional PDF...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 55;
    const contentWidth = width - (margin * 2);
    let yPosition = height - 50;

    // Colors
    const black = rgb(0, 0, 0);
    const darkGray = rgb(0.35, 0.35, 0.35);
    const mediumGray = rgb(0.5, 0.5, 0.5);
    const lightGray = rgb(0.85, 0.85, 0.85);
    const accentColor = rgb(0.15, 0.25, 0.45); // Professional dark blue

    // ========== HEADER WITH LOGO ==========
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
        
        const logoHeight = 50;
        const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
        const logoX = (width - logoWidth) / 2;
        
        page.drawImage(logoImage, {
          x: logoX,
          y: yPosition - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        yPosition -= logoHeight + 10;

        // Subtle separator line under logo
        page.drawLine({
          start: { x: margin + 100, y: yPosition },
          end: { x: width - margin - 100, y: yPosition },
          thickness: 0.5,
          color: lightGray,
        });
        yPosition -= 25;
      } catch (e) {
        console.error('Error loading logo:', e);
        yPosition -= 20;
      }
    } else {
      yPosition -= 20;
    }

    // ========== TITLE: RECIBO ==========
    drawCenteredText(page, 'RECIBO', yPosition, helveticaBold, 28, accentColor, width);
    yPosition -= 50;

    // ========== BUENO POR SECTION ==========
    const montoFormateado = formatMoney(pago.monto);
    const montoEnLetras = numberToWordsWithPesos(pago.monto);
    
    // Background box for amount
    const boxHeight = 50;
    const boxY = yPosition - boxHeight + 15;
    page.drawRectangle({
      x: margin,
      y: boxY,
      width: contentWidth,
      height: boxHeight,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: lightGray,
      borderWidth: 1,
    });

    // "Bueno por:" label
    page.drawText('Bueno por:', {
      x: margin + 15,
      y: yPosition - 5,
      size: 11,
      font: helvetica,
      color: darkGray,
    });

    // Amount value
    page.drawText(montoFormateado, {
      x: margin + 15,
      y: yPosition - 25,
      size: 16,
      font: helveticaBold,
      color: black,
    });

    // Amount in words
    const amountInWordsX = margin + 150;
    const amountLines = wrapText(`(${montoEnLetras})`, contentWidth - 160, helvetica, 10);
    let amountY = yPosition - 8;
    for (const line of amountLines) {
      page.drawText(line, {
        x: amountInWordsX,
        y: amountY,
        size: 10,
        font: helvetica,
        color: mediumGray,
      });
      amountY -= 14;
    }

    yPosition -= boxHeight + 25;

    // ========== MAIN PARAGRAPH ==========
    const fechaFormateada = formatDate(pago.fecha_pago);
    const precioTotal = Number(cuenta.precio_final) || 0;
    const precioTotalFormateado = formatMoney(precioTotal);
    const precioTotalEnLetras = numberToWordsWithPesos(precioTotal);
    const m2Formateado = m2Totales.toFixed(2);
    const m2EnLetras = numberToWordsM2(m2Totales);

    // Build the main paragraph - adjust text based on whether it's a product or property
    // Determine the payer name based on number of buyers and payment method
    const numCompradores = compradores?.length || 0;
    const esSTP = pago.id_metodos_pago === 6 || pago.id_metodos_pago === 7;
    let nombrePagador = nombreComprador.toUpperCase();
    let prefijoPagador = '';

    if (numCompradores > 1) {
      if (esSTP && pago.clave_rastreo) {
        // Multiple buyers + STP: use nombre_ordenante from pagos_stp_raw
        const { data: stpRaw } = await supabase
          .from('pagos_stp_raw')
          .select('nombre_ordenante')
          .eq('claverastreo', pago.clave_rastreo)
          .single();
        if (stpRaw?.nombre_ordenante) {
          nombrePagador = stpRaw.nombre_ordenante.trim().replace(/\s+/g, ' ').toUpperCase();
        }
        console.log('Multiple buyers + STP, using nombre_ordenante:', nombrePagador);
      } else {
        // Multiple buyers + non-STP: use "del cliente (NAME1/NAME2/...)"
        const todosNombres = compradores!
          .map((c: any) => (c.personas?.nombre_legal || '').trim().replace(/\s+/g, ' ').toUpperCase())
          .filter((n: string) => n)
          .join('/');
        nombrePagador = todosNombres;
        prefijoPagador = 'del cliente ';
        console.log('Multiple buyers + non-STP, using all names:', nombrePagador);
      }
    }

    const recibimosTexto = prefijoPagador
      ? `Recibimos ${prefijoPagador}(${nombrePagador})`
      : `Recibimos de ${nombrePagador}`;

    let conceptoText = '';
    if (categoriaProducto) {
      const deptoText = numeroDepartamento ? ` del departamento ${numeroDepartamento}` : '';
      conceptoText = `${recibimosTexto} la cantidad de ${montoFormateado} (${montoEnLetras}), el día ${fechaFormateada}, por concepto de depósito en garantía de cumplimiento de conformidad que tiene como objetivo la gestión para la adquisición de un(a) ${categoriaProducto.toLowerCase()} del desarrollo inmobiliario ${proyectoNombre.toUpperCase()}${deptoText}, cuyas características serán:`;
    } else {
      conceptoText = `${recibimosTexto} la cantidad de ${montoFormateado} (${montoEnLetras}), el día ${fechaFormateada}, por concepto de depósito en garantía de cumplimiento de conformidad que tiene como objetivo la gestión para la adquisición de una unidad condominal del desarrollo inmobiliario ${proyectoNombre.toUpperCase()}, al efecto de adquirir la siguiente unidad condominal, cuyas características serán:`;
    }
    const mainParagraph = conceptoText;

    const mainLines = wrapText(mainParagraph, contentWidth, helvetica, 11);
    for (const line of mainLines) {
      page.drawText(line, {
        x: margin,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: black,
      });
      yPosition -= 17;
    }
    yPosition -= 12;

    // ========== NUMBERED LIST ==========
    // Item 1 - Label changes based on whether it's a product or property
    const item1Label = categoriaProducto ? `${categoriaProducto}:` : 'Unidad condominal:';
    const item1LabelWidth = helveticaBold.widthOfTextAtSize(item1Label, 11);
    
    page.drawText('1.', {
      x: margin + 5,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: accentColor,
    });
    page.drawText(item1Label, {
      x: margin + 25,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    page.drawText(unidadNombre, {
      x: margin + 30 + item1LabelWidth,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: black,
    });
    yPosition -= 22;

    // Item 2 - Metros estimados (only for properties or products with tiene_metraje=true)
    const showMetraje = !categoriaProducto || tieneMetraje;
    let currentItemNumber = 2;
    
    if (showMetraje) {
      page.drawText(`${currentItemNumber}.`, {
        x: margin + 5,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: accentColor,
      });
      page.drawText('Metros estimados:', {
        x: margin + 25,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: black,
      });
      page.drawText(`${m2Formateado} m²`, {
        x: margin + 145,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: black,
      });
      yPosition -= 16;
      // M2 in words on new line
      page.drawText(`(${m2EnLetras} metros cuadrados)`, {
        x: margin + 25,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: mediumGray,
      });
      yPosition -= 22;
      currentItemNumber++;
    }

    // Item 3 - Full text with client name
    page.drawText('3.', {
      x: margin + 5,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: accentColor,
    });
    
    // Item 3 label - wrap the full text including client name
    // Item 3 always shows ALL buyers when multiple, regardless of payment method
    let nombreParaItem3 = nombreComprador.toUpperCase();
    if (numCompradores > 1) {
      const todosNombresItem3 = compradores!
        .map((c: any) => (c.personas?.nombre_legal || '').trim().replace(/\s+/g, ' ').toUpperCase())
        .filter((n: string) => n)
        .join('/');
      nombreParaItem3 = todosNombresItem3;
    }
    const verboCompromiso = numCompradores > 1 ? 'comprometen' : 'compromete';
    const item3Label = `Monto total de depósito en garantía de cumplimiento al que se ${verboCompromiso} ${nombreParaItem3}:`;
    const item3LabelLines = wrapText(item3Label, contentWidth - 30, helveticaBold, 11);
    for (let i = 0; i < item3LabelLines.length; i++) {
      page.drawText(item3LabelLines[i], {
        x: margin + 25,
        y: yPosition - (i * 15),
        size: 11,
        font: helveticaBold,
        color: black,
      });
    }
    yPosition -= (item3LabelLines.length * 15) + 5;
    
    // Amount on new line
    page.drawText(precioTotalFormateado, {
      x: margin + 25,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    yPosition -= 16;
    
    // Amount in words
    const item3InWords = `(${precioTotalEnLetras})`;
    const item3WordsLines = wrapText(item3InWords, contentWidth - 30, helvetica, 10);
    for (const line of item3WordsLines) {
      page.drawText(line, {
        x: margin + 25,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: mediumGray,
      });
      yPosition -= 14;
    }
    yPosition -= 15;

    // ========== LEGAL PARAGRAPHS ==========
    const legalParagraph1 = `La cantidad aquí entregada y recibida será aplicada al depósito en garantía de cumplimiento, al momento de la celebración del contrato de promesa de compraventa.`;
    
    const legal1Lines = wrapText(legalParagraph1, contentWidth, helvetica, 10);
    for (const line of legal1Lines) {
      page.drawText(line, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: darkGray,
      });
      yPosition -= 15;
    }
    yPosition -= 10;

    const legalParagraph2 = `Será obligación de la empresa mantener debidamente informado al aportante de la forma y términos en los que se lleve a cabo la gestión de la adquisición de una unidad condominal del desarrollo inmobiliario ${proyectoNombre.toUpperCase()}.`;
    
    const legal2Lines = wrapText(legalParagraph2, contentWidth, helvetica, 10);
    for (const line of legal2Lines) {
      page.drawText(line, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: darkGray,
      });
      yPosition -= 15;
    }
    yPosition -= 35;

    // ========== SIGNATURE SECTION (Centered) ==========
    drawCenteredText(page, 'ATENTAMENTE', yPosition, helveticaBold, 12, black, width);
    yPosition -= 45;

    // Signature image
    const urlFirma = proyectoData?.url_firma_recibos || proyectoData?.url_firma;
    if (urlFirma) {
      try {
        console.log('Loading firma from:', urlFirma);
        const firmaResponse = await fetch(urlFirma);
        const firmaBytes = await firmaResponse.arrayBuffer();
        let firmaImage;
        
        if (urlFirma.toLowerCase().includes('.png')) {
          firmaImage = await pdfDoc.embedPng(firmaBytes);
        } else {
          firmaImage = await pdfDoc.embedJpg(firmaBytes);
        }
        
        const firmaHeight = 50;
        const firmaWidth = (firmaImage.width / firmaImage.height) * firmaHeight;
        const firmaX = (width - firmaWidth) / 2;
        
        page.drawImage(firmaImage, {
          x: firmaX,
          y: yPosition - firmaHeight + 10,
          width: firmaWidth,
          height: firmaHeight,
        });
        yPosition -= firmaHeight + 5;
      } catch (e) {
        console.error('Error loading firma:', e);
      }
    }

    // Signature line
    const lineWidth = 180;
    const lineX = (width - lineWidth) / 2;
    page.drawLine({
      start: { x: lineX, y: yPosition },
      end: { x: lineX + lineWidth, y: yPosition },
      thickness: 1,
      color: black,
    });
    yPosition -= 15;

    // Signer name (centered)
    if (proyectoData?.nombre_firmante_recibos) {
      drawCenteredText(page, proyectoData.nombre_firmante_recibos, yPosition, helveticaBold, 11, black, width);
      yPosition -= 14;
    }

    // Signer title (centered)
    drawCenteredText(page, 'Gerente de cobranza', yPosition, helvetica, 10, mediumGray, width);
    yPosition -= 30;

    // ========== FOOTER ==========
    const cuentaFormateada = formatCuentaCobranzaId(cuenta.id, cuenta.tipo || 'propiedad');
    const fechaEmision = formatShortDate(new Date().toISOString());
    
    // Footer separator line
    page.drawLine({
      start: { x: margin, y: 55 },
      end: { x: width - margin, y: 55 },
      thickness: 0.5,
      color: lightGray,
    });

    // Footer text
    const footerText = `Ref: ${cuentaFormateada}  •  Emitido: ${fechaEmision}  •  Pago ID: ${pago.id}`;
    drawCenteredText(page, footerText, 40, helvetica, 9, mediumGray, width);

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length, 'bytes');

    // Upload to Supabase Storage
    const fechaPago = new Date(pago.fecha_pago);
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
