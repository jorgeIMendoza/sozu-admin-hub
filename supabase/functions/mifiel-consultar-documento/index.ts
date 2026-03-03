import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIFIEL_API_URL = (Deno.env.get("MIFIEL_API_URL") || "https://app-sandbox.mifiel.com/api/v1").replace(/\/+$/, "").replace(/\/documents$/i, "");

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

    const { document_id } = await req.json();
    if (!document_id) {
      throw new Error("document_id is required");
    }

    const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

    const response = await fetch(`${MIFIEL_API_URL}/documents/${document_id}`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      const errBody = await response.text();
      let parsedError: unknown = errBody;
      try {
        parsedError = JSON.parse(errBody);
      } catch {
        // keep raw text
      }

      return new Response(JSON.stringify({
        success: false,
        upstream_status: response.status,
        error: `Mifiel API error [${response.status}]`,
        details: parsedError,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    let signedPdfUrl: string | null = null;
    let pdfStorageUrl: string | null = null;

    try {
      const mifielApiBaseUrl = MIFIEL_API_URL.replace(/\/api\/v1$/i, "");
      const signedFilePath = typeof data?.file_signed === "string" ? data.file_signed : null;
      const signedFileUrl = signedFilePath
        ? signedFilePath.startsWith("http")
          ? signedFilePath
          : signedFilePath.startsWith("/api/")
            ? `${mifielApiBaseUrl}${signedFilePath}`
            : `${MIFIEL_API_URL}${signedFilePath.startsWith("/") ? "" : "/"}${signedFilePath}`
        : `${MIFIEL_API_URL}/documents/${document_id}/file_signed`;

      const pdfResponse = await fetch(signedFileUrl, {
        headers: { Authorization: authHeader },
      });

      if (pdfResponse.ok && supabaseAdmin) {
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const filePath = `cartas/${document_id}.pdf`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("firmas-digitales")
          .upload(filePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (!uploadError) {
          pdfStorageUrl = filePath;

          const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
            .from("firmas-digitales")
            .createSignedUrl(filePath, 3600);

          if (signedUrlError) {
            console.error("Error creating signed URL for uploaded Mifiel PDF:", signedUrlError);
          }

          signedPdfUrl = signedUrlData?.signedUrl || null;

          if (pdfStorageUrl) {
            await supabaseAdmin
              .from("firmas_digitales")
              .update({ pdf_firmado_url: pdfStorageUrl })
              .eq("mifiel_document_id", document_id);
          }
        } else {
          console.error("Error uploading Mifiel PDF to storage:", uploadError);
        }
      } else if (!pdfResponse.ok) {
        const pdfErrorBody = await pdfResponse.text();
        console.error("Error fetching signed Mifiel PDF:", pdfResponse.status, pdfErrorBody);
      }
    } catch (pdfError) {
      console.error("Error resolving signed PDF URL:", pdfError);
    }

    return new Response(JSON.stringify({ success: true, document: data, signed_pdf_url: signedPdfUrl, pdf_storage_url: pdfStorageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
