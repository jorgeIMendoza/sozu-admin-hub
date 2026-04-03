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

// Helper: Validate RFC (simplified check for valid format)
function isValidRFC(rfc: string | null | undefined): boolean {
  if (!rfc) return false;
  const rfcPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
  return rfcPattern.test(rfc.trim());
}

// Helper: Fetch image with timeout and size limit (returns null on failure)
async function fetchImageWithTimeout(url: string, timeoutMs: number = 3000, maxSizeKB: number = 150): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`Image fetch failed with status ${response.status}: ${url}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const sizeKB = arrayBuffer.byteLength / 1024;
    
    if (sizeKB > maxSizeKB) {
      console.warn(`Image too large (${sizeKB.toFixed(1)}KB > ${maxSizeKB}KB): ${url}`);
      return null;
    }
    
    console.log(`Image loaded successfully: ${sizeKB.toFixed(1)}KB from ${url.substring(0, 60)}...`);
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`Image fetch timed out after ${timeoutMs}ms: ${url}`);
    } else {
      console.warn(`Image fetch error: ${error.message}`);
    }
    return null;
  }
}

// Helper: Detect image type from bytes
function detectImageType(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes.length < 8) return null;
  
  // PNG magic number: 137 80 78 71 13 10 26 10
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'png';
  }
  
  // JPEG magic number: 255 216 255
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'jpg';
  }
  
  return null;
}

// Helper: Number to Spanish text
function numberToSpanishText(num: number): string {
  const textMap: { [key: number]: string } = {
    0: 'Cero', 1: 'Una', 2: 'Dos', 3: 'Tres', 4: 'Cuatro',
    5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez',
  };
  return textMap[num] || num.toString();
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offerId, includeBase64, hideBanking } = await req.json();

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

    // Fetch approval status name
    let estatus_aprobacion_nombre: string | null = null;
    if (oferta.id_estatus_aprobacion) {
      const { data: estatusData } = await supabase
        .from('estatus_aprobacion')
        .select('nombre')
        .eq('id', oferta.id_estatus_aprobacion)
        .single();
      estatus_aprobacion_nombre = estatusData?.nombre || null;
    }

    // Determine offer type
    const isProductOffer = oferta.id_producto !== null;
    const tipoOferta = isProductOffer ? 'producto' : 'propiedad';

    console.log('Offer type:', tipoOferta);

    // Generate PDF based on type
    let pdfBytes: Uint8Array;
    let fileName: string;

    if (isProductOffer) {
      const result = await generateProductOfferPdf(supabase, oferta, estatus_aprobacion_nombre, hideBanking);
      pdfBytes = result.pdfBytes;
      fileName = result.fileName;
    } else {
      const result = await generatePropertyOfferPdf(supabase, oferta, estatus_aprobacion_nombre, hideBanking);
      pdfBytes = result.pdfBytes;
      fileName = result.fileName;
    }

    // Upload to Supabase Storage
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

    // Schedule deletion after 1 minute (using EdgeRuntime.waitUntil for background task)
    const deleteTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 60000));
      try {
        await supabase.storage.from('documentos').remove([filePath]);
        console.log('Temporary file deleted:', filePath);
      } catch (e) {
        console.error('Error deleting temporary file:', e);
      }
    };
    
    // Use EdgeRuntime.waitUntil if available, otherwise fire-and-forget
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(deleteTask());
    }

    const responseBody: any = {
      success: true,
      url_oferta: urlData.publicUrl,
      fileName: fileName,
      expiresIn: '1 minute',
      tipoOferta: tipoOferta,
      offerId: oferta.id
    };

    // If requested, include base64-encoded PDF bytes directly
    if (includeBase64) {
      // Use Deno's built-in base64 encoding for reliable binary conversion
      const { encode } = await import("https://deno.land/std@0.208.0/encoding/base64.ts");
      responseBody.pdfBase64 = encode(pdfBytes);
    }

    return new Response(
      JSON.stringify(responseBody),
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
async function generatePropertyOfferPdf(supabase: any, oferta: any, estatus_aprobacion_nombre: string | null = null, hideBanking: boolean = false): Promise<{ pdfBytes: Uint8Array; fileName: string }> {
  console.log('Generating property offer PDF...');

  // Fetch property with full relationship path INCLUDING vistas
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
      id_vista,
      vistas (id, nombre),
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
  const vista = propiedad.vistas;

  console.log('Property data loaded:', { 
    numero: propiedad.numero_propiedad, 
    proyecto: proyecto?.nombre,
    vista: vista?.nombre
  });

  // Fetch model images
  let modelImages: any[] = [];
  if (modelo?.id) {
    const { data: images } = await supabase
      .from('multimedia_modelo')
      .select('url, ver_como_ubicacion_en_oferta')
      .eq('id_modelo', modelo.id)
      .eq('activo', true)
      .limit(5);
    modelImages = images || [];
  }

  // Fetch owner data from project
  let ownerData: any = null;
  let ownerBankAccount: any = null;
  
  if (proyecto?.id) {
    const { data: entidadDueno } = await supabase
      .from('entidades_relacionadas')
      .select(`
        personas!entidades_relacionadas_id_persona_fkey (
          id, nombre_legal, email, telefono
        )
      `)
      .eq('id_proyecto', proyecto.id)
      .eq('tipo_entidad', 'propietario')
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    
    if (entidadDueno?.personas) {
      ownerData = entidadDueno.personas;
      
      // Fetch owner's bank account (non-STP mother account for cash payments)
      const { data: bankAccount } = await supabase
        .from('cuentas_bancarias')
        .select('numero_cuenta, cuenta_clabe, banco_nombre')
        .eq('id_persona', ownerData.id)
        .eq('es_cuenta_madre_stp', false)
        .eq('activo', true)
        .limit(1)
        .maybeSingle();
      
      ownerBankAccount = bankAccount;
    }
  }

  // Fetch payment schemes WITH tramos_mensualidad
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
        es_manual,
        tramos_mensualidad
      )
    `)
    .eq('id_oferta', oferta.id)
    .eq('activo', true);

  const paymentSchemes = ofertaEsquemas?.map((oe: any) => {
    const s = oe.esquemas_pago;
    if (s && s.tramos_mensualidad && typeof s.tramos_mensualidad === 'string') {
      try { s.tramos_mensualidad = JSON.parse(s.tramos_mensualidad); } catch { s.tramos_mensualidad = null; }
    }
    return s;
  }).filter(Boolean) || [];

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
      .maybeSingle();
    
    if (user) {
      creatorInfo = { nombre_legal: user.nombre, email: user.email, telefono: user.telefono };
    } else {
      const { data: persona } = await supabase
        .from('personas')
        .select('id, nombre_legal, email, telefono')
        .eq('email', oferta.email_creador)
        .maybeSingle();
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

  // Check if property has balcony (id_caracteristica = 1 is typically balcón)
  const { data: caracteristicaBalcon } = await supabase
    .from('propiedades_caracteristicas')
    .select('id')
    .eq('id_propiedad', propiedad.id)
    .eq('id_caracteristica', 1)
    .eq('activo', true)
    .maybeSingle();
  
  const tieneBalcon = !!caracteristicaBalcon;

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = currentPage.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 34;
  const contentWidth = width - margin * 2;
  let y = height - margin;

  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.83, 0.83, 0.83);
  const dividerColor = rgb(0.83, 0.83, 0.83);
  const selectedBg = rgb(0.91, 0.96, 0.91);
  const selectedBorder = rgb(0.13, 0.77, 0.37);

  // Helper function to check and add new page
  function checkNewPage(neededHeight: number): boolean {
    if (y - neededHeight < margin) {
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin;
      return true;
    }
    return false;
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

  function getEscalonadoDisplayData(scheme: any, amounts: ReturnType<typeof calculatePaymentAmounts>, fechaGeneracion: string) {
    const isEscalonado = Array.isArray(scheme.tramos_mensualidad) && scheme.tramos_mensualidad.length > 0;
    const hasFixedAmountTramos = isEscalonado &&
      scheme.tramos_mensualidad.some((t: any) => (t.monto_mensualidad || 0) > 0);

    const totalFixedMens = hasFixedAmountTramos
      ? scheme.tramos_mensualidad.reduce(
          (sum: number, t: any) => sum + ((t.monto_mensualidad || 0) / 100) * t.numero_mensualidades,
          0,
        )
      : 0;

    const montoMensualText = hasFixedAmountTramos
      ? Array.from(
          new Set(
            scheme.tramos_mensualidad.map((t: any) => formatCurrency((t.monto_mensualidad || 0) / 100)),
          ),
        ).join(' / ')
      : formatCurrency(amounts.mensualidad);

    const montoEntregaText = hasFixedAmountTramos
      ? formatCurrency(amounts.finalPrice - amounts.enganche - totalFixedMens)
      : formatCurrency(amounts.entrega);

    let fechaFinalText = '';
    if (isEscalonado) {
      const tramos = scheme.tramos_mensualidad;
      const lastTramo = tramos[tramos.length - 1];
      if (lastTramo.fecha_limite) {
        const parts = lastTramo.fecha_limite.split('-');
        fechaFinalText = `hasta ${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        const totalMeses = tramos.reduce((sum: number, t: any) => sum + (t.numero_mensualidades || 0), 0);
        const startDate = new Date(fechaGeneracion);
        startDate.setMonth(startDate.getMonth() + totalMeses);
        const dd = String(startDate.getDate()).padStart(2, '0');
        const mm = String(startDate.getMonth() + 1).padStart(2, '0');
        const yyyy = startDate.getFullYear();
        fechaFinalText = `hasta ${dd}/${mm}/${yyyy}`;
      }
    }

    return {
      isEscalonado,
      hasFixedAmountTramos,
      montoMensualText,
      montoEntregaText,
      fechaFinalText,
    };
  }

  // ========== LOAD IMAGES (with timeout protection) ==========
  let logoImage: any = null;
  let modelImage: any = null;

  // Load project logo
  if (proyecto?.url_logo) {
    console.log('Loading project logo...');
    const logoBytes = await fetchImageWithTimeout(proyecto.url_logo, 2500, 100);
    if (logoBytes) {
      const imageType = detectImageType(logoBytes);
      try {
        if (imageType === 'png') {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else if (imageType === 'jpg') {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
        console.log('Project logo embedded successfully');
      } catch (e) {
        console.warn('Failed to embed logo:', e.message);
      }
    }
  }

  // Load model image (prefer one marked for offer, or first available)
  const modelImageUrl = modelImages.find((img: any) => img.ver_como_ubicacion_en_oferta)?.url || modelImages[0]?.url;
  if (modelImageUrl) {
    console.log('Loading model image...');
    const modelBytes = await fetchImageWithTimeout(modelImageUrl, 2500, 150);
    if (modelBytes) {
      const imageType = detectImageType(modelBytes);
      try {
        if (imageType === 'png') {
          modelImage = await pdfDoc.embedPng(modelBytes);
        } else if (imageType === 'jpg') {
          modelImage = await pdfDoc.embedJpg(modelBytes);
        }
        console.log('Model image embedded successfully');
      } catch (e) {
        console.warn('Failed to embed model image:', e.message);
      }
    }
  }

  // ========== HEADER ==========
  const headerStartY = y;

  // Project logo (left side)
  if (logoImage) {
    try {
      const logoMaxHeight = 42;
      const logoMaxWidth = 113;
      const dims = logoImage.scale(1);
      const scale = Math.min(logoMaxWidth / dims.width, logoMaxHeight / dims.height);
      currentPage.drawImage(logoImage, {
        x: margin,
        y: y - logoMaxHeight,
        width: dims.width * scale,
        height: dims.height * scale,
      });
    } catch (e) {
      console.warn('Error drawing logo:', e);
      currentPage.drawText(proyecto?.nombre || 'Proyecto', {
        x: margin,
        y: y - 10,
        size: 16,
        font: helveticaBold,
        color: black,
      });
    }
  } else {
    currentPage.drawText(proyecto?.nombre || 'Proyecto', {
      x: margin,
      y: y - 10,
      size: 16,
      font: helveticaBold,
      color: black,
    });
  }

  // Offer info on right side
  const rightX = width - margin;
  let rightY = headerStartY - 4;

  currentPage.drawText('ID Oferta:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(formatOfferId(oferta.id, 'propiedad'), {
    x: rightX - helvetica.widthOfTextAtSize(formatOfferId(oferta.id, 'propiedad'), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  currentPage.drawText('Expedicion:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(formatDate(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(formatDate(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  currentPage.drawText('Vigencia:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(calculateVigencia(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(calculateVigencia(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 55;

  // Divider
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PROPERTY DETAILS ==========
  currentPage.drawText('Datos de la Propiedad:', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: black,
  });
  y -= 20;

  // Calculate column widths based on whether we have a model image
  const hasModelImage = !!modelImage;
  const propColWidth = hasModelImage ? contentWidth * 0.35 : contentWidth * 0.5;
  const charColWidth = hasModelImage ? contentWidth * 0.2 : contentWidth * 0.5;
  const imageColWidth = hasModelImage ? contentWidth * 0.45 : 0;
  const propStartY = y;

  // Property items
  const propItems: { label: string; value: string }[] = [
    { label: 'Proyecto:', value: proyecto?.nombre || 'N/A' },
  ];

  if (edificio?.nombre) {
    propItems.push({ label: 'Edificio:', value: edificio.nombre });
  }
  if (modelo?.nombre) {
    propItems.push({ label: 'Modelo:', value: modelo.nombre });
  }
  propItems.push({ label: 'Numero de propiedad:', value: propiedad.numero_propiedad || 'N/A' });

  if (proyecto?.mostrar_piso_en_oferta && propiedad.numero_piso) {
    propItems.push({ label: 'Nivel:', value: propiedad.numero_piso });
  }
  
  if (vista?.nombre) {
    propItems.push({ label: 'Vista:', value: vista.nombre });
  }

  const totalArea = (Number(propiedad.m2_interiores) || 0) + (Number(propiedad.m2_exteriores) || 0);
  propItems.push({ label: 'Area:', value: `${totalArea.toFixed(2)} m2` });
  propItems.push({ label: 'Precio de lista:', value: formatCurrency(propiedad.precio_lista) });

  if (proyecto?.mostrar_precio_m2_en_oferta && totalArea > 0) {
    propItems.push({ label: 'Precio por m2:', value: formatCurrency(propiedad.precio_lista / totalArea) });
  }

  for (const item of propItems) {
    currentPage.drawText(item.label, {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });
    currentPage.drawText(item.value, {
      x: margin + 100,
      y,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    y -= 14;
  }

  // Characteristics column with text symbols
  const charX = margin + propColWidth + 5;
  let charY = propStartY;

  // Build characteristics list
  const iconItems: { symbol: string; value: string }[] = [];
  
  if (modelo?.numero_recamaras && modelo.numero_recamaras > 0) {
    iconItems.push({ symbol: '[R]', value: numberToSpanishText(modelo.numero_recamaras) + ' Recamara' + (modelo.numero_recamaras > 1 ? 's' : '') });
  }
  if (modelo?.numero_completo_banos && modelo.numero_completo_banos > 0) {
    iconItems.push({ symbol: '[B]', value: numberToSpanishText(modelo.numero_completo_banos) + ' Bano' + (modelo.numero_completo_banos > 1 ? 's' : '') });
  }
  if ((modelo?.numero_medio_bano ?? 0) > 0) {
    iconItems.push({ symbol: '[1/2]', value: numberToSpanishText(modelo.numero_medio_bano) + ' Medio bano' });
  }
  if (estacionamientos && estacionamientos.length > 0) {
    const estResumen = estacionamientos.reduce((acc: any, est: any) => {
      const tipo = est.tipos_estacionamiento?.nombre || 'Sin especificar';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});
    const estTexto = Object.entries(estResumen)
      .map(([tipo, cantidad]) => `${cantidad} ${tipo}`)
      .join(', ');
    iconItems.push({ symbol: '[E]', value: estTexto });
  }
  if (bodegas && bodegas.length > 0) {
    iconItems.push({ symbol: '[Bo]', value: `${bodegas.length} Bodega${bodegas.length > 1 ? 's' : ''}` });
  }
  if (tieneBalcon) {
    iconItems.push({ symbol: '[Bc]', value: 'Balcon' });
  }

  // Render characteristics
  for (const item of iconItems) {
    currentPage.drawText(item.symbol, {
      x: charX,
      y: charY,
      size: 8,
      font: helveticaBold,
      color: gray,
    });
    currentPage.drawText(item.value, {
      x: charX + 25,
      y: charY,
      size: 8,
      font: helvetica,
      color: black,
    });
    charY -= 12;
  }

  // Model image (right column)
  if (modelImage && hasModelImage) {
    const imageX = margin + propColWidth + charColWidth + 10;
    const imageMaxWidth = imageColWidth - 20;
    const imageMaxHeight = 100;
    
    try {
      const dims = modelImage.scale(1);
      const scale = Math.min(imageMaxWidth / dims.width, imageMaxHeight / dims.height);
      currentPage.drawImage(modelImage, {
        x: imageX,
        y: propStartY - dims.height * scale,
        width: dims.width * scale,
        height: dims.height * scale,
      });
    } catch (e) {
      console.warn('Error drawing model image:', e);
    }
  }

  y = Math.min(y, charY) - 10;

  // Divider
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PAYMENT SCHEMES ==========
  if (paymentSchemes.length > 0) {
    currentPage.drawText('Esquemas de pago:', {
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
    
    for (let i = 0; i < filteredSchemes.length; i++) {
      const scheme = filteredSchemes[i];
      const isSelected = oferta.id_esquema_pago_seleccionado === scheme.id;
      const amounts = calculatePaymentAmounts(scheme, propiedad.precio_lista);
      const hasSavings = amounts.adjustment < 0;

      const escalonadoDisplay = getEscalonadoDisplayData(scheme, amounts, oferta.fecha_generacion);

      // Calculate dynamic height based on content
      const tramosCount = scheme.tramos_mensualidad?.length || 0;
      let schemeHeight = 45;
      if (!escalonadoDisplay.isEscalonado && tramosCount > 1) {
        schemeHeight += (tramosCount - 1) * 12;
      }
      if (hasSavings) schemeHeight += 12;
      if (scheme.porcentaje_enganche > 0) schemeHeight += 12;
      if (escalonadoDisplay.isEscalonado) {
        schemeHeight += 24;
      } else {
        if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
          schemeHeight += 24;
          if (tramosCount > 0) {
            schemeHeight += tramosCount * 12;
          }
        }
        if (scheme.porcentaje_entrega > 0) schemeHeight += 12;
      }

      const col = i % 2;
      const xOffset = col * (schemeWidth + 10);
      const schemeX = margin + xOffset;

      // Check for new page
      checkNewPage(schemeHeight + 10);

      // Background
      if (isSelected) {
        currentPage.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: selectedBg,
          borderColor: selectedBorder,
          borderWidth: 1,
        });
      } else {
        currentPage.drawRectangle({
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
      const padding = 8;

      // Scheme name (only for non-manual)
      if (!scheme.es_manual) {
        currentPage.drawText(scheme.nombre, {
          x: schemeX + padding,
          y: lineY,
          size: 10,
          font: helveticaBold,
          color: black,
        });
        
        // Draw approval status badge next to name
        if (oferta.id_esquema_pago_seleccionado && oferta.id_estatus_aprobacion && estatus_aprobacion_nombre) {
          const statusColorsMap: Record<number, { bg: { r: number; g: number; b: number }; text: { r: number; g: number; b: number } }> = {
            1: { bg: { r: 1, g: 0.953, b: 0.804 }, text: { r: 0.522, g: 0.392, b: 0.016 } },
            2: { bg: { r: 0.831, g: 0.929, b: 0.855 }, text: { r: 0.082, g: 0.341, b: 0.141 } },
            3: { bg: { r: 0.973, g: 0.843, b: 0.855 }, text: { r: 0.447, g: 0.110, b: 0.141 } },
            4: { bg: { r: 0.800, g: 0.898, b: 1 }, text: { r: 0, g: 0.251, b: 0.522 } },
          };
          const sColors = statusColorsMap[oferta.id_estatus_aprobacion] || statusColorsMap[1];
          const nameW = helveticaBold.widthOfTextAtSize(scheme.nombre, 10);
          const badgeText = estatus_aprobacion_nombre;
          const badgeFontSize = 6;
          const badgeTextW = helvetica.widthOfTextAtSize(badgeText, badgeFontSize);
          const badgePad = 4;
          const badgeW = badgeTextW + badgePad * 2;
          const badgeH = 10;
          const badgeX = schemeX + padding + nameW + 4;
          const badgeY = lineY - 2;
          
          currentPage.drawRectangle({
            x: badgeX, y: badgeY, width: badgeW, height: badgeH,
            color: rgb(sColors.bg.r, sColors.bg.g, sColors.bg.b),
            borderColor: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
            borderWidth: 0.3,
          });
          currentPage.drawText(badgeText, {
            x: badgeX + badgePad, y: badgeY + 3, size: badgeFontSize,
            font: helvetica, color: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
          });
        }
        
        lineY -= 14;
      } else if (oferta.id_esquema_pago_seleccionado && oferta.id_estatus_aprobacion && estatus_aprobacion_nombre) {
        // Draw approval status badge for manual schemes
        const statusColorsMap: Record<number, { bg: { r: number; g: number; b: number }; text: { r: number; g: number; b: number } }> = {
          1: { bg: { r: 1, g: 0.953, b: 0.804 }, text: { r: 0.522, g: 0.392, b: 0.016 } },
          2: { bg: { r: 0.831, g: 0.929, b: 0.855 }, text: { r: 0.082, g: 0.341, b: 0.141 } },
          3: { bg: { r: 0.973, g: 0.843, b: 0.855 }, text: { r: 0.447, g: 0.110, b: 0.141 } },
          4: { bg: { r: 0.800, g: 0.898, b: 1 }, text: { r: 0, g: 0.251, b: 0.522 } },
        };
        const sColors = statusColorsMap[oferta.id_estatus_aprobacion] || statusColorsMap[1];
        const badgeText = estatus_aprobacion_nombre;
        const badgeFontSize = 7;
        const badgeTextW = helveticaBold.widthOfTextAtSize(badgeText, badgeFontSize);
        const badgePad = 4;
        const badgeW = badgeTextW + badgePad * 2;
        const badgeH = 12;
        const badgeX = schemeX + padding;
        const badgeY = lineY - 2;
        
        currentPage.drawRectangle({
          x: badgeX, y: badgeY, width: badgeW, height: badgeH,
          color: rgb(sColors.bg.r, sColors.bg.g, sColors.bg.b),
          borderColor: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
          borderWidth: 0.3,
        });
        currentPage.drawText(badgeText, {
          x: badgeX + badgePad, y: badgeY + 3, size: badgeFontSize,
          font: helveticaBold, color: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
        });
        lineY -= 16;
      }

      // Final price
      currentPage.drawText('Precio final:', { 
        x: schemeX + padding, 
        y: lineY, 
        size: 8, 
        font: helvetica, 
        color: gray 
      });
      currentPage.drawText(formatCurrency(amounts.finalPrice), {
        x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.finalPrice), 8),
        y: lineY,
        size: 8,
        font: helveticaBold,
        color: black,
      });
      lineY -= 12;

      // Savings
      if (hasSavings) {
        currentPage.drawText(`Ahorro (${Math.abs(scheme.porcentaje_descuento_aumento)}%):`, {
          x: schemeX + padding,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        const savingsText = formatCurrency(Math.abs(amounts.adjustment));
        currentPage.drawText(savingsText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(savingsText, 8),
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
        currentPage.drawText(engancheLabel, { 
          x: schemeX + padding, 
          y: lineY, 
          size: 8, 
          font: helvetica, 
          color: gray 
        });
        const engancheText = `${scheme.porcentaje_enganche}% ${formatCurrency(amounts.enganche)}`;
        currentPage.drawText(engancheText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(engancheText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      if (escalonadoDisplay.isEscalonado) {
        currentPage.drawText('Monto mensual:', {
          x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
        });
        currentPage.drawText(escalonadoDisplay.montoMensualText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(escalonadoDisplay.montoMensualText, 8),
          y: lineY, size: 8, font: helveticaBold, color: black,
        });
        lineY -= 8;
        if (escalonadoDisplay.fechaFinalText) {
          currentPage.drawText(escalonadoDisplay.fechaFinalText, {
            x: schemeX + schemeWidth - padding - helvetica.widthOfTextAtSize(escalonadoDisplay.fechaFinalText, 6),
            y: lineY, size: 6, font: helvetica, color: gray,
          });
          lineY -= 10;
        } else {
          lineY -= 4;
        }

        currentPage.drawText('Monto a la entrega:', {
          x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
        });
        currentPage.drawText(escalonadoDisplay.montoEntregaText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(escalonadoDisplay.montoEntregaText, 8),
          y: lineY, size: 8, font: helveticaBold, color: black,
        });
      } else {
        // Monthly payments (percentage mode)
        if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
          currentPage.drawText('Durante la obra:', { 
            x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray 
          });
          const totalMensText = `${scheme.porcentaje_mensualidades}% ${formatCurrency(amounts.finalPrice * (scheme.porcentaje_mensualidades / 100))}`;
          currentPage.drawText(totalMensText, {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(totalMensText, 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
          lineY -= 12;

          currentPage.drawText(`${scheme.numero_mensualidades} mensualidades:`, {
            x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
          });
          currentPage.drawText(formatCurrency(amounts.mensualidad), {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.mensualidad), 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
          lineY -= 12;
        }

        // Delivery payment
        if (scheme.porcentaje_entrega > 0) {
          currentPage.drawText('A la entrega:', { 
            x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray 
          });
          const entregaText = `${scheme.porcentaje_entrega}% ${formatCurrency(amounts.entrega)}`;
          currentPage.drawText(entregaText, {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(entregaText, 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
        }
      }

      // Move to next row after 2 schemes
      if (col === 1 || i === filteredSchemes.length - 1) {
        y -= schemeHeight + 10;
      }
    }

    // Divider
    currentPage.drawLine({
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
  const showCashPayment = proyecto?.mostrar_seccion_efectivo_en_oferta && ownerBankAccount;
  const showBanking = !hideBanking && hasValidRFC && (hasClabe || showCashPayment);

  if (showBanking) {
    checkNewPage(80);

    currentPage.drawText('Datos Bancarios', {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 20;

    const bankCardWidth = (hasClabe && showCashPayment) ? (contentWidth - 10) / 2 : contentWidth;
    const bankCardHeight = 70;

    // Transfer payment card
    if (hasClabe) {
      currentPage.drawRectangle({
        x: margin,
        y: y - bankCardHeight,
        width: bankCardWidth,
        height: bankCardHeight,
        color: dividerColor,
      });

      let bankY = y - 12;
      currentPage.drawText('Pago por transferencia', {
        x: margin + 8,
        y: bankY,
        size: 9,
        font: helveticaBold,
        color: black,
      });
      bankY -= 14;
      currentPage.drawText('Banco: Sistema de Transferencias y Pagos (STP)', {
        x: margin + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
      bankY -= 12;
      currentPage.drawText(`Titular: ${ownerData?.nombre_legal || 'N/A'}`, {
        x: margin + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
      bankY -= 12;
      currentPage.drawText(`Cuenta CLABE: ${propiedad.clabe_stp_tmp_apartado}`, {
        x: margin + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
    }

    // Cash payment card
    if (showCashPayment) {
      const cashX = hasClabe ? margin + bankCardWidth + 10 : margin;

      currentPage.drawRectangle({
        x: cashX,
        y: y - bankCardHeight,
        width: bankCardWidth,
        height: bankCardHeight,
        color: dividerColor,
      });

      let bankY = y - 12;
      currentPage.drawText('Pago en efectivo', {
        x: cashX + 8,
        y: bankY,
        size: 9,
        font: helveticaBold,
        color: black,
      });
      bankY -= 14;
      currentPage.drawText(`Banco: ${ownerBankAccount.banco_nombre || 'N/A'}`, {
        x: cashX + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
      bankY -= 12;
      currentPage.drawText(`Titular: ${ownerData?.nombre_legal || 'N/A'}`, {
        x: cashX + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
      bankY -= 12;
      currentPage.drawText(`Cuenta CLABE: ${ownerBankAccount.cuenta_clabe || 'N/A'}`, {
        x: cashX + 8,
        y: bankY,
        size: 8,
        font: helvetica,
        color: black,
      });
    }

    y -= bankCardHeight + 10;

    // Divider
    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;
  }

  // ========== CONTACT INFO ==========
  checkNewPage(60);

  currentPage.drawText('Datos de Contacto', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: black,
  });
  y -= 20;

  const contactColWidth = (contentWidth - 10) / 2;

  // Agent column
  currentPage.drawText('Agente', { x: margin, y, size: 9, font: helveticaBold, color: black });
  y -= 14;

  const agentName = creatorInfo?.nombre_legal || creatorInfo?.nombre || oferta.email_creador;
  currentPage.drawText('Nombre:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(agentName || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  currentPage.drawText('Email:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(creatorInfo?.email || oferta.email_creador || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  currentPage.drawText('Telefono:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(creatorInfo?.telefono || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });

  // Buyer column (on same row, right side)
  const buyerX = margin + contactColWidth + 10;
  let buyerY = y + 36;

  currentPage.drawText('Comprador', { x: buyerX, y: buyerY, size: 9, font: helveticaBold, color: black });
  buyerY -= 14;

  const leadName = leadInfo?.nombre_legal || 'N/A';
  currentPage.drawText('Nombre:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(leadName, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  currentPage.drawText('Email:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(leadInfo?.email || 'N/A', { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  if (leadInfo?.telefono) {
    currentPage.drawText('Telefono:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    currentPage.drawText(leadInfo.telefono, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
    buyerY -= 11;
  }
  if (leadInfo?.rfc) {
    currentPage.drawText('RFC:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    currentPage.drawText(leadInfo.rfc, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
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
async function generateProductOfferPdf(supabase: any, oferta: any, estatus_aprobacion_nombre: string | null = null, hideBanking: boolean = false): Promise<{ pdfBytes: Uint8Array; fileName: string }> {
  console.log('Generating product offer PDF...');

  // Fetch product details
  const { data: producto, error: prodError } = await supabase
    .from('productos_servicios')
    .select(`
      id,
      nombre,
      precio_lista,
      m2,
      id_categoria,
      id_proyecto,
      categorias_producto!fk_prodserv_categoria (
        id,
        nombre
      ),
      proyectos!productos_servicios_id_proyecto_fkey (
        id,
        nombre,
        url_logo,
        mostrar_seccion_efectivo_en_oferta,
        mostrar_precio_m2_en_oferta
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

  // Fetch owner data from project
  let ownerData: any = null;
  let ownerBankAccount: any = null;
  
  if (proyecto?.id) {
    const { data: entidadDueno } = await supabase
      .from('entidades_relacionadas')
      .select(`
        personas!entidades_relacionadas_id_persona_fkey (
          id, nombre_legal, email, telefono
        )
      `)
      .eq('id_proyecto', proyecto.id)
      .eq('tipo_entidad', 'propietario')
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    
    if (entidadDueno?.personas) {
      ownerData = entidadDueno.personas;
      
      // Fetch owner's bank account
      const { data: bankAccount } = await supabase
        .from('cuentas_bancarias')
        .select('numero_cuenta, cuenta_clabe, banco_nombre')
        .eq('id_persona', ownerData.id)
        .eq('es_cuenta_madre_stp', false)
        .eq('activo', true)
        .limit(1)
        .maybeSingle();
      
      ownerBankAccount = bankAccount;
    }
  }

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

  // Fetch payment schemes WITH tramos_mensualidad
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
        es_manual,
        tramos_mensualidad
      )
    `)
    .eq('id_oferta', oferta.id)
    .eq('activo', true);

  const paymentSchemes = ofertaEsquemas?.map((oe: any) => {
    const s = oe.esquemas_pago;
    if (s && s.tramos_mensualidad && typeof s.tramos_mensualidad === 'string') {
      try { s.tramos_mensualidad = JSON.parse(s.tramos_mensualidad); } catch { s.tramos_mensualidad = null; }
    }
    return s;
  }).filter(Boolean) || [];

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
      .maybeSingle();
    
    if (user) {
      creatorInfo = { nombre_legal: user.nombre, email: user.email, telefono: user.telefono };
    }
  }

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  let currentPage = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = currentPage.getSize();

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
  const dividerColor = rgb(0.83, 0.83, 0.83);
  const selectedBg = rgb(0.91, 0.96, 0.91);
  const selectedBorder = rgb(0.13, 0.77, 0.37);

  // Helper function to check and add new page
  function checkNewPage(neededHeight: number): boolean {
    if (y - neededHeight < margin) {
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      y = height - margin;
      return true;
    }
    return false;
  }

  // Helper: Calculate payment amounts
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

  // ========== LOAD LOGO ==========
  let logoImage: any = null;
  if (proyecto?.url_logo) {
    console.log('Loading project logo for product offer...');
    const logoBytes = await fetchImageWithTimeout(proyecto.url_logo, 2500, 100);
    if (logoBytes) {
      const imageType = detectImageType(logoBytes);
      try {
        if (imageType === 'png') {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else if (imageType === 'jpg') {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
        console.log('Project logo embedded successfully for product offer');
      } catch (e) {
        console.warn('Failed to embed logo:', e.message);
      }
    }
  }

  // ========== HEADER ==========
  const headerStartY = y;

  if (logoImage) {
    try {
      const logoMaxHeight = 42;
      const logoMaxWidth = 113;
      const dims = logoImage.scale(1);
      const scale = Math.min(logoMaxWidth / dims.width, logoMaxHeight / dims.height);
      currentPage.drawImage(logoImage, {
        x: margin,
        y: y - logoMaxHeight,
        width: dims.width * scale,
        height: dims.height * scale,
      });
    } catch (e) {
      console.warn('Error drawing logo:', e);
      currentPage.drawText(proyecto?.nombre || 'Proyecto', {
        x: margin,
        y: y - 10,
        size: 16,
        font: helveticaBold,
        color: black,
      });
    }
  } else {
    currentPage.drawText(proyecto?.nombre || 'Proyecto', {
      x: margin,
      y: y - 10,
      size: 16,
      font: helveticaBold,
      color: black,
    });
  }

  // Offer info on right side
  const rightX = width - margin;
  let rightY = headerStartY - 4;

  currentPage.drawText('ID Oferta:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(formatOfferId(oferta.id, 'producto'), {
    x: rightX - helvetica.widthOfTextAtSize(formatOfferId(oferta.id, 'producto'), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  currentPage.drawText('Expedicion:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(formatDate(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(formatDate(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });
  rightY -= 14;

  currentPage.drawText('Vigencia:', {
    x: rightX - 90,
    y: rightY,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  currentPage.drawText(calculateVigencia(oferta.fecha_generacion), {
    x: rightX - helvetica.widthOfTextAtSize(calculateVigencia(oferta.fecha_generacion), 10),
    y: rightY,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 55;

  // Divider
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  // ========== PROPERTY AND PRODUCT DATA (side by side) ==========
  const colWidth = (contentWidth - 20) / 2;
  const cardHeight = 90;

  // Property Data Card Title
  currentPage.drawText('Datos de la Propiedad:', {
    x: margin,
    y,
    size: 11,
    font: helveticaBold,
    color: black,
  });

  // Product Data Card Title
  currentPage.drawText('Datos del Producto:', {
    x: margin + colWidth + 20,
    y,
    size: 11,
    font: helveticaBold,
    color: black,
  });
  y -= 17;

  // Property Card
  currentPage.drawRectangle({
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
  currentPage.drawText('Proyecto:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
  currentPage.drawText(proyecto?.nombre || 'N/A', { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
  propY -= 14;

  if (edificioModelo?.modelos?.nombre) {
    currentPage.drawText('Modelo:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
    currentPage.drawText(edificioModelo.modelos.nombre, { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
    propY -= 14;
  }
  if (edificioModelo?.edificios?.nombre) {
    currentPage.drawText('Edificio:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
    currentPage.drawText(edificioModelo.edificios.nombre, { x: margin + 60, y: propY, size: 9, font: helveticaBold, color: black });
    propY -= 14;
  }
  currentPage.drawText('No. de propiedad:', { x: margin + 10, y: propY, size: 9, font: helvetica, color: gray });
  currentPage.drawText(propiedad?.numero_propiedad || 'N/A', { x: margin + 90, y: propY, size: 9, font: helveticaBold, color: black });

  // Product Card
  const prodCardX = margin + colWidth + 20;
  currentPage.drawRectangle({
    x: prodCardX,
    y: y - cardHeight,
    width: colWidth,
    height: cardHeight,
    color: cardBg,
    borderColor: lightGray,
    borderWidth: 0.5,
  });

  let prodY = y - 15;
  currentPage.drawText('Categoria:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  currentPage.drawText(categoria?.nombre || 'N/A', { x: prodCardX + 60, y: prodY, size: 9, font: helveticaBold, color: black });
  prodY -= 14;

  currentPage.drawText('Producto:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  const prodNameLines = wrapText(producto.nombre, colWidth - 80, helveticaBold, 9);
  currentPage.drawText(prodNameLines[0] || 'N/A', { x: prodCardX + 60, y: prodY, size: 9, font: helveticaBold, color: black });
  prodY -= 14;

  // Show m2 if applicable
  if (producto.m2 && producto.m2 > 0) {
    currentPage.drawText('Metraje:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
    currentPage.drawText(`${producto.m2.toFixed(2)} m2`, { x: prodCardX + 60, y: prodY, size: 9, font: helveticaBold, color: black });
    prodY -= 14;
  }

  currentPage.drawText('Precio de lista:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
  currentPage.drawText(formatCurrency(producto.precio_lista), { x: prodCardX + 80, y: prodY, size: 9, font: helveticaBold, color: black });
  prodY -= 14;

  // Show price per m2 if applicable
  if (proyecto?.mostrar_precio_m2_en_oferta && producto.m2 && producto.m2 > 0) {
    currentPage.drawText('Precio por m2:', { x: prodCardX + 10, y: prodY, size: 9, font: helvetica, color: gray });
    currentPage.drawText(formatCurrency(producto.precio_lista / producto.m2), { x: prodCardX + 80, y: prodY, size: 9, font: helveticaBold, color: black });
  }

  y -= cardHeight + 17;

  // ========== PAYMENT SCHEMES ==========
  if (paymentSchemes.length > 0) {
    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;

    currentPage.drawText('Esquemas de pago:', {
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

    for (let i = 0; i < filteredSchemes.length; i++) {
      const scheme = filteredSchemes[i];
      const isSelected = oferta.id_esquema_pago_seleccionado === scheme.id;
      const amounts = calculatePaymentAmounts(scheme, producto.precio_lista);
      const hasSavings = amounts.adjustment < 0;

      const escalonadoDisplay = getEscalonadoDisplayData(scheme, amounts, oferta.fecha_generacion);

      // Calculate dynamic height
      const tramosCount = scheme.tramos_mensualidad?.length || 0;
      let schemeHeight = 45;
      if (!escalonadoDisplay.isEscalonado && tramosCount > 1) schemeHeight += (tramosCount - 1) * 12;
      if (hasSavings) schemeHeight += 12;
      if (scheme.porcentaje_enganche > 0) schemeHeight += 12;
      if (escalonadoDisplay.isEscalonado) {
        schemeHeight += 24;
      } else {
        if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
          schemeHeight += 24;
          if (tramosCount > 0) schemeHeight += tramosCount * 12;
        }
        if (scheme.porcentaje_entrega > 0) schemeHeight += 12;
      }

      const col = i % 2;
      const xOffset = col * (schemeWidth + 10);
      const schemeX = margin + xOffset;

      checkNewPage(schemeHeight + 10);

      // Background
      if (isSelected) {
        currentPage.drawRectangle({
          x: schemeX,
          y: y - schemeHeight,
          width: schemeWidth,
          height: schemeHeight,
          color: selectedBg,
          borderColor: selectedBorder,
          borderWidth: 1,
        });
      } else {
        currentPage.drawRectangle({
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
      const padding = 8;

      // Scheme name
      if (!scheme.es_manual) {
        currentPage.drawText(scheme.nombre, {
          x: schemeX + padding,
          y: lineY,
          size: 10,
          font: helveticaBold,
          color: black,
        });
        
        // Draw approval status badge
        if (oferta.id_esquema_pago_seleccionado && oferta.id_estatus_aprobacion && estatus_aprobacion_nombre) {
          const statusColorsMap: Record<number, { bg: { r: number; g: number; b: number }; text: { r: number; g: number; b: number } }> = {
            1: { bg: { r: 1, g: 0.953, b: 0.804 }, text: { r: 0.522, g: 0.392, b: 0.016 } },
            2: { bg: { r: 0.831, g: 0.929, b: 0.855 }, text: { r: 0.082, g: 0.341, b: 0.141 } },
            3: { bg: { r: 0.973, g: 0.843, b: 0.855 }, text: { r: 0.447, g: 0.110, b: 0.141 } },
            4: { bg: { r: 0.800, g: 0.898, b: 1 }, text: { r: 0, g: 0.251, b: 0.522 } },
          };
          const sColors = statusColorsMap[oferta.id_estatus_aprobacion] || statusColorsMap[1];
          const nameW = helveticaBold.widthOfTextAtSize(scheme.nombre, 10);
          const badgeText = estatus_aprobacion_nombre;
          const badgeFontSize = 6;
          const badgeTextW = helvetica.widthOfTextAtSize(badgeText, badgeFontSize);
          const badgePad = 4;
          const badgeW = badgeTextW + badgePad * 2;
          const badgeH = 10;
          const badgeX = schemeX + padding + nameW + 4;
          const badgeY = lineY - 2;
          
          currentPage.drawRectangle({
            x: badgeX, y: badgeY, width: badgeW, height: badgeH,
            color: rgb(sColors.bg.r, sColors.bg.g, sColors.bg.b),
            borderColor: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
            borderWidth: 0.3,
          });
          currentPage.drawText(badgeText, {
            x: badgeX + badgePad, y: badgeY + 3, size: badgeFontSize,
            font: helvetica, color: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
          });
        }
        
        lineY -= 14;
      } else if (oferta.id_esquema_pago_seleccionado && oferta.id_estatus_aprobacion && estatus_aprobacion_nombre) {
        // Draw approval status badge for manual schemes
        const statusColorsMap: Record<number, { bg: { r: number; g: number; b: number }; text: { r: number; g: number; b: number } }> = {
          1: { bg: { r: 1, g: 0.953, b: 0.804 }, text: { r: 0.522, g: 0.392, b: 0.016 } },
          2: { bg: { r: 0.831, g: 0.929, b: 0.855 }, text: { r: 0.082, g: 0.341, b: 0.141 } },
          3: { bg: { r: 0.973, g: 0.843, b: 0.855 }, text: { r: 0.447, g: 0.110, b: 0.141 } },
          4: { bg: { r: 0.800, g: 0.898, b: 1 }, text: { r: 0, g: 0.251, b: 0.522 } },
        };
        const sColors = statusColorsMap[oferta.id_estatus_aprobacion] || statusColorsMap[1];
        const badgeText = estatus_aprobacion_nombre;
        const badgeFontSize = 7;
        const badgeTextW = helveticaBold.widthOfTextAtSize(badgeText, badgeFontSize);
        const badgePad = 4;
        const badgeW = badgeTextW + badgePad * 2;
        const badgeH = 12;
        const badgeX = schemeX + padding;
        const badgeY = lineY - 2;
        
        currentPage.drawRectangle({
          x: badgeX, y: badgeY, width: badgeW, height: badgeH,
          color: rgb(sColors.bg.r, sColors.bg.g, sColors.bg.b),
          borderColor: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
          borderWidth: 0.3,
        });
        currentPage.drawText(badgeText, {
          x: badgeX + badgePad, y: badgeY + 3, size: badgeFontSize,
          font: helveticaBold, color: rgb(sColors.text.r, sColors.text.g, sColors.text.b),
        });
        lineY -= 16;
      }

      // Final price
      currentPage.drawText('Precio final:', { x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray });
      currentPage.drawText(formatCurrency(amounts.finalPrice), {
        x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.finalPrice), 8),
        y: lineY,
        size: 8,
        font: helveticaBold,
        color: black,
      });
      lineY -= 12;

      // Savings
      if (hasSavings) {
        currentPage.drawText(`Ahorro (${Math.abs(scheme.porcentaje_descuento_aumento)}%):`, {
          x: schemeX + padding,
          y: lineY,
          size: 8,
          font: helvetica,
          color: gray,
        });
        currentPage.drawText(formatCurrency(Math.abs(amounts.adjustment)), {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(formatCurrency(Math.abs(amounts.adjustment)), 8),
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
        currentPage.drawText(engancheLabel, { x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray });
        const engancheText = `${scheme.porcentaje_enganche}% ${formatCurrency(amounts.enganche)}`;
        currentPage.drawText(engancheText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(engancheText, 8),
          y: lineY,
          size: 8,
          font: helveticaBold,
          color: black,
        });
        lineY -= 12;
      }

      if (escalonadoDisplay.isEscalonado) {
        currentPage.drawText('Monto mensual:', {
          x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
        });
        currentPage.drawText(escalonadoDisplay.montoMensualText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(escalonadoDisplay.montoMensualText, 8),
          y: lineY, size: 8, font: helveticaBold, color: black,
        });
        lineY -= 8;
        if (escalonadoDisplay.fechaFinalText) {
          currentPage.drawText(escalonadoDisplay.fechaFinalText, {
            x: schemeX + schemeWidth - padding - helvetica.widthOfTextAtSize(escalonadoDisplay.fechaFinalText, 6),
            y: lineY, size: 6, font: helvetica, color: gray,
          });
          lineY -= 10;
        } else {
          lineY -= 4;
        }

        currentPage.drawText('Monto a la entrega:', {
          x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
        });
        currentPage.drawText(escalonadoDisplay.montoEntregaText, {
          x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(escalonadoDisplay.montoEntregaText, 8),
          y: lineY, size: 8, font: helveticaBold, color: black,
        });
      } else {
        // Monthly payments (percentage mode)
        if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
          currentPage.drawText('Durante la obra:', { x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray });
          const totalMensText = `${scheme.porcentaje_mensualidades}% ${formatCurrency(amounts.finalPrice * (scheme.porcentaje_mensualidades / 100))}`;
          currentPage.drawText(totalMensText, {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(totalMensText, 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
          lineY -= 12;

          currentPage.drawText(`${scheme.numero_mensualidades} mensualidades:`, {
            x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray,
          });
          currentPage.drawText(formatCurrency(amounts.mensualidad), {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(formatCurrency(amounts.mensualidad), 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
          lineY -= 12;
        }

        if (scheme.porcentaje_entrega > 0) {
          currentPage.drawText('A la entrega:', { x: schemeX + padding, y: lineY, size: 8, font: helvetica, color: gray });
          const entregaText = `${scheme.porcentaje_entrega}% ${formatCurrency(amounts.entrega)}`;
          currentPage.drawText(entregaText, {
            x: schemeX + schemeWidth - padding - helveticaBold.widthOfTextAtSize(entregaText, 8),
            y: lineY, size: 8, font: helveticaBold, color: black,
          });
        }
      }

      if (col === 1 || i === filteredSchemes.length - 1) {
        y -= schemeHeight + 10;
      }
    }
  }

  // ========== BANKING DATA ==========
  const hasValidRFC = isValidRFC(leadInfo?.rfc);
  const showCashPayment = proyecto?.mostrar_seccion_efectivo_en_oferta && ownerBankAccount;
  const showBanking = !hideBanking && hasValidRFC && showCashPayment;

  if (showBanking) {
    checkNewPage(80);

    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 17;

    currentPage.drawText('Datos Bancarios', {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 20;

    const bankCardHeight = 70;

    currentPage.drawRectangle({
      x: margin,
      y: y - bankCardHeight,
      width: contentWidth,
      height: bankCardHeight,
      color: dividerColor,
    });

    let bankY = y - 12;
    currentPage.drawText('Pago en efectivo', {
      x: margin + 8,
      y: bankY,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    bankY -= 14;
    currentPage.drawText(`Banco: ${ownerBankAccount.banco_nombre || 'N/A'}`, {
      x: margin + 8,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });
    bankY -= 12;
    currentPage.drawText(`Titular: ${ownerData?.nombre_legal || 'N/A'}`, {
      x: margin + 8,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });
    bankY -= 12;
    currentPage.drawText(`Cuenta CLABE: ${ownerBankAccount.cuenta_clabe || 'N/A'}`, {
      x: margin + 8,
      y: bankY,
      size: 8,
      font: helvetica,
      color: black,
    });

    y -= bankCardHeight + 10;
  }

  // ========== CONTACT INFO ==========
  checkNewPage(60);

  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 17;

  currentPage.drawText('Datos de Contacto', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: black,
  });
  y -= 20;

  const contactColWidth = (contentWidth - 10) / 2;

  // Agent column
  currentPage.drawText('Agente', { x: margin, y, size: 9, font: helveticaBold, color: black });
  y -= 14;

  const agentName = creatorInfo?.nombre_legal || creatorInfo?.nombre || oferta.email_creador;
  currentPage.drawText('Nombre:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(agentName || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  currentPage.drawText('Email:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(creatorInfo?.email || oferta.email_creador || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });
  y -= 11;
  currentPage.drawText('Telefono:', { x: margin, y, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(creatorInfo?.telefono || 'N/A', { x: margin + 50, y, size: 8, font: helvetica, color: black });

  // Buyer column
  const buyerX = margin + contactColWidth + 10;
  let buyerY = y + 36;

  currentPage.drawText('Comprador', { x: buyerX, y: buyerY, size: 9, font: helveticaBold, color: black });
  buyerY -= 14;

  currentPage.drawText('Nombre:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(leadInfo?.nombre_legal || 'N/A', { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  currentPage.drawText('Email:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
  currentPage.drawText(leadInfo?.email || 'N/A', { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  buyerY -= 11;
  if (leadInfo?.telefono) {
    currentPage.drawText('Telefono:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    currentPage.drawText(leadInfo.telefono, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
    buyerY -= 11;
  }
  if (leadInfo?.rfc) {
    currentPage.drawText('RFC:', { x: buyerX, y: buyerY, size: 8, font: helveticaBold, color: black });
    currentPage.drawText(leadInfo.rfc, { x: buyerX + 50, y: buyerY, size: 8, font: helvetica, color: black });
  }

  // Generate filename
  const cleanProjectName = (proyecto?.nombre || 'Proyecto').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanProductName = (producto.nombre || 'Producto').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  const offerNumber = oferta.id.toString().padStart(6, '0');

  const fileName = `OP_${offerNumber}_${cleanProductName}_${cleanProjectName}_${Date.now()}.pdf`;

  const pdfBytes = await pdfDoc.save();
  console.log('Product offer PDF generated, size:', pdfBytes.length, 'bytes');

  return { pdfBytes, fileName };
}
