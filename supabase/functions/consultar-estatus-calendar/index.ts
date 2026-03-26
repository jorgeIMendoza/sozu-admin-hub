import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ---------- Google Auth ----------
async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (o: any) =>
    btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = encode({ alg: "RS256", typ: "JWT" });
  const jwtPayload: Record<string, any> = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const payload = encode(jwtPayload);

  const unsigned = `${header}.${payload}`;
  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sigB64}`,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token error: ${JSON.stringify(json)}`);
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_ids, calendario_email } = await req.json();

    if (!event_ids || !Array.isArray(event_ids) || event_ids.length === 0 || !calendario_email) {
      return new Response(
        JSON.stringify({ error: 'Se requieren event_ids (array) y calendario_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!saJson) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sa = JSON.parse(saJson);
    const token = await getAccessToken(sa);

    // Fetch all events in parallel
    const results: Record<string, { attendees: Array<{ email: string; responseStatus: string }> }> = {};

    await Promise.all(event_ids.map(async (eventId: string) => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario_email)}/events/${encodeURIComponent(eventId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[consultar-estatus] Event ${eventId} fetch failed: ${errText}`);
          results[eventId] = { attendees: [] };
          return;
        }

        const event = await res.json();
        const attendees = (event.attendees || []).map((a: any) => ({
          email: a.email,
          responseStatus: a.responseStatus || 'needsAction',
        }));

        results[eventId] = { attendees };
      } catch (err: any) {
        console.error(`[consultar-estatus] Error fetching event ${eventId}:`, err);
        results[eventId] = { attendees: [] };
      }
    }));

    return new Response(
      JSON.stringify({ events: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[consultar-estatus-calendar] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
