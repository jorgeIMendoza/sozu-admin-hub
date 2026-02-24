import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SERVICE_ACCOUNT_EMAIL = "cuenta-conexiones-drive@sozu-38755.iam.gserviceaccount.com";

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
    if (dayOfWeek > 0) {
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

  const timeMin = `${fecha}T09:00:00-06:00`;
  const timeMax = `${fecha}T18:00:00-06:00`;
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

  const slots: string[] = [];
  for (let h = 9; h <= 16; h++) {
    for (const m of [0, 30]) {
      if (h === 16 && m > 30) continue;
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
  calendarOwnerEmail?: string, tipoCitaId?: number
): Promise<boolean> {
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    if (dayOfWeek > 0) {
      const checkQuery = supabaseClient
        .from("configuracion_citas_horarios")
        .select("id")
        .eq("id_usuario_email", calendarOwnerEmail)
        .eq("activo", true)
        .limit(1);
      if (tipoCitaId) checkQuery.eq("id_tipo_cita", tipoCitaId);
      const { data: anyConfig } = await checkQuery;

      if (anyConfig && anyConfig.length > 0) {
        const horaNum = parseInt(horaInicio.split(":")[0]);
        const slotQuery = supabaseClient
          .from("configuracion_citas_horarios")
          .select("id")
          .eq("id_usuario_email", calendarOwnerEmail)
          .eq("dia_semana", dayOfWeek)
          .eq("hora", horaNum)
          .eq("activo", true)
          .limit(1);
        if (tipoCitaId) slotQuery.eq("id_tipo_cita", tipoCitaId);
        const { data: slotConfig } = await slotQuery;

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
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Calendar API error: ${await res.text()}`);
  const data = await res.json();
  
  // Only count non-service-account events as blocking
  const blockingEvents = (data.items || []).filter((e: any) => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false;
    if (e.id === excludeEventId) return false;
    const isServiceAccount = e.creator?.email === SERVICE_ACCOUNT_EMAIL || e.organizer?.email === SERVICE_ACCOUNT_EMAIL;
    return !isServiceAccount;
  });
  
  return blockingEvents.length === 0;
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
  correos_enterado: string[]
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

async function createCalendarEvent(token: string, calendarId: string, fecha: string, horaInicio: string, horaFin: string, summary: string, agentEmail: string, attendees?: { email: string }[], description?: string) {
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
    const token = await getAccessToken(sa);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tipoCitaId = body.tipo_cita_id || 1;
    const calendarOwnerEmail = body.calendar_owner_email || "jorge.mendoza@sozu.com";

    // Fetch dynamic config
    const userCitaConfig = await getUserCitaConfig(supabase, calendarOwnerEmail, tipoCitaId);
    const duracionMinutos = body.duracion_minutos || userCitaConfig?.duracion_minutos || 90;
    const calendarId = userCitaConfig?.calendario_email || calendarOwnerEmail;

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

    // ---- Action: create recurring meets ----
    if (body.action === "create-recurring-meets") {
      const { slots_config, fecha_fin, correos_enterado, descripcion_invitacion, config_id: bodyConfigId } = body;
      if (!slots_config || !fecha_fin) {
        return new Response(JSON.stringify({ error: "Faltan slots_config o fecha_fin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Use the config's nombre (e.g. "Capacitación Daiku") as the event summary
      let tipoCitaDescripcion = body.nombre_cita || "";
      if (!tipoCitaDescripcion) {
        const userCfg = await getUserCitaConfig(supabase, calendarOwnerEmail, tipoCitaId);
        tipoCitaDescripcion = userCfg?.nombre || "";
      }
      if (!tipoCitaDescripcion) {
        const { data: tipoCitaData } = await supabase
          .from("tipos_cita")
          .select("nombre, descripcion")
          .eq("id", tipoCitaId)
          .maybeSingle();
        tipoCitaDescripcion = tipoCitaData?.descripcion || tipoCitaData?.nombre || "Cita";
      }

      const eventDescription = descripcion_invitacion || userCitaConfig?.descripcion_invitacion || "";
      const attendees = (correos_enterado || userCitaConfig?.correos_enterado || []).map((email: string) => ({ email }));
      console.log(`[create-recurring-meets] Summary: "${tipoCitaDescripcion}", Attendees: ${JSON.stringify(attendees)}, CalendarId: ${calendarId}, ConfigId: ${bodyConfigId}`);

      const endDate = new Date(fecha_fin + "T23:59:59-06:00");
      const today = new Date();
      const createdEvents: any[] = [];
      const errors: string[] = [];

      // --- Step 1: Check stored events in DB and detect deleted ones ---
      let storedEvents: any[] = [];
      if (bodyConfigId) {
        const { data: stored } = await supabase
          .from("citas_calendar_events")
          .select("*")
          .eq("id_configuracion_cita", bodyConfigId)
          .eq("activo", true);
        storedEvents = stored || [];
        console.log(`[sync] ${storedEvents.length} stored event references in DB for config ${bodyConfigId}`);
      }

      // Check each stored event against Google Calendar
      const deletedEvents: any[] = [];
      const existingStoredEvents: any[] = [];
      for (const se of storedEvents) {
        try {
          const checkRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(se.calendar_email)}/events/${encodeURIComponent(se.google_event_id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (checkRes.status === 404 || checkRes.status === 410) {
            console.log(`[sync] Stored event ${se.google_event_id} for ${se.fecha} hora ${se.hora} was DELETED from Calendar`);
            deletedEvents.push(se);
          } else if (checkRes.ok) {
            const evData = await checkRes.json();
            if (evData.status === "cancelled") {
              console.log(`[sync] Stored event ${se.google_event_id} for ${se.fecha} hora ${se.hora} was CANCELLED`);
              deletedEvents.push(se);
            } else {
              existingStoredEvents.push({ ...se, calendarData: evData });
            }
          } else {
            const txt = await checkRes.text();
            console.error(`[sync] Error checking event ${se.google_event_id}: ${checkRes.status} ${txt}`);
            existingStoredEvents.push(se);
          }
        } catch (e: any) {
          console.error(`[sync] Error checking stored event: ${e.message}`);
          existingStoredEvents.push(se);
        }
      }

      // --- Step 2: Update existing stored events with new config ---
      for (const se of existingStoredEvents) {
        if (!se.calendarData) continue;
        const patchBody: any = { summary: tipoCitaDescripcion };
        if (eventDescription) patchBody.description = eventDescription;
        patchBody.attendees = [...attendees];

        try {
          let res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(se.calendar_email)}/events/${encodeURIComponent(se.google_event_id)}?sendUpdates=all`,
            { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
          );
          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
              delete patchBody.attendees;
              res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(se.calendar_email)}/events/${encodeURIComponent(se.google_event_id)}?sendUpdates=all`,
                { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
              );
            }
            if (!res.ok) {
              console.error(`[sync] Failed to update stored event ${se.google_event_id}: ${await res.text()}`);
            } else {
              const updated = await res.json();
              createdEvents.push({ day: new Date(se.fecha + "T12:00:00").getDay(), hora: `${String(se.hora).padStart(2, "0")}:00`, eventId: updated.id, action: "updated" });
            }
          } else {
            const updated = await res.json();
            createdEvents.push({ day: new Date(se.fecha + "T12:00:00").getDay(), hora: `${String(se.hora).padStart(2, "0")}:00`, eventId: updated.id, action: "updated" });
          }
        } catch (e: any) {
          errors.push(`UPDATE stored ${se.fecha} ${se.hora}: ${e.message}`);
        }
      }

      // --- Step 3: Regenerate deleted events ---
      for (const de of deletedEvents) {
        const eventDate = de.fecha;
        const eventDateObj = new Date(eventDate + "T12:00:00");
        if (eventDateObj < today) {
          console.log(`[sync] Skipping regeneration of past event ${de.fecha}`);
          // Mark as inactive in DB
          await supabase.from("citas_calendar_events").update({ activo: false }).eq("id", de.id);
          continue;
        }
        if (eventDateObj > endDate) {
          console.log(`[sync] Skipping regeneration of event beyond fecha_fin: ${de.fecha}`);
          await supabase.from("citas_calendar_events").update({ activo: false }).eq("id", de.id);
          continue;
        }

        const horaStr = `${String(de.hora).padStart(2, "0")}:00`;
        const totalMinEnd = de.hora * 60 + duracionMinutos;
        const horaFin = `${String(Math.floor(totalMinEnd / 60) % 24).padStart(2, "0")}:${String(totalMinEnd % 60).padStart(2, "0")}`;

        const event: any = {
          summary: tipoCitaDescripcion,
          start: { dateTime: `${eventDate}T${horaStr}:00`, timeZone: "America/Mexico_City" },
          end: { dateTime: `${eventDate}T${horaFin}:00`, timeZone: "America/Mexico_City" },
        };
        if (eventDescription) event.description = eventDescription;
        if (attendees.length > 0) event.attendees = [...attendees];
        event.conferenceData = {
          createRequest: {
            requestId: `meet-regen-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };

        try {
          let res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
            { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
          );
          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
              delete event.attendees;
              res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
                { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
              );
            }
            if (!res.ok && res.status === 400) {
              delete event.conferenceData;
              res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
                { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
              );
            }
            if (!res.ok) {
              errors.push(`REGEN ${eventDate} ${horaStr}: ${await res.text()}`);
              continue;
            }
          }
          const created = await res.json();
          console.log(`[sync] Regenerated event for ${eventDate} ${horaStr}: ${created.id}`);
          createdEvents.push({ day: eventDateObj.getDay(), hora: horaStr, eventId: created.id, meetLink: created.hangoutLink || null, action: "regenerated" });

          // Update DB record with new event ID
          await supabase.from("citas_calendar_events")
            .update({ google_event_id: created.id, activo: true, fecha_actualizacion: new Date().toISOString() })
            .eq("id", de.id);
        } catch (e: any) {
          errors.push(`REGEN ${eventDate} ${horaStr}: ${e.message}`);
        }
      }

      // --- Step 4: Create NEW recurring events for slots not covered by stored events ---
      const searchMin = new Date().toISOString();
      const searchMax = new Date(fecha_fin + "T23:59:59Z").toISOString();

      let existingRecurringEvents: any[] = [];
      try {
        existingRecurringEvents = await findExistingEventsByServiceAccount(
          token, calendarId, tipoCitaDescripcion, searchMin, searchMax
        );
        existingRecurringEvents = existingRecurringEvents.filter((e: any) => e.recurrence);
        console.log(`[sync] ${existingRecurringEvents.length} existing recurring events created by service account`);
      } catch (e: any) {
        console.error("[sync] Error fetching existing events:", e.message);
      }

      const rruleDays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      const untilStr = `${fecha_fin.replace(/-/g, "")}T235959Z`;
      const desiredEvents: { day: number; hora: string; targetJsDay: number; fechaStr: string; horaInicio: string; horaFin: string; rruleDay: string }[] = [];

      for (const slotGroup of slots_config) {
        const { dia_semana, horas } = slotGroup;
        for (const hora of horas) {
          const [h, m] = hora.split(":").map(Number);
          let nextDate = new Date(today);
          const targetJsDay = dia_semana === 0 ? 0 : dia_semana;
          while (nextDate.getDay() !== targetJsDay) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          if (nextDate.toDateString() === today.toDateString()) {
            if (today.getHours() >= h) nextDate.setDate(nextDate.getDate() + 7);
          }
          if (nextDate > endDate) continue;

          const fechaStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
          const totalMinEnd = h * 60 + m + duracionMinutos;
          const horaFin = `${String(Math.floor(totalMinEnd / 60) % 24).padStart(2, "0")}:${String(totalMinEnd % 60).padStart(2, "0")}`;
          const rruleDay = rruleDays[targetJsDay];

          desiredEvents.push({ day: dia_semana, hora, targetJsDay, fechaStr, horaInicio: hora, horaFin, rruleDay });
        }
      }

      // Filter out desired events that already have stored (non-deleted) DB records
      const coveredByStored = new Set(
        existingStoredEvents.map((se: any) => `${se.fecha}_${se.hora}`)
      );

      const usedExistingIds = new Set<string>();

      for (const desired of desiredEvents) {
        // Check if this slot is already covered by a stored event that still exists
        // We need to check all dates this recurring event would produce
        const desiredKey = `${desired.fechaStr}_${parseInt(desired.horaInicio)}`;
        if (coveredByStored.has(desiredKey)) {
          console.log(`[sync] Slot ${desired.fechaStr} ${desired.horaInicio} already covered by stored event`);
          continue;
        }

        const matchIdx = existingRecurringEvents.findIndex((ev: any) => {
          if (usedExistingIds.has(ev.id)) return false;
          const rrule = (ev.recurrence || []).find((r: string) => r.includes("RRULE:"));
          return rrule && rrule.includes(`BYDAY=${desired.rruleDay}`);
        });

        if (matchIdx >= 0) {
          const existingEv = existingRecurringEvents[matchIdx];
          usedExistingIds.add(existingEv.id);
          const patchBody: any = {
            summary: tipoCitaDescripcion,
            start: { dateTime: `${desired.fechaStr}T${desired.horaInicio}:00`, timeZone: "America/Mexico_City" },
            end: { dateTime: `${desired.fechaStr}T${desired.horaFin}:00`, timeZone: "America/Mexico_City" },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${desired.rruleDay};UNTIL=${untilStr}`],
          };
          if (eventDescription) patchBody.description = eventDescription;
          patchBody.attendees = [...attendees];

          try {
            let res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEv.id)}?sendUpdates=all`,
              { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
            );
            if (!res.ok) {
              const errText = await res.text();
              if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
                delete patchBody.attendees;
                res = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEv.id)}?sendUpdates=all`,
                  { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
                );
                if (!res.ok) {
                  errors.push(`UPDATE ${desired.fechaStr} ${desired.horaInicio}: ${await res.text()}`);
                } else {
                  const updated = await res.json();
                  createdEvents.push({ day: desired.day, hora: desired.hora, eventId: updated.id, meetLink: updated.hangoutLink || existingEv.hangoutLink || null, action: "updated" });
                }
              } else {
                errors.push(`UPDATE ${desired.fechaStr} ${desired.horaInicio}: ${errText}`);
              }
            } else {
              const updated = await res.json();
              createdEvents.push({ day: desired.day, hora: desired.hora, eventId: updated.id, meetLink: updated.hangoutLink || existingEv.hangoutLink || null, action: "updated" });
            }
          } catch (e: any) {
            errors.push(`UPDATE ${desired.fechaStr} ${desired.horaInicio}: ${e.message}`);
          }
        } else {
          // CREATE new event
          const event: any = {
            summary: tipoCitaDescripcion,
            start: { dateTime: `${desired.fechaStr}T${desired.horaInicio}:00`, timeZone: "America/Mexico_City" },
            end: { dateTime: `${desired.fechaStr}T${desired.horaFin}:00`, timeZone: "America/Mexico_City" },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${desired.rruleDay};UNTIL=${untilStr}`],
          };
          if (eventDescription) event.description = eventDescription;
          if (attendees.length > 0) event.attendees = [...attendees];
          event.conferenceData = {
            createRequest: {
              requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          };

          try {
            let res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
              { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
            );
            if (!res.ok) {
              const errText = await res.text();
              if (res.status === 403 && errText.includes("forbiddenForServiceAccounts")) {
                delete event.attendees;
                res = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
                  { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
                );
                if (!res.ok) {
                  const errText2 = await res.text();
                  if (res.status === 400 && errText2.includes("Invalid conference type")) {
                    delete event.conferenceData;
                    res = await fetch(
                      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
                      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
                    );
                  }
                }
              } else if (res.status === 400 && errText.includes("Invalid conference type")) {
                delete event.conferenceData;
                res = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
                  { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
                );
                if (!res.ok) {
                  const errText2 = await res.text();
                  if (res.status === 403 && errText2.includes("forbiddenForServiceAccounts")) {
                    delete event.attendees;
                    res = await fetch(
                      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
                      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
                    );
                  }
                }
              }
              if (!res.ok) {
                const finalErr = await res.text();
                errors.push(`CREATE ${desired.fechaStr} ${desired.horaInicio}: ${finalErr}`);
                continue;
              }
            }
            const created = await res.json();
            createdEvents.push({ day: desired.day, hora: desired.hora, eventId: created.id, meetLink: created.hangoutLink || null, action: "created" });
          } catch (e: any) {
            errors.push(`CREATE ${desired.fechaStr} ${desired.horaInicio}: ${e.message}`);
          }
        }
      }

      // Delete unmatched existing recurring events
      for (const ev of existingRecurringEvents) {
        if (!usedExistingIds.has(ev.id)) {
          console.log(`[sync] Deleting unmatched event ${ev.id}`);
          await deleteCalendarEvent(token, calendarId, ev.id);
        }
      }

      // --- Step 5: Expand all recurring events to instances and store in DB ---
      if (bodyConfigId) {
        try {
          const instancesTimeMin = new Date().toISOString();
          const instancesTimeMax = new Date(fecha_fin + "T23:59:59Z").toISOString();
          
          // Collect all event IDs (both recurring and standalone) that we created/updated
          const allEventIds = new Set<string>();
          for (const ce of createdEvents) {
            if (ce.eventId) allEventIds.add(ce.eventId);
          }
          // Also include existing stored events that are still valid
          for (const se of existingStoredEvents) {
            allEventIds.add(se.google_event_id);
          }

          // List all events by service account in the date range
          const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(instancesTimeMin)}&timeMax=${encodeURIComponent(instancesTimeMax)}&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(tipoCitaDescripcion)}&maxResults=2500`;
          const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
          
          if (listRes.ok) {
            const listData = await listRes.json();
            const instances = (listData.items || []).filter((e: any) => {
              const matchesSummary = e.summary === tipoCitaDescripcion;
              const isServiceAccount = e.creator?.email === SERVICE_ACCOUNT_EMAIL || e.organizer?.email === SERVICE_ACCOUNT_EMAIL;
              return matchesSummary && isServiceAccount && e.start?.dateTime;
            });

            console.log(`[sync] Found ${instances.length} expanded instances to store in DB`);

            const upsertRows = instances.map((inst: any) => {
              const dtMatch = inst.start.dateTime.match(/(\d{4}-\d{2}-\d{2})T(\d{2})/);
              return {
                id_configuracion_cita: bodyConfigId,
                google_event_id: inst.id,
                fecha: dtMatch ? dtMatch[1] : inst.start.dateTime.slice(0, 10),
                hora: dtMatch ? parseInt(dtMatch[2]) : 0,
                calendar_email: calendarId,
                activo: true,
                fecha_actualizacion: new Date().toISOString(),
              };
            });

            if (upsertRows.length > 0) {
              const { error: upsertErr } = await supabase
                .from("citas_calendar_events")
                .upsert(upsertRows, { onConflict: "id_configuracion_cita,fecha,hora" });
              if (upsertErr) {
                console.error(`[sync] Error upserting event references: ${JSON.stringify(upsertErr)}`);
              } else {
                console.log(`[sync] Stored ${upsertRows.length} event references in DB`);
              }
            }
          }
        } catch (e: any) {
          console.error(`[sync] Error expanding instances: ${e.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, created_events: createdEvents, errors }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const { fecha, hora_inicio, id_persona, agent_email, direccion_showroom, latitud_showroom, longitud_showroom, config_id } = body;

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
        .select("id_usuario_email, calendario_email, duracion_minutos, correos_enterado, descripcion_invitacion, max_invitados, nombre")
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

    const { data: oldCitas } = await supabase
      .from("reservas_citas")
      .select("id, google_calendar_event_id")
      .eq("id_persona", id_persona)
      .eq("activo", true);

    const existingEventId = oldCitas?.[0]?.google_calendar_event_id || undefined;
    const existingCitaId = oldCitas?.[0]?.id;

    // Check availability (only non-service-account events block)
    const available = await checkAvailability(token, fecha, hora_inicio, horaFin, scheduleCalendarId, existingEventId, supabase, scheduleCalendarOwner, tipoCitaId);
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
          // Remove the agent line from description
          if (agentEmailFinal && oldDesc.includes(agentEmailFinal)) {
            const lines = oldDesc.split("\n").filter((l: string) => !l.includes(agentEmailFinal));
            const newDesc = lines.join("\n").replace(/\n+$/, "");
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(scheduleCalendarId)}/events/${encodeURIComponent(existingEventId)}`,
              { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ description: newDesc }) },
            );
            console.log(`[schedule] Removed agent from old event ${existingEventId} description`);
          }
        }
      } catch (e: any) {
        console.error(`[schedule] Error cleaning old event: ${e.message}`);
      }
    }

    // Try to find existing recurring event instance for this date/time
    let existingInstance = await findRecurringEventInstance(token, scheduleCalendarId, tipoCitaSummary, fecha, hora_inicio, scheduleDuracion);
    
    // Fallback: try with tipos_cita name if config name didn't match (old events may use generic name)
    if (!existingInstance && scheduleCitaNombre) {
      const { data: tipoCitaFallback } = await supabase
        .from("tipos_cita")
        .select("nombre, descripcion")
        .eq("id", tipoCitaId)
        .maybeSingle();
      const fallbackSummary = tipoCitaFallback?.descripcion || tipoCitaFallback?.nombre || "";
      if (fallbackSummary && fallbackSummary !== tipoCitaSummary) {
        console.log(`[schedule] Trying fallback summary: "${fallbackSummary}"`);
        existingInstance = await findRecurringEventInstance(token, scheduleCalendarId, fallbackSummary, fecha, hora_inicio, scheduleDuracion);
      }
    }
    
    let calendarEvent: any;
    
    if (existingInstance) {
      // PATCH the existing instance to add the agent as attendee
      console.log(`[schedule] Found existing event instance ${existingInstance.id}, patching to add attendee ${agentEmailFinal}`);
      calendarEvent = await patchEventWithAttendee(
        token, scheduleCalendarId, existingInstance.id,
        agentEmailFinal, agentName,
        existingInstance.attendees || [],
        existingInstance.description || scheduleDescInv || "",
        scheduleCorrEnt
      );
    } else {
      // No recurring event found, create a standalone event
      console.log(`[schedule] No existing event instance found, creating new event`);
      let summary = scheduleCitaNombre || tipoCitaSummary || "Capacitación";
      if (direccion_showroom && latitud_showroom && longitud_showroom) {
        summary += ` — ${direccion_showroom}`;
      }
      
      const bookingAttendees: { email: string }[] = [];
      if (agentEmailFinal) bookingAttendees.push({ email: agentEmailFinal });
      for (const cc of scheduleCorrEnt) {
        if (!bookingAttendees.some(a => a.email === cc)) bookingAttendees.push({ email: cc });
      }
      
      const desc = scheduleDescInv 
        ? `${scheduleDescInv}\n\n--- Asistentes ---\n• ${agentName ? `${agentName} (${agentEmailFinal})` : agentEmailFinal}`
        : `Capacitación agendada para: ${agentEmailFinal}\n\n--- Asistentes ---\n• ${agentName ? `${agentName} (${agentEmailFinal})` : agentEmailFinal}`;
      
      calendarEvent = await createCalendarEvent(token, scheduleCalendarId, fecha, hora_inicio, horaFin, summary, agentEmailFinal, bookingAttendees, desc);
    }

    let resultCita;
    const meetLink = calendarEvent.hangoutLink || null;

    if (existingCitaId) {
      const { data: updatedCita, error: updateError } = await supabase
        .from("reservas_citas")
        .update({ 
          fecha, hora_inicio, hora_fin: horaFin, 
          google_calendar_event_id: calendarEvent.id, 
          google_meet_link: meetLink, 
          estatus: "programada",
          id_configuracion_cita: config_id || null,
        })
        .eq("id", existingCitaId)
        .select()
        .single();
      if (updateError) console.error("DB update error:", updateError);
      resultCita = updatedCita;
    } else {
      const { data: newCita, error: insertError } = await supabase
        .from("reservas_citas")
        .insert({ 
          id_tipo_cita: tipoCitaId || 1,
          id_persona, fecha, hora_inicio, hora_fin: horaFin, 
          ubicacion: "Presencial", estatus: "programada", 
          google_calendar_event_id: calendarEvent.id, 
          google_meet_link: meetLink,
          id_configuracion_cita: config_id || null,
        })
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
