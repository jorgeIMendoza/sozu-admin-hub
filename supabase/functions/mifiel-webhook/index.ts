import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Mifiel webhook received:", JSON.stringify(body));

    const documentId = body.document?.id || body.id;
    const status = body.status || body.document?.status;

    if (!documentId) {
      return new Response(JSON.stringify({ error: "No document ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Mifiel status to our status
    let estado = "enviado";
    if (status === "completed" || status === "signed") {
      estado = "completado";
    } else if (status === "canceled" || status === "cancelled") {
      estado = "cancelado";
    } else if (status === "partially_signed") {
      estado = "firmado_parcial";
    }

    // Update firma status
    const { error: updateErr } = await supabase
      .from("firmas_digitales")
      .update({
        estado,
        metadata: body,
      })
      .eq("mifiel_document_id", documentId);

    if (updateErr) {
      console.error("Error updating firma:", updateErr);
    }

    // If completed, download signed PDF and store it
    if (estado === "completado") {
      try {
        const MIFIEL_API_ID = Deno.env.get("MIFIEL_API_ID");
        const MIFIEL_API_SECRET = Deno.env.get("MIFIEL_API_SECRET");

        if (MIFIEL_API_ID && MIFIEL_API_SECRET) {
          const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

          const pdfResponse = await fetch(
            `https://app.mifiel.com/api/v1/documents/${documentId}/file`,
            { headers: { Authorization: authHeader } }
          );

          if (pdfResponse.ok) {
            const pdfBuffer = await pdfResponse.arrayBuffer();
            const filePath = `cartas/${documentId}.pdf`;

            const { error: uploadErr } = await supabase.storage
              .from("firmas-digitales")
              .upload(filePath, pdfBuffer, {
                contentType: "application/pdf",
                upsert: true,
              });

            if (!uploadErr) {
              const { data: urlData } = supabase.storage
                .from("firmas-digitales")
                .getPublicUrl(filePath);

              await supabase
                .from("firmas_digitales")
                .update({ pdf_firmado_url: urlData?.publicUrl || filePath })
                .eq("mifiel_document_id", documentId);
            }
          }
        }
      } catch (pdfErr) {
        console.error("Error downloading signed PDF:", pdfErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
