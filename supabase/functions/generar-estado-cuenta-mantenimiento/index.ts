import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function formatMoney(amount: number): string {
  const normalized = Math.abs(amount) < 0.01 ? 0 : amount;
  const safe = normalized < 0 ? 0 : normalized;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(safe);
}

function formatMoneyAllowNegative(amount: number): string {
  const normalized = Math.abs(amount) < 0.01 ? 0 : amount;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(normalized);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX');
}

function formatCuentaMantenimientoId(id: number): string {
  return `CM-${String(id).padStart(6, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { id_cuenta } = await req.json();
    console.log('generar-estado-cuenta-mantenimiento called with id_cuenta:', id_cuenta);

    if (!id_cuenta) {
      return new Response(
        JSON.stringify({ error: 'id_cuenta is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch cuenta de mantenimiento (must have id_cuenta_cobranza_padre)
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select('*')
      .eq('id', id_cuenta)
      .not('id_cuenta_cobranza_padre', 'is', null)
      .single();

    if (cuentaError || !cuenta) {
      return new Response(
        JSON.stringify({ error: 'Cuenta de mantenimiento no encontrada', details: cuentaError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch parent cuenta
    const { data: parentCuenta } = await supabase
      .from('cuentas_cobranza')
      .select('id, id_oferta')
      .eq('id', cuenta.id_cuenta_cobranza_padre)
      .single();

    // 3. Fetch compradores from parent cuenta
    const { data: compradores } = await supabase
      .from('compradores')
      .select('*, personas!compradores_id_persona_fkey(*)')
      .eq('id_cuenta_cobranza', cuenta.id_cuenta_cobranza_padre)
      .eq('activo', true);

    // 4. Fetch project & property info
    let proyectoData: any = null;
    let propiedadData: any = null;

    if (parentCuenta?.id_oferta) {
      const { data: oferta } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .eq('id', parentCuenta.id_oferta)
        .single();

      if (oferta?.id_propiedad) {
        const { data: propiedad } = await supabase
          .from('propiedades')
          .select('numero_propiedad, id_entidad_relacionada_dueno')
          .eq('id', oferta.id_propiedad)
          .single();

        propiedadData = propiedad;

        if (propiedad?.id_entidad_relacionada_dueno) {
          const { data: entidad } = await supabase
            .from('entidades_relacionadas')
            .select('id_proyecto')
            .eq('id', propiedad.id_entidad_relacionada_dueno)
            .single();

          if (entidad?.id_proyecto) {
            const { data: proyecto } = await supabase
              .from('proyectos')
              .select('*')
              .eq('id', entidad.id_proyecto)
              .single();

            proyectoData = proyecto;
          }
        }
      }
    }

    // 5. Calculate date 12 months ago
    const fechaHace12Meses = new Date();
    fechaHace12Meses.setMonth(fechaHace12Meses.getMonth() - 12);
    const fechaLimite = fechaHace12Meses.toISOString().split('T')[0];

    // 6. Fetch acuerdos de pago (últimos 12 meses)
    const { data: acuerdos } = await supabase
      .from('acuerdos_pago')
      .select('*, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)')
      .eq('id_cuenta_cobranza', id_cuenta)
      .eq('activo', true)
      .gte('fecha_pago', fechaLimite)
      .order('orden', { ascending: true });

    // 7. Fetch aplicaciones for these acuerdos
    const acuerdoIds = (acuerdos || []).map((a: any) => a.id);
    let aplicaciones: any[] = [];

    if (acuerdoIds.length > 0) {
      const { data: apps } = await supabase
        .from('aplicaciones_pago')
        .select('monto, id_acuerdo_pago, es_multa')
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      aplicaciones = apps || [];
    }

    // 8. Fetch pagos reales
    const { data: pagosReales } = await supabase
      .from('pagos')
      .select('monto')
      .eq('id_cuenta_cobranza', id_cuenta)
      .eq('activo', true);

    // 9. Calculate totals (same logic as client-side service)
    const precioMensualAcumulado = (acuerdos || []).reduce((sum: number, a: any) => sum + (a.monto || 0), 0);
    const totalAplicado = aplicaciones
      .filter((ap: any) => !ap.es_multa)
      .reduce((sum: number, ap: any) => sum + (ap.monto || 0), 0);
    const totalPagadoReal = (pagosReales || []).reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
    const excedente = totalPagadoReal - totalAplicado;
    const saldoPendienteBruto = precioMensualAcumulado - totalAplicado;
    const saldoPendienteReal = saldoPendienteBruto - excedente;

    // ============ GENERATE PDF ============
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 595; // A4
    const pageH = 842;
    const margin = 40;
    const contentWidth = pageW - margin * 2;
    let page = pdfDoc.addPage([pageW, pageH]);
    let y = pageH - margin;

    // Colors
    const primaryColor = rgb(0.102, 0.102, 0.180);
    const grayColor = rgb(0.4, 0.4, 0.4);
    const lightGrayColor = rgb(0.533, 0.533, 0.533);
    const lineColor = rgb(0.898, 0.906, 0.922);
    const bgLight = rgb(0.973, 0.976, 0.980);
    const white = rgb(1, 1, 1);
    const greenColor = rgb(0.086, 0.396, 0.204);

    const checkNewPage = (needed: number) => {
      if (y - needed < margin) {
        page = pdfDoc.addPage([pageW, pageH]);
        y = pageH - margin;
        return true;
      }
      return false;
    };

    const drawLine = (yPos: number, color = lineColor) => {
      page.drawLine({ start: { x: margin, y: yPos }, end: { x: pageW - margin, y: yPos }, thickness: 0.5, color });
    };

    const drawRightText = (text: string, yPos: number, font: any, size: number, color: any) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: pageW - margin - w, y: yPos, size, font, color });
    };

    const cuentaId = formatCuentaMantenimientoId(cuenta.id);

    // === HEADER ===
    page.drawText(proyectoData?.nombre || 'Estado de Cuenta - Mantenimiento', {
      x: margin, y, size: 18, font: helveticaBold, color: primaryColor,
    });
    y -= 14;
    if (proyectoData?.direccion) {
      page.drawText(proyectoData.direccion, { x: margin, y, size: 9, font: helvetica, color: grayColor });
    }

    // Account number (right)
    const labelY = y + 14;
    drawRightText('CUENTA MANTENIMIENTO', labelY + 8, helvetica, 8, lightGrayColor);
    drawRightText(cuentaId, labelY - 6, helveticaBold, 14, primaryColor);

    // Property number
    if (propiedadData?.numero_propiedad) {
      drawRightText(`Propiedad: ${propiedadData.numero_propiedad}`, labelY - 20, helvetica, 9, grayColor);
    }

    // Client name
    let rhY = labelY - 34;
    if (compradores && compradores.length > 0) {
      const clientName = compradores.map((c: any) => c.personas?.nombre_legal).filter(Boolean).join(', ');
      drawRightText(clientName.substring(0, 50), rhY, helvetica, 10, primaryColor);
      rhY -= 12;
      const clientId = compradores[0]?.personas?.rfc || compradores[0]?.personas?.curp || '';
      if (clientId) drawRightText(clientId, rhY, helvetica, 8, lightGrayColor);
    }

    y -= 40;
    drawLine(y, primaryColor);
    y -= 24;

    // === META INFO ===
    const metaBoxWidth = contentWidth / 3 - 6;
    const metaBoxHeight = 42;
    const fechaInicio = (acuerdos || []).length > 0 ? formatDate(acuerdos![0].fecha_pago) : 'N/A';
    const fechaFin = (acuerdos || []).length > 0 ? formatDate(acuerdos![acuerdos!.length - 1].fecha_pago) : 'N/A';

    const metaItems = [
      { label: 'TIPO', value: 'Mantenimiento' },
      { label: 'PERIODO (12 MESES)', value: (acuerdos || []).length > 0 ? `${fechaInicio} — ${fechaFin}` : 'Sin acuerdos' },
      { label: 'FECHA DE EMISIÓN', value: formatDate(new Date().toISOString()) },
    ];

    for (let i = 0; i < metaItems.length; i++) {
      const item = metaItems[i];
      const x = margin + i * (metaBoxWidth + 9);

      // Box background
      page.drawRectangle({ x, y: y - metaBoxHeight + 14, width: metaBoxWidth, height: metaBoxHeight, color: bgLight });
      // Left border accent
      page.drawRectangle({ x, y: y - metaBoxHeight + 14, width: 2.5, height: metaBoxHeight, color: primaryColor });

      page.drawText(item.label, { x: x + 8, y: y + 6, size: 7, font: helvetica, color: lightGrayColor });
      page.drawText(item.value.substring(0, 35), { x: x + 8, y: y - 10, size: 9, font: helveticaBold, color: primaryColor });
    }

    y -= metaBoxHeight + 16;

    // === SUMMARY CARDS ===
    const cardW = contentWidth / 3 - 5;
    const cardH = 52;
    const saldoEsNegativo = saldoPendienteReal < -0.01;

    const summaryItems = [
      { label: 'PAGO MENSUAL ACUMULADO', value: formatMoneyAllowNegative(precioMensualAcumulado), highlight: false, isNegative: false },
      { label: 'TOTAL PAGADO', value: formatMoneyAllowNegative(totalPagadoReal), highlight: false, isNegative: false },
      {
        label: saldoEsNegativo ? 'SALDO A FAVOR' : 'SALDO PENDIENTE',
        value: formatMoneyAllowNegative(Math.abs(saldoPendienteReal)),
        highlight: true,
        isNegative: saldoEsNegativo,
      },
    ];

    for (let i = 0; i < summaryItems.length; i++) {
      const item = summaryItems[i];
      const cx = margin + i * (cardW + 7.5);
      const cardY = y - cardH;

      if (item.highlight) {
        const fillColor = item.isNegative ? greenColor : primaryColor;
        page.drawRectangle({ x: cx, y: cardY, width: cardW, height: cardH, color: fillColor });
      } else {
        page.drawRectangle({ x: cx, y: cardY, width: cardW, height: cardH, color: white, borderColor: lineColor, borderWidth: 1 });
      }

      const labelColor = item.highlight ? white : grayColor;
      const valueColor = item.highlight ? white : primaryColor;

      const lw = helvetica.widthOfTextAtSize(item.label, 7);
      page.drawText(item.label, { x: cx + (cardW - lw) / 2, y: cardY + cardH - 16, size: 7, font: helvetica, color: labelColor });

      const vw = helveticaBold.widthOfTextAtSize(item.value, 13);
      page.drawText(item.value, { x: cx + (cardW - vw) / 2, y: cardY + 14, size: 13, font: helveticaBold, color: valueColor });
    }

    y -= cardH + 24;

    // === ACUERDOS DE PAGO TABLE ===
    checkNewPage(60);
    page.drawText('Acuerdos de Pago - Últimos 12 Meses', { x: margin, y, size: 12, font: helveticaBold, color: primaryColor });
    y -= 12;
    drawLine(y);
    y -= 24;

    // Column widths - proportional to original jsPDF layout (total = contentWidth = 515)
    // Original ratios: Concepto=60, Fecha=28, Monto=28, Pagado=28, Pendiente=28, Estado=18 (total=190)
    const aCols = [130, 70, 80, 75, 85, 75]; // = 515
    const aHeaders = ['CONCEPTO', 'FECHA', 'MONTO', 'PAGADO', 'PENDIENTE', 'ESTADO'];

    // Header bg
    page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 16, color: bgLight });

    let colX = margin;
    for (let i = 0; i < aHeaders.length; i++) {
      // All headers left-aligned with padding to avoid any overlap
      const tx = colX + 4;
      page.drawText(aHeaders[i], { x: tx, y, size: 7, font: helveticaBold, color: grayColor });
      colX += aCols[i];
    }

    y -= 22;
    drawLine(y + 4);

    // Rows
    for (let idx = 0; idx < (acuerdos || []).length; idx++) {
      const acuerdo = acuerdos![idx];
      checkNewPage(18);

      const pagadoAcuerdo = aplicaciones
        .filter((ap: any) => ap.id_acuerdo_pago === acuerdo.id && !ap.es_multa)
        .reduce((sum: number, ap: any) => sum + (ap.monto || 0), 0);

      let pendiente = acuerdo.monto - pagadoAcuerdo;
      if (Math.abs(pendiente) < 0.01 || pendiente < 0) pendiente = 0;
      const isPaid = acuerdo.pago_completado;

      if (idx % 2 === 0) {
        page.drawRectangle({ x: margin, y: y - 5, width: contentWidth, height: 16, color: rgb(0.98, 0.98, 0.98) });
      }

      colX = margin;

      // Concepto - format with month if maintenance
      let conceptoText = acuerdo.conceptos_pago?.nombre || 'N/A';
      if (acuerdo.fecha_pago && conceptoText.toLowerCase().includes('mantenimiento')) {
        const [, monthNum] = acuerdo.fecha_pago.split('-').map(Number);
        const fecha = new Date(2000, monthNum - 1, 1);
        const mes = fecha.toLocaleDateString('es-MX', { month: 'long' });
        conceptoText = `${conceptoText} - ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
      }

      const rowData = [
        conceptoText.substring(0, 40),
        acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : 'N/A',
        formatMoneyAllowNegative(acuerdo.monto),
        formatMoneyAllowNegative(pagadoAcuerdo),
        formatMoney(pendiente),
        '',
      ];

      for (let i = 0; i < rowData.length - 1; i++) {
        const align = i >= 2 && i <= 4 ? 'right' : 'left';
        let tx = colX + 4;
        if (align === 'right') {
          const tw = helvetica.widthOfTextAtSize(rowData[i], 8);
          tx = colX + aCols[i] - 4 - tw;
        }
        page.drawText(rowData[i], { x: tx, y, size: 8, font: helvetica, color: primaryColor });
        colX += aCols[i];
      }

      // Status badge
      const statusText = isPaid ? 'Pagado' : 'Pendiente';
      const badgeColor = isPaid ? rgb(0.863, 0.988, 0.906) : rgb(0.996, 0.953, 0.780);
      const txtColor = isPaid ? rgb(0.086, 0.396, 0.204) : rgb(0.573, 0.251, 0.055);
      const badgeW = 42;
      const badgeX = colX + (aCols[5] - badgeW) / 2;
      page.drawRectangle({ x: badgeX, y: y - 4, width: badgeW, height: 13, color: badgeColor });
      const stw = helvetica.widthOfTextAtSize(statusText, 7);
      page.drawText(statusText, { x: badgeX + (badgeW - stw) / 2, y: y - 1, size: 7, font: helvetica, color: txtColor });

      y -= 18;
    }

    if ((acuerdos || []).length === 0) {
      const noDataText = 'No hay acuerdos de pago en los últimos 12 meses';
      const ntw = helvetica.widthOfTextAtSize(noDataText, 9);
      page.drawText(noDataText, { x: margin + (contentWidth - ntw) / 2, y, size: 9, font: helvetica, color: grayColor });
      y -= 18;
    }

    y -= 16;

    // === FOOTER ===
    checkNewPage(20);
    drawLine(y);
    y -= 10;
    page.drawText(
      'Notas: Este estado de cuenta muestra el detalle de acuerdos de pago de mantenimiento de los últimos 12 meses. Generado automáticamente.',
      { x: margin, y, size: 7, font: helvetica, color: lightGrayColor }
    );

    if (cuenta.clabe_stp) {
      y -= 10;
      page.drawText(`CLABE STP para pagos: ${cuenta.clabe_stp}`, {
        x: margin, y, size: 7, font: helvetica, color: lightGrayColor,
      });
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    console.log('PDF mantenimiento generated, size:', pdfBytes.length);

    // Upload to storage
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
    const cuentaFormatted = formatCuentaMantenimientoId(id_cuenta);
    const fileName = `estado_cuenta_mantenimiento_${cuentaFormatted}_${dateStr}.pdf`;
    const filePath = `estados_cuenta_temp/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('documentos').upload(filePath, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload PDF', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
    console.log('PDF mantenimiento uploaded:', urlData.publicUrl);

    // Auto-delete after 1 minute
    setTimeout(async () => {
      try { await supabase.storage.from('documentos').remove([filePath]); } catch (_e) { /* ignore */ }
    }, 60000);

    return new Response(JSON.stringify({
      success: true,
      url_estado_cuenta: urlData.publicUrl,
      fileName,
      expiresIn: '1 minute',
      id_cuenta: cuenta.id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in generar-estado-cuenta-mantenimiento:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
