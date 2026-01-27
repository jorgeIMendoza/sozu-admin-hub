import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Helper: Format offer ID
function formatOfferId(id: number, tipo: 'propiedad' | 'producto'): string {
  const prefix = tipo === 'producto' ? 'OP' : 'O';
  return `${prefix}-${id.toString().padStart(6, '0')}`;
}

// Helper: Format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

// Helper: Calculate vigencia (5 days from offer date)
function calculateVigencia(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 5);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

// Helper: Wrap text to fit within maxWidth
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

// Helper: Draw centered text
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

// Helper: Convert hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

// Helper: Calculate payment amounts for a scheme
function calculatePaymentAmounts(scheme: any, basePrice: number) {
  const adjustment = basePrice * (scheme.porcentaje_descuento_aumento / 100);
  const finalPrice = basePrice + adjustment;

  return {
    enganche: finalPrice * (scheme.porcentaje_enganche / 100),
    mensualidad: scheme.numero_mensualidades > 0
      ? (finalPrice * (scheme.porcentaje_mensualidades / 100)) / scheme.numero_mensualidades
      : 0,
    entrega: finalPrice * (scheme.porcentaje_entrega / 100),
    finalPrice,
    adjustment,
  };
}

// Helper: Validate RFC (simplified check for valid format)
function isValidRFC(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  // RFC can be 12 or 13 characters for physical or moral persons
  const rfcPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
  return rfcPattern.test(rfc.trim());
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offerId } = await req.json();

    console.log('Received request with offerId:', offerId);

    if (!offerId) {
      return new Response(
        JSON.stringify({ error: 'offerId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the offer data
    console.log('Fetching oferta data...');
    const { data: oferta, error: ofertaError } = await supabase
      .from('ofertas')
      .select('*')
      .eq('id', offerId)
      .single();

    if (ofertaError || !oferta) {
      console.error('Error fetching oferta:', ofertaError);
      return new Response(
        JSON.stringify({ error: 'Oferta not found', details: ofertaError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Oferta found:', { id: oferta.id, id_propiedad: oferta.id_propiedad, id_producto: oferta.id_producto });

    // Determine offer type
    const isProductOffer = oferta.id_producto !== null;
    const tipoOferta = isProductOffer ? 'producto' : 'propiedad';

    console.log('Offer type:', tipoOferta);

    // Generate PDF based on type
    let pdfBytes: Uint8Array;
    let fileName: string;

    if (isProductOffer) {
      const result = await generateProductOfferPdf(supabase, oferta);
      pdfBytes = result.pdfBytes;
      fileName = result.fileName;
    } else {
      const result = await generatePropertyOfferPdf(supabase, oferta);
      pdfBytes = result.pdfBytes;
      fileName = result.fileName;
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const filePath = `ofertas_temp/${fileName}`;

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
        url_oferta: urlData.publicUrl,
        fileName: fileName,
        expiresIn: '1 minute',
        tipoOferta: tipoOferta,
        offerId: oferta.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generar-oferta-pdf:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ================== PROPERTY OFFER PDF GENERATION ==================
async function generatePropertyOfferPdf(supabase: any, oferta: any): Promise<{ pdfBytes: Uint8Array; fileName: string }> {
  console.log('Generating property offer PDF...');

  // Fetch property with full relationship path
  const { data: propiedad, error: propError } = await supabase
    .from('propiedades')
    .select(`
      id,
      numero_propiedad,
      precio_lista,
      m2_interiores,
      m2_exteriores,
      numero_piso,
      descripcion,
      clabe_stp_tmp_apartado,
      edificios_modelos!fk_propiedades_edificio_modelo (
        id,
        modelos!fk_edificios_modelos_modelo (
          id,
          nombre,
          descripcion,
          numero_recamaras,
          numero_completo_banos,
          numero_medio_bano
        ),
        edificios!fk_edificios_modelos_edificio (
          id,
          nombre,
          proyectos!fk_edificios_proyecto (
            id,
            nombre,
            url_logo,
            mostrar_precio_m2_en_oferta,
            mostrar_piso_en_oferta,
            mostrar_seccion_efectivo_en_oferta
          )
        )
      )
    `)
    .eq('id', oferta.id_propiedad)
    .single();

  if (propError || !propiedad) {
    throw new Error(`Property not found: ${propError?.message}`);
  }

  const edificioModelo = propiedad.edificios_modelos;
  const modelo = edificioModelo?.modelos;
  const edificio = edificioModelo?.edificios;
  const proyecto = edificio?.proyectos;

  console.log('Property data loaded:', { 
    numero: propiedad.numero_propiedad, 
    proyecto: proyecto?.nombre 
  });

  // Fetch payment schemes for the offer
  const { data: ofertaEsquemas } = await supabase
    .from('ofertas_esquemas_pago')
    .select(`
      id_esquema_pago,
      esquemas_pago (
        id,
        nombre,
        porcentaje_enganche,
        numero_mensualidades,
        numero_pagos_enganche,
        porcentaje_mensualidades,
        porcentaje_entrega,
        porcentaje_descuento_aumento,
        es_manual
      )
    `)
    .eq('id_oferta', oferta.id)
    .eq('activo', true);

  const paymentSchemes = ofertaEsquemas?.map((oe: any) => oe.esquemas_pago).filter(Boolean) || [];

  // Fetch lead info
  let leadInfo: any = null;
  if (oferta.id_persona_lead) {
    const { data: persona } = await supabase
      .from('personas')
      .select('id, nombre_legal, email, telefono, rfc')
      .eq('id', oferta.id_persona_lead)
      .single();
    leadInfo = persona;
  }

  // Fetch creator info
  let creatorInfo: any = null;
  if (oferta.email_creador) {
    const { data: user } = await supabase
      .from('usuarios')
      .select('id, nombre, email, telefono')
      .eq('email', oferta.email_creador)
      .single();
    
    if (user) {
      creatorInfo = { nombre_legal: user.nombre, email: user.email, telefono: user.telefono };
    } else {
      // Try personas table
      const { data: persona } = await supabase
        .from('personas')
        .select('id, nombre_legal, email, telefono')
        .eq('email', oferta.email_creador)
        .single();
      if (persona) {
        creatorInfo = persona;
      }
    }
  }

  // Fetch estacionamientos
  const { data: estacionamientos } = await supabase
    .from('estacionamientos')
    .select(`
      id,
      nombre,
      tipos_estacionamiento (nombre)
    `)
    .eq('id_propiedad', propiedad.id)
    .eq('activo', true);

  // Fetch bodegas
  const { data: bodegas } = await supabase
    .from('bodegas')
    .select('id, nombre, m2')
    .eq('id_propiedad', propiedad.id)
    .eq('activo', true);

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 34; // 12mm
  const contentWidth = width - margin * 2;
  let y = height - margin;

  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.83, 0.83, 0.83);
  const selectedBg = rgb(0.91, 0.96, 0.91);
  const selectedBorder = rgb(0.13, 0.77, 0.37);

  // ========== HEADER ==========
  if (proyecto?.url_logo) {
    try {
      const logoResponse = await fetch(proyecto.url_logo);
      const logoBytes = await logoResponse.arrayBuffer();
      let logoImage;
      
      if (proyecto.url_logo.toLowerCase().includes('.png')) {
        logoImage = await pdfDoc.embedPng(logoBytes);
      } else {
        logoImage = await pdfDoc.embedJpg(logoBytes);
      }
      
      const logoHeight = 42;
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
      
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    } catch (e) {
      console.warn('Error loading logo:', e);
      // Fallback to text
      page.drawText(proyecto?.nombre || 'Proyecto', {
        x: margin,
        y: y - 10,
        size: 14,
        font: helveticaBold,
        color: black,
      });
    }
  } else {
    page.drawText(proyecto?.nombre || 'Proyecto', {
      x: margin,
      y: y - 10,
      size: 14,
      font: helveticaBold,
      color: black,
    });
  }

  // Offer info on right side
  const rightX = width - margin;
  let rightY = y - 4;

  page.drawText('ID Oferta:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  page.drawText(formatOfferId(oferta.id, 'propiedad'), {
    x: rightX - helvetica.widthOfTextAtSize(formatOfferId(oferta.id, 'propiedad'), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  page.drawText('Expedición:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  page.drawText(formatDate(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(formatDate(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  page.drawText('Vigencia:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  page.drawText(calculateVigencia(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(calculateVigencia(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 60;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PROPERTY DETAILS ==========
  page.drawText('Datos de la Propiedad:', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: black,
  });
  y -= 20;

  const propItems = [
    { label: 'Proyecto:', value: proyecto?.nombre || 'N/A' },
    { label: 'Edificio:', value: edificio?.nombre || 'N/A' },
    { label: 'Modelo:', value: modelo?.nombre || 'N/A' },
    { label: 'Número de propiedad:', value: propiedad.numero_propiedad || 'N/A' },
  ];

  if (proyecto?.mostrar_piso_en_oferta && propiedad.numero_piso) {
    propItems.push({ label: 'Nivel:', value: propiedad.numero_piso });
  }

  const totalArea = (Number(propiedad.m2_interiores) || 0) + (Number(propiedad.m2_exteriores) || 0);
  propItems.push({ label: 'Área:', value: `${totalArea.toFixed(2)} m²` });
  propItems.push({ label: 'Precio de lista:', value: formatCurrency(propiedad.precio_lista) });

  if (proyecto?.mostrar_precio_m2_en_oferta && totalArea > 0) {
    propItems.push({ label: 'Precio por m²:', value: formatCurrency(propiedad.precio_lista / totalArea) });
  }

  for (const item of propItems) {
    page.drawText(item.label, {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });
    page.drawText(item.value, {
      x: margin + 100,
      y,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    y -= 14;
  }

  // Property features
  const features: string[] = [];
  if (modelo?.numero_recamaras && modelo.numero_recamaras > 0) {
    features.push(`${modelo.numero_recamaras} Recámaras`);
  }
  if (modelo?.numero_completo_banos && modelo.numero_completo_banos > 0) {
    features.push(`${modelo.numero_completo_banos} Baños`);
  }
  if (modelo?.numero_medio_bano && modelo.numero_medio_bano > 0) {
    features.push(`${modelo.numero_medio_bano} Medio baño`);
  }
  if (estacionamientos && estacionamientos.length > 0) {
    features.push(`${estacionamientos.length} Estacionamiento(s)`);
  }
  if (bodegas && bodegas.length > 0) {
    features.push(`${bodegas.length} Bodega(s)`);
  }

  if (features.length > 0) {
    y -= 5;
    const featuresText = features.join('  •  ');
    page.drawText(featuresText, {
      x: margin,
      y,
      size: 8,
      font: helvetica,
      color: gray,
    });
    y -= 14;
  }

  y -= 5;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PAYMENT SCHEMES ==========
  if (paymentSchemes.length > 0) {
    page.drawText('Esquemas de pago:', {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 20;

    const selectedScheme = paymentSchemes[0];
    const filteredSchemes = selectedScheme?.es_manual
      ? paymentSchemes.filter((s: any) => s.es_manual)
      : paymentSchemes.filter((s: any) => !s.es_manual);

    const schemeWidth = filteredSchemes.length === 1 ? contentWidth : (contentWidth - 10) / 2;
    const schemeHeight = 100;

    for (let i = 0; i < filteredSchemes.length; i++) {
      const scheme = filteredSchemes[i];
      const isSelected = oferta.id_esquema_pago_seleccionado === scheme.id;
      const amounts = calculatePaymentAmounts(scheme, propiedad.precio_lista);
      const hasSavings = amounts.adjustment < 0;

      const col = i % 2;
      const xOffset = col * (schemeWidth + 10);
      const schemeX = margin + xOffset;

      // Check for new page
      if (y - schemeHeight < margin) {
        const newPage = pdfDoc.addPage([595.28, 841.89]);
        y = height - margin;
      }

      // Background
      if (isSelected) {
        page.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: selectedBg,
          borderColor: selectedBorder,
          borderWidth: 1,
        });
      } else {
        page.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: rgb(1, 1, 1),
          borderColor: lightGray,
          borderWidth: 0.5,
        });
      }

      let lineY = y - 12;

      // Scheme name
      if (!scheme.es_manual) {
        page.drawText(scheme.nombre, {
          x: schemeX + 8,
          y: lineY,
          size: 10,
          font: helveticaBold,
          color: black,
        });
        lineY -= 14;
      }

      // Final price
      page.drawText('Precio final:', { x: schemeX + 8, y: lineY, size: 8, font: helvetica, color: gray });
      page.drawText(formatCurrency(amounts.finalPrice), {
        x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.finalPrice), 8),
        y: lineY,
        size: 8,
        font: helveticaBold,
        color: black,
      });
      lineY -= 12;

      // Savings
      if (hasSavings) {
        page.drawText(`Ahorro (${Math.abs(scheme.porcentaje_descuento_aumento)}%):`, {
          x: schemeX + 8,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        const savingsText = formatCurrency(Math.abs(amounts.adjustment));
        page.drawText(savingsText, {
          x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(savingsText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Enganche
      if (scheme.porcentaje_enganche > 0) {
        const engancheLabel = scheme.numero_pagos_enganche > 1
          ? `Enganche (en ${scheme.numero_pagos_enganche} pagos):`
          : 'Enganche:';
        page.drawText(engancheLabel, { x: schemeX + 8, y: lineY, size: 8, font: helvetica, color: gray });
        const engancheText = `${scheme.porcentaje_enganche}% ${formatCurrency(amounts.enganche)}`;
        page.drawText(engancheText, {
          x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(engancheText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Monthly payments
      if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
        page.drawText('Durante la obra:', { x: schemeX + 8, y: lineY, size: 8, font: helvetica, color: gray });
        const totalMensText = `${scheme.porcentaje_mensualidades}% ${formatCurrency(amounts.finalPrice * (scheme.porcentaje_mensualidades / 100))}`;
        page.drawText(totalMensText, {
          x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(totalMensText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;

        page.drawText(`${scheme.numero_mensualidades} mensualidades:`, {
          x: schemeX + 8,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        page.drawText(formatCurrency(amounts.mensualidad), {
          x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.mensualidad), 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Delivery payment
      if (scheme.porcentaje_entrega > 0) {
        page.drawText('A la entrega:', { x: schemeX + 8, y: lineY, size: 8, font: helvetica, color: gray });
        const entregaText = `${scheme.porcentaje_entrega}% ${formatCurrency(amounts.entrega)}`;
        page.drawText(entregaText, {
          x: schemeX + schemeWidth - 8 - helveticaBold.widthOfTextAtSize(entregaText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
      }

      // Move to next row after 2 schemes
      if (col === 1 || i === filteredSchemes.length - 1) {
        y -= schemeHeight + 10;
      }
    }

    // Divider
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;
  }

  // ========== BANKING DATA ==========
  const hasValidRFC = isValidRFC(leadInfo?.rfc);
  const hasClabe = propiedad.clabe_stp_tmp_apartado;

  if (hasValidRFC && hasClabe) {
    page.drawText('Datos Bancarios', {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 20;

    const bankCardHeight = 60;

    // Transfer payment card
    page.drawRectangle({
      x: margin,
      y: y - bankCardHeight,
      width: contentWidth,
      height: bankCardHeight,
      color: rgb(0.83, 0.83, 0.83),
    });

    let bankY = y - 12;
    page.drawText('Pago por transferencia', {
      x: margin + 8,
      y: bankY,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    bankY -= 12;
    page.drawText('Banco: Sistema de Transferencias y Pagos (STP)', {
      x: margin + 8,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });
    bankY -= 10;
    page.drawText(`Cuenta CLABE: ${propiedad.clabe_stp_tmp_apartado}`, {
      x: margin + 8,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });

    y -= bankCardHeight + 10;

    // Divider
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;
  }

  // ========== CONTACT INFO ==========
  page.drawText('Datos de Contacto', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: black,
  });
  y -= 20;

  const contactColWidth = (contentWidth - 10) / 2;

  // Agent column
  page.drawText('Agente', { x: margin, y, size: 9, font: helveticaBold, color: black });
  y -= 14;

  const agentName = creatorInfo?.nombre_legal || creatorInfo?.nombre || oferta.email_creador;
  page.drawText('Nombre:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  page.drawText(agentName, { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  page.drawText('Email:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  page.drawText(creatorInfo?.email || oferta.email_creador, { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  page.drawText('Teléfono:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  page.drawText(creatorInfo?.telefono || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });

  // Buyer column (on same row, right side)
  const buyerX = margin + contactColWidth + 10;
  let buyerY = y + 36; // Go back to header level

  page.drawText('Comprador', { x: buyerX, y: buyerY, size: 9, font: helveticaBold, color: black });
  buyerY -= 14;

  const leadName = leadInfo?.nombre_legal || 'N/A';
  page.drawText('Nombre:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  page.drawText(leadName, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  page.drawText('Email:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  page.drawText(leadInfo?.email || 'N/A', { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  if (leadInfo?.telefono) {
    page.drawText('Teléfono:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    page.drawText(leadInfo.telefono, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
    buyerY -= 11;
  }
  if (leadInfo?.rfc) {
    page.drawText('RFC:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    page.drawText(leadInfo.rfc, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  }

  // Generate filename
  const cleanProjectName = (proyecto?.nombre || 'Proyecto').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanPropertyNumber = (propiedad.numero_propiedad || 'NA').replace(/[^a-zA-Z0-9]/g, '_');
  const offerNumber = oferta.id.toString().padStart(6, '0');

  const fileName = `O_${offerNumber}_${cleanPropertyNumber}_${cleanProjectName}_${Date.now()}.pdf`;

  const pdfBytes = await pdfDoc.save();
  console.log('Property offer PDF generated, size:', pdfBytes.length, 'bytes');

  return { pdfBytes, fileName };
}

// ================== PRODUCT OFFER PDF GENERATION ==================
async function generateProductOfferPdf(supabase: any, oferta: any): Promise<{ pdfBytes: Uint8Array; fileName: string }> {
  console.log('Generating product offer PDF...');

  // Fetch product details
  const { data: producto, error: prodError } = await supabase
    .from('productos_servicios')
    .select(`
      id,
      nombre,
      precio_lista,
      id_categoria,
      id_proyecto,
      categorias_producto!fk_prodserv_categoria (
        id,
        nombre
      ),
      proyectos!productos_servicios_id_proyecto_fkey (
        id,
        nombre,
        url_logo
      )
    `)
    .eq('id', oferta.id_producto)
    .single();

  if (prodError || !producto) {
    throw new Error(`Product not found: ${prodError?.message}`);
  }

  const proyecto = producto.proyectos;
  const categoria = producto.categorias_producto;

  console.log('Product data loaded:', { nombre: producto.nombre, proyecto: proyecto?.nombre });

  // Fetch related property if exists
  let propiedad: any = null;
  if (oferta.id_propiedad) {
    const { data: prop } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        edificios_modelos!fk_propiedades_edificio_modelo (
          id,
          modelos!fk_edificios_modelos_modelo (nombre),
          edificios!fk_edificios_modelos_edificio (nombre)
        )
      `)
      .eq('id', oferta.id_propiedad)
      .single();
    propiedad = prop;
  }

  // Fetch payment schemes for the offer
  const { data: ofertaEsquemas } = await supabase
    .from('ofertas_esquemas_pago')
    .select(`
      id_esquema_pago,
      esquemas_pago (
        id,
        nombre,
        porcentaje_enganche,
        numero_mensualidades,
        porcentaje_mensualidades,
        porcentaje_entrega,
        porcentaje_descuento_aumento,
        es_manual
      )
    `)
    .eq('id_oferta', oferta.id)
    .eq('activo', true);

  const paymentSchemes = ofertaEsquemas?.map((oe: any) => oe.esquemas_pago).filter(Boolean) || [];

  // Fetch lead info
  let leadInfo: any = null;
  if (oferta.id_persona_lead) {
    const { data: persona } = await supabase
      .from('personas')
      .select('id, nombre_legal, email, telefono, rfc')
      .eq('id', oferta.id_persona_lead)
      .single();
    leadInfo = persona;
  }

  // Fetch creator info
  let creatorInfo: any = null;
  if (oferta.email_creador) {
    const { data: user } = await supabase
      .from('usuarios')
      .select('id, nombre, email, telefono')
      .eq('email', oferta.email_creador)
      .single();
    
    if (user) {
      creatorInfo = { nombre_legal: user.nombre, email: user.email, telefono: user.telefono };
    }
  }

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 34;
  const contentWidth = width - margin * 2;
  let y = height - margin;

  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.83, 0.83, 0.83);
  const cardBg = rgb(0.96, 0.96, 0.96);
  const selectedBg = rgb(0.91, 0.96, 0.91);
  const selectedBorder = rgb(0.13, 0.77, 0.37);

  // ========== HEADER ==========
  if (proyecto?.url_logo) {
    try {
      const logoResponse = await fetch(proyecto.url_logo);
      const logoBytes = await logoResponse.arrayBuffer();
      let logoImage;
      
      if (proyecto.url_logo.toLowerCase().includes('.png')) {
        logoImage = await pdfDoc.embedPng(logoBytes);
      } else {
        logoImage = await pdfDoc.embedJpg(logoBytes);
      }
      
      const logoHeight = 42;
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
      
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    } catch (e) {
      console.warn('Error loading logo:', e);
      page.drawText(proyecto?.nombre || 'Proyecto', {
        x: margin,
        y: y - 10,
        size: 14,
        font: helveticaBold,
        color: black,
      });
    }
  } else {
    page.drawText(proyecto?.nombre || 'Proyecto', {
      x: margin,
      y: y - 10,
      size: 14,
      font: helveticaBold,
      color: black,
    });
  }

  // Offer info on right side
  const rightX = width - margin;
  page.drawText(`ID Oferta: ${formatOfferId(oferta.id, 'producto')}`, {
    x: rightX - helvetica.widthOfTextAtSize(`ID Oferta: ${formatOfferId(oferta.id, 'producto')}`, 9),
    y: y - 5,
    size: 9,
    font: helvetica,
    color: black,
  });
  page.drawText(`Expedición: ${formatDate(oferta.fecha_generacion)}`, {
    x: rightX - helvetica.widthOfTextAtSize(`Expedición: ${formatDate(oferta.fecha_generacion)}`, 9),
    y: y - 17,
    size: 9,
    font: helvetica,
    color: black,
  });
  page.drawText(`Vigencia: ${calculateVigencia(oferta.fecha_generacion)}`, {
    x: rightX - helvetica.widthOfTextAtSize(`Vigencia: ${calculateVigencia(oferta.fecha_generacion)}`, 9),
    y: y - 29,
    size: 9,
    font: helvetica,
    color: black,
  });

  y -= 60;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PROPERTY AND PRODUCT DATA (side by side) ==========
  const colWidth = (contentWidth - 20) / 2;
  const cardHeight = 80;

  // Property Data Card Title
  page.drawText('Datos de la Propiedad:', {
    x: margin,
    y,
    size: 11,
    font: helveticaBold,
    color: black,
  });

  // Product Data Card Title
  page.drawText('Datos del Producto:', {
    x: margin + colWidth + 20,
    y,
    size: 11,
    font: helveticaBold,
    color: black,
  });
  y -= 17;

  // Property Card
  page.drawRectangle({
    x: margin,
    y: y - cardHeight,
    width: colWidth,
    height: cardHeight,
    color: cardBg,
    borderColor: lightGray,
    borderWidth: 0.5,
  });

  const edificioModelo = propiedad?.edificios_modelos;
  let propY = y - 15;
  page.drawText('Proyecto:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
  page.drawText(proyecto?.nombre || 'N/A', { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
  propY -= 14;

  if (edificioModelo?.modelos?.nombre) {
    page.drawText('Modelo:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
    page.drawText(edificioModelo.modelos.nombre, { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
    propY -= 14;
  }
  if (edificioModelo?.edificios?.nombre) {
    page.drawText('Edificio:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
    page.drawText(edificioModelo.edificios.nombre, { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
    propY -= 14;
  }
  page.drawText('No° de propiedad:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
  page.drawText(propiedad?.numero_propiedad || 'N/A', { x: margin + 90, y: propY, size: 9, font: helveticaBold, color: black });

  // Product Card
  const prodCardX = margin + colWidth + 20;
  page.drawRectangle({
    x: prodCardX,
    y: y - cardHeight,
    width: colWidth,
    height: cardHeight,
    color: cardBg,
    borderColor: lightGray,
    borderWidth: 0.5,
  });

  let prodY = y - 15;
  page.drawText('Categoría:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  page.drawText(categoria?.nombre || 'N/A', { x: prodCardX + 60, y: prodY, size: 9, font: helveticaBold, color: black });
  prodY -= 14;

  page.drawText('Producto:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  const prodNameLines = wrapText(producto.nombre, colWidth - 80, helveticaBold, 9);
  page.drawText(prodNameLines[0] || 'N/A', { x: prodCardX + 60, y: prodY, size: 9, font: helveticaBold, color: black });
  prodY -= 14;

  page.drawText('Precio de lista:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  page.drawText(formatCurrency(producto.precio_lista), { x: prodCardX + 80, y: prodY, size: 9, font: helveticaBold, color: black });

  y -= cardHeight + 17;

  // ========== PAYMENT SCHEMES ==========
  if (paymentSchemes.length > 0) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;

    page.drawText('Esquemas de pago disponibles:', {
      x: margin,
      y,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    y -= 17;

    const selectedScheme = paymentSchemes.find((s: any) => s.id === oferta.id_esquema_pago_seleccionado);
    const displaySchemes = selectedScheme?.es_manual
      ? [selectedScheme]
      : paymentSchemes.filter((s: any) => !s.es_manual);

    const schemeWidth = displaySchemes.length === 1 ? contentWidth : (contentWidth - 10) / 2;
    const schemeHeight = 90;

    for (let i = 0; i < displaySchemes.length; i++) {
      const scheme = displaySchemes[i];
      const isSelected = oferta.id_esquema_pago_seleccionado === scheme.id;
      const amounts = calculatePaymentAmounts(scheme, producto.precio_lista);
      const hasSavings = amounts.adjustment < 0;

      const col = i % 2;
      const xOffset = col * (schemeWidth + 10);
      const schemeX = margin + xOffset;

      // Background
      if (isSelected) {
        page.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: selectedBg,
          borderColor: selectedBorder,
          borderWidth: 1,
        });
      } else {
        page.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: cardBg,
          borderColor: lightGray,
          borderWidth: 0.5,
        });
      }

      let lineY = y - 14;

      // Scheme name
      page.drawText(scheme.nombre, {
        x: schemeX + 10,
        y: lineY,
        size: 10,
        font: helveticaBold,
        color: black,
      });
      lineY -= 14;

      // Final price
      page.drawText('Precio final:', { x: schemeX + 10, y: lineY, size: 8, font: helvetica, color: gray });
      page.drawText(formatCurrency(amounts.finalPrice), {
        x: schemeX + schemeWidth - 10 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.finalPrice), 8),
        y: lineY,
        size: 8,
        font: helveticaBold,
        color: black,
      });
      lineY -= 12;

      // Savings
      if (hasSavings) {
        page.drawText('Ahorro:', { x: schemeX + 10, y: lineY, size: 8, font: helvetica, color: gray });
        const savingsText = `${Math.abs(scheme.porcentaje_descuento_aumento)}% ${formatCurrency(Math.abs(amounts.adjustment))}`;
        page.drawText(savingsText, {
          x: schemeX + schemeWidth - 10 - helveticaBold.widthOfTextAtSize(savingsText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Enganche
      if (scheme.porcentaje_enganche > 0) {
        page.drawText(`Enganche (${scheme.porcentaje_enganche}%):`, {
          x: schemeX + 10,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        page.drawText(formatCurrency(amounts.enganche), {
          x: schemeX + schemeWidth - 10 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.enganche), 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Mensualidades
      if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
        page.drawText(`${scheme.numero_mensualidades} mensualidades:`, {
          x: schemeX + 10,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        page.drawText(formatCurrency(amounts.mensualidad), {
          x: schemeX + schemeWidth - 10 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.mensualidad), 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      // Entrega
      if (scheme.porcentaje_entrega > 0) {
        page.drawText(`A la entrega (${scheme.porcentaje_entrega}%):`, {
          x: schemeX + 10,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        page.drawText(formatCurrency(amounts.entrega), {
          x: schemeX + schemeWidth - 10 - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.entrega), 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
      }

      // Move to next row
      if (col === 1 || i === displaySchemes.length - 1) {
        y -= schemeHeight + 10;
      }
    }
  }

  y -= 10;

  // ========== BANKING DATA ==========
  const hasClabe = oferta.clabe_stp_tmp_producto || oferta.clabe_stp;

  if (hasClabe) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;

    page.drawText('Datos Bancarios', {
      x: margin,
      y,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    y -= 17;

    const bankCardHeight = 60;

    page.drawRectangle({
      x: margin,
      y: y - bankCardHeight,
      width: contentWidth,
      height: bankCardHeight,
      color: rgb(0.83, 0.83, 0.83),
    });

    let bankY = y - 14;
    page.drawText('Pago por transferencia', {
      x: margin + 10,
      y: bankY,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    bankY -= 12;
    page.drawText('Banco: Sistema de Transferencias y Pagos (STP)', {
      x: margin + 10,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });
    bankY -= 12;
    page.drawText(`Cuenta CLABE: ${oferta.clabe_stp_tmp_producto || oferta.clabe_stp}`, {
      x: margin + 10,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });

    y -= bankCardHeight + 10;
  }

  // ========== CONTACT INFO ==========
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  page.drawText('Datos de Contacto:', {
    x: margin,
    y,
    size: 11,
    font: helveticaBold,
    color: black,
  });
  y -= 17;

  const contactColWidth = (contentWidth - 20) / 2;

  // Agent
  page.drawText('Agente:', { x: margin, y, size: 9, font: helveticaBold, color: black });
  page.drawText('Comprador:', { x: margin + contactColWidth + 20, y, size: 9, font: helveticaBold, color: black });
  y -= 14;

  const agentName = creatorInfo?.nombre_legal || oferta.email_creador;
  page.drawText(`Nombre: ${agentName}`, { x: margin, y, size: 8, font: helvetica, color: black });
  page.drawText(`Nombre: ${leadInfo?.nombre_legal || 'N/A'}`, { x: margin + contactColWidth + 20, y, size: 8, font: helvetica, color: black });
  y -= 11;

  page.drawText(`Email: ${oferta.email_creador}`, { x: margin, y, size: 8, font: helvetica, color: black });
  page.drawText(`Email: ${leadInfo?.email || 'N/A'}`, { x: margin + contactColWidth + 20, y, size: 8, font: helvetica, color: black });
  y -= 11;

  page.drawText(`Teléfono: ${creatorInfo?.telefono || 'N/A'}`, { x: margin, y, size: 8, font: helvetica, color: black });
  if (leadInfo?.telefono) {
    page.drawText(`Teléfono: ${leadInfo.telefono}`, { x: margin + contactColWidth + 20, y, size: 8, font: helvetica, color: black });
  }

  // Generate filename
  const cleanProjectName = (proyecto?.nombre || 'Proyecto').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanPropertyNumber = (propiedad?.numero_propiedad || 'NA').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanProductName = (producto.nombre || 'Producto').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  const offerNumber = oferta.id.toString().padStart(6, '0');

  const fileName = `OP_${offerNumber}_${cleanPropertyNumber}_${cleanProductName}_${cleanProjectName}_${Date.now()}.pdf`;

  const pdfBytes = await pdfDoc.save();
  console.log('Product offer PDF generated, size:', pdfBytes.length, 'bytes');

  return { pdfBytes, fileName };
}
