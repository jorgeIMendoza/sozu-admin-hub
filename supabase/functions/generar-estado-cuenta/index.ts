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
  const d = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  return new Date(d).toLocaleDateString('es-MX');
}

function formatCuentaCobranzaId(id: number, tipo?: string): string {
  const padded = String(id).padStart(6, '0');
  if (tipo === 'Producto' || tipo === 'Servicio') return `CCP-${padded}`;
  return `CC-${padded}`;
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { id_cuenta } = await req.json();
    console.log('generar-estado-cuenta called with id_cuenta:', id_cuenta);

    if (!id_cuenta) {
      return new Response(
        JSON.stringify({ error: 'id_cuenta is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch cuenta_cobranza
    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas_cobranza').select('*').eq('id', id_cuenta).single();
    if (cuentaError || !cuenta) {
      return new Response(JSON.stringify({ error: 'Cuenta not found', details: cuentaError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Fetch oferta
    const { data: oferta, error: ofertaError } = await supabase
      .from('ofertas').select('id_propiedad, id_producto, fecha_generacion, id_esquema_pago_seleccionado')
      .eq('id', cuenta.id_oferta).single();
    if (ofertaError || !oferta) {
      return new Response(JSON.stringify({ error: 'Oferta not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Esquema de pago
    let esquemaPago: any = null;
    if (oferta.id_esquema_pago_seleccionado) {
      const { data } = await supabase.from('esquemas_pago')
        .select('nombre, numero_mensualidades, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, porcentaje_descuento_aumento')
        .eq('id', oferta.id_esquema_pago_seleccionado).maybeSingle();
      esquemaPago = data;
    }

    // 4. Compradores
    const { data: compradores } = await supabase.from('compradores')
      .select('*, personas!compradores_id_persona_fkey(*)')
      .eq('id_cuenta_cobranza', id_cuenta).eq('activo', true);

    // 5. Acuerdos de pago
    const { data: acuerdos } = await supabase.from('acuerdos_pago')
      .select('*, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)')
      .eq('id_cuenta_cobranza', id_cuenta).eq('activo', true)
      .order('orden', { ascending: true });

    // 6. Multas
    const acuerdoIds = (acuerdos || []).map((a: any) => a.id);
    let multas: any[] = [];
    if (acuerdoIds.length > 0) {
      const { data: multasData } = await supabase.from('multas')
        .select('id, monto, descripcion, es_pagada, fecha_creacion, id_acuerdo_pago')
        .in('id_acuerdo_pago', acuerdoIds).eq('activo', true)
        .order('fecha_creacion', { ascending: true });
      multas = multasData || [];
    }

    // 7. Pagos
    const { data: pagos } = await supabase.from('pagos')
      .select('*, metodos_pago!pagos_id_metodos_pago_fkey(nombre), aplicaciones_pago!fk_aplicaciones_pago_pago(monto, id_acuerdo_pago, es_multa)')
      .eq('id_cuenta_cobranza', id_cuenta).eq('activo', true)
      .order('fecha_pago', { ascending: true });

    // 8. Property/Product details
    let proyectoData: any = null;
    let propiedadData: any = null;
    let edificioData: any = null;
    let modeloData: any = null;
    let estacionamientos: any[] = [];
    let bodegas: any[] = [];
    let productoData: any = null;

    if (oferta.id_propiedad) {
      const { data: prop } = await supabase.from('propiedades')
        .select('id, numero_propiedad, numero_piso, id_edificio_modelo, id_entidad_relacionada_dueno')
        .eq('id', oferta.id_propiedad).maybeSingle();
      propiedadData = prop;

      if (prop?.id_edificio_modelo) {
        const { data: em } = await supabase.from('edificios_modelos')
          .select('id, modelos!edificios_modelos_id_modelo_fkey(id, nombre), edificios!edificios_modelos_id_edificio_fkey(id, nombre, id_proyecto)')
          .eq('id', prop.id_edificio_modelo).maybeSingle();
        if (em) {
          edificioData = em.edificios;
          modeloData = em.modelos;
          if (em.edificios?.id_proyecto) {
            const { data: proy } = await supabase.from('proyectos').select('*')
              .eq('id', em.edificios.id_proyecto).maybeSingle();
            proyectoData = proy;
          }
        }
      }

      if (!proyectoData && prop?.id_entidad_relacionada_dueno) {
        const { data: ent } = await supabase.from('entidades_relacionadas')
          .select('id_proyecto').eq('id', prop.id_entidad_relacionada_dueno).maybeSingle();
        if (ent) {
          const { data: proy } = await supabase.from('proyectos').select('*')
            .eq('id', ent.id_proyecto).maybeSingle();
          proyectoData = proy;
        }
      }

      const [estRes, bodRes] = await Promise.all([
        supabase.from('estacionamientos').select('id, nombre, ubicacion').eq('id_propiedad', oferta.id_propiedad).eq('activo', true),
        supabase.from('bodegas').select('id, nombre, ubicacion').eq('id_propiedad', oferta.id_propiedad).eq('activo', true),
      ]);
      estacionamientos = estRes.data || [];
      bodegas = bodRes.data || [];
    }

    if (oferta.id_producto) {
      const { data: prod } = await supabase.from('productos_servicios')
        .select('id, nombre, id_categoria').eq('id', oferta.id_producto).maybeSingle();
      let categoriaData: any = null;
      if (prod?.id_categoria) {
        const { data: cat } = await supabase.from('categorias_producto')
          .select('id, nombre').eq('id', prod.id_categoria).maybeSingle();
        categoriaData = cat;
      }
      if (prod) productoData = { ...prod, categoria: categoriaData };
    }

    // Calculate totals
    const precioFinal = cuenta.precio_final || 0;
    const totalPagado = (pagos || []).reduce((sum: number, p: any) => {
      const apps = (p.aplicaciones_pago || []).filter((ap: any) => !ap.es_multa);
      return sum + apps.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
    }, 0);
    const totalMultas = (pagos || []).reduce((sum: number, p: any) => {
      const apps = (p.aplicaciones_pago || []).filter((ap: any) => ap.es_multa);
      return sum + apps.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
    }, 0);
    const saldoPendiente = precioFinal - totalPagado;

    // ============ GENERATE PDF ============
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 612; // Letter
    const pageH = 792;
    const margin = 40;
    const contentWidth = pageW - margin * 2;
    let page = pdfDoc.addPage([pageW, pageH]);
    let y = pageH - margin;

    // Colors
    const primaryColor = rgb(0.102, 0.102, 0.180); // #1a1a2e
    const grayColor = rgb(0.4, 0.4, 0.4);
    const lightGrayColor = rgb(0.533, 0.533, 0.533);
    const lineColor = rgb(0.898, 0.906, 0.922); // #e5e7eb
    const bgLight = rgb(0.973, 0.976, 0.980); // #f8f9fa
    const white = rgb(1, 1, 1);

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

    const drawCenteredText = (text: string, yPos: number, font: any, size: number, color: any) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (pageW - w) / 2, y: yPos, size, font, color });
    };

    const isProduct = !!oferta.id_producto;
    const tipoCuenta = isProduct ? 'Producto' : 'Propiedad';
    const cuentaId = formatCuentaCobranzaId(cuenta.id, tipoCuenta);

    // === HEADER ===
    page.drawText(proyectoData?.nombre || 'Estado de Cuenta', { x: margin, y, size: 16, font: helveticaBold, color: primaryColor });
    y -= 12;
    if (proyectoData?.direccion) {
      page.drawText(proyectoData.direccion, { x: margin, y, size: 8, font: helvetica, color: grayColor });
    }

    // Account number (right)
    const labelY = y + 12;
    drawRightText('CUENTA', labelY + 6, helvetica, 8, lightGrayColor);
    drawRightText(cuentaId, labelY - 4, helveticaBold, 13, primaryColor);

    // Client name
    let rhY = labelY - 16;
    if (compradores && compradores.length > 0) {
      const clientName = compradores.map((c: any) => c.personas?.nombre_legal).filter(Boolean).join(', ');
      drawRightText(clientName, rhY, helvetica, 9, primaryColor);
      rhY -= 10;
      const clientId = compradores[0]?.personas?.rfc || compradores[0]?.personas?.curp || '';
      if (clientId) drawRightText(clientId, rhY, helvetica, 7, lightGrayColor);
      rhY -= 10;
    }

    if (cuenta.clabe_stp) {
      const clabeLabel = 'CLABE STP: ';
      const clabeText = cuenta.clabe_stp;
      const fullClabe = clabeLabel + clabeText;
      drawRightText(fullClabe, rhY, helveticaBold, 7, primaryColor);
    }

    y -= 30;
    drawLine(y, primaryColor);
    y -= 14;

    // === PROPERTY/PRODUCT DETAILS (left) + CONTRACT INFO (right) ===
    const leftColX = margin;
    const rightColX = margin + contentWidth / 2 + 5;
    const startY = y;

    // Left column
    page.drawText('Detalles del ' + (isProduct ? 'Producto' : 'Inmueble'), { x: leftColX, y, size: 9, font: helveticaBold, color: primaryColor });
    y -= 12;

    const detailsLeft: { label: string; value: string }[] = [];
    if (proyectoData?.nombre) detailsLeft.push({ label: 'Proyecto:', value: proyectoData.nombre });
    if (edificioData?.nombre) detailsLeft.push({ label: 'Torre:', value: edificioData.nombre });
    if (propiedadData?.numero_piso) detailsLeft.push({ label: 'Nivel:', value: String(propiedadData.numero_piso) });
    if (modeloData?.nombre) detailsLeft.push({ label: 'Modelo:', value: modeloData.nombre });
    if (propiedadData?.numero_propiedad) detailsLeft.push({ label: 'N° de propiedad:', value: String(propiedadData.numero_propiedad) });
    if (isProduct) {
      if (productoData?.categoria?.nombre) detailsLeft.push({ label: 'Categoría:', value: productoData.categoria.nombre });
      if (productoData?.nombre) detailsLeft.push({ label: 'Producto:', value: productoData.nombre });
    }
    detailsLeft.push({ label: 'Precio final:', value: formatMoney(precioFinal) });

    if (!isProduct) {
      const getCountWord = (c: number) => ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco'][c] || String(c);
      let estVal = 'No';
      if (estacionamientos.length > 0) {
        const names = estacionamientos.map((e: any) => e.nombre).join(', ');
        const locs = estacionamientos.map((e: any) => e.ubicacion || 'N/A').join(', ');
        estVal = `${getCountWord(estacionamientos.length)}: ${names}, ub: ${locs}`;
      }
      let bodVal = 'No';
      if (bodegas.length > 0) {
        const names = bodegas.map((b: any) => b.nombre).join(', ');
        const locs = bodegas.map((b: any) => b.ubicacion || 'N/A').join(', ');
        bodVal = `${getCountWord(bodegas.length)}: ${names}, ub: ${locs}`;
      }
      detailsLeft.push({ label: 'Estacionamiento:', value: estVal });
      detailsLeft.push({ label: 'Bodega:', value: bodVal });
    }

    for (const item of detailsLeft) {
      page.drawText(item.label, { x: leftColX, y, size: 7, font: helvetica, color: grayColor });
      const val = String(item.value || 'N/A').substring(0, 40);
      page.drawText(val, { x: leftColX + 70, y, size: 7, font: helveticaBold, color: primaryColor });
      y -= 11;
    }

    // Right column
    let ry = startY;
    page.drawText('Información del contrato', { x: rightColX, y: ry, size: 9, font: helveticaBold, color: primaryColor });
    ry -= 12;

    const detailsRight: { label: string; value: string }[] = [];
    const fechaCompraMostrada = (cuenta as any).fecha_compra || oferta.fecha_generacion;
    if (fechaCompraMostrada) detailsRight.push({ label: 'Fecha de compra:', value: formatDate(fechaCompraMostrada) });
    if (esquemaPago?.numero_mensualidades) detailsRight.push({ label: 'Parcialidades:', value: String(esquemaPago.numero_mensualidades) });

    const porcEng = esquemaPago?.porcentaje_enganche || 0;
    const porcMens = esquemaPago?.porcentaje_mensualidades || 0;
    const porcEnt = esquemaPago?.porcentaje_entrega || 0;
    const numMens = esquemaPago?.numero_mensualidades || 1;
    const montoMens = precioFinal * (porcMens / 100);
    const pagoMensual = numMens > 0 ? montoMens / numMens : 0;

    if (pagoMensual > 0) detailsRight.push({ label: 'Pago mensual:', value: formatMoney(pagoMensual) });

    const apartado = (acuerdos || []).find((a: any) => a.conceptos_pago?.nombre?.toLowerCase().includes('apartado'));
    detailsRight.push({ label: 'Apartado:', value: apartado ? formatMoney(apartado.monto) : 'N/A' });

    if (porcEng > 0) detailsRight.push({ label: 'Enganche:', value: `${porcEng}%  ${formatMoney(precioFinal * porcEng / 100)}` });
    if (porcMens > 0) detailsRight.push({ label: 'Parcialidades:', value: `${porcMens}%  ${formatMoney(montoMens)}` });
    if (porcEnt > 0) detailsRight.push({ label: 'Contraentrega:', value: `${porcEnt}%  ${formatMoney(precioFinal * porcEnt / 100)}` });

    for (const item of detailsRight) {
      page.drawText(item.label, { x: rightColX, y: ry, size: 7, font: helvetica, color: grayColor });
      const val = String(item.value || 'N/A').substring(0, 35);
      page.drawText(val, { x: rightColX + 65, y: ry, size: 7, font: helveticaBold, color: primaryColor });
      ry -= 11;
    }

    y = Math.min(y, ry) - 8;
    drawLine(y);
    y -= 14;

    // === SUMMARY CARDS ===
    const cardW = contentWidth / 4 - 3;
    const cardH = 35;
    const summaryItems = [
      { label: 'PRECIO FINAL', value: formatMoneyAllowNegative(precioFinal), highlight: false },
      { label: 'TOTAL PAGADO', value: formatMoneyAllowNegative(totalPagado), highlight: false },
      { label: 'MULTAS', value: formatMoneyAllowNegative(totalMultas), highlight: false },
      { label: 'SALDO PENDIENTE', value: formatMoneyAllowNegative(saldoPendiente), highlight: true },
    ];

    for (let i = 0; i < summaryItems.length; i++) {
      const item = summaryItems[i];
      const cx = margin + i * (cardW + 4);
      const cardY = y - cardH;

      if (item.highlight) {
        page.drawRectangle({ x: cx, y: cardY, width: cardW, height: cardH, color: primaryColor });
      } else {
        page.drawRectangle({ x: cx, y: cardY, width: cardW, height: cardH, color: white, borderColor: lineColor, borderWidth: 1 });
      }

      const labelColor = item.highlight ? white : grayColor;
      const valueColor = item.highlight ? white : primaryColor;

      const lw = helvetica.widthOfTextAtSize(item.label, 6);
      page.drawText(item.label, { x: cx + (cardW - lw) / 2, y: cardY + cardH - 12, size: 6, font: helvetica, color: labelColor });

      const vw = helveticaBold.widthOfTextAtSize(item.value, 10);
      page.drawText(item.value, { x: cx + (cardW - vw) / 2, y: cardY + 8, size: 10, font: helveticaBold, color: valueColor });
    }

    y -= cardH + 14;

    // === ACUERDOS DE PAGO TABLE ===
    checkNewPage(50);
    page.drawText('Acuerdos de Pago', { x: margin, y, size: 10, font: helveticaBold, color: primaryColor });
    y -= 8;
    drawLine(y);
    y -= 14;

    // Column widths
    const aCols = [25, 90, 75, 75, 75, 75, 55]; // #, Concepto, Fecha, Monto, Pagado, Pendiente, Estado
    const aHeaders = ['#', 'CONCEPTO', 'FECHA PROGRAMADA', 'MONTO', 'PAGADO', 'PENDIENTE', 'ESTADO'];

    // Header bg
    page.drawRectangle({ x: margin, y: y - 2, width: contentWidth, height: 14, color: bgLight });

    let colX = margin;
    for (let i = 0; i < aHeaders.length; i++) {
      const align = i >= 3 && i <= 5 ? 'right' : (i === 0 || i === 6 ? 'center' : 'left');
      let tx = colX + 2;
      if (align === 'right') tx = colX + aCols[i] - 2;
      else if (align === 'center') tx = colX + aCols[i] / 2 - helveticaBold.widthOfTextAtSize(aHeaders[i], 6) / 2;
      page.drawText(aHeaders[i], { x: tx, y: y, size: 6, font: helveticaBold, color: grayColor });
      colX += aCols[i];
    }

    y -= 16;
    drawLine(y + 2);

    // Rows
    for (let idx = 0; idx < (acuerdos || []).length; idx++) {
      const acuerdo = acuerdos![idx];
      checkNewPage(14);

      const pagadoAcuerdo = (pagos || []).reduce((sum: number, p: any) => {
        const apps = (p.aplicaciones_pago || []).filter((ap: any) => ap.id_acuerdo_pago === acuerdo.id && !ap.es_multa);
        return sum + apps.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);
      let pendiente = acuerdo.monto - pagadoAcuerdo;
      if (Math.abs(pendiente) < 0.01 || pendiente < 0) pendiente = 0;
      const isPaid = acuerdo.pago_completado;

      if (idx % 2 === 0) {
        page.drawRectangle({ x: margin, y: y - 3, width: contentWidth, height: 12, color: rgb(0.98, 0.98, 0.98) });
      }

      colX = margin;
      const rowData = [
        String(acuerdo.orden),
        (acuerdo.conceptos_pago?.nombre || 'N/A').substring(0, 18),
        acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : 'N/A',
        formatMoneyAllowNegative(acuerdo.monto),
        formatMoneyAllowNegative(pagadoAcuerdo),
        formatMoney(pendiente),
        '',
      ];

      for (let i = 0; i < rowData.length - 1; i++) {
        const align = i >= 3 && i <= 5 ? 'right' : (i === 0 ? 'center' : 'left');
        let tx = colX + 2;
        if (align === 'right') tx = colX + aCols[i] - 2;
        else if (align === 'center') tx = colX + aCols[i] / 2 - helvetica.widthOfTextAtSize(rowData[i], 7) / 2;
        page.drawText(rowData[i], { x: tx, y, size: 7, font: helvetica, color: primaryColor });
        colX += aCols[i];
      }

      // Status badge
      const statusText = isPaid ? 'Pagado' : 'Pendiente';
      const badgeColor = isPaid ? rgb(0.863, 0.988, 0.906) : rgb(0.996, 0.953, 0.780);
      const textColor = isPaid ? rgb(0.086, 0.396, 0.204) : rgb(0.573, 0.251, 0.055);
      const badgeW = 40;
      const badgeX = colX + (aCols[6] - badgeW) / 2;
      page.drawRectangle({ x: badgeX, y: y - 3, width: badgeW, height: 11, color: badgeColor });
      const stw = helvetica.widthOfTextAtSize(statusText, 6);
      page.drawText(statusText, { x: badgeX + (badgeW - stw) / 2, y: y, size: 6, font: helvetica, color: textColor });

      y -= 13;
    }

    y -= 10;

    // === MULTAS TABLE ===
    if (multas.length > 0) {
      checkNewPage(50);
      page.drawText('Multas', { x: margin, y, size: 10, font: helveticaBold, color: primaryColor });
      y -= 8;
      drawLine(y);
      y -= 14;

      const mCols = [25, 150, 75, 75, 75, 70];
      const mHeaders = ['#', 'DESCRIPCIÓN', 'MONTO', 'PAGADO', 'PENDIENTE', 'ESTADO'];
      const amberBg = rgb(0.996, 0.953, 0.780);

      page.drawRectangle({ x: margin, y: y - 2, width: contentWidth, height: 14, color: amberBg });
      colX = margin;
      for (let i = 0; i < mHeaders.length; i++) {
        const align = i >= 2 && i <= 4 ? 'right' : (i === 0 || i === 5 ? 'center' : 'left');
        let tx = colX + 2;
        if (align === 'right') tx = colX + mCols[i] - 2;
        else if (align === 'center') tx = colX + mCols[i] / 2 - helveticaBold.widthOfTextAtSize(mHeaders[i], 6) / 2;
        page.drawText(mHeaders[i], { x: tx, y, size: 6, font: helveticaBold, color: rgb(0.573, 0.251, 0.055) });
        colX += mCols[i];
      }
      y -= 16;

      for (let mi = 0; mi < multas.length; mi++) {
        const multa = multas[mi];
        let pagadoMulta = 0;
        if (multa.es_pagada) {
          pagadoMulta = multa.monto;
        } else {
          pagadoMulta = (pagos || []).reduce((sum: number, p: any) => {
            const apps = (p.aplicaciones_pago || []).filter((ap: any) => ap.es_multa && ap.id_acuerdo_pago === multa.id);
            return sum + apps.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
          }, 0);
        }
        const isPaid = multa.es_pagada || pagadoMulta >= multa.monto;
        const pendienteMulta = Math.max(0, multa.monto - pagadoMulta);

        const descLines = wrapText(multa.descripcion || 'Multa', mCols[1] - 4, helvetica, 7);
        const rowH = Math.max(13, descLines.length * 10 + 3);
        checkNewPage(rowH);

        if (mi % 2 === 0) {
          page.drawRectangle({ x: margin, y: y - 3, width: contentWidth, height: rowH, color: rgb(1, 0.984, 0.922) });
        }

        colX = margin;
        // #
        const numTxt = String(mi + 1);
        page.drawText(numTxt, { x: colX + mCols[0] / 2 - helvetica.widthOfTextAtSize(numTxt, 7) / 2, y, size: 7, font: helvetica, color: primaryColor });
        colX += mCols[0];

        // Desc
        let dy = y;
        for (const line of descLines) {
          page.drawText(line, { x: colX + 2, y: dy, size: 7, font: helvetica, color: primaryColor });
          dy -= 10;
        }
        colX += mCols[1];

        // Monto, Pagado, Pendiente
        const mVals = [formatMoneyAllowNegative(multa.monto), formatMoneyAllowNegative(pagadoMulta), formatMoneyAllowNegative(pendienteMulta)];
        for (let vi = 0; vi < 3; vi++) {
          const tw = helvetica.widthOfTextAtSize(mVals[vi], 7);
          page.drawText(mVals[vi], { x: colX + mCols[2 + vi] - 2 - tw, y, size: 7, font: helvetica, color: primaryColor });
          colX += mCols[2 + vi];
        }

        // Estado
        const stTxt = isPaid ? 'Pagada' : 'Pendiente';
        const bColor = isPaid ? rgb(0.863, 0.988, 0.906) : rgb(0.996, 0.886, 0.886);
        const tColor = isPaid ? rgb(0.086, 0.396, 0.204) : rgb(0.6, 0.106, 0.106);
        const bW = 38;
        const bX = colX + (mCols[5] - bW) / 2;
        page.drawRectangle({ x: bX, y: y - 3, width: bW, height: 11, color: bColor });
        const stW = helvetica.widthOfTextAtSize(stTxt, 6);
        page.drawText(stTxt, { x: bX + (bW - stW) / 2, y, size: 6, font: helvetica, color: tColor });

        y -= rowH;
      }
      y -= 5;
    }

    y -= 10;

    // === PAGOS REALIZADOS TABLE ===
    checkNewPage(50);
    page.drawText('Pagos Realizados', { x: margin, y, size: 10, font: helveticaBold, color: primaryColor });
    y -= 8;
    drawLine(y);
    y -= 14;

    const pCols = [75, 75, 250, 70];
    const pHeaders = ['FECHA', 'MÉTODO', 'REFERENCIA', 'MONTO'];

    page.drawRectangle({ x: margin, y: y - 2, width: contentWidth, height: 14, color: bgLight });
    colX = margin;
    for (let i = 0; i < pHeaders.length; i++) {
      const align = i === 3 ? 'right' : 'left';
      let tx = colX + 2;
      if (align === 'right') tx = colX + pCols[i] - 2;
      page.drawText(pHeaders[i], { x: tx, y, size: 6, font: helveticaBold, color: grayColor });
      colX += pCols[i];
    }
    y -= 16;
    drawLine(y + 2);

    for (let pi = 0; pi < (pagos || []).length; pi++) {
      const pago = pagos![pi];
      checkNewPage(14);

      if (pi % 2 === 0) {
        page.drawRectangle({ x: margin, y: y - 3, width: contentWidth, height: 12, color: rgb(0.98, 0.98, 0.98) });
      }

      colX = margin;
      const pRow = [
        formatDate(pago.fecha_pago),
        (pago.metodos_pago?.nombre || 'N/A').substring(0, 15),
        (pago.clave_rastreo || 'N/A').substring(0, 50),
        formatMoneyAllowNegative(pago.monto || 0),
      ];

      for (let i = 0; i < pRow.length; i++) {
        const align = i === 3 ? 'right' : 'left';
        const sz = i === 2 ? 6 : 7;
        let tx = colX + 2;
        if (align === 'right') {
          const tw = helvetica.widthOfTextAtSize(pRow[i], sz);
          tx = colX + pCols[i] - 2 - tw;
        }
        page.drawText(pRow[i], { x: tx, y, size: sz, font: helvetica, color: primaryColor });
        colX += pCols[i];
      }
      y -= 13;
    }

    // Total footer
    y -= 2;
    page.drawRectangle({ x: margin, y: y - 3, width: contentWidth, height: 14, color: bgLight });
    drawLine(y + 11);
    const totalPagosReal = (pagos || []).reduce((s: number, p: any) => s + (p.monto || 0), 0);
    page.drawText('Total Pagos', { x: margin + 4, y: y + 2, size: 8, font: helveticaBold, color: primaryColor });
    const totalTxt = formatMoneyAllowNegative(totalPagosReal);
    drawRightText(totalTxt, y + 2, helveticaBold, 8, primaryColor);
    y -= 20;

    // === FOOTER ===
    checkNewPage(20);
    drawLine(y);
    y -= 10;
    page.drawText('Notas: Este estado de cuenta muestra el detalle de acuerdos de pago y pagos realizados. Generado automáticamente.', {
      x: margin, y, size: 7, font: helvetica, color: lightGrayColor,
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload to storage
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `estado_cuenta_${cuentaId}_${dateStr}.pdf`;
    const filePath = `estados_cuenta_temp/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('documentos').upload(filePath, pdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Failed to upload PDF', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
    console.log('PDF uploaded:', urlData.publicUrl);

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
    console.error('Error in generar-estado-cuenta:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
