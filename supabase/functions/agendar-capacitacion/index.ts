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
  configId?: number
): Promise<string[]> {
  let configuredSlots: Set<string> | null = null;
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    if (dayOfWeek > 0) {
      let query = supabaseClient
        .from("configuracion_citas_horarios")
        .select("hora")
        .eq("activo", true);
      
      // Prefer filtering by config id if available
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
        // Check if any config exists at all
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

  const timeMin = `${fecha}T09:00:00-06:00`;
  const timeMax = `${fecha}T18:00:00-06:00`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

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

      if (configuredSlots) {
        const slotHourLabel = `${String(h).padStart(2, "0")}:00`;
        if (!configuredSlots.has(slotHourLabel)) continue;
      }

      const startMs = new Date(`${fecha}T${label}:00-06:00`).getTime();
      const endMs = startMs + duracionMinutos * 60 * 1000;
      if (!events.some((ev: any) => startMs < ev.end && endMs > ev.start)) {
        slots.push(label);
      }
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
  const timedEvents = (data.items || []).filter((e: any) => e.start?.dateTime && e.end?.dateTime && e.id !== excludeEventId);
  return timedEvents.length === 0;
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
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
  );
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403 || res.status === 404 || errText.includes("Not Found") || errText.includes("forbidden")) {
      throw new Error("No se tiene acceso al calendario. Verifique que la cuenta de servicio tenga permisos de 'Realizar cambios en eventos' en la configuración de compartir del Google Calendar.");
    }
    throw new Error(`Failed to create event: ${errText}`);
  }
  const created = await res.json();
  console.log(`[createEvent] Meet link: ${created.hangoutLink || 'none'}, attendees: ${event.attendees?.length || 0}`);
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
    // Returns slots grouped by calendar owner, filtered by project access
    if (body.action === "check-availability-by-project") {
      if (!body.fecha) {
        return new Response(JSON.stringify({ error: "Falta el campo 'fecha'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const proyectoIds: number[] = body.proyecto_ids || [];
      
      // Find all cita configs of tipoCitaId that have at least one project in common with proyectoIds
      let query = supabase
        .from("configuracion_citas_usuarios")
        .select("id, id_usuario_email, duracion_minutos, calendario_email, nombre")
        .eq("id_tipo_cita", tipoCitaId)
        .eq("activo", true);
      
      const { data: allConfigs } = await query;
      if (!allConfigs || allConfigs.length === 0) {
        return new Response(JSON.stringify({ grouped_slots: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // For each config, check if it has overlapping projects
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

      // Filter configs that have at least one project in common
      const matchingConfigs = allConfigs.filter((c: any) => {
        const projIds = configProjectMap.get(c.id) || [];
        if (proyectoIds.length === 0) return projIds.length > 0; // No filter = show all with projects
        return projIds.some((pid: number) => proyectoIds.includes(pid));
      });

      if (matchingConfigs.length === 0) {
        return new Response(JSON.stringify({ grouped_slots: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get owner names from usuarios table
      const ownerEmails = [...new Set(matchingConfigs.map((c: any) => c.id_usuario_email))];
      const { data: ownerUsers } = await supabase
        .from("usuarios")
        .select("email, personas:id_persona(nombre_legal)")
        .in("email", ownerEmails);
      
      const ownerNameMap = new Map<string, string>();
      (ownerUsers || []).forEach((u: any) => {
        ownerNameMap.set(u.email, u.personas?.nombre_legal || u.email);
      });

      // For each matching config, get available slots
      const groupedSlots: any[] = [];
      for (const cfg of matchingConfigs) {
        const cfgCalendarId = cfg.calendario_email || cfg.id_usuario_email;
        const cfgDuracion = cfg.duracion_minutos || 90;
        try {
          const slots = await getAvailableSlots(
            token, body.fecha, cfgCalendarId, cfgDuracion,
            supabase, cfg.id_usuario_email, tipoCitaId, cfg.id
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
      const { slots_config, fecha_fin, correos_enterado, descripcion_invitacion } = body;
      if (!slots_config || !fecha_fin) {
        return new Response(JSON.stringify({ error: "Faltan slots_config o fecha_fin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let tipoCitaDescripcion = "";
      const { data: tipoCitaData } = await supabase
        .from("tipos_cita")
        .select("nombre, descripcion")
        .eq("id", tipoCitaId)
        .maybeSingle();
      tipoCitaDescripcion = tipoCitaData?.descripcion || tipoCitaData?.nombre || "Cita";

      // Build event description from config
      const eventDescription = descripcion_invitacion || userCitaConfig?.descripcion_invitacion || "";

      // Build attendees from correos_enterado
      const attendees = (correos_enterado || userCitaConfig?.correos_enterado || []).map((email: string) => ({ email }));
      console.log(`[create-recurring-meets] Attendees to add: ${JSON.stringify(attendees)}`);

      const endDate = new Date(fecha_fin + "T23:59:59-06:00");
      const today = new Date();
      const createdEvents: any[] = [];
      const errors: string[] = [];

      // Fetch existing recurring events
      let existingRecurringEvents: any[] = [];
      try {
        const searchMin = new Date().toISOString();
        const searchMax = new Date(fecha_fin + "T23:59:59Z").toISOString();
        const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=false&maxResults=2500&q=${encodeURIComponent(tipoCitaDescripcion)}`;
        const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (listRes.ok) {
          const listData = await listRes.json();
          existingRecurringEvents = (listData.items || []).filter((e: any) => e.summary === tipoCitaDescripcion && e.recurrence);
          console.log(`[sync] Found ${existingRecurringEvents.length} existing recurring events with summary "${tipoCitaDescripcion}"`);
        }
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

      const usedExistingIds = new Set<string>();

      for (const desired of desiredEvents) {
        const matchIdx = existingRecurringEvents.findIndex((ev: any) => {
          if (usedExistingIds.has(ev.id)) return false;
          const rrule = (ev.recurrence || []).find((r: string) => r.includes("RRULE:"));
          return rrule && rrule.includes(`BYDAY=${desired.rruleDay}`);
        });

        if (matchIdx >= 0) {
          const existingEv = existingRecurringEvents[matchIdx];
          usedExistingIds.add(existingEv.id);
          const patchBody: any = {
            start: { dateTime: `${desired.fechaStr}T${desired.horaInicio}:00`, timeZone: "America/Mexico_City" },
            end: { dateTime: `${desired.fechaStr}T${desired.horaFin}:00`, timeZone: "America/Mexico_City" },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${desired.rruleDay};UNTIL=${untilStr}`],
          };
          if (eventDescription) {
            patchBody.description = eventDescription;
          }
          // Always send the full desired attendee list so removed correos_enterado are also removed from the event
          patchBody.attendees = [...attendees];
          try {
            const res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEv.id)}?sendUpdates=all`,
              { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(patchBody) },
            );
            if (!res.ok) {
              errors.push(`UPDATE ${desired.fechaStr} ${desired.horaInicio}: ${await res.text()}`);
            } else {
              const updated = await res.json();
              console.log(`[sync] Updated event ${existingEv.id} to ${desired.rruleDay} ${desired.horaInicio}`);
              createdEvents.push({ day: desired.day, hora: desired.hora, eventId: updated.id, meetLink: updated.hangoutLink || existingEv.hangoutLink || null, action: "updated" });
            }
          } catch (e: any) {
            errors.push(`UPDATE ${desired.fechaStr} ${desired.horaInicio}: ${e.message}`);
          }
        } else {
          const event: any = {
            summary: tipoCitaDescripcion,
            start: { dateTime: `${desired.fechaStr}T${desired.horaInicio}:00`, timeZone: "America/Mexico_City" },
            end: { dateTime: `${desired.fechaStr}T${desired.horaFin}:00`, timeZone: "America/Mexico_City" },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${desired.rruleDay};UNTIL=${untilStr}`],
          };

          if (eventDescription) {
            event.description = eventDescription;
          }

          // Add correos_enterado as attendees
          if (attendees.length > 0) {
            event.attendees = [...attendees];
          }

          let createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
          event.conferenceData = {
            createRequest: {
              requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          };

          try {
            let res = await fetch(createUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(event),
            });

            if (!res.ok) {
              const errText = await res.text();
              if (res.status === 400 && errText.includes("Invalid conference type")) {
                console.log(`[sync] Meet not supported on this calendar, creating event without conferenceData`);
                delete event.conferenceData;
                res = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
                  { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
                );
                if (!res.ok) {
                  const errText2 = await res.text();
                  if (res.status === 403 || res.status === 404) {
                    return new Response(JSON.stringify({ error: "No se tiene acceso al calendario. Verifique que la cuenta de servicio tenga permisos de 'Realizar cambios en eventos' en la configuración de compartir del Google Calendar." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                  }
                  errors.push(`CREATE ${desired.fechaStr} ${desired.horaInicio}: ${errText2}`);
                  continue;
                }
              } else if (res.status === 403 || res.status === 404) {
                return new Response(JSON.stringify({ error: "No se tiene acceso al calendario. Verifique que la cuenta de servicio tenga permisos de 'Realizar cambios en eventos' en la configuración de compartir del Google Calendar." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              } else {
                errors.push(`CREATE ${desired.fechaStr} ${desired.horaInicio}: ${errText}`);
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

      // Delete unmatched existing events
      for (const ev of existingRecurringEvents) {
        if (!usedExistingIds.has(ev.id)) {
          console.log(`[sync] Deleting unmatched event ${ev.id}`);
          await deleteCalendarEvent(token, calendarId, ev.id);
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

    // Resolve calendar from config_id if provided
    let scheduleCalendarOwner = body.calendar_owner_email || calendarOwnerEmail;
    let scheduleCalendarId = body.calendar_id || calendarId;
    let scheduleDuracion = duracionMinutos;

    if (config_id) {
      const { data: cfgData } = await supabase
        .from("configuracion_citas_usuarios")
        .select("id_usuario_email, calendario_email, duracion_minutos, correos_enterado, descripcion_invitacion")
        .eq("id", config_id)
        .eq("activo", true)
        .maybeSingle();
      if (cfgData) {
        scheduleCalendarOwner = cfgData.id_usuario_email;
        scheduleCalendarId = cfgData.calendario_email || cfgData.id_usuario_email;
        scheduleDuracion = cfgData.duracion_minutos || duracionMinutos;
      }
    }

    const [h, m] = hora_inicio.split(":").map(Number);
    const totalMin = h * 60 + m + scheduleDuracion;
    const horaFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

    const { data: oldCitas } = await supabase
      .from("citas_capacitacion")
      .select("id, google_calendar_event_id")
      .eq("id_persona", id_persona)
      .eq("activo", true);

    const existingEventId = oldCitas?.[0]?.google_calendar_event_id || undefined;
    const existingCitaId = oldCitas?.[0]?.id;

    const available = await checkAvailability(token, fecha, hora_inicio, horaFin, scheduleCalendarId, existingEventId, supabase, scheduleCalendarOwner, tipoCitaId);
    if (!available) {
      return new Response(JSON.stringify({ error: "no_disponible", message: "El horario seleccionado no está disponible." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let summary = "Capacitación de Sozu para uso de herramienta.";
    if (direccion_showroom && latitud_showroom && longitud_showroom) {
      summary += ` En la direccion: ${direccion_showroom} con la ubicacion ${latitud_showroom},${longitud_showroom}`;
    }

    if (existingEventId) {
      await deleteCalendarEvent(token, scheduleCalendarId, existingEventId);
    }

    // Build attendees from config correos_enterado for single booking
    let bookingAttendees: { email: string }[] = [];
    let bookingDescription: string | undefined;
    if (config_id) {
      const { data: cfgForAttendees } = await supabase
        .from("configuracion_citas_usuarios")
        .select("correos_enterado, descripcion_invitacion")
        .eq("id", config_id)
        .maybeSingle();
      if (cfgForAttendees?.correos_enterado) {
        bookingAttendees = cfgForAttendees.correos_enterado.map((email: string) => ({ email }));
      }
      if (cfgForAttendees?.descripcion_invitacion) {
        bookingDescription = cfgForAttendees.descripcion_invitacion;
      }
    } else if (userCitaConfig?.correos_enterado) {
      bookingAttendees = userCitaConfig.correos_enterado.map((email: string) => ({ email }));
      bookingDescription = userCitaConfig.descripcion_invitacion || undefined;
    }

    const calendarEvent = await createCalendarEvent(token, scheduleCalendarId, fecha, hora_inicio, horaFin, summary, agent_email || "", bookingAttendees, bookingDescription);

    let resultCita;
    const meetLink = calendarEvent.hangoutLink || null;

    if (existingCitaId) {
      const { data: updatedCita, error: updateError } = await supabase
        .from("citas_capacitacion")
        .update({ fecha, hora_inicio, hora_fin: horaFin, google_calendar_event_id: calendarEvent.id, google_meet_link: meetLink, estatus: "programada" })
        .eq("id", existingCitaId)
        .select()
        .single();
      if (updateError) console.error("DB update error:", updateError);
      resultCita = updatedCita;
    } else {
      const { data: newCita, error: insertError } = await supabase
        .from("citas_capacitacion")
        .insert({ id_persona, fecha, hora_inicio, hora_fin: horaFin, ubicacion: "Presencial", estatus: "programada", google_calendar_event_id: calendarEvent.id, google_meet_link: meetLink })
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
