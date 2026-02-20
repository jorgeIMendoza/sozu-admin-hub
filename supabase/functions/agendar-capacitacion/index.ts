import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CALENDAR_ID = "jorge.mendoza@sozu.com";

// ---------- Google Auth ----------

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (o: any) =>
    btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = encode({ alg: "RS256", typ: "JWT" });
  const payload = encode({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

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

// ---------- Calendar helpers ----------

async function getAvailableSlots(token: string, fecha: string, supabaseClient?: any, calendarOwnerEmail?: string): Promise<string[]> {
  // First check configured slots from configuracion_citas_horarios if supabase client provided
  let configuredSlots: Set<string> | null = null;
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    if (dayOfWeek > 0) { // 0 = Sunday, skip
      const { data: configData } = await supabaseClient
        .from("configuracion_citas_horarios")
        .select("hora")
        .eq("id_usuario_email", calendarOwnerEmail)
        .eq("dia_semana", dayOfWeek)
        .eq("activo", true);
      
      if (configData && configData.length > 0) {
        configuredSlots = new Set(configData.map((c: any) => `${String(c.hora).padStart(2, "0")}:00`));
        console.log(`[availability] Configured slots for ${calendarOwnerEmail} on day ${dayOfWeek}:`, Array.from(configuredSlots));
      } else {
        // Check if user has ANY configuration at all
        const { data: anyConfig } = await supabaseClient
          .from("configuracion_citas_horarios")
          .select("id")
          .eq("id_usuario_email", calendarOwnerEmail)
          .eq("activo", true)
          .limit(1);
        
        if (anyConfig && anyConfig.length > 0) {
          // User has config but not for this day -> no slots available
          console.log(`[availability] No configured slots for day ${dayOfWeek}, returning empty`);
          return [];
        }
        // If no config at all, fall through to calendar-only check
      }
    }
  }

  const timeMin = `${fecha}T09:00:00-06:00`;
  const timeMax = `${fecha}T18:00:00-06:00`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar API error: ${await res.text()}`);

  const data = await res.json();
  console.log(`[availability] ${fecha}: ${(data.items || []).length} events found`);
  const events = (data.items || [])
    .filter((e: any) => e.start?.dateTime && e.end?.dateTime)
    .map((e: any) => {
      const ev = { start: new Date(e.start.dateTime).getTime(), end: new Date(e.end.dateTime).getTime(), summary: e.summary || '' };
      console.log(`  event: "${ev.summary}" ${e.start.dateTime} -> ${e.end.dateTime}`);
      return ev;
    });

  const slots: string[] = [];
  for (let h = 9; h <= 16; h++) {
    for (const m of [0, 30]) {
      if (h === 16 && m > 30) continue;
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      
      // If configured slots exist, check if slot's hour is in configured hours
      if (configuredSlots) {
        const slotHourLabel = `${String(h).padStart(2, "0")}:00`;
        if (!configuredSlots.has(slotHourLabel)) continue;
      }
      
      const startMs = new Date(`${fecha}T${label}:00-06:00`).getTime();
      const endMs = startMs + 90 * 60 * 1000;
      if (!events.some((ev: any) => startMs < ev.end && endMs > ev.start)) {
        slots.push(label);
      }
    }
  }
  return slots;
}

// Helper to get day of week (1=Monday, 6=Saturday, 0=Sunday)
function getDayOfWeek(fecha: string): number {
  const date = new Date(fecha + "T12:00:00");
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (jsDay === 0) return 0; // Sunday not supported
  return jsDay; // 1=Mon, 2=Tue, ..., 6=Sat - matches our DB schema
}

async function checkAvailability(token: string, fecha: string, horaInicio: string, horaFin: string, excludeEventId?: string, supabaseClient?: any, calendarOwnerEmail?: string): Promise<boolean> {
  // First check configured slots
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    if (dayOfWeek > 0) {
      const { data: anyConfig } = await supabaseClient
        .from("configuracion_citas_horarios")
        .select("id")
        .eq("id_usuario_email", calendarOwnerEmail)
        .eq("activo", true)
        .limit(1);
      
      if (anyConfig && anyConfig.length > 0) {
        // User has configuration, check if this specific day/hour is allowed
        const horaNum = parseInt(horaInicio.split(":")[0]);
        const { data: slotConfig } = await supabaseClient
          .from("configuracion_citas_horarios")
          .select("id")
          .eq("id_usuario_email", calendarOwnerEmail)
          .eq("dia_semana", dayOfWeek)
          .eq("hora", horaNum)
          .eq("activo", true)
          .limit(1);
        
        if (!slotConfig || slotConfig.length === 0) {
          console.log(`[checkAvailability] Slot ${horaInicio} on day ${dayOfWeek} not configured for ${calendarOwnerEmail}`);
          return false;
        }
      }
    }
  }

  const timeMin = `${fecha}T${horaInicio}:00-06:00`;
  const timeMax = `${fecha}T${horaFin}:00-06:00`;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Calendar API error: ${await res.text()}`);
  const data = await res.json();
  const timedEvents = (data.items || []).filter((e: any) => e.start?.dateTime && e.end?.dateTime && e.id !== excludeEventId);
  return timedEvents.length === 0;
}

async function createCalendarEvent(token: string, fecha: string, horaInicio: string, horaFin: string, summary: string, agentEmail: string) {
  const event = {
    summary,
    start: { dateTime: `${fecha}T${horaInicio}:00`, timeZone: "America/Mexico_City" },
    end: { dateTime: `${fecha}T${horaFin}:00`, timeZone: "America/Mexico_City" },
    description: `Capacitación agendada para: ${agentEmail}`,
  };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
  );
  if (!res.ok) throw new Error(`Failed to create event: ${await res.text()}`);
  return await res.json();
}

async function deleteCalendarEvent(token: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404) {
    console.error(`Failed to delete calendar event ${eventId}: ${await res.text()}`);
  } else {
    console.log(`Deleted calendar event: ${eventId}`);
  }
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const saStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saStr) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret not configured");
    const sa = JSON.parse(saStr);
    const body = await req.json();
    const token = await getAccessToken(sa);

    // ---- Action: check available slots ----
    if (body.action === "check-availability") {
      if (!body.fecha) {
        return new Response(JSON.stringify({ error: "Falta el campo 'fecha'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Create supabase client to check configured slots
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseForSlots = createClient(supabaseUrl, supabaseKey);
      const slots = await getAvailableSlots(token, body.fecha, supabaseForSlots, CALENDAR_ID);
      return new Response(JSON.stringify({ available_slots: slots }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: schedule (default) ----
    const { fecha, hora_inicio, id_persona, agent_email, direccion_showroom, latitud_showroom, longitud_showroom } = body;

    if (!fecha || !hora_inicio || !id_persona) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios: fecha, hora_inicio, id_persona" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [h, m] = hora_inicio.split(":").map(Number);
    const totalMin = h * 60 + m + 90;
    const horaFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find existing active cita for this persona
    const { data: oldCitas } = await supabase
      .from("citas_capacitacion")
      .select("id, google_calendar_event_id")
      .eq("id_persona", id_persona)
      .eq("activo", true);

    const existingEventId = oldCitas?.[0]?.google_calendar_event_id || undefined;
    const existingCitaId = oldCitas?.[0]?.id;

    // Check availability excluding the existing event (so rescheduling doesn't conflict with itself)
    const available = await checkAvailability(token, fecha, hora_inicio, horaFin, existingEventId, supabase, CALENDAR_ID);
    if (!available) {
      return new Response(JSON.stringify({ error: "no_disponible", message: "El horario seleccionado no está disponible." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let summary = "Capacitación de Sozu para uso de herramienta.";
    if (direccion_showroom && latitud_showroom && longitud_showroom) {
      summary += ` En la direccion: ${direccion_showroom} con la ubicacion ${latitud_showroom},${longitud_showroom}`;
    }

    // Delete old Google Calendar event if it exists
    if (existingEventId) {
      await deleteCalendarEvent(token, existingEventId);
    }

    // Create new calendar event
    const calendarEvent = await createCalendarEvent(token, fecha, hora_inicio, horaFin, summary, agent_email || "");

    let resultCita;

    if (existingCitaId) {
      // UPDATE existing cita record
      const { data: updatedCita, error: updateError } = await supabase
        .from("citas_capacitacion")
        .update({ fecha, hora_inicio, hora_fin: horaFin, google_calendar_event_id: calendarEvent.id, estatus: "programada" })
        .eq("id", existingCitaId)
        .select()
        .single();
      if (updateError) console.error("DB update error:", updateError);
      resultCita = updatedCita;
    } else {
      // Insert new cita only if none exists
      const { data: newCita, error: insertError } = await supabase
        .from("citas_capacitacion")
        .insert({ id_persona, fecha, hora_inicio, hora_fin: horaFin, ubicacion: "Presencial", estatus: "programada", google_calendar_event_id: calendarEvent.id, google_meet_link: null })
        .select()
        .single();
      if (insertError) console.error("DB insert error:", insertError);
      resultCita = newCita;
    }

    return new Response(JSON.stringify({ success: true, meet_link: null, event_id: calendarEvent.id, cita: resultCita }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error in agendar-capacitacion:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
