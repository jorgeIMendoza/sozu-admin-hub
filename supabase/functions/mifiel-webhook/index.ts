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

    // If completed, download signed PDF and store it + create documento tipo 48
    if (estado === "completado") {
      // Fetch the firma record to get referencia_id
      const { data: firmaRecord } = await supabase
        .from("firmas_digitales")
        .select("id, referencia_id, tipo_documento")
        .eq("mifiel_document_id", documentId)
        .single();

      try {
        const MIFIEL_API_ID = Deno.env.get("MIFIEL_API_ID");
        const MIFIEL_API_SECRET = Deno.env.get("MIFIEL_API_SECRET");

        if (MIFIEL_API_ID && MIFIEL_API_SECRET) {
          const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

          const pdfResponse = await fetch(
            `${Deno.env.get("MIFIEL_API_URL") || "https://app-sandbox.mifiel.com/api/v1"}/documents/${documentId}/file`,
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

              const pdfUrl = urlData?.publicUrl || filePath;

              await supabase
                .from("firmas_digitales")
                .update({ pdf_firmado_url: pdfUrl })
                .eq("mifiel_document_id", documentId);

              // Create documento tipo 48 (Carta de cumplimiento) for the agent
              if (firmaRecord?.referencia_id && firmaRecord?.tipo_documento === "carta_acuerdos") {
                const personaId = firmaRecord.referencia_id;

                // Deactivate previous docs of type 48 for this persona
                await supabase
                  .from("documentos")
                  .update({ activo: false })
                  .eq("id_persona", personaId)
                  .eq("id_tipo_documento", 48)
                  .eq("activo", true);

                // Insert new validated document
                const { error: docInsertErr } = await supabase
                  .from("documentos")
                  .insert({
                    url: pdfUrl,
                    id_tipo_documento: 48,
                    id_persona: personaId,
                    activo: true,
                    id_estatus_verificacion: 2, // Validado
                  });

                if (docInsertErr) {
                  console.error("Error creating documento tipo 48:", docInsertErr);
                } else {
                  console.log(`Documento tipo 48 created for persona ${personaId}`);
                }
              }
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
