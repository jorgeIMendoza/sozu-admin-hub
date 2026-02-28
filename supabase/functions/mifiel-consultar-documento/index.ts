import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIFIEL_API_URL = "https://app.mifiel.com/api/v1";

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

    const response = await fetch(`${MIFIEL_API_URL}/documents/${document_id}`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Mifiel API error [${response.status}]: ${errBody}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, document: data }), {
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
