import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Google Calendar API helpers
async function getAccessToken(serviceAccountJson: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountJson.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  // Import the private key and sign
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccountJson.private_key
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\n/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsignedToken}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

const CALENDAR_ID = "jorge.mendoza@sozu.com";

async function checkAvailability(accessToken: string, fecha: string, horaInicio: string, horaFin: string): Promise<boolean> {
  const timeMin = `${fecha}T${horaInicio}:00-06:00`;
  const timeMax = `${fecha}T${horaFin}:00-06:00`;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar API error: ${err}`);
  }

  const data = await res.json();
  // If there are events in this time range, it's not available
  return (data.items || []).length === 0;
}

async function createCalendarEvent(
  accessToken: string,
  fecha: string,
  horaInicio: string,
  horaFin: string,
  summary: string,
  agentEmail: string
): Promise<any> {
  const event = {
    summary,
    start: {
      dateTime: `${fecha}T${horaInicio}:00`,
      timeZone: "America/Mexico_City",
    },
    end: {
      dateTime: `${fecha}T${horaFin}:00`,
      timeZone: "America/Mexico_City",
    },
    conferenceData: {
      createRequest: {
        requestId: `cap-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    description: `Capacitación agendada para: ${agentEmail}`,
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create event: ${err}`);
  }

  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountJsonStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJsonStr) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret not configured");
    }
    const serviceAccountJson = JSON.parse(serviceAccountJsonStr);

    const { fecha, hora_inicio, id_persona, agent_email, direccion_showroom, latitud_showroom, longitud_showroom } = await req.json();

    if (!fecha || !hora_inicio || !id_persona) {
      return new Response(
        JSON.stringify({ error: "Faltan campos obligatorios: fecha, hora_inicio, id_persona" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate hora_fin (1h30m after inicio)
    const [h, m] = hora_inicio.split(':').map(Number);
    const totalMin = h * 60 + m + 90;
    const horaFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

    // Get access token
    const accessToken = await getAccessToken(serviceAccountJson);

    // Check availability
    const available = await checkAvailability(accessToken, fecha, hora_inicio, horaFin);
    if (!available) {
      return new Response(
        JSON.stringify({ 
          error: "no_disponible", 
          message: "El horario seleccionado no está disponible. Por favor selecciona otra fecha u hora." 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build event summary
    let summary = "Capacitación de Sozu para uso de herramienta.";
    if (direccion_showroom && latitud_showroom && longitud_showroom) {
      summary += ` En la direccion: ${direccion_showroom} con la ubicacion ${latitud_showroom},${longitud_showroom}`;
    }

    // Create Google Calendar event with Meet
    const calendarEvent = await createCalendarEvent(
      accessToken,
      fecha,
      hora_inicio,
      horaFin,
      summary,
      agent_email || ""
    );

    const meetLink = calendarEvent.hangoutLink || calendarEvent.conferenceData?.entryPoints?.[0]?.uri || null;
    const eventId = calendarEvent.id;

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Deactivate previous appointments
    await supabase
      .from('citas_capacitacion')
      .update({ activo: false })
      .eq('id_persona', id_persona)
      .eq('activo', true);

    // Insert new appointment
    const { data: newCita, error: insertError } = await supabase
      .from('citas_capacitacion')
      .insert({
        id_persona,
        fecha,
        hora_inicio,
        hora_fin: horaFin,
        ubicacion: meetLink || 'Google Meet',
        estatus: 'programada',
        google_calendar_event_id: eventId,
        google_meet_link: meetLink,
      })
      .select()
      .single();

    if (insertError) {
      console.error("DB insert error:", insertError);
      // Still return success since calendar event was created
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        meet_link: meetLink,
        event_id: eventId,
        cita: newCita,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in agendar-capacitacion:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
