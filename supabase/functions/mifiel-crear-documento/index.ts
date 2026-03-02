import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIFIEL_API_URL = (Deno.env.get("MIFIEL_API_URL") || "https://app-sandbox.mifiel.com/api/v1").replace(/\/+$/, "").replace(/\/documents$/i, "");
const SOZU_SIGNER_EMAIL = "rodrigo.terveen@sozu.com";
const SOZU_SIGNER_NAME = "Rodrigo Terveen";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MIFIEL_API_ID = Deno.env.get("MIFIEL_API_ID");
    const MIFIEL_API_SECRET = Deno.env.get("MIFIEL_API_SECRET");
    if (!MIFIEL_API_ID || !MIFIEL_API_SECRET) {
      throw new Error("Mifiel credentials not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { agente_email, agente_nombre, agente_persona_id } = await req.json();
    if (!agente_email || !agente_nombre) {
      throw new Error("agente_email y agente_nombre son requeridos");
    }

    // 1. Get the template
    const { data: templateData, error: templateErr } = await supabase
      .from("carta_acuerdos_template")
      .select("contenido_html")
      .order("id")
      .limit(1)
      .single();

    if (templateErr || !templateData?.contenido_html) {
      throw new Error("No se encontró el template de carta de acuerdos");
    }

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
      fecha_actual: fechaActual,
      fecha_fin: fechaFinStr,
    };

    // Replace placeholder spans
    html = html.replace(
      /<span[^>]*data-placeholder="([^"]+)"[^>]*>.*?<\/span>/g,
      (_match: string, key: string) => values[key] || `[${key}]`
    );

    // 3. Generate PDF from HTML
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; padding: 40px; font-size: 12px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 18px; } h2 { font-size: 15px; } h3 { font-size: 13px; }
  ul, ol { padding-left: 1.5em; }
</style>
</head><body>${html}</body></html>`;

    const pdfContent = new TextEncoder().encode(fullHtml);

    // 4. Create document in Mifiel
    const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

    const formData = new FormData();
    const blob = new Blob([pdfContent], { type: "text/html" });
    formData.append("file", blob, "carta-acuerdos.html");
    formData.append("signatories[0][name]", SOZU_SIGNER_NAME);
    formData.append("signatories[0][email]", SOZU_SIGNER_EMAIL);
    formData.append("signatories[1][name]", agente_nombre);
    formData.append("signatories[1][email]", agente_email);
    formData.append("callback_url", `${supabaseUrl}/functions/v1/mifiel-webhook`);

    const mifielUrl = `${MIFIEL_API_URL}/documents`;
    console.log("Mifiel URL:", mifielUrl);
    const mifielResponse = await fetch(mifielUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });

    if (!mifielResponse.ok) {
      const errBody = await mifielResponse.text();
      throw new Error(`Mifiel API error [${mifielResponse.status}]: ${errBody}`);
    }

    const mifielDoc = await mifielResponse.json();

    // 5. Extract widget_id for the agent signer
    const signatories = mifielDoc.signers || mifielDoc.signatories || [];
    const agentSigner = signatories.find((s: any) => s.email === agente_email);
    const agentWidgetId = agentSigner?.widget_id || null;

    // Build firmantes array with widget_ids
    const firmantes = [
      { 
        name: SOZU_SIGNER_NAME, 
        email: SOZU_SIGNER_EMAIL,
        widget_id: signatories.find((s: any) => s.email === SOZU_SIGNER_EMAIL)?.widget_id || null,
      },
      { 
        name: agente_nombre, 
        email: agente_email,
        widget_id: agentWidgetId,
      },
    ];

    // 6. Save to firmas_digitales
    const { error: insertErr } = await supabase.from("firmas_digitales").insert({
      tipo_documento: "carta_acuerdos",
      referencia_id: agente_persona_id || null,
      mifiel_document_id: mifielDoc.id,
      estado: "enviado",
      firmantes,
      metadata: { mifiel_response: mifielDoc },
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
