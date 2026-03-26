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
  if (subject) jwtPayload.sub = subject;
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

// ---------- Calendar helpers ----------
async function updateCalendarEventTime(
  token: string, calendarId: string, eventId: string,
  newFecha: string, newHoraInicio: string, newHoraFin: string
) {
  const patchBody = {
    start: { dateTime: `${newFecha}T${newHoraInicio}:00`, timeZone: "America/Mexico_City" },
    end: { dateTime: `${newFecha}T${newHoraFin}:00`, timeZone: "America/Mexico_City" },
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[updateEventTime] PATCH failed (${res.status}): ${errText}`);
    throw new Error(`Failed to update calendar event: ${errText}`);
  }

  const updated = await res.json();
  console.log(`[updateEventTime] Updated event ${updated.id} to ${newFecha} ${newHoraInicio}-${newHoraFin}`);
  return updated;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      id_horario,
      id_configuracion_cita,
      fecha_original,
      hora_original,
      fecha_nueva,
      hora_nueva,
      movido_por,
    } = await req.json();

    console.log(`[reagendar-slot] Moving slot: horario=${id_horario}, config=${id_configuracion_cita}, from=${fecha_original} h${hora_original} to=${fecha_nueva} h${hora_nueva}`);

    if (!id_horario || !id_configuracion_cita || !fecha_original || hora_original === undefined || !fecha_nueva || hora_nueva === undefined) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get config to know duration and calendar
    const { data: config, error: configError } = await supabase
      .from('configuracion_citas_usuarios')
      .select('duracion_minutos, calendario_email, nombre')
      .eq('id', id_configuracion_cita)
      .single();

    if (configError || !config) {
      console.error('Error fetching config:', configError);
      return new Response(
        JSON.stringify({ error: 'No se encontró la configuración de cita' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duracion = config.duracion_minutos || 60;
    const oldHoraInicio = `${String(hora_original).padStart(2, '0')}:00`;
    const oldMinFin = hora_original * 60 + duracion;
    const oldHoraFin = `${String(Math.floor(oldMinFin / 60)).padStart(2, '0')}:${String(oldMinFin % 60).padStart(2, '0')}`;

    const newHoraInicio = `${String(hora_nueva).padStart(2, '0')}:00`;
    const newMinFin = hora_nueva * 60 + duracion;
    const newHoraFin = `${String(Math.floor(newMinFin / 60)).padStart(2, '0')}:${String(newMinFin % 60).padStart(2, '0')}`;

    // 2. Find any bookings (reservas_citas) for this slot on the original date
    const { data: reservas, error: reservasError } = await supabase
      .from('reservas_citas')
      .select('id, google_calendar_event_id, hora_inicio, hora_fin, fecha')
      .eq('id_configuracion_cita', id_configuracion_cita)
      .eq('fecha', fecha_original)
      .eq('hora_inicio', oldHoraInicio)
      .eq('activo', true);

    if (reservasError) {
      console.error('Error fetching reservas:', reservasError);
      throw reservasError;
    }

    const hasBookings = reservas && reservas.length > 0;
    console.log(`[reagendar-slot] Found ${reservas?.length || 0} bookings for this slot`);

    // 3. Check if an override already exists for this horario (re-move scenario)
    // If so, preserve the ORIGINAL fecha/hora from the first move
    const { data: existingOverride } = await supabase
      .from('citas_horarios_overrides')
      .select('id, fecha_original, hora_original')
      .eq('id_horario', id_horario)
      .eq('activo', true)
      .maybeSingle();

    const finalFechaOriginal = existingOverride ? existingOverride.fecha_original : fecha_original;
    const finalHoraOriginal = existingOverride ? existingOverride.hora_original : hora_original;

    console.log(`[reagendar-slot] Using original: fecha=${finalFechaOriginal} hora=${finalHoraOriginal} (had existing override: ${!!existingOverride})`);

    // Delete old override if exists, then insert new one with original values
    if (existingOverride) {
      await supabase
        .from('citas_horarios_overrides')
        .delete()
        .eq('id', existingOverride.id);
    }

    const { error: overrideError } = await supabase
      .from('citas_horarios_overrides')
      .insert({
        id_configuracion_cita,
        id_horario,
        fecha_original: finalFechaOriginal,
        hora_original: finalHoraOriginal,
        fecha_nueva,
        hora_nueva,
        movido_por: movido_por || null,
      });

    if (overrideError) {
      console.error('Error creating override:', overrideError);
      throw overrideError;
    }

    // 4. If there are bookings, update them + Google Calendar
    let calendarUpdated = false;
    let calendarErrors: string[] = [];

    if (hasBookings && reservas) {
      // Update all reservas for this slot
      for (const reserva of reservas) {
        const { error: updateError } = await supabase
          .from('reservas_citas')
          .update({
            fecha: fecha_nueva,
            hora_inicio: newHoraInicio,
            hora_fin: newHoraFin,
            fecha_actualizacion: new Date().toISOString(),
          })
          .eq('id', reserva.id);

        if (updateError) {
          console.error(`Error updating reserva ${reserva.id}:`, updateError);
          calendarErrors.push(`Error actualizando reserva ${reserva.id}`);
          continue;
        }

        // Update Google Calendar event if exists
        if (reserva.google_calendar_event_id && config.calendario_email) {
          try {
            const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
            if (saJson) {
              const sa = JSON.parse(saJson);
              const token = await getAccessToken(sa);
              await updateCalendarEventTime(
                token,
                config.calendario_email,
                reserva.google_calendar_event_id,
                fecha_nueva,
                newHoraInicio,
                newHoraFin
              );
              calendarUpdated = true;
              console.log(`[reagendar-slot] Updated GCal event ${reserva.google_calendar_event_id}`);
            } else {
              console.warn('[reagendar-slot] No GOOGLE_SERVICE_ACCOUNT_KEY configured');
              calendarErrors.push('No se pudo actualizar Google Calendar: clave no configurada');
            }
          } catch (calErr: any) {
            console.error(`[reagendar-slot] GCal update error for reserva ${reserva.id}:`, calErr);
            calendarErrors.push(`Error GCal: ${calErr.message}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        had_bookings: hasBookings,
        bookings_moved: reservas?.length || 0,
        calendar_updated: calendarUpdated,
        calendar_errors: calendarErrors.length > 0 ? calendarErrors : undefined,
        message: hasBookings
          ? `Slot reagendado. ${reservas!.length} reserva(s) actualizada(s).${calendarUpdated ? ' Google Calendar notificado.' : ''}`
          : 'Slot movido exitosamente.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[reagendar-slot] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
