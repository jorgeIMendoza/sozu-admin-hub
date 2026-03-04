import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { document_id } = await req.json();
    if (!document_id) {
      throw new Error("document_id is required");
    }

    const authHeader = "Basic " + btoa(`${MIFIEL_API_ID}:${MIFIEL_API_SECRET}`);

    // DELETE the document in Mifiel
    const response = await fetch(`${MIFIEL_API_URL}/documents/${document_id}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });

    // 404 means already deleted — treat as success
    if (response.ok || response.status === 404) {
      return new Response(JSON.stringify({ success: true, already_deleted: response.status === 404 }), {
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
