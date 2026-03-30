import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getMifielCredentials(environment?: string) {
  const suffix = environment === "production" ? "_PRD" : "_DEV";
  return {
    apiUrl: (Deno.env.get(`MIFIEL_API_URL${suffix}`) || "").replace(/\/+$/, "").replace(/\/documents$/i, ""),
    apiId: Deno.env.get(`MIFIEL_API_ID${suffix}`) || "",
    apiSecret: Deno.env.get(`MIFIEL_API_SECRET${suffix}`) || "",
  };
}

// ── Rich HTML-to-PDF renderer ──

interface TextSegment {
  text: string;
  bold: boolean;
}

interface Block {
  type: "heading" | "paragraph" | "list-item";
  headingLevel?: number;
  listPrefix?: string;
  segments: TextSegment[];
  spacingBefore?: number;
  spacingAfter?: number;
}

function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Normalize whitespace between tags
  let normalized = html.replace(/\r\n/g, "\n").replace(/>\s+</g, "> <");

  // Split into block-level elements
  const blockRegex = /<(h[1-6]|p|li|br|ol|ul|\/ol|\/ul)[^>]*>([\s\S]*?)<\/\1>|<br\s*\/?>|<(ol|ul)[^>]*>|<\/(ol|ul)>/gi;
  
  // Simpler approach: process line by line after stripping block tags
  // First, insert markers for block boundaries
  let processed = normalized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h([1-6])>/gi, "###END_H$1###\n\n")
    .replace(/<h([1-6])[^>]*>/gi, "###START_H$1###")
    .replace(/<\/li>/gi, "###END_LI###\n")
    .replace(/<li[^>]*>/gi, "###START_LI###")
    .replace(/<ol[^>]*>/gi, "###START_OL###")
    .replace(/<\/ol>/gi, "###END_OL###")
    .replace(/<ul[^>]*>/gi, "###START_UL###")
    .replace(/<\/ul>/gi, "###END_UL###");

  // Track list context
  let listStack: ("ol" | "ul")[] = [];
  let olCounter = 0;

  const lines = processed.split("\n");
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) {
      // empty line = spacing
      blocks.push({ type: "paragraph", segments: [], spacingBefore: 4, spacingAfter: 0 });
      continue;
    }

    // Check for list markers
    if (line.includes("###START_OL###")) {
      listStack.push("ol");
      olCounter = 0;
      line = line.replace(/###START_OL###/g, "");
    }
    if (line.includes("###START_UL###")) {
      listStack.push("ul");
      line = line.replace(/###START_UL###/g, "");
    }
    if (line.includes("###END_OL###")) {
      listStack.pop();
      line = line.replace(/###END_OL###/g, "");
    }
    if (line.includes("###END_UL###")) {
      listStack.pop();
      line = line.replace(/###END_UL###/g, "");
    }

    // Check for headings
    const headingStartMatch = line.match(/###START_H(\d)###/);
    const headingEndMatch = line.match(/###END_H(\d)###/);
    if (headingStartMatch) {
      const level = parseInt(headingStartMatch[1]);
      line = line.replace(/###START_H\d###/g, "").replace(/###END_H\d###/g, "");
      const segments = parseInlineFormatting(stripHtml(line));
      // Force all heading segments to bold
      segments.forEach(s => s.bold = true);
      if (segments.length > 0 && segments.some(s => s.text.trim())) {
        blocks.push({
          type: "heading",
          headingLevel: level,
          segments,
          spacingBefore: 12,
          spacingAfter: 4,
        });
      }
      continue;
    }
    if (headingEndMatch) {
      line = line.replace(/###END_H\d###/g, "");
    }

    // Check for list items
    if (line.includes("###START_LI###")) {
      line = line.replace(/###START_LI###/g, "").replace(/###END_LI###/g, "");
      const currentList = listStack[listStack.length - 1];
      let prefix = "  •  ";
      if (currentList === "ol") {
        olCounter++;
        prefix = `  ${olCounter}.  `;
      }
      const segments = parseInlineFormatting(stripHtml(line));
      if (segments.length > 0) {
        blocks.push({
          type: "list-item",
          listPrefix: prefix,
          segments,
          spacingBefore: 1,
          spacingAfter: 1,
        });
      }
      continue;
    }

    // Remove remaining markers
    line = line.replace(/###[A-Z_]+\d*###/g, "");
    if (!line.trim()) continue;

    const segments = parseInlineFormatting(stripHtml(line));
    if (segments.length > 0 && segments.some(s => s.text.trim())) {
      blocks.push({
        type: "paragraph",
        segments,
        spacingBefore: 0,
        spacingAfter: 2,
      });
    }
  }

  return blocks;
}

function parseInlineFormatting(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Split by bold markers
  const boldRegex = /<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = cleanText(text.substring(lastIndex, match.index));
      if (before) segments.push({ text: before, bold: false });
    }
    const boldText = cleanText(match[1]);
    if (boldText) segments.push({ text: boldText, bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = cleanText(text.substring(lastIndex));
    if (remaining) segments.push({ text: remaining, bold: false });
  }

  if (segments.length === 0) {
    const cleaned = cleanText(text);
    if (cleaned) segments.push({ text: cleaned, bold: false });
  }

  return segments;
}

function stripHtml(text: string): string {
  // Keep <strong> and <b> for inline processing, strip everything else
  return text
    .replace(/<(?!\/?(?:strong|b)[ >])[^>]+>/g, "")
    .trim();
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderBlocksToPdf(blocks: Block[], options?: { firmantesConfig?: { name: string; email: string; cargo?: string; firma_imagen?: string }[]; agentSignature?: string; agentName?: string; agentRfc?: string; fechaActual?: string; requiereFirmaAutografa?: boolean }): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;

  const fontSizes: Record<string, number> = {
    paragraph: 11,
    "list-item": 11,
    h1: 18,
    h2: 16,
    h3: 14,
    h4: 13,
    h5: 12,
    h6: 11,
  };

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const textColor = rgb(0.1, 0.1, 0.1);

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  for (const block of blocks) {
    const fontSize = block.type === "heading"
      ? fontSizes[`h${block.headingLevel || 2}`] || 14
      : fontSizes[block.type] || 11;
    const lineHeight = fontSize * 1.5;

    // Spacing before
    if (block.spacingBefore) y -= block.spacingBefore;

    // Empty paragraph = spacing only
    if (block.segments.length === 0) continue;

    // Build the full text with prefix
    const prefix = block.listPrefix || "";

    // Word-wrap with mixed bold/regular segments
    const allWords: { word: string; bold: boolean }[] = [];
    if (prefix) {
      allWords.push({ word: prefix, bold: false });
    }
    for (const seg of block.segments) {
      const words = seg.text.split(/\s+/).filter(w => w);
      for (const w of words) {
        allWords.push({ word: w, bold: seg.bold || block.type === "heading" });
      }
    }

    // Wrap into lines
    const wrappedLines: { word: string; bold: boolean }[][] = [];
    let currentLine: { word: string; bold: boolean }[] = [];
    let currentWidth = 0;

    for (const item of allWords) {
      const f = item.bold ? boldFont : font;
      const wordWidth = f.widthOfTextAtSize(item.word, fontSize);
      const spaceWidth = font.widthOfTextAtSize(" ", fontSize);
      const testWidth = currentLine.length > 0 ? currentWidth + spaceWidth + wordWidth : wordWidth;

      if (testWidth > maxWidth && currentLine.length > 0) {
        wrappedLines.push(currentLine);
        currentLine = [item];
        currentWidth = wordWidth;
      } else {
        currentLine.push(item);
        currentWidth = testWidth;
      }
    }
    if (currentLine.length > 0) wrappedLines.push(currentLine);

    // Render lines
    for (const line of wrappedLines) {
      ensureSpace(lineHeight);
      let x = margin;
      for (let i = 0; i < line.length; i++) {
        const item = line[i];
        const f = item.bold ? boldFont : font;
        if (i > 0) {
          const spaceW = font.widthOfTextAtSize(" ", fontSize);
          x += spaceW;
        }
        page.drawText(item.word, {
          x,
          y,
          size: fontSize,
          font: f,
          color: textColor,
        });
        x += f.widthOfTextAtSize(item.word, fontSize);
      }
      y -= lineHeight;
    }

    // Spacing after
    if (block.spacingAfter) y -= block.spacingAfter;
  }

  // ── Render signature blocks directly in PDF (not via HTML) ──
  if (options) {
    const { firmantesConfig = [], agentSignature, agentName, agentRfc, fechaActual } = options;
    const fontSize = 11;
    const lineHeight = fontSize * 1.5;
    const underline = "___________________________";
    const underlineWidth = font.widthOfTextAtSize(underline, fontSize);

    // Helper to embed a base64 PNG image
    const embedBase64Image = async (dataUrl: string) => {
      try {
        const base64Data = dataUrl.split(",")[1];
        if (!base64Data) return null;
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        if (dataUrl.includes("image/png")) {
          return await pdfDoc.embedPng(imageBytes);
        }
        return await pdfDoc.embedJpg(imageBytes);
      } catch (e) {
        console.error("Error embedding image:", e);
        return null;
      }
    };

    // Draw horizontal rule
    ensureSpace(20);
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 16;

    // "Firmas" heading
    ensureSpace(lineHeight + 10);
    page.drawText("Firmas", { x: margin, y, size: 14, font: boldFont, color: textColor });
    y -= lineHeight + 8;

    // Configured firmantes
    for (const f of firmantesConfig) {
      ensureSpace(100);
      page.drawText(f.name, { x: margin, y, size: 12, font: boldFont, color: textColor });
      y -= lineHeight;
      page.drawText(`Cargo: ${f.cargo || ""}`, { x: margin, y, size: fontSize, font, color: textColor });
      y -= lineHeight;

      // Firmante signature image (if available)
      if (f.firma_imagen) {
        const img = await embedBase64Image(f.firma_imagen);
        if (img) {
          const imgHeight = 80;
          const imgWidth = Math.min(160, (img.width / img.height) * imgHeight);
          const firmaLabelWidth = font.widthOfTextAtSize("Firma: ", fontSize);
          const underlineCenter = margin + firmaLabelWidth + underlineWidth / 2;
          ensureSpace(imgHeight + lineHeight);
          page.drawImage(img, {
            x: underlineCenter - imgWidth / 2,
            y: y - imgHeight + lineHeight,
            width: imgWidth,
            height: imgHeight,
          });
          y -= imgHeight;
        }
      }

      // "Firma: ___________________________"
      page.drawText("Firma: ", { x: margin, y, size: fontSize, font, color: textColor });
      const firmaLabelW = font.widthOfTextAtSize("Firma: ", fontSize);
      page.drawText(underline, { x: margin + firmaLabelW, y, size: fontSize, font, color: textColor });
      y -= lineHeight;

      page.drawText(`Fecha: ${fechaActual || ""}`, { x: margin, y, size: fontSize, font, color: textColor });
      y -= lineHeight + 12;
    }

    // Agent block
    ensureSpace(120);
    // Separator
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 16;

    page.drawText("EL AGENTE", { x: margin, y, size: 12, font: boldFont, color: textColor });
    y -= lineHeight;
    page.drawText(`Nombre/Razón Social: ${agentName || ""}`, { x: margin, y, size: fontSize, font, color: textColor });
    y -= lineHeight;
    page.drawText(`RFC: ${agentRfc || ""}`, { x: margin, y, size: fontSize, font, color: textColor });
    y -= lineHeight;

    // Agent autograph signature
    if (agentSignature) {
      const img = await embedBase64Image(agentSignature);
      if (img) {
        const imgHeight = 80;
        const imgWidth = Math.min(160, (img.width / img.height) * imgHeight);
        const firmaLabelWidth = font.widthOfTextAtSize("Firma: ", fontSize);
        const underlineCenter = margin + firmaLabelWidth + underlineWidth / 2;
        ensureSpace(imgHeight + lineHeight);
        page.drawImage(img, {
          x: underlineCenter - imgWidth / 2,
          y: y - imgHeight + lineHeight,
          width: imgWidth,
          height: imgHeight,
        });
        y -= imgHeight;
      }
    }

    page.drawText("Firma: ", { x: margin, y, size: fontSize, font, color: textColor });
    const firmaLabelW = font.widthOfTextAtSize("Firma: ", fontSize);
    page.drawText(underline, { x: margin + firmaLabelW, y, size: fontSize, font, color: textColor });
    y -= lineHeight;

    page.drawText(`Fecha: ${fechaActual || ""}`, { x: margin, y, size: fontSize, font, color: textColor });
  }

  return await pdfDoc.save();
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { agente_email, agente_nombre, agente_persona_id, carta_acuerdo_id, firma_autografa_agente, environment } = await req.json();
    if (!agente_email || !agente_nombre) {
      throw new Error("agente_email y agente_nombre son requeridos");
    }

    // Fetch agent's RFC from personas table
    let agente_rfc = "";
    if (agente_persona_id) {
      const { data: personaData } = await supabase
        .from("personas")
        .select("rfc")
        .eq("id", agente_persona_id)
        .single();
      if (personaData?.rfc) {
        agente_rfc = personaData.rfc;
      }
    }

    // 1. Get the template + firmantes_config from cartas_acuerdo (new table) or fallback
    let templateData: any = null;
    if (carta_acuerdo_id) {
      const { data, error } = await supabase
        .from("cartas_acuerdo")
        .select("contenido_html, firmantes_config, requiere_validacion_biometrica, requiere_firma_autografa")
        .eq("id", carta_acuerdo_id)
        .single();
      if (error) throw new Error("No se encontró la carta de acuerdo: " + error.message);
      templateData = data;
    } else {
      // Fallback: use first active carta from new table
      const { data, error } = await supabase
        .from("cartas_acuerdo")
        .select("id, contenido_html, firmantes_config, requiere_validacion_biometrica, requiere_firma_autografa")
        .eq("activo", true)
        .order("created_at")
        .limit(1)
        .single();
      if (error || !data) {
        // Last resort: old table
        const { data: oldData, error: oldErr } = await supabase
          .from("carta_acuerdos_template")
          .select("contenido_html, firmantes_config")
          .order("id")
          .limit(1)
          .single();
        if (oldErr || !oldData?.contenido_html) {
          throw new Error("No se encontró el template de carta de acuerdos");
        }
        templateData = { ...oldData, requiere_validacion_biometrica: false };
      } else {
        templateData = data;
      }
    }

    if (!templateData?.contenido_html) {
      throw new Error("No se encontró el template de carta de acuerdos");
    }

    const usedCartaId = carta_acuerdo_id || templateData.id || null;
    const firmantesConfig: { name: string; email: string; cargo?: string }[] = templateData.firmantes_config || [];
    const requiereBiometrica: boolean = templateData.requiere_validacion_biometrica || false;
    const requiereFirmaAutografa: boolean = templateData.requiere_firma_autografa !== false; // default true

    // 2. Replace placeholders
    const now = new Date();
    const fechaActual = now.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const fechaFin = new Date(now);
    fechaFin.setMonth(fechaFin.getMonth() + 3);
    const fechaFinStr = fechaFin.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let html = templateData.contenido_html;
    const values: Record<string, string> = {
      nombre_agente: agente_nombre,
      rfc_agente: agente_rfc,
      fecha_actual: fechaActual,
      fecha_fin: fechaFinStr,
    };

    html = html.replace(
      /<span[^>]*data-placeholder="([^"]+)"[^>]*>.*?<\/span>/g,
      (_match: string, key: string) => values[key] || `[${key}]`
    );

    // 3. Generate rich PDF from HTML (signature blocks rendered natively in PDF)
    const blocks = parseHtmlToBlocks(html);
    const pdfBytes = await renderBlocksToPdf(blocks, {
      firmantesConfig: firmantesConfig as any,
      agentSignature: requiereFirmaAutografa ? (firma_autografa_agente || undefined) : undefined,
      agentName: agente_nombre,
      agentRfc: agente_rfc || "[rfc_agente]",
      fechaActual,
    });

    // 4. Build signatories: only firmantes with enviar_mifiel !== false + agent
    const signatories: { name: string; email: string }[] = [
      ...firmantesConfig.filter(f => (f as any).enviar_mifiel !== false).map(f => ({ name: f.name, email: f.email })),
      { name: agente_nombre, email: agente_email },
    ];

    // 5. Create document in Mifiel
    const { apiUrl: MIFIEL_API_URL, apiId: MIFIEL_API_ID, apiSecret: MIFIEL_API_SECRET } = getMifielCredentials(environment);
    if (!MIFIEL_API_ID || !MIFIEL_API_SECRET) {
      throw new Error("Mifiel credentials not configured");
    }
    const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

    const formData = new FormData();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    formData.append("file", blob, "carta-acuerdos.pdf");

    // Signing methods:
    // Agent: FSSV (simple) when biometric is OFF, FSCV (biometric) when ON
    // Non-agent firmantes: always FSSV (simple)
    signatories.forEach((s, i) => {
      formData.append(`signatories[${i}][name]`, s.name);
      formData.append(`signatories[${i}][email]`, s.email);
      const isAgent = s.email === agente_email;
      if (isAgent) {
        formData.append(`signatories[${i}][allowed_signature_methods][0]`, requiereBiometrica ? "FESCV" : "FESSV");
      } else {
        formData.append(`signatories[${i}][allowed_signature_methods][0]`, "FESSV");
      }
    });

    formData.append("send_invites", "true");
    formData.append("callback_url", `${supabaseUrl}/functions/v1/mifiel-webhook`);

    const mifielUrl = `${MIFIEL_API_URL}/documents`;
    console.log("Mifiel URL:", mifielUrl, "Signatories:", signatories.length);

    const mifielResponse = await fetch(mifielUrl, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: formData,
    });

    if (!mifielResponse.ok) {
      const errBody = await mifielResponse.text();
      throw new Error(`Mifiel API error [${mifielResponse.status}]: ${errBody}`);
    }

    const mifielDoc = await mifielResponse.json();

    // 6. Extract widget_ids for all signatories
    const mifielSigners = mifielDoc.signers || mifielDoc.signatories || [];
    const agentSigner = mifielSigners.find((s: any) => s.email === agente_email);
    const agentWidgetId = agentSigner?.widget_id || null;

    const firmantes = signatories.map((s) => {
      const found = mifielSigners.find((ms: any) => ms.email === s.email);
      return {
        name: s.name,
        email: s.email,
        widget_id: found?.widget_id || null,
      };
    });

    // 7. Save to firmas_digitales
    const { error: insertErr } = await supabase.from("firmas_digitales").insert({
      tipo_documento: "carta_acuerdos",
      referencia_id: agente_persona_id || null,
      carta_acuerdo_id: usedCartaId,
      mifiel_document_id: mifielDoc.id,
      estado: "enviado",
      firmantes,
      metadata: { mifiel_response: mifielDoc, environment: environment || "development" },
    });

    if (insertErr) {
      console.error("Error saving firma:", insertErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_id: mifielDoc.id,
        widget_id: agentWidgetId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
