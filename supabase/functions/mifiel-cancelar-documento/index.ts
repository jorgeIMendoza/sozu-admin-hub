import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getMifielCredentials(environment?: string) {
  const suffix = environment === "production" ? "_PRD" : "_DEV";
  return {
    apiUrl: (Deno.env.get(`MIFIEL_API_URL${suffix}`) || "").replace(/\/+$/, "").replace(/\/documents$/i, ""),
    apiId: Deno.env.get(`MIFIEL_API_ID${suffix}`) || "",
    apiSecret: Deno.env.get(`MIFIEL_API_SECRET${suffix}`) || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id, environment } = await req.json();
    if (!document_id) {
      throw new Error("document_id is required");
    }

    const { apiUrl, apiId, apiSecret } = getMifielCredentials(environment);
    if (!apiId || !apiSecret) {
      throw new Error("Mifiel credentials not configured");
    }

    const authHeader = "Basic " + btoa(`${apiId}:${apiSecret}`);

    // DELETE the document in Mifiel
    const response = await fetch(`${apiUrl}/documents/${document_id}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });

    // 404 = already deleted, 410 = fully signed (can't delete but is finalized) — treat both as success
    if (response.ok || response.status === 404 || response.status === 410) {
      return new Response(JSON.stringify({
        success: true,
        already_deleted: response.status === 404,
        already_signed: response.status === 410,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errBody = await response.text();
    return new Response(JSON.stringify({
      success: false,
      upstream_status: response.status,
      error: `Mifiel API error [${response.status}]`,
      details: errBody,
    }), {
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
