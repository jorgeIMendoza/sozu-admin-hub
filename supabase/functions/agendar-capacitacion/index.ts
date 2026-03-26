import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SERVICE_ACCOUNT_EMAIL = "cuenta-conexiones-drive@sozu-38755.iam.gserviceaccount.com";

// ---------- Google Auth ----------

async function getAccessToken(sa: any, subject?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (o: any) =>
    btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = encode({ alg: "RS256", typ: "JWT" });
  const jwtPayload: Record<string, any> = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (subject) {
    jwtPayload.sub = subject;
  }
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

// ---------- DB helpers ----------

async function getUserCitaConfig(supabase: any, calendarOwnerEmail: string, tipoCitaId: number) {
  const { data } = await supabase
    .from("configuracion_citas_usuarios")
    .select("duracion_minutos, calendario_email, correos_enterado, nombre, descripcion_invitacion")
    .eq("id_usuario_email", calendarOwnerEmail)
    .eq("id_tipo_cita", tipoCitaId)
    .eq("activo", true)
    .maybeSingle();
  return data;
}

// ---------- Calendar helpers ----------

function getDayOfWeek(fecha: string): number {
  const date = new Date(fecha + "T12:00:00");
  const jsDay = date.getDay();
  if (jsDay === 0) return 0;
  return jsDay;
}

async function getAvailableSlots(
  token: string, fecha: string, calendarId: string, duracionMinutos: number,
  supabaseClient?: any, calendarOwnerEmail?: string, tipoCitaId?: number,
  configId?: number, maxInvitados?: number, excludePersonaId?: number
): Promise<string[]> {
  let configuredSlots: Set<string> | null = null;
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    // Always check configured slots, including Sunday (day 0)
    let query = supabaseClient
      .from("configuracion_citas_horarios")
      .select("hora")
      .eq("activo", true);
    
    if (configId) {
      query = query.eq("id_configuracion_cita", configId);
    } else {
      query = query.eq("id_usuario_email", calendarOwnerEmail);
      if (tipoCitaId) query = query.eq("id_tipo_cita", tipoCitaId);
    }
    query = query.eq("dia_semana", dayOfWeek);

    const { data: configData } = await query;

    if (configData && configData.length > 0) {
      configuredSlots = new Set(configData.map((c: any) => `${String(c.hora).padStart(2, "0")}:00`));
      console.log(`[availability] Configured slots for ${calendarOwnerEmail} on day ${dayOfWeek}:`, Array.from(configuredSlots));
    } else {
      let checkQuery = supabaseClient
        .from("configuracion_citas_horarios")
        .select("id")
        .eq("activo", true)
        .limit(1);
      if (configId) {
        checkQuery = checkQuery.eq("id_configuracion_cita", configId);
      } else {
        checkQuery = checkQuery.eq("id_usuario_email", calendarOwnerEmail);
        if (tipoCitaId) checkQuery = checkQuery.eq("id_tipo_cita", tipoCitaId);
      }
      const { data: anyConfig } = await checkQuery;

      if (anyConfig && anyConfig.length > 0) {
        console.log(`[availability] No configured slots for day ${dayOfWeek}, returning empty`);
        return [];
      }
    }
  }

  // Check existing bookings for this config+date to enforce max_invitados
  let bookedSlotsCount: Map<string, number> = new Map();
  if (supabaseClient && configId && maxInvitados) {
    let bookingQuery = supabaseClient
      .from("reservas_citas")
      .select("hora_inicio")
      .eq("id_configuracion_cita", configId)
      .eq("fecha", fecha)
      .eq("activo", true)
      .in("estatus", ["programada"]);
    if (excludePersonaId) {
      bookingQuery = bookingQuery.neq("id_persona", excludePersonaId);
    }
    const { data: existingBookings } = await bookingQuery;
    
    if (existingBookings) {
      for (const booking of existingBookings) {
        const slotKey = booking.hora_inicio?.slice(0, 5);
        if (slotKey) {
          bookedSlotsCount.set(slotKey, (bookedSlotsCount.get(slotKey) || 0) + 1);
        }
      }
      console.log(`[availability] Existing bookings for config ${configId} on ${fecha}:`, Object.fromEntries(bookedSlotsCount));
    }
  }

  const timeMin = `${fecha}T06:00:00-06:00`;
  const timeMax = `${fecha}T23:00:00-06:00`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar API error: ${await res.text()}`);

  const data = await res.json();
  console.log(`[availability] ${fecha}: ${(data.items || []).length} events found`);
  
  // Separate service-account events from other events
  const serviceAccountEvents: any[] = [];
  const otherEvents: any[] = [];
  
  for (const e of (data.items || [])) {
    if (!e.start?.dateTime || !e.end?.dateTime) continue;
    const ev = { start: new Date(e.start.dateTime).getTime(), end: new Date(e.end.dateTime).getTime(), summary: e.summary || '', creator: e.creator?.email || '', organizer: e.organizer?.email || '' };
    console.log(`  event: "${ev.summary}" ${e.start.dateTime} -> ${e.end.dateTime} creator=${ev.creator}`);
    
    if (ev.creator === SERVICE_ACCOUNT_EMAIL || ev.organizer === SERVICE_ACCOUNT_EMAIL) {
      serviceAccountEvents.push(ev);
    } else {
      otherEvents.push(ev);
    }
  }

  // Dynamic slot range based on configured hours or default 9-20
  let minHour = 9;
  let maxHour = 20;
  if (configuredSlots && configuredSlots.size > 0) {
    const hours = Array.from(configuredSlots).map(s => parseInt(s.split(":")[0]));
    minHour = Math.min(...hours);
    maxHour = Math.max(...hours);
  }

  const slots: string[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    for (const m of [0, 30]) {
      if (h === maxHour && m > 0) continue;
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      if (configuredSlots) {
        const slotHourLabel = `${String(h).padStart(2, "0")}:00`;
        if (!configuredSlots.has(slotHourLabel)) continue;
      }

      const startMs = new Date(`${fecha}T${label}:00-06:00`).getTime();
      const endMs = startMs + duracionMinutos * 60 * 1000;
      
      // Non-service-account events block the slot entirely
      if (otherEvents.some((ev: any) => startMs < ev.end && endMs > ev.start)) {
        continue;
      }
      
      // For service-account events (our recurring events), check max_invitados
      if (maxInvitados) {
        const currentBookings = bookedSlotsCount.get(label) || 0;
        if (currentBookings >= maxInvitados) {
          console.log(`[availability] Slot ${label} full: ${currentBookings}/${maxInvitados}`);
          continue;
        }
      }
      
      slots.push(label);
    }
  }
  return slots;
}

async function checkAvailability(
  token: string, fecha: string, horaInicio: string, horaFin: string,
  calendarId: string, excludeEventId?: string, supabaseClient?: any,
  calendarOwnerEmail?: string, tipoCitaId?: number, configId?: number,
  maxInvitados?: number
): Promise<boolean> {
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);

    // Valida contra la misma fuente de horarios que usa el modal:
    // si viene configId, validar por id_configuracion_cita; si no, fallback por owner/tipo.
    let slotQuery = supabaseClient
      .from("configuracion_citas_horarios")
      .select("id")
      .eq("dia_semana", dayOfWeek)
      .eq("hora", parseInt(horaInicio.split(":")[0]))
      .eq("activo", true)
      .limit(1);

    if (configId) {
      slotQuery = slotQuery.eq("id_configuracion_cita", configId);
    } else {
      slotQuery = slotQuery.eq("id_usuario_email", calendarOwnerEmail);
      if (tipoCitaId) slotQuery = slotQuery.eq("id_tipo_cita", tipoCitaId);
    }

    const { data: slotConfig } = await slotQuery;

    if (!slotConfig || slotConfig.length === 0) {
      console.log(`[checkAvailability] Slot ${horaInicio} on day ${dayOfWeek} not configured (configId=${configId || "none"}) for ${calendarOwnerEmail}`);
      return false;
    }
  }

  // Availability is now managed entirely by the database (reservas_citas).
  // Google Calendar events are only created AFTER booking, so we check the DB for existing bookings.
  if (!supabaseClient) {
    console.log(`[checkAvailability] No supabase client, allowing by default`);
    return true;
  }

  // Query existing active bookings for this slot
  let bookingQuery = supabaseClient
    .from("reservas_citas")
    .select("id")
    .eq("fecha", fecha)
    .eq("hora_inicio", horaInicio + ":00")
    .eq("activo", true)
    .in("estatus", ["programada"]);

  // Filter by config or by calendar owner
  if (configId) {
    bookingQuery = bookingQuery.eq("id_configuracion_cita", configId);
  } else if (calendarOwnerEmail) {
    bookingQuery = bookingQuery.eq("email_agente", calendarOwnerEmail);
  }

  // Exclude the current person's booking (for re-scheduling)
  if (excludeEventId) {
    bookingQuery = bookingQuery.neq("google_calendar_event_id", excludeEventId);
  }

  const { data: existingBookings, error: bookErr } = await bookingQuery;

  if (bookErr) {
    console.error(`[checkAvailability] DB error:`, bookErr);
    return true; // Allow on error to not block user
  }

  const maxSlots = maxInvitados && maxInvitados > 1 ? maxInvitados : 1;
  const currentCount = existingBookings?.length || 0;

  console.log(`[checkAvailability] Slot ${fecha} ${horaInicio}: ${currentCount}/${maxSlots} booked`);

  return currentCount < maxSlots;
}

// ---------- Find specific instance of recurring event for a date/time ----------

async function findRecurringEventInstance(
  token: string, calendarId: string, summary: string, fecha: string, horaInicio: string, duracionMinutos: number
): Promise<any | null> {
  const timeMin = `${fecha}T00:00:00-06:00`;
  const timeMax = `${fecha}T23:59:59-06:00`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(summary)}`;
  
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`[findInstance] Error: ${await res.text()}`);
    return null;
  }
  
  const data = await res.json();
  const events = data.items || [];
  
  // Find the event that matches summary, time, and is created by service account
  for (const ev of events) {
    if (!ev.start?.dateTime) continue;
    // Extract time from the dateTime string directly (e.g. "2026-02-26T13:00:00-06:00" -> "13:00")
    // This avoids timezone conversion issues with Date.getHours()
    const dtMatch = ev.start.dateTime.match(/T(\d{2}):(\d{2})/);
    if (!dtMatch) continue;
    const evTime = `${dtMatch[1]}:${dtMatch[2]}`;
    
    const matchesSummary = ev.summary === summary;
    const matchesTime = evTime === horaInicio;
    const isServiceAccount = ev.creator?.email === SERVICE_ACCOUNT_EMAIL || ev.organizer?.email === SERVICE_ACCOUNT_EMAIL;
    
    if (matchesSummary && matchesTime && isServiceAccount) {
      console.log(`[findInstance] Found instance: ${ev.id} at ${fecha} ${horaInicio}, recurringEventId=${ev.recurringEventId || 'none'}`);
      return ev;
    }
  }
  
  console.log(`[findInstance] No matching instance found for "${summary}" at ${fecha} ${horaInicio}`);
  return null;
}

// ---------- PATCH event to add attendee and update description ----------

async function patchEventWithAttendee(
  token: string, calendarId: string, eventId: string, 
  agentEmail: string, agentName: string,
  existingAttendees: any[], existingDescription: string,
  correos_enterado: string[], notas?: string
): Promise<any> {
  // Build new attendee list: existing + agent + correos_enterado
  const allAttendees = [...(existingAttendees || [])];
  
  // Add agent if not already there
  if (agentEmail && !allAttendees.some((a: any) => a.email === agentEmail)) {
    allAttendees.push({ email: agentEmail, responseStatus: "accepted" });
  }
  
  // Add correos_enterado if not already there
  for (const cc of correos_enterado) {
    if (!allAttendees.some((a: any) => a.email === cc)) {
      allAttendees.push({ email: cc, responseStatus: "needsAction" });
    }
  }
  
  // Build updated description with attendee list
  const attendeeSection = `\n\n--- Asistentes ---\n${agentName ? `• ${agentName} (${agentEmail})` : `• ${agentEmail}`}`;
  let newDescription = existingDescription || "";

  // Add or update notas section
  if (notas) {
    if (newDescription.includes("Notas:")) {
      newDescription = newDescription.replace(/Notas:.*(?:\n|$)/, `Notas: ${notas}\n`);
    } else {
      // Insert notas before attendee section if exists, otherwise append
      const idx = newDescription.indexOf("--- Asistentes ---");
      if (idx > -1) {
        newDescription = newDescription.slice(0, idx) + `Notas: ${notas}\n\n` + newDescription.slice(idx);
      } else {
        newDescription += `\n\nNotas: ${notas}`;
      }
    }
  }
  
  // Check if there's already an attendee section
  if (newDescription.includes("--- Asistentes ---")) {
    // Append to existing section if agent not already listed
    if (!newDescription.includes(agentEmail)) {
      newDescription += `\n${agentName ? `• ${agentName} (${agentEmail})` : `• ${agentEmail}`}`;
    }
  } else {
    newDescription += attendeeSection;
  }
  
  const patchBody: any = {
    description: newDescription,
  };
  
  // Try with attendees first
  patchBody.attendees = allAttendees;
  
  let res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
  );
  
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[patchEvent] PATCH with attendees failed (${res.status}): ${errText}`);
    
    if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
      // Retry without attendees but still update description
      console.log(`[patchEvent] Cannot add attendees (no DWD), updating description only`);
      delete patchBody.attendees;
      res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
      );
      if (!res.ok) {
        const finalErr = await res.text();
        console.error(`[patchEvent] Description-only PATCH also failed: ${finalErr}`);
        throw new Error(`Failed to update event: ${finalErr}`);
      }
    } else {
      throw new Error(`Failed to update event: ${errText}`);
    }
  }
  
  const updated = await res.json();
  console.log(`[patchEvent] Updated event ${updated.id}, attendees: ${JSON.stringify(updated.attendees?.map((a: any) => a.email) || [])}`);
  return updated;
}

async function createCalendarEvent(token: string, calendarId: string, fecha: string, horaInicio: string, horaFin: string, summary: string, agentEmail: string, attendees?: { email: string }[], description?: string, location?: string) {
  const event: any = {
    summary,
    start: { dateTime: `${fecha}T${horaInicio}:00`, timeZone: "America/Mexico_City" },
    end: { dateTime: `${fecha}T${horaFin}:00`, timeZone: "America/Mexico_City" },
    description: description || `Capacitación agendada para: ${agentEmail}`,
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  if (location) {
    event.location = location;
  }
  if (attendees && attendees.length > 0) {
    event.attendees = attendees;
  }

  const attemptCreate = async (eventPayload: any, withMeet: boolean): Promise<Response> => {
    const url = withMeet
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`;
    return fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload),
    });
  };

  let res = await attemptCreate(event, true);

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[createEvent] Attempt 1 failed (${res.status}): ${errText}`);

    if (res.status === 400 && errText.includes("Invalid conference type")) {
      delete event.conferenceData;
      res = await attemptCreate(event, false);
    } else if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
      console.log(`[createEvent] Cannot add attendees (no DWD), retrying without attendees`);
      delete event.attendees;
      res = await attemptCreate(event, true);
      
      if (!res.ok) {
        const errText2 = await res.text();
        if (res.status === 400 && errText2.includes("Invalid conference type")) {
          delete event.conferenceData;
          res = await attemptCreate(event, false);
        }
      }
    } else {
      throw new Error(`Failed to create event (${res.status}): ${errText}`);
    }

    if (!res.ok) {
      const finalErr = await res.text();
      throw new Error(`Failed to create event: ${finalErr}`);
    }
  }

  const created = await res.json();
  console.log(`[createEvent] Created event ${created.id}, Meet: ${created.hangoutLink || 'none'}`);
  return created;
}

async function deleteCalendarEvent(token: string, calendarId: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404) {
    console.error(`Failed to delete calendar event ${eventId}: ${await res.text()}`);
  } else {
    console.log(`Deleted calendar event: ${eventId}`);
  }
}

// ---------- Helper: find existing events by summary AND creator (service account) ----------

async function findExistingEventsByServiceAccount(
  token: string, calendarId: string, summary: string, timeMin: string, timeMax: string
): Promise<any[]> {
  const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=false&maxResults=2500&q=${encodeURIComponent(summary)}`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  
  if (!listRes.ok) {
    const errText = await listRes.text();
    console.error(`[findEvents] Error listing events (${listRes.status}): ${errText}`);
    return [];
  }
  
  const listData = await listRes.json();
  const allEvents = listData.items || [];
  
  const filtered = allEvents.filter((e: any) => {
    const matchesSummary = e.summary === summary;
    const createdByServiceAccount = e.creator?.email === SERVICE_ACCOUNT_EMAIL || e.organizer?.email === SERVICE_ACCOUNT_EMAIL;
    return matchesSummary && createdByServiceAccount;
  });
  
  console.log(`[findEvents] Found ${allEvents.length} total events matching query "${summary}", ${filtered.length} created by service account`);
  filtered.forEach((e: any) => {
    console.log(`  - Event ${e.id}: "${e.summary}" creator=${e.creator?.email} organizer=${e.organizer?.email} recurrence=${JSON.stringify(e.recurrence)}`);
  });
  
  return filtered;
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const saStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saStr) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret not configured");
    const sa = JSON.parse(saStr);
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tipoCitaId = body.tipo_cita_id || 1;
    const calendarOwnerEmail = body.calendar_owner_email || "jorge.mendoza@sozu.com";

    // Fetch dynamic config
    const userCitaConfig = await getUserCitaConfig(supabase, calendarOwnerEmail, tipoCitaId);
    const duracionMinutos = body.duracion_minutos || userCitaConfig?.duracion_minutos || 90;
    const calendarId = userCitaConfig?.calendario_email || calendarOwnerEmail;

    // Generate token with Domain-Wide Delegation (sub = actual calendar owner, not config owner)
    const dwdSubject = calendarId;
    const token = await getAccessToken(sa, dwdSubject);
    console.log(`[auth] Token generated with DWD subject: ${dwdSubject} (config owner: ${calendarOwnerEmail})`);

    // ---- Action: verify-calendar-access (check if SA has WRITE access to the calendar) ----
    if (body.action === "verify-calendar-access") {
      const targetEmail = body.calendar_email;
      if (!targetEmail) {
        return new Response(JSON.stringify({ error: "Falta calendar_email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        // Use the service account's OWN token (no DWD/subject impersonation)
        // This only works if the calendar was explicitly shared with the SA
        const saToken = await getAccessToken(sa); // no subject = SA's own identity
        
        // Try to create a temporary test event to verify WRITE access ("Realizar cambios en eventos")
        const now = new Date();
        const testStart = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
        const testEnd = new Date(testStart.getTime() + 15 * 60 * 1000);
        const testEvent = {
          summary: "__SOZU_VERIFY_WRITE_ACCESS__",
          start: { dateTime: testStart.toISOString() },
          end: { dateTime: testEnd.toISOString() },
        };
        
        const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetEmail)}/events`;
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${saToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(testEvent),
        });
        
        if (createRes.ok) {
          // Write access confirmed — delete the test event immediately
          const created = await createRes.json();
          if (created.id) {
            const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetEmail)}/events/${created.id}`;
            await fetch(deleteUrl, { method: "DELETE", headers: { Authorization: `Bearer ${saToken}` } });
          }
          console.log(`[verify-calendar-access] WRITE access OK for ${targetEmail}`);
          return new Response(JSON.stringify({ success: true, accessible: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        // Write failed — check if it's a permission issue
        const errText = await createRes.text();
        console.log(`[verify-calendar-access] WRITE access DENIED for ${targetEmail}: ${createRes.status} ${errText}`);
        
        // Provide a specific message depending on the error
        let detail = errText;
        if (createRes.status === 404) {
          detail = "Calendario no encontrado. Verifique que el email sea correcto.";
        } else if (createRes.status === 403) {
          detail = "La cuenta de servicio no tiene permiso de 'Realizar cambios en eventos' en este calendario.";
        }
        
        return new Response(JSON.stringify({ success: true, accessible: false, status: createRes.status, detail }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        console.error(`[verify-calendar-access] Error: ${e.message}`);
        return new Response(JSON.stringify({ success: true, accessible: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ---- Action: verify-event (check if calendar event still exists) ----
    if (body.action === "verify-event") {
      const { google_calendar_event_id, reserva_id } = body;
      if (!google_calendar_event_id || !reserva_id) {
        return new Response(JSON.stringify({ error: "Faltan google_calendar_event_id o reserva_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(google_calendar_event_id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.status === 404) {
          // Event was deleted - cancel the reservation
          console.log(`[verify-event] Event ${google_calendar_event_id} not found (404), cancelling reserva ${reserva_id}`);
          await supabase
            .from("reservas_citas")
            .update({ estatus: "cancelada", activo: false })
            .eq("id", reserva_id);
          return new Response(JSON.stringify({ exists: false, cancelled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!res.ok) {
          // Could be permissions or other error - don't cancel, just report
          const errText = await res.text();
          console.error(`[verify-event] Error checking event (${res.status}): ${errText}`);
          return new Response(JSON.stringify({ exists: true, error: errText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const eventData = await res.json();
        // Also check if status is "cancelled"
        if (eventData.status === "cancelled") {
          console.log(`[verify-event] Event ${google_calendar_event_id} status is cancelled`);
          await supabase
            .from("reservas_citas")
            .update({ estatus: "cancelada", activo: false })
            .eq("id", reserva_id);
          return new Response(JSON.stringify({ exists: false, cancelled: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`[verify-event] Event ${google_calendar_event_id} exists, status: ${eventData.status}`);
        return new Response(JSON.stringify({ exists: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        console.error(`[verify-event] Exception: ${e.message}`);
        return new Response(JSON.stringify({ exists: true, error: e.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ---- Action: verify-events-batch (check multiple reservas against Google Calendar) ----
    if (body.action === "verify-events-batch") {
      const reservaIds: number[] = body.reserva_ids;
      if (!reservaIds || !Array.isArray(reservaIds) || reservaIds.length === 0) {
        return new Response(JSON.stringify({ error: "Falta reserva_ids (array)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch reservas with their google_calendar_event_id and config
      const { data: reservas } = await supabase
        .from("reservas_citas")
        .select("id, google_calendar_event_id, id_configuracion_cita, fecha, hora_inicio")
        .in("id", reservaIds)
        .eq("activo", true);

      if (!reservas || reservas.length === 0) {
        return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get unique config IDs to fetch calendar emails
      const configIds = [...new Set(reservas.map((r: any) => r.id_configuracion_cita).filter(Boolean))];
      const { data: configs } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id, calendario_email, id_usuario_email")
        .in("id", configIds);

      const configMap = new Map<number, any>();
      (configs || []).forEach((c: any) => configMap.set(c.id, c));

      // Group by calendar email for token reuse
      const byCalendar = new Map<string, any[]>();
      for (const r of reservas) {
        if (!r.google_calendar_event_id) continue;
        const cfg = configMap.get(r.id_configuracion_cita);
        const calEmail = cfg?.calendario_email || cfg?.id_usuario_email;
        if (!calEmail) continue;
        if (!byCalendar.has(calEmail)) byCalendar.set(calEmail, []);
        byCalendar.get(calEmail)!.push({ ...r, calendar_email: calEmail });
      }

      const results: { reserva_id: number; exists: boolean; cancelled: boolean }[] = [];

      // Reservas without google_calendar_event_id are "not in calendar"
      for (const r of reservas) {
        if (!r.google_calendar_event_id) {
          results.push({ reserva_id: r.id, exists: false, cancelled: false });
        }
      }

      for (const [calEmail, items] of byCalendar) {
        let calToken: string;
        try {
          calToken = await getAccessToken(sa, calEmail);
        } catch (e: any) {
          console.error(`[verify-batch] Token error for ${calEmail}: ${e.message}`);
          items.forEach((i: any) => results.push({ reserva_id: i.id, exists: true, cancelled: false }));
          continue;
        }

        for (const item of items) {
          try {
            const res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calEmail)}/events/${encodeURIComponent(item.google_calendar_event_id)}`,
              { headers: { Authorization: `Bearer ${calToken}` } },
            );

            if (res.status === 404 || res.status === 410) {
              console.log(`[verify-batch] Event ${item.google_calendar_event_id} NOT FOUND for reserva ${item.id}`);
              await supabase.from("reservas_citas").update({ 
                estatus: "cancelada_calendar", 
                fecha_actualizacion: new Date().toISOString() 
              }).eq("id", item.id);
              results.push({ reserva_id: item.id, exists: false, cancelled: true });
              continue;
            }

            if (res.ok) {
              const evData = await res.json();
              if (evData.status === "cancelled") {
                console.log(`[verify-batch] Event ${item.google_calendar_event_id} CANCELLED for reserva ${item.id}`);
                await supabase.from("reservas_citas").update({ 
                  estatus: "cancelada_calendar", 
                  fecha_actualizacion: new Date().toISOString() 
                }).eq("id", item.id);
                results.push({ reserva_id: item.id, exists: false, cancelled: true });
              } else {
                results.push({ reserva_id: item.id, exists: true, cancelled: false });
              }
            } else {
              console.error(`[verify-batch] Error checking event ${item.google_calendar_event_id}: ${res.status}`);
              results.push({ reserva_id: item.id, exists: true, cancelled: false });
            }
          } catch (e: any) {
            console.error(`[verify-batch] Exception for reserva ${item.id}: ${e.message}`);
            results.push({ reserva_id: item.id, exists: true, cancelled: false });
          }
        }
      }

      console.log(`[verify-batch] Verified ${results.length} reservas`);
      return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: check-config-future-attendees (check if future events have real attendees) ----
    if (body.action === "check-config-future-attendees") {
      const configId = body.config_id;
      if (!configId) {
        return new Response(JSON.stringify({ error: "Falta config_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      console.log(`[check-config-future-attendees] Checking future events for config ${configId}`);

      const { data: storedEvents } = await supabase
        .from("citas_calendar_events")
        .select("*")
        .eq("id_configuracion_cita", configId)
        .eq("activo", true)
        .gte("fecha", todayStr);

      let hasAttendees = false;
      let eventsWithAttendees = 0;
      const datesWithAttendees: string[] = [];
      const totalFutureEvents = (storedEvents || []).length;

      for (const se of (storedEvents || [])) {
        try {
          const evRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(se.calendar_email)}/events/${encodeURIComponent(se.google_event_id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!evRes.ok) {
            console.log(`[check-attendees] Could not fetch event ${se.google_event_id}: ${evRes.status}`);
            continue;
          }
          const evData = await evRes.json();
          const realAttendees = (evData.attendees || []).filter(
            (a: any) => a.email !== SERVICE_ACCOUNT_EMAIL
          );
          if (realAttendees.length > 0) {
            hasAttendees = true;
            eventsWithAttendees++;
            if (se.fecha) datesWithAttendees.push(se.fecha);
            console.log(`[check-attendees] Event ${se.google_event_id} on ${se.fecha} has ${realAttendees.length} attendees`);
          }
        } catch (e: any) {
          console.error(`[check-attendees] Error checking event ${se.google_event_id}: ${e.message}`);
        }
      }

      console.log(`[check-config-future-attendees] Result: has_attendees=${hasAttendees}, events_with_attendees=${eventsWithAttendees}/${totalFutureEvents}`);
      return new Response(JSON.stringify({
        has_attendees: hasAttendees,
        total_future_events: totalFutureEvents,
        events_with_attendees: eventsWithAttendees,
        dates_with_attendees: datesWithAttendees,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: delete-config-events (delete only future calendar events without attendees) ----
    if (body.action === "delete-config-events") {
      const configId = body.config_id;
      if (!configId) {
        return new Response(JSON.stringify({ error: "Falta config_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      console.log(`[delete-config-events] Deleting future calendar events (>= ${todayStr}) for config ${configId}`);

      // 1. Get future stored calendar events for this config
      const { data: storedEvents } = await supabase
        .from("citas_calendar_events")
        .select("*")
        .eq("id_configuracion_cita", configId)
        .eq("activo", true)
        .gte("fecha", todayStr);

      let deletedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const deletedEventIds: number[] = [];

      for (const se of (storedEvents || [])) {
        try {
          await deleteCalendarEvent(token, se.calendar_email, se.google_event_id);
          deletedCount++;
          deletedEventIds.push(se.id);
        } catch (e: any) {
          console.error(`[delete-config-events] Error deleting event ${se.google_event_id}: ${e.message}`);
          errors.push(`Event ${se.google_event_id}: ${e.message}`);
        }
      }

      // 2. Mark only deleted events as inactive (skipped ones remain active)
      if (deletedEventIds.length > 0) {
        await supabase
          .from("citas_calendar_events")
          .update({ activo: false })
          .in("id", deletedEventIds);
      }

      // 3. Cancel only future active reservations
      await supabase
        .from("reservas_citas")
        .update({ activo: false, estatus: "cancelada" })
        .eq("id_configuracion_cita", configId)
        .eq("activo", true)
        .gte("fecha", todayStr);

      console.log(`[delete-config-events] Deleted ${deletedCount}, skipped ${skippedCount}/${(storedEvents || []).length} future events, errors: ${errors.length}`);

      return new Response(JSON.stringify({ 
        success: true, 
        deleted_count: deletedCount, 
        skipped_count: skippedCount,
        total: (storedEvents || []).length,
        errors 
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: check-availability-by-project ----
    if (body.action === "check-availability-by-project") {
      if (!body.fecha) {
        return new Response(JSON.stringify({ error: "Falta el campo 'fecha'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const proyectoIds: number[] = body.proyecto_ids || [];
      const excludePersonaId: number | undefined = body.exclude_persona_id || undefined;
      let query = supabase
        .from("configuracion_citas_usuarios")
        .select("id, id_usuario_email, duracion_minutos, calendario_email, nombre, max_invitados")
        .eq("id_tipo_cita", tipoCitaId)
        .eq("activo", true);
      
      const { data: allConfigs } = await query;
      if (!allConfigs || allConfigs.length === 0) {
        return new Response(JSON.stringify({ grouped_slots: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const configIds = allConfigs.map((c: any) => c.id);
      const { data: configProjects } = await supabase
        .from("configuracion_citas_proyectos")
        .select("id_configuracion_cita, id_proyecto")
        .in("id_configuracion_cita", configIds);

      const configProjectMap = new Map<number, number[]>();
      (configProjects || []).forEach((cp: any) => {
        if (!configProjectMap.has(cp.id_configuracion_cita)) configProjectMap.set(cp.id_configuracion_cita, []);
        configProjectMap.get(cp.id_configuracion_cita)!.push(cp.id_proyecto);
      });

      const matchingConfigs = allConfigs.filter((c: any) => {
        const projIds = configProjectMap.get(c.id) || [];
        if (proyectoIds.length === 0) return projIds.length > 0;
        return projIds.some((pid: number) => proyectoIds.includes(pid));
      });

      if (matchingConfigs.length === 0) {
        return new Response(JSON.stringify({ grouped_slots: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ownerEmails = [...new Set(matchingConfigs.map((c: any) => c.id_usuario_email))];
      const { data: ownerUsers } = await supabase
        .from("usuarios")
        .select("email, personas:id_persona(nombre_legal)")
        .in("email", ownerEmails);
      
      const ownerNameMap = new Map<string, string>();
      (ownerUsers || []).forEach((u: any) => {
        ownerNameMap.set(u.email, u.personas?.nombre_legal || u.email);
      });

      const groupedSlots: any[] = [];
      for (const cfg of matchingConfigs) {
        const cfgCalendarId = cfg.calendario_email || cfg.id_usuario_email;
        const cfgDuracion = cfg.duracion_minutos || 90;
        const cfgMaxInvitados = cfg.max_invitados || 1;
        try {
          const slots = await getAvailableSlots(
            token, body.fecha, cfgCalendarId, cfgDuracion,
            supabase, cfg.id_usuario_email, tipoCitaId, cfg.id, cfgMaxInvitados, excludePersonaId
          );
          groupedSlots.push({
            config_id: cfg.id,
            owner_email: cfg.id_usuario_email,
            owner_name: ownerNameMap.get(cfg.id_usuario_email) || cfg.id_usuario_email,
            cita_nombre: cfg.nombre,
            calendar_id: cfgCalendarId,
            duracion_minutos: cfgDuracion,
            available_slots: slots,
          });
        } catch (e: any) {
          console.error(`[check-availability-by-project] Error for ${cfg.id_usuario_email}: ${e.message}`);
        }
      }

      return new Response(JSON.stringify({ grouped_slots: groupedSlots }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: create-recurring-meets (DEPRECATED — no longer used) ----
    if (body.action === "create-recurring-meets") {
      return new Response(JSON.stringify({ success: true, message: "Deprecated: calendar events are now created only when a booking is made.", created_events: [], errors: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: check available slots (legacy, single calendar) ----
    if (body.action === "check-availability") {
      if (!body.fecha) {
        return new Response(JSON.stringify({ error: "Falta el campo 'fecha'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const slots = await getAvailableSlots(token, body.fecha, calendarId, duracionMinutos, supabase, calendarOwnerEmail, tipoCitaId);
      return new Response(JSON.stringify({ available_slots: slots, duracion_minutos: duracionMinutos }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: schedule (default) ----
    const { fecha, hora_inicio, id_persona, agent_email, direccion_showroom, latitud_showroom, longitud_showroom, config_id, id_persona_prospecto, id_agente, id_proyecto, notas } = body;

    if (!fecha || !hora_inicio || !id_persona) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios: fecha, hora_inicio, id_persona" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let scheduleCalendarOwner = body.calendar_owner_email || calendarOwnerEmail;
    let scheduleCalendarId = body.calendar_id || calendarId;
    let scheduleDuracion = duracionMinutos;
    let scheduleMaxInvitados = 1;
    let scheduleCorrEnt: string[] = [];
    let scheduleDescInv = "";

    let scheduleCitaNombre = "";
    if (config_id) {
      const { data: cfgData } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id_usuario_email, calendario_email, duracion_minutos, correos_enterado, correos_enterado_fijos, descripcion_invitacion, max_invitados, nombre, round_robin_enterados, round_robin_index")
        .eq("id", config_id)
        .eq("activo", true)
        .maybeSingle();
      if (cfgData) {
        scheduleCalendarOwner = cfgData.id_usuario_email;
        scheduleCalendarId = cfgData.calendario_email || cfgData.id_usuario_email;
        scheduleDuracion = cfgData.duracion_minutos || duracionMinutos;
        scheduleMaxInvitados = cfgData.max_invitados || 1;
        scheduleCorrEnt = cfgData.correos_enterado || [];
        scheduleDescInv = cfgData.descripcion_invitacion || "";
        scheduleCitaNombre = cfgData.nombre || "";

        // Round Robin: pick only one correo from non-fixed ones, always include fixed ones
        const correosFijos: string[] = cfgData.correos_enterado_fijos || [];
        if (cfgData.round_robin_enterados && scheduleCorrEnt.length >= 2) {
          const correosRotables = scheduleCorrEnt.filter((c: string) => !correosFijos.includes(c));
          if (correosRotables.length >= 2) {
            const rrIndex = (cfgData.round_robin_index || 0) % correosRotables.length;
            const selectedCorreo = correosRotables[rrIndex];
            console.log(`[schedule] Round Robin: picking correo ${rrIndex} = ${selectedCorreo} from ${correosRotables.length} rotables (${correosFijos.length} fijos siempre incluidos)`);
            scheduleCorrEnt = [...correosFijos, selectedCorreo];
            const nextIndex = (rrIndex + 1) % correosRotables.length;
            await supabase
              .from("configuracion_citas_usuarios")
              .update({ round_robin_index: nextIndex } as any)
              .eq("id", config_id);
          } else if (correosRotables.length === 1) {
            // Only 1 rotable + fijos = include all
            scheduleCorrEnt = [...new Set([...correosFijos, ...correosRotables])];
          } else {
            // All are fixed, include all
            scheduleCorrEnt = [...correosFijos];
          }
        }
      }
    } else if (userCitaConfig) {
      scheduleCorrEnt = userCitaConfig.correos_enterado || [];
      scheduleDescInv = userCitaConfig.descripcion_invitacion || "";
    }

    const [h, m] = hora_inicio.split(":").map(Number);
    const totalMin = h * 60 + m + scheduleDuracion;
    const horaFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

    // Check max_invitados capacity
    if (config_id) {
      const { data: existingBookings, error: bookErr } = await supabase
        .from("reservas_citas")
        .select("id")
        .eq("id_configuracion_cita", config_id)
        .eq("fecha", fecha)
        .eq("hora_inicio", hora_inicio + ":00")
        .eq("activo", true)
        .in("estatus", ["programada"])
        .neq("id_persona", id_persona); // Exclude self (re-scheduling)
      
      if (!bookErr && existingBookings && existingBookings.length >= scheduleMaxInvitados) {
        return new Response(JSON.stringify({ error: "no_disponible", message: "El horario ya tiene el máximo de invitados." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // For showroom appointments, look up existing citas by prospect + tipo_cita
    let oldCitaQuery = supabase
      .from("reservas_citas")
      .select("id, google_calendar_event_id")
      .eq("activo", true);
    
    if (id_persona_prospecto) {
      oldCitaQuery = oldCitaQuery.eq("id_persona_prospecto", id_persona_prospecto).eq("id_tipo_cita", 2);
    } else {
      oldCitaQuery = oldCitaQuery.eq("id_persona", id_persona);
    }
    
    const { data: oldCitas } = await oldCitaQuery;

    const existingEventId = oldCitas?.[0]?.google_calendar_event_id || undefined;
    const existingCitaId = oldCitas?.[0]?.id;

    // Check availability (only non-service-account events block)
    const available = await checkAvailability(token, fecha, hora_inicio, horaFin, scheduleCalendarId, existingEventId, supabase, scheduleCalendarOwner, tipoCitaId, config_id, scheduleMaxInvitados);
    if (!available) {
      return new Response(JSON.stringify({ error: "no_disponible", message: "El horario seleccionado no está disponible." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get agent name for description
    let agentName = "";
    const { data: personaData } = await supabase
      .from("personas")
      .select("nombre_legal, email")
      .eq("id", id_persona)
      .maybeSingle();
    agentName = personaData?.nombre_legal || "";
    const agentEmailFinal = agent_email || personaData?.email || "";

    // Use the config's nombre (e.g. "Capacitación Daiku") to find the recurring event
    let tipoCitaSummary = scheduleCitaNombre || "";
    if (!tipoCitaSummary) {
      const { data: tipoCitaInfo } = await supabase
        .from("tipos_cita")
        .select("nombre, descripcion")
        .eq("id", tipoCitaId)
        .maybeSingle();
      tipoCitaSummary = tipoCitaInfo?.descripcion || tipoCitaInfo?.nombre || "Cita";
    }

    // If re-scheduling, remove agent from old event's description
    if (existingEventId) {
      // We don't delete the recurring event, just remove the agent from description if possible
      try {
        const oldEvent = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(scheduleCalendarId)}/events/${encodeURIComponent(existingEventId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (oldEvent.ok) {
          const oldEvData = await oldEvent.json();
          let oldDesc = oldEvData.description || "";
          // Clear notas, asistentes, and agent info from old event description
          let cleanDesc = oldDesc
            .replace(/\n*Notas:.*(?:\n|$)/g, "")
            .replace(/\n*--- Asistentes ---[\s\S]*/g, "")
            .replace(/\n*--- Enterados ---[\s\S]*/g, "")
            .replace(/\n+$/, "");
          // Also remove attendees list from the event
          const oldAttendees = (oldEvData.attendees || []).filter(
            (a: any) => a.email !== agentEmailFinal
          );
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(scheduleCalendarId)}/events/${encodeURIComponent(existingEventId)}`,
            { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ description: cleanDesc, attendees: oldAttendees }) },
          );
          console.log(`[schedule] Cleaned old event ${existingEventId} description and attendees`);
        }
      } catch (e: any) {
        console.error(`[schedule] Error cleaning old event: ${e.message}`);
      }
    }

    // Always create a standalone event (no longer searching for recurring instances)
    let calendarEvent: any;
    console.log(`[schedule] Creating standalone event for ${fecha} ${hora_inicio}`);
    let summary = scheduleCitaNombre || tipoCitaSummary || "Capacitación";
    
    const bookingAttendees: { email: string }[] = [];
    if (agentEmailFinal) bookingAttendees.push({ email: agentEmailFinal });
    for (const cc of scheduleCorrEnt) {
      if (!bookingAttendees.some(a => a.email === cc)) bookingAttendees.push({ email: cc });
    }
    
    const notasSection = notas ? `\n\nNotas: ${notas}` : "";
    const desc = scheduleDescInv 
      ? `${scheduleDescInv}${notasSection}\n\n--- Asistentes ---\n• ${agentName ? `${agentName} (${agentEmailFinal})` : agentEmailFinal}`
      : `Cita agendada para: ${agentEmailFinal}${notasSection}\n\n--- Asistentes ---\n• ${agentName ? `${agentName} (${agentEmailFinal})` : agentEmailFinal}`;
    
    const eventLocation = direccion_showroom || undefined;
    calendarEvent = await createCalendarEvent(token, scheduleCalendarId, fecha, hora_inicio, horaFin, summary, agentEmailFinal, bookingAttendees, desc, eventLocation);

    let resultCita;
    const meetLink = calendarEvent.hangoutLink || null;

    if (existingCitaId) {
      const updatePayload: any = { 
        fecha, hora_inicio, hora_fin: horaFin, 
        google_calendar_event_id: calendarEvent.id, 
        google_meet_link: meetLink, 
        estatus: "programada",
        id_estatus_cita: 1,
        id_configuracion_cita: config_id || null,
      };
      if (notas !== undefined) updatePayload.notas = notas || null;
      if (id_persona_prospecto) updatePayload.id_persona_prospecto = id_persona_prospecto;
      if (id_agente) updatePayload.id_agente = id_agente;
      if (id_proyecto) updatePayload.id_proyecto = id_proyecto;

      const { data: updatedCita, error: updateError } = await supabase
        .from("reservas_citas")
        .update(updatePayload)
        .eq("id", existingCitaId)
        .select()
        .single();
      if (updateError) console.error("DB update error:", updateError);
      resultCita = updatedCita;
    } else {
      const insertPayload: any = { 
        id_tipo_cita: tipoCitaId || 1,
        id_persona, fecha, hora_inicio, hora_fin: horaFin, 
        ubicacion: "Presencial", estatus: "programada", 
        id_estatus_cita: 1,
        google_calendar_event_id: calendarEvent.id, 
        google_meet_link: meetLink,
        id_configuracion_cita: config_id || null,
      };
      if (notas) insertPayload.notas = notas;
      if (id_persona_prospecto) insertPayload.id_persona_prospecto = id_persona_prospecto;
      if (id_agente) insertPayload.id_agente = id_agente;
      if (id_proyecto) insertPayload.id_proyecto = id_proyecto;

      const { data: newCita, error: insertError } = await supabase
        .from("reservas_citas")
        .insert(insertPayload)
        .select()
        .single();
      if (insertError) console.error("DB insert error:", insertError);
      resultCita = newCita;
    }

    return new Response(JSON.stringify({ success: true, meet_link: meetLink, event_id: calendarEvent.id, cita: resultCita }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Error in agendar-capacitacion:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
