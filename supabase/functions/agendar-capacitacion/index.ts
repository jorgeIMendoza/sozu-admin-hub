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
    .select("duracion_minutos, calendario_email")
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
  supabaseClient?: any, calendarOwnerEmail?: string, tipoCitaId?: number
): Promise<string[]> {
  let configuredSlots: Set<string> | null = null;
  if (supabaseClient && calendarOwnerEmail) {
    const dayOfWeek = getDayOfWeek(fecha);
    if (dayOfWeek > 0) {
      const query = supabaseClient
        .from("configuracion_citas_horarios")
        .select("hora")
        .eq("id_usuario_email", calendarOwnerEmail)
        .eq("dia_semana", dayOfWeek)
        .eq("activo", true);
      if (tipoCitaId) query.eq("id_tipo_cita", tipoCitaId);

      const { data: configData } = await query;

      if (configData && configData.length > 0) {
        configuredSlots = new Set(configData.map((c: any) => `${String(c.hora).padStart(2, "0")}:00`));
        console.log(`[availability] Configured slots for ${calendarOwnerEmail} on day ${dayOfWeek}:`, Array.from(configuredSlots));
      } else {
        const checkQuery = supabaseClient
          .from("configuracion_citas_horarios")
          .select("id")
          .eq("id_usuario_email", calendarOwnerEmail)
          .eq("activo", true)
          .limit(1);
        if (tipoCitaId) checkQuery.eq("id_tipo_cita", tipoCitaId);
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

async function createCalendarEvent(token: string, calendarId: string, fecha: string, horaInicio: string, horaFin: string, summary: string, agentEmail: string) {
  const event = {
    summary,
    start: { dateTime: `${fecha}T${horaInicio}:00`, timeZone: "America/Mexico_City" },
    end: { dateTime: `${fecha}T${horaFin}:00`, timeZone: "America/Mexico_City" },
    description: `Capacitación agendada para: ${agentEmail}`,
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
  );
  if (!res.ok) {
    const errText = await res.text();
    // Detect permission errors and return a friendly message
    if (res.status === 403 || res.status === 404 || errText.includes("Not Found") || errText.includes("forbidden")) {
      throw new Error("No se tiene acceso al calendario. Verifique que la cuenta de servicio tenga permisos de 'Realizar cambios en eventos' en la configuración de compartir del Google Calendar.");
    }
    throw new Error(`Failed to create event: ${errText}`);
  }
  const created = await res.json();
  console.log(`[createEvent] Meet link: ${created.hangoutLink || 'none'}`);
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

    // Determine calendar owner email and tipo cita
    // Default tipo_cita = 1 (Capacitación) for backwards compatibility
    const tipoCitaId = body.tipo_cita_id || 1;
    const calendarOwnerEmail = body.calendar_owner_email || "jorge.mendoza@sozu.com";

    // Fetch dynamic config
    const userCitaConfig = await getUserCitaConfig(supabase, calendarOwnerEmail, tipoCitaId);
    const duracionMinutos = userCitaConfig?.duracion_minutos || 90;
    const calendarId = userCitaConfig?.calendario_email || calendarOwnerEmail;

    // ---- Action: create recurring meets ----
    if (body.action === "create-recurring-meets") {
      const { slots_config, fecha_fin } = body;
      // slots_config: Array<{ dia_semana: number, horas: string[] }>
      // fecha_fin: "YYYY-MM-DD"
      if (!slots_config || !fecha_fin) {
        return new Response(JSON.stringify({ error: "Faltan slots_config o fecha_fin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch tipo_cita description for event summary
      let tipoCitaDescripcion = "";
      const { data: tipoCitaData } = await supabase
        .from("tipos_cita")
        .select("nombre, descripcion")
        .eq("id", tipoCitaId)
        .maybeSingle();
      tipoCitaDescripcion = tipoCitaData?.descripcion || tipoCitaData?.nombre || "Cita";

      const endDate = new Date(fecha_fin + "T23:59:59-06:00");
      const today = new Date();
      const createdEvents: any[] = [];
      const errors: string[] = [];

      // --- Delete existing recurring events with same summary ---
      try {
        const searchMin = new Date().toISOString();
        const searchMax = new Date(fecha_fin + "T23:59:59Z").toISOString();
        const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=false&maxResults=2500&q=${encodeURIComponent(tipoCitaDescripcion)}`;
        const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (listRes.ok) {
          const listData = await listRes.json();
          const matchingEvents = (listData.items || []).filter((e: any) => e.summary === tipoCitaDescripcion && e.recurrence);
          console.log(`[sync] Found ${matchingEvents.length} existing recurring events with summary "${tipoCitaDescripcion}" to delete`);
          for (const ev of matchingEvents) {
            await deleteCalendarEvent(token, calendarId, ev.id);
          }
        }
      } catch (e: any) {
        console.error("[sync] Error cleaning old events:", e.message);
      }

      // JS day mapping: dia_semana 1=Mon..6=Sat, JS 0=Sun,1=Mon..6=Sat
      for (const slotGroup of slots_config) {
        const { dia_semana, horas } = slotGroup;
        for (const hora of horas) {
          // Find next occurrence of this weekday
          const [h, m] = hora.split(":").map(Number);
          let nextDate = new Date(today);
          // Adjust to next occurrence of dia_semana
          const targetJsDay = dia_semana === 0 ? 0 : dia_semana; // 1=Mon matches JS getDay()=1
          while (nextDate.getDay() !== targetJsDay) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          // If today is the target day but time has passed, skip to next week
          if (nextDate.toDateString() === today.toDateString()) {
            const nowHours = today.getHours();
            if (nowHours >= h) {
              nextDate.setDate(nextDate.getDate() + 7);
            }
          }

          if (nextDate > endDate) continue;

          const fechaStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
          const horaInicio = hora;
          const totalMinEnd = h * 60 + m + duracionMinutos;
          const horaFin = `${String(Math.floor(totalMinEnd / 60) % 24).padStart(2, "0")}:${String(totalMinEnd % 60).padStart(2, "0")}`;

          // Build RRULE UNTIL
          const untilStr = `${fecha_fin.replace(/-/g, "")}T235959Z`;
          // Map dia_semana to RRULE day
          const rruleDays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
          const rruleDay = rruleDays[targetJsDay];

          const event = {
            summary: tipoCitaDescripcion,
            start: { dateTime: `${fechaStr}T${horaInicio}:00`, timeZone: "America/Mexico_City" },
            end: { dateTime: `${fechaStr}T${horaFin}:00`, timeZone: "America/Mexico_City" },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${untilStr}`],
            conferenceData: {
              createRequest: {
                requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          };

          try {
            const res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
              { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
            );
            if (!res.ok) {
              const errText = await res.text();
              if (res.status === 403 || res.status === 404 || errText.includes("Not Found") || errText.includes("forbidden")) {
                return new Response(JSON.stringify({ error: "No se tiene acceso al calendario. Verifique que la cuenta de servicio tenga permisos de 'Realizar cambios en eventos' en la configuración de compartir del Google Calendar." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
              errors.push(`${fechaStr} ${horaInicio}: ${errText}`);
              continue;
            }
            const created = await res.json();
            createdEvents.push({ day: dia_semana, hora, eventId: created.id, meetLink: created.hangoutLink || null });
          } catch (e: any) {
            errors.push(`${fechaStr} ${horaInicio}: ${e.message}`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, created_events: createdEvents, errors }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: check available slots ----
    if (body.action === "check-availability") {
      if (!body.fecha) {
        return new Response(JSON.stringify({ error: "Falta el campo 'fecha'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const slots = await getAvailableSlots(token, body.fecha, calendarId, duracionMinutos, supabase, calendarOwnerEmail, tipoCitaId);
      return new Response(JSON.stringify({ available_slots: slots, duracion_minutos: duracionMinutos }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Action: schedule (default) ----
    const { fecha, hora_inicio, id_persona, agent_email, direccion_showroom, latitud_showroom, longitud_showroom } = body;

    if (!fecha || !hora_inicio || !id_persona) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios: fecha, hora_inicio, id_persona" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [h, m] = hora_inicio.split(":").map(Number);
    const totalMin = h * 60 + m + duracionMinutos;
    const horaFin = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

    // Find existing active cita for this persona
    const { data: oldCitas } = await supabase
      .from("citas_capacitacion")
      .select("id, google_calendar_event_id")
      .eq("id_persona", id_persona)
      .eq("activo", true);

    const existingEventId = oldCitas?.[0]?.google_calendar_event_id || undefined;
    const existingCitaId = oldCitas?.[0]?.id;

    const available = await checkAvailability(token, fecha, hora_inicio, horaFin, calendarId, existingEventId, supabase, calendarOwnerEmail, tipoCitaId);
    if (!available) {
      return new Response(JSON.stringify({ error: "no_disponible", message: "El horario seleccionado no está disponible." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let summary = "Capacitación de Sozu para uso de herramienta.";
    if (direccion_showroom && latitud_showroom && longitud_showroom) {
      summary += ` En la direccion: ${direccion_showroom} con la ubicacion ${latitud_showroom},${longitud_showroom}`;
    }

    if (existingEventId) {
      await deleteCalendarEvent(token, calendarId, existingEventId);
    }

    const calendarEvent = await createCalendarEvent(token, calendarId, fecha, hora_inicio, horaFin, summary, agent_email || "");

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
